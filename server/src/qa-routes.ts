import { createHash } from 'node:crypto'
import type { Express } from 'express'
import { z } from 'zod'
import type { Config } from './config'
import type { DB } from './db'
import { HttpError } from './review'
import * as repo from './repo'

// This is an AI suggestion, not a reviewer verdict. The SHA fingerprint
// prevents changed transcript text from silently reusing old model evidence.
const Predicted = z.object({
  label: z.enum(['routine', 'needs_attention']),
  score: z.number().finite().min(0).max(1),
  model: z.string().min(1).max(300),
  modelSha256: z.string().regex(/^[a-f0-9]{64}$/),
  dataset: z.literal('synthetic_onevoice'),
  truncated: z.boolean(),
  source: z.literal('model'),
  note: z.string().min(1),
}).refine(x => (x.score >= 0.5) === (x.label === 'needs_attention'), {
  message: 'Model probability and decision threshold disagree',
})
interface Row {
  input_sha256: string
  model_sha256: string
  model_name: string
  label: 'routine' | 'needs_attention'
  score: number
  dataset_source: string
  truncated: number
  created_at: string
}
function makeInput(db: DB, id: string) {
  const call = repo.getCallRow(db, id)
  if (!call) throw new HttpError(404, 'Không tìm thấy cuộc gọi.')
  if (call.status !== 'ready') throw new HttpError(409, 'Cuộc gọi cần hoàn tất ASR/SER trước khi chấm QA bằng model.')
  const utterances = repo.getUtterances(db, id)
  // OneVoice source imports contain the complete original conversation in a
  // single unknown-speaker utterance. Do not add a synthetic "unknown:" token
  // that was absent from the training examples.
  const text = utterances.length === 1 && utterances[0].speaker === 'unknown'
    ? utterances[0].text.trim()
    : utterances.map(u => u.speaker + ': ' + u.text).join('\n').trim()
  if (!text || text.length > 100000) throw new HttpError(422, 'Transcript rỗng hoặc vượt giới hạn 100.000 ký tự.')
  return { text, hash: createHash('sha256').update(text).digest('hex') }
}
function stored(db: DB, id: string) {
  const row = db.prepare('SELECT * FROM qa_triage_results WHERE call_id=?').get(id) as Row | undefined
  if (!row) return null
  return {
    label: row.label, score: row.score, model: row.model_name,
    modelSha256: row.model_sha256, dataset: row.dataset_source,
    truncated: !!row.truncated, createdAt: row.created_at,
    source: 'model' as const,
  }
}
export function attachQaTriageRoutes(app: Express, db: DB, config: Config) {
  app.get('/api/calls/:id/qa-triage', (req, res) => {
    const { hash } = makeInput(db, req.params.id)
    const result = stored(db, req.params.id)
    res.json({ result, outdated: !!result && (db.prepare('SELECT input_sha256 FROM qa_triage_results WHERE call_id=?')
      .get(req.params.id) as { input_sha256: string }).input_sha256 !== hash })
  })

  app.post('/api/calls/:id/qa-triage', async (req, res) => {
    const { text, hash } = makeInput(db, req.params.id)
    let response: Response
    try {
      response = await fetch(config.inferenceUrl + '/v1/qa/triage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }), signal: AbortSignal.timeout(180000),
      })
    } catch (error) {
      throw new HttpError(503, 'Không liên hệ được model QA trên GPU: ' + (error as Error).message)
    }
    if (!response.ok) {
      throw new HttpError(503, 'QA classifier chưa sẵn sàng (GPU inference HTTP ' + response.status + ').')
    }
    const result = Predicted.parse(await response.json())
    db.transaction(() => {
      const now = makeInput(db, req.params.id)
      if (now.hash !== hash) throw new HttpError(409, 'Transcript đã thay đổi khi model đang chạy. Thử lại để không lưu kết quả cũ.')
      db.prepare('INSERT INTO qa_triage_results (call_id,input_sha256,model_sha256,model_name,label,score,dataset_source,truncated,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(call_id) DO UPDATE SET input_sha256=excluded.input_sha256, model_sha256=excluded.model_sha256, model_name=excluded.model_name, label=excluded.label, score=excluded.score, dataset_source=excluded.dataset_source, truncated=excluded.truncated, created_at=excluded.created_at')
        .run(req.params.id, hash, result.modelSha256, result.model, result.label,
          result.score, result.dataset, Number(result.truncated), new Date().toISOString())
    }).immediate()
    res.json({ result: stored(db, req.params.id), outdated: false, note: result.note })
  })
}
