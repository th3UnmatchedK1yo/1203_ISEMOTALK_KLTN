import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { ZodError, z } from 'zod'
import type { Config } from './config'
import type { DB } from './db'
import type { StageEntry } from './domain'
import { ImportError, parseUtteranceFile } from './importers'
import { InferenceError, type InferenceClient } from './inference/client'
import { Pipeline, planStages } from './pipeline'
import * as repo from './repo'
import { buildAnalytics, exportAnalyticsCsv, exportReviewsCsv } from './reports'
import { HttpError, ReviewBody, applyReview } from './review'

const AUDIO_EXT: Record<string, string> = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4' }
const DATA_EXT = new Set(['.json', '.csv'])

export interface AppDeps {
  db: DB
  config: Config
  client: InferenceClient
  pipeline: Pipeline
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)

const MetaFields = z.object({
  title: z.string().max(200).optional(),
  agentName: z.string().max(120).optional(),
  customerName: z.string().max(120).optional(),
  callDate: z.string().optional(),
  agentChannel: z.enum(['0', '1']).optional(),
})

function parseCallDate(v: string | undefined): string {
  if (!v) return new Date().toISOString()
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) throw new HttpError(400, 'Ngày gọi không hợp lệ.')
  return d.toISOString()
}

export function createApp({ db, config, client, pipeline }: AppDeps) {
  const app = express()
  const tmpDir = path.join(config.uploadsDir, '.tmp')
  fs.mkdirSync(tmpDir, { recursive: true })

  app.use(cors())
  app.use(express.json({ limit: '5mb' }))

  const upload = multer({
    storage: multer.diskStorage({
      destination: tmpDir,
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: config.maxUploadBytes, files: 2 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      const ok = file.fieldname === 'audio' ? ext in AUDIO_EXT : DATA_EXT.has(ext)
      if (ok) return cb(null, true)
      cb(new HttpError(400, file.fieldname === 'audio' ? 'Chỉ hỗ trợ âm thanh WAV, MP3 hoặc M4A.' : 'Chỉ hỗ trợ tệp .json hoặc .csv.'))
    },
  })
  const fields = upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'transcript', maxCount: 1 },
    { name: 'results', maxCount: 1 },
  ])

  const filesOf = (req: Request) => (req.files ?? {}) as Record<string, Express.Multer.File[]>
  const cleanup = (req: Request) => Object.values(filesOf(req)).flat().forEach((f) => fs.rmSync(f.path, { force: true }))

  function storeAudio(callId: string, file: Express.Multer.File) {
    const ext = path.extname(file.originalname).toLowerCase()
    const rel = path.join(callId, `audio${ext}`)
    fs.mkdirSync(path.join(config.uploadsDir, callId), { recursive: true })
    fs.renameSync(file.path, path.join(config.uploadsDir, rel))
    return { rel, mime: AUDIO_EXT[ext], name: file.originalname }
  }

  // ---- System ------------------------------------------------------------
  app.get('/api/system/status', async (_req, res) => {
    try {
      res.json({ api: 'ok', inference: { reachable: true, ...(await client.health()) } })
    } catch (e) {
      res.json({ api: 'ok', inference: { reachable: false, error: (e as Error).message } })
    }
  })

  // ---- Calls: list / detail ---------------------------------------------
  app.get('/api/calls', (req, res) => {
    const q = req.query
    res.json(
      repo.listCalls(db, {
        search: str(q.search),
        priority: str(q.priority),
        review: str(q.review),
        status: str(q.status),
        provenance: str(q.provenance),
        source: str(q.source),
        attention: q.attention === '1',
        sort: str(q.sort),
        dir: q.dir === 'asc' ? 'asc' : 'desc',
        page: Number(q.page) || 1,
        pageSize: Number(q.pageSize) || 15,
      }),
    )
  })

  app.get('/api/calls/:id', (req, res) => {
    const call = repo.getCallDetail(db, req.params.id)
    if (!call) throw new HttpError(404, 'Không tìm thấy cuộc gọi.')
    res.json(call)
  })

  // ---- Calls: create ------------------------------------------------------
  app.post('/api/calls/upload', fields, (req, res) => {
    try {
      const f = filesOf(req)
      const audio = f.audio?.[0]
      if (!audio) throw new HttpError(400, 'Cần chọn tệp ghi âm (WAV, MP3 hoặc M4A).')
      const meta = MetaFields.parse(req.body)
      const transcript = f.transcript?.[0]
      const parsed = transcript ? parseUtteranceFile(fs.readFileSync(transcript.path), transcript.originalname, false) : null

      const id = repo.nextCallId(db)
      const source = parsed ? 'transcript_import' : 'upload'
      const stored = storeAudio(id, audio)
      repo.insertCall(db, {
        id,
        title: str(meta.title) ?? path.basename(audio.originalname, path.extname(audio.originalname)),
        agentName: str(meta.agentName) ?? '',
        customerName: str(meta.customerName) ?? '',
        callDate: parseCallDate(meta.callDate),
        source,
        agentChannel: Number(meta.agentChannel ?? 0),
        audioFile: stored.rel,
        audioName: stored.name,
        audioMime: stored.mime,
        stageLog: planStages(source, true),
        speakerSource: parsed ? (parsed.utterances.every((u) => u.speaker !== 'unknown') ? 'provided' : null) : null,
      })
      if (parsed) {
        // Predictions inside a transcript file are deliberately dropped: the model must produce them.
        repo.replaceUtterances(db, id, parsed.utterances.map((u) => ({ speaker: u.speaker, text: u.text, start: u.start, end: u.end })))
      }
      if (transcript) fs.rmSync(transcript.path, { force: true })
      pipeline.enqueue(id)
      res.status(202).json({ id })
    } catch (e) {
      cleanup(req)
      throw e
    }
  })

  app.post('/api/calls/import', fields, (req, res) => {
    try {
      const f = filesOf(req)
      const results = f.results?.[0]
      if (!results) throw new HttpError(400, 'Cần chọn tệp kết quả (.json hoặc .csv).')
      const meta = MetaFields.parse(req.body)
      const parsed = parseUtteranceFile(fs.readFileSync(results.path), results.originalname, true)
      const audio = f.audio?.[0]

      const id = repo.nextCallId(db)
      const stored = audio ? storeAudio(id, audio) : null
      repo.insertCall(db, {
        id,
        title: str(meta.title) ?? parsed.meta.title ?? path.basename(results.originalname, path.extname(results.originalname)),
        agentName: str(meta.agentName) ?? parsed.meta.agentName ?? '',
        customerName: str(meta.customerName) ?? parsed.meta.customerName ?? '',
        callDate: parseCallDate(str(meta.callDate) ?? parsed.meta.callDate),
        source: 'results_import',
        agentChannel: 0,
        audioFile: stored?.rel ?? null,
        audioName: stored?.name ?? null,
        audioMime: stored?.mime ?? null,
        provenance: 'imported',
        speakerSource: parsed.utterances.every((u) => u.speaker !== 'unknown') ? 'provided' : null,
        stageLog: planStages('results_import', !!stored),
      })
      repo.replaceUtterances(db, id, parsed.utterances)
      repo.updateCall(db, id, { duration: parsed.utterances.reduce((m, u) => Math.max(m, u.end), 0) })
      fs.rmSync(results.path, { force: true })
      pipeline.enqueue(id)
      res.status(202).json({ id })
    } catch (e) {
      cleanup(req)
      throw e
    }
  })

  // ---- Calls: audio, review, retry, delete -------------------------------
  app.get('/api/calls/:id/audio', (req, res) => {
    const r = repo.getCallRow(db, req.params.id)
    if (!r?.audio_file) throw new HttpError(404, 'Cuộc gọi này không có tệp âm thanh.')
    const abs = path.resolve(config.uploadsDir, r.audio_file)
    if (!abs.startsWith(path.resolve(config.uploadsDir)) || !fs.existsSync(abs)) throw new HttpError(404, 'Không tìm thấy tệp âm thanh.')
    res.setHeader('Content-Type', r.audio_mime ?? 'application/octet-stream')
    res.sendFile(abs, { acceptRanges: true })
  })

  app.put('/api/calls/:id/review', (req, res) => {
    res.json(applyReview(db, req.params.id, ReviewBody.parse(req.body)))
  })

  app.post('/api/calls/:id/retry', (req, res) => {
    const r = repo.getCallRow(db, req.params.id)
    if (!r) throw new HttpError(404, 'Không tìm thấy cuộc gọi.')
    if (r.status !== 'failed') throw new HttpError(409, 'Chỉ có thể thử lại cuộc gọi bị lỗi.')
    const log = (JSON.parse(r.stage_log) as StageEntry[]).map((e) => (e.state === 'failed' ? { stage: e.stage, state: 'pending' as const } : e))
    repo.updateCall(db, r.id, { status: 'queued', error: null, stageLog: log, attempts: r.attempts + 1 })
    pipeline.enqueue(r.id)
    res.status(202).json({ id: r.id })
  })

  app.delete('/api/calls/:id', (req, res) => {
    const removed = repo.deleteCall(db, req.params.id)
    if (!removed) throw new HttpError(404, 'Không tìm thấy cuộc gọi.')
    if (removed.audioFile) fs.rmSync(path.join(config.uploadsDir, path.dirname(removed.audioFile)), { recursive: true, force: true })
    res.status(204).end()
  })

  // ---- Reports -------------------------------------------------------------
  const filterOf = (req: Request) => ({ provenance: str(req.query.provenance), from: str(req.query.from), to: str(req.query.to) })
  const sendCsv = (res: Response, name: string, body: string) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
    res.send(body)
  }
  app.get('/api/analytics', (req, res) => res.json(buildAnalytics(db, filterOf(req))))
  app.get('/api/export/analytics.csv', (req, res) => sendCsv(res, 'isemotalk-analytics.csv', exportAnalyticsCsv(db, filterOf(req))))
  app.get('/api/export/reviews.csv', (req, res) => {
    const ids = str(req.query.ids)?.split(',').filter(Boolean)
    sendCsv(res, 'isemotalk-reviews.csv', exportReviewsCsv(db, ids, str(req.query.provenance)))
  })
  app.get('/api/calls/:id/export.csv', (req, res) => {
    if (!repo.getCallRow(db, req.params.id)) throw new HttpError(404, 'Không tìm thấy cuộc gọi.')
    sendCsv(res, `${req.params.id}.csv`, exportReviewsCsv(db, [req.params.id]))
  })
  app.get('/api/calls/:id/export.json', (req, res) => {
    const c = repo.getCallDetail(db, req.params.id)
    if (!c) throw new HttpError(404, 'Không tìm thấy cuộc gọi.')
    res.setHeader('Content-Disposition', `attachment; filename="${c.id}.json"`)
    res.json({
      call: { title: c.title, agentName: c.agentName, customerName: c.customerName, callDate: c.callDate, provenance: c.provenance },
      utterances: c.utterances.map((u) => ({
        speaker: u.speaker, start: u.start, end: u.end, text: u.text,
        acoustic: u.acoustic, lexical: u.lexical, fused: u.fused,
        review: u.review, flagged: u.flagged,
      })),
    })
  })

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Đường dẫn API không tồn tại.')))

  // ---- Errors --------------------------------------------------------------
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message, ...err.extra })
    if (err instanceof ImportError) return void res.status(400).json({ error: err.message, details: err.details })
    if (err instanceof InferenceError) return void res.status(502).json({ error: err.message, code: err.code })
    if (err instanceof ZodError)
      return void res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ.', details: err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`) })
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `Tệp quá lớn (tối đa ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB).` : `Lỗi tải tệp: ${err.message}`
      return void res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: msg })
    }
    console.error(err)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ.' })
  })

  return app
}
