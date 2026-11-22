import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { ZodError, z } from 'zod'
import { assertCallAudioOwnership, cleanupPendingAudio, UnsafeAudioPathError } from './audio-storage'
import type { Config } from './config'
import type { DB } from './db'
import type { StageEntry } from './domain'
import { ImportError, MAX_IMPORT_BYTES, parseUtteranceFile } from './importers'
import { InferenceError, type InferenceClient } from './inference/client'
import { Pipeline, planStages } from './pipeline'
import * as repo from './repo'
import { buildAnalytics, exportAnalyticsCsv, exportReviewsCsv } from './reports'
import { HttpError, ReviewBody, applyReview } from './review'
import { attachWorkflowRoutes, getWorkflow } from './workflow'

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

function positiveInteger(v: unknown, fallback: number): number {
  if (v === undefined) return fallback
  if (typeof v !== 'string' || !/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) < 1 || Number(v) > 1_000_000)
    throw new HttpError(400, 'Số trang và kích thước trang phải là số nguyên dương hợp lệ.')
  return Number(v)
}

export function createApp({ db, config, client, pipeline }: AppDeps) {
  const app = express()
  const tmpDir = path.join(config.uploadsDir, '.tmp')
  fs.mkdirSync(tmpDir, { recursive: true })
  cleanupPendingAudio(db, config.uploadsDir)

  const allowedOrigin = (origin: string): boolean => {
    if (config.allowedOrigins.includes(origin)) return true
    try {
      const url = new URL(origin)
      return url.origin === origin && url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    } catch { return false }
  }
  // Reject the request itself: omitting CORS headers alone does not prevent a
  // malicious page from submitting a form to an unauthenticated local API.
  app.use((req, _res, next) => {
    const origin = req.headers.origin
    if ((origin && !allowedOrigin(origin)) || (!origin && req.headers['sec-fetch-site'] === 'cross-site'))
      return next(new HttpError(403, 'Nguồn trang web không được phép truy cập API cục bộ.'))
    next()
  })
  app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowedOrigin(origin)) }))
  app.use(express.json({ limit: '5mb' }))

  const upload = multer({
    storage: multer.diskStorage({
      destination: tmpDir,
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: config.maxUploadBytes, files: 2, fields: 8, parts: 10, fieldSize: 16 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase()
      const ok = file.fieldname === 'audio' ? ext in AUDIO_EXT : DATA_EXT.has(ext)
      if (ok) return cb(null, true)
      cb(new HttpError(400, file.fieldname === 'audio' ? 'Chỉ hỗ trợ âm thanh WAV, MP3 hoặc M4A.' : 'Chỉ hỗ trợ tệp .json hoặc .csv.'))
    },
  })
  const uploadFields = upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'transcript', maxCount: 1 }])
  const importFields = upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'results', maxCount: 1 }])

  const filesOf = (req: Request) => (req.files ?? {}) as Record<string, Express.Multer.File[]>
  const cleanup = (req: Request) => Object.values(filesOf(req)).flat().forEach((f) => fs.rmSync(f.path, { force: true }))
  const parseFile = (file: Express.Multer.File, results: boolean) => {
    if (file.size > MAX_IMPORT_BYTES) throw new HttpError(413, 'Tệp dữ liệu quá lớn (tối đa 10 MB).')
    return parseUtteranceFile(fs.readFileSync(file.path), file.originalname, results)
  }

  function storeAudio(callId: string, file: Express.Multer.File) {
    if (file.size === 0) throw new HttpError(400, 'Tệp âm thanh trống.')
    const ext = path.extname(file.originalname).toLowerCase()
    const rel = path.join(callId, `audio${ext}`)
    const dir = path.join(config.uploadsDir, callId)
    // A new ID must own a new directory; never overwrite an existing recording.
    fs.mkdirSync(dir)
    try { fs.renameSync(file.path, path.join(config.uploadsDir, rel)) }
    catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e }
    return { rel, dir, mime: AUDIO_EXT[ext], name: file.originalname }
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
        page: positiveInteger(q.page, 1),
        pageSize: positiveInteger(q.pageSize, 15),
      }),
    )
  })

  app.get('/api/calls/:id', (req, res) => {
    const call = repo.getCallDetail(db, req.params.id)
    if (!call) throw new HttpError(404, 'Không tìm thấy cuộc gọi.')
    res.json(call)
  })

  // ---- Calls: create ------------------------------------------------------
  app.post('/api/calls/upload', uploadFields, (req, res) => {
    let stored: ReturnType<typeof storeAudio> | null = null
    try {
      const f = filesOf(req)
      const audio = f.audio?.[0]
      if (!audio) throw new HttpError(400, 'Cần chọn tệp ghi âm (WAV, MP3 hoặc M4A).')
      const meta = MetaFields.parse(req.body)
      const transcript = f.transcript?.[0]
      const parsed = transcript ? parseFile(transcript, false) : null
      const callDate = parseCallDate(meta.callDate)
      const title = z.string().max(200).parse(str(meta.title) ?? path.basename(audio.originalname, path.extname(audio.originalname)))

      const id = repo.nextCallId(db)
      const source = parsed ? 'transcript_import' : 'upload'
      stored = storeAudio(id, audio)
      const audioInfo = stored
      db.transaction(() => {
        repo.insertCall(db, {
          id,
          title,
          agentName: str(meta.agentName) ?? '',
          customerName: str(meta.customerName) ?? '',
          callDate,
          source,
          agentChannel: Number(meta.agentChannel ?? 0),
          audioFile: audioInfo.rel,
          audioName: audioInfo.name,
          audioMime: audioInfo.mime,
          stageLog: planStages(source, true),
          speakerSource: parsed ? (parsed.utterances.every((u) => u.speaker !== 'unknown') ? 'provided' : null) : null,
        })
        if (parsed) {
          // Predictions inside a transcript file are deliberately dropped: the model must produce them.
          repo.replaceUtterances(db, id, parsed.utterances.map((u) => ({ speaker: u.speaker, text: u.text, start: u.start, end: u.end })))
        }
      })()
      pipeline.enqueue(id)
      res.status(202).json({ id })
    } catch (e) {
      if (stored) fs.rmSync(stored.dir, { recursive: true, force: true })
      throw e
    } finally {
      cleanup(req)
    }
  })

  app.post('/api/calls/import', importFields, (req, res) => {
    let stored: ReturnType<typeof storeAudio> | null = null
    try {
      const f = filesOf(req)
      const results = f.results?.[0]
      if (!results) throw new HttpError(400, 'Cần chọn tệp kết quả (.json hoặc .csv).')
      const meta = MetaFields.parse(req.body)
      const parsed = parseFile(results, true)
      const audio = f.audio?.[0]
      const combined = MetaFields.parse({
        title: str(meta.title) ?? parsed.meta.title ?? path.basename(results.originalname, path.extname(results.originalname)),
        agentName: str(meta.agentName) ?? parsed.meta.agentName ?? '',
        customerName: str(meta.customerName) ?? parsed.meta.customerName ?? '',
        callDate: str(meta.callDate) ?? parsed.meta.callDate,
      })
      const callDate = parseCallDate(combined.callDate)

      const id = repo.nextCallId(db)
      stored = audio ? storeAudio(id, audio) : null
      const audioInfo = stored
      db.transaction(() => {
        repo.insertCall(db, {
          id,
          title: combined.title!,
          agentName: combined.agentName!,
          customerName: combined.customerName!,
          callDate,
          source: 'results_import',
          agentChannel: Number(meta.agentChannel ?? 0),
          audioFile: audioInfo?.rel ?? null,
          audioName: audioInfo?.name ?? null,
          audioMime: audioInfo?.mime ?? null,
          provenance: 'imported',
          speakerSource: parsed.utterances.every((u) => u.speaker !== 'unknown') ? 'provided' : null,
          stageLog: planStages('results_import', !!audioInfo),
        })
        repo.replaceUtterances(db, id, parsed.utterances)
        repo.updateCall(db, id, { duration: parsed.utterances.reduce((m, u) => Math.max(m, u.end), 0) })
      })()
      pipeline.enqueue(id)
      res.status(202).json({ id })
    } catch (e) {
      if (stored) fs.rmSync(stored.dir, { recursive: true, force: true })
      throw e
    } finally {
      cleanup(req)
    }
  })

  // ---- Calls: audio, review, retry, delete -------------------------------
  app.get('/api/calls/:id/audio', (req, res) => {
    const r = repo.getCallRow(db, req.params.id)
    if (!r?.audio_file) throw new HttpError(404, 'Cuộc gọi này không có tệp âm thanh.')
    const abs = path.resolve(config.uploadsDir, r.audio_file)
    const rel = path.relative(path.resolve(config.uploadsDir), abs)
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel) || !fs.existsSync(abs)) throw new HttpError(404, 'Không tìm thấy tệp âm thanh.')
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
    const id = req.params.id
    const current = repo.getCallRow(db, id)
    if (!current) throw new HttpError(404, 'Không tìm thấy cuộc gọi.')
    if (current.audio_file) {
      try { assertCallAudioOwnership(config.uploadsDir, id, current.audio_file) }
      catch (error) {
        if (!(error instanceof UnsafeAudioPathError)) throw error
        throw new HttpError(409, 'Đường dẫn bản ghi không thuộc cuộc gọi này. Cần kiểm tra dữ liệu trước khi xóa.', { code: 'unsafe_audio_path' })
      }
    }
    db.transaction(() => {
      const removed = repo.deleteCall(db, id)
      if (!removed) throw new HttpError(404, 'Không tìm thấy cuộc gọi.')
      if (removed.audioFile) db.prepare('INSERT INTO audio_cleanup_jobs(call_id, created_at) VALUES (?,?)').run(id, new Date().toISOString())
    })()
    pipeline.cancel(id)
    cleanupPendingAudio(db, config.uploadsDir, id)
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
    const { utterances, moments, stageLog, peaks: _peaks, audioUrl: _audioUrl, ...call } = c
    const momentReviews = db.prepare('SELECT moment_id, relevance, note, evidence_key FROM moment_reviews WHERE call_id=? ORDER BY moment_id').all(c.id) as Array<{ moment_id: string; relevance: number | null; note: string; evidence_key: string | null }>
    res.json({
      schemaVersion: 2, exportedAt: new Date().toISOString(), call, stageLog, utterances, moments,
      momentReviews: momentReviews.map((m) => ({ momentId: m.moment_id, relevance: m.relevance === null ? null : !!m.relevance, note: m.note, evidenceKey: m.evidence_key })),
      workflow: getWorkflow(db, c.id, { fullHistory: true }),
    })
  })

  attachWorkflowRoutes(app, db)
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
