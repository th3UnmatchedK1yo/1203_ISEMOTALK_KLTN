import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
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

import { attachServiceRoutes } from './service-routes'
import { recordCaseRecordingDeletion } from './service-operations'
import { attachQaTriageRoutes } from './qa-routes'
import { attachInsightRoutes } from './insights'
import type { AutoQa } from './auto-qa'

const AUDIO_EXT: Record<string, string> = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4' }
const DATA_EXT = new Set(['.json', '.csv'])

export interface AppDeps {
  db: DB
  config: Config
  client: InferenceClient
  pipeline: Pipeline
  autoQa?: AutoQa | null
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

export function createApp({ db, config, client, pipeline, autoQa }: AppDeps) {
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
  // While the shared GPU is training, the API-only frontend preview must be
  // read-only regarding model jobs. In particular no uploaded call should be
  // queued/fail just because Python inference is intentionally offline.
  const previewOnly = process.env.ISEMO_API_PREVIEW_ONLY === '1'
  if (previewOnly) {
    app.use((req, res, next) => {
      // A results-only import can be finalized using local SQLite operations,
      // without Python. Audio imports still require the unavailable probe.
      const modelAction = req.method === 'POST' &&
        (/^\/api\/calls\/upload$/.test(req.path) ||
          /^\/api\/calls\/[^/]+\/(retry|qa-triage|reprocess|insights)$/.test(req.path))
      if (modelAction) return res.status(503).json({
        error: 'Chế độ xem trước giao diện: GPU đang training, chưa cho gửi tác vụ model. Dữ liệu đánh giá cũ được giữ nguyên.',
        code: 'inference_paused_for_training',
      })
      next()
    })
  }

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
    // These flags describe what the backend will automatically ATTEMPT,
    // not successful predictions. Runtime health exposes model readiness.
    const runtimeCommit = /^[a-f0-9]{40}$/.test(process.env.ISEMO_RUNTIME_COMMIT || '') ? process.env.ISEMO_RUNTIME_COMMIT : null
    const automation = {
      qa: !previewOnly && process.env.ISEMO_QA_AUTOMATION === '1' && !!process.env.ISEMO_QA_MODEL_DIR,
      asr: !previewOnly && !['none', 'mock', ''].includes(process.env.ISEMO_ASR ?? ''),
      ser: !previewOnly && process.env.ISEMO_SER === 'checkpoint',
    }
    // During training, report a fast, explicit preview status without polling
    // an intentionally offline Python service or implying that it should start.
    if (previewOnly) return res.json({
      api: 'ok', runtimeCommit,
      previewOnly: true,
      automation,
      demoData: process.env.ISEMO_MIDTERM_DEMO === '1',
      speechDemo: process.env.ISEMO_SPEECH_DEMO === '1',
      inference: { reachable: false, error: 'Chế độ API-only preview: dịch vụ AI chưa khởi động; chỉ phục vụ dữ liệu và giao diện, không chạy ASR/SER/QA.' },
    })
    try {
      res.json({ api: 'ok', runtimeCommit, previewOnly: false,
        automation,
        speechDemo: process.env.ISEMO_SPEECH_DEMO === '1',
        demoData: process.env.ISEMO_MIDTERM_DEMO === '1',
        inference: { reachable: true, ...(await client.health()) } })
    } catch (e) {
      res.json({ api: 'ok', runtimeCommit, previewOnly: false,
        automation,
        speechDemo: process.env.ISEMO_SPEECH_DEMO === '1',
        demoData: process.env.ISEMO_MIDTERM_DEMO === '1',
        inference: { reachable: false, error: (e as Error).message } })
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
        datasetScope: q.datasetScope === 'business' || q.datasetScope === 'speech_only' ? q.datasetScope : 'all',
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
      if (previewOnly && audio) {
        throw new HttpError(503,
          'Chế độ xem trước chỉ nhận JSON/CSV không kèm audio. Ghi âm cần dịch vụ kiểm tra âm thanh khi GPU sẵn sàng.',
          { code: 'inference_paused_for_training' })
      }
      // Results-only import has a skipped validation/transcription/emotion plan.
      // Its single pending finalize stage does not call Python or the GPU.
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

  // Create a NEW derived call from an unchanged imported or uploaded WAV.
  // Never overwrite the original transcript, QA reviews, case history or audio.
  app.post('/api/calls/:id/reprocess', async (req, res) => {
    if (previewOnly) throw new HttpError(503, 'API preview không chạy model.')
    const original = repo.getCallRow(db, req.params.id)
    if (!original) throw new HttpError(404, 'Không tìm thấy cuộc gọi nguồn.')
    if (original.status !== 'ready' || !['imported', 'real'].includes(original.provenance || '') || !original.audio_file)
      throw new HttpError(409, 'Chỉ phân tích lại được bản ghi đã hoàn tất, có audio thật và nguồn hợp lệ; không ghi đè hồ sơ cũ.')
    if (original.title.startsWith('HỘI THOẠI ĐIỆN THOẠI THẬT · DataHive')) {
      throw new HttpError(422,
        'DataHive không phải cuộc gọi CSKH. Không tự gán hai người nói vào vai nhân viên và khách hàng; chỉ sử dụng để nghe và kiểm tra ASR riêng.')
    }
    // Real ASR must be present; a mock or merely configured adapter cannot
    // produce evidence for a genuine inference demonstration.
    let status
    try { status = await client.health() }
    catch { throw new HttpError(503, 'Không xác nhận được ASR thật trên GPU. Hãy kiểm tra Python inference.') }
    const asr = status.components.asr
    if (!asr.ready || asr.mock || asr.adapter === 'not_configured' || !status.ffmpeg)
      throw new HttpError(503, 'ASR chưa chạy thật hoặc ffmpeg không sẵn sàng. Không tạo hàng đợi không thể xử lý.')
    const ser = status.components.ser
    if (process.env.ISEMO_SER === 'none') {
      if (ser.adapter !== 'not_configured' || ser.ready || ser.mock)
        throw new HttpError(503, 'Cấu hình bỏ qua SER giữa hai dịch vụ không khớp.')
    } else if (!ser.ready || ser.mock || ser.verified !== true) {
      throw new HttpError(503, 'SER chưa được xác minh; chỉ có thể chạy khi cấu hình chế độ QA/ASR không có SER.')
    }

    try { assertCallAudioOwnership(config.uploadsDir, original.id, original.audio_file) }
    catch { throw new HttpError(409, 'Đường dẫn bản ghi không được xác minh thuộc cuộc gọi nguồn.') }
    const source = path.resolve(config.uploadsDir, original.audio_file)
    if (!fs.existsSync(source) || !fs.statSync(source).isFile())
      throw new HttpError(404, 'Tệp ghi âm nguồn không còn tồn tại.')
    const ext = path.extname(source).toLowerCase()
    if (!(ext in AUDIO_EXT)) throw new HttpError(400, 'Định dạng tệp ghi âm nguồn không hỗ trợ.')
    const id = repo.nextCallId(db)
    const dir = path.join(config.uploadsDir, id)
    const targetRel = path.join(id, 'audio' + ext)
    fs.mkdirSync(dir)
    try {
      const dest = path.join(config.uploadsDir, targetRel)
      fs.copyFileSync(source, dest, fs.constants.COPYFILE_EXCL)
      const digest = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
      const hash = digest(source)
      if (hash !== digest(dest)) throw new Error('Audio hash changed during copy')
      db.transaction(() => {
        repo.insertCall(db, {
          id, title: ('ASR thật · ' + original.title).slice(0, 200),
          agentName: original.agent_name || '', customerName: original.customer_name || '',
          callDate: new Date().toISOString(), source: 'upload',
          agentChannel: original.agent_channel || 0,
          audioFile: targetRel, audioName: original.audio_name || path.basename(source),
          audioMime: original.audio_mime || AUDIO_EXT[ext], stageLog: planStages('upload', true),
          speakerSource: null,
        })
        repo.updateCall(db, id, {
          overallNote: 'Bản phân tích mới từ ' + original.id +
            '. File audio sao chép nguyên byte (SHA256 ' + hash + '). Transcript sẽ do ASR thật tạo, không sử dụng transcript nguồn. Kết quả SER chỉ có nếu checkpoint đã được xác minh.',
        })
      })()
    } catch (error) {
      fs.rmSync(dir, { recursive: true, force: true })
      throw error
    }
    pipeline.enqueue(id)
    res.status(202).json({ id, sourceCallId: original.id })
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
      recordCaseRecordingDeletion(db, id)
      const removed = repo.deleteCall(db, id)
      if (!removed) throw new HttpError(404, 'Không tìm thấy cuộc gọi.')
      if (removed.audioFile) db.prepare('INSERT INTO audio_cleanup_jobs(call_id, created_at) VALUES (?,?)').run(id, new Date().toISOString())
    }).immediate()
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

  attachServiceRoutes(app, db)
  attachWorkflowRoutes(app, db)
  attachQaTriageRoutes(app, db, config, autoQa)
  attachInsightRoutes(app, db)
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
