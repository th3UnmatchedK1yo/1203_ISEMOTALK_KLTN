import type { DB } from './db'
import type { Config } from './config'
import { buildQaInput } from './qa-input'
import { predictAndStoreQa } from './qa-routes'

type Row = { id: string; title: string; status: string; provenance: string | null; source: string }

/**
 * Lightweight, persistent-result QA worker. It is intentionally separate from
 * ASR/SER: the audio pipeline can reach "ready" even when QA is unavailable.
 * One request at a time, with no fabricated fallback and no DB schema change.
 * Previously imported OneVoice cases are picked up without user button clicks.
 */
export class AutoQa {
  private pending = new Set<string>()
  private busy: Promise<void> | null = null
  private timer: NodeJS.Timeout | null = null
  private abort: AbortController | null = null
  private stopped = false
  private warned = false

  constructor(
    private db: DB,
    private config: Config,
    private log: (message: string, error?: unknown) => void = () => {},
  ) {}

  start() {
    if (this.timer || this.stopped) return
    // Wait for Python startup when both services are launched together.
    this.timer = setInterval(() => void this.sweep(), 12000)
    this.timer.unref()
    void this.sweep()
  }

  onCallReady(id: string) {
    if (this.stopped) return
    this.pending.add(id)
    void this.pump()
  }

  private eligible(id: string) {
    const call = this.db.prepare('SELECT id,title,status,provenance,source FROM calls WHERE id=?').get(id) as Row | undefined
    if (!call || call.status !== 'ready' || call.provenance === 'mock') return false
    // Synthetic OneVoice is the TRAINING domain; genuine uploads are an
    // explicitly unvalidated transfer test. Other imported human-speech
    // benchmarks/ordinary DataHive conversations are not call-center cases.
    if (call.provenance === 'imported' && !call.title.startsWith('TTS TỔNG HỢP · OneVoice')) return false
    if (call.provenance !== 'imported' && call.provenance !== 'real') return false
    const utterances = this.db.prepare('SELECT text,speaker FROM utterances WHERE call_id=? ORDER BY idx').all(id) as Array<{text:string;speaker:string}>
    const { text, hash } = buildQaInput(utterances)
    if (!text || text.length > 100000) return false
    const previous = this.db.prepare('SELECT input_sha256, model_name, truncated FROM qa_triage_results WHERE call_id=?').get(id) as {input_sha256:string;model_name:string;truncated:number}|undefined
    return previous?.input_sha256 !== hash || (!!previous?.truncated && !previous.model_name.includes('/window-max-v2'))
  }

  private async qaAvailable(signal: AbortSignal) {
    try {
      const response = await fetch(this.config.inferenceUrl + '/v1/qa/health', {
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      })
      if (!response.ok) return false
      const value = await response.json() as {ready?:boolean}
      return value.ready === true
    } catch { return false }
  }

  async sweep() {
    if (this.stopped) return
    // Source imports may have been added to the database without passing the
    // normal audio pipeline. This bounded scan also heals after an API restart.
    const rows = this.db.prepare(
      "SELECT id FROM calls WHERE status='ready' AND provenance IN ('imported','real') ORDER BY created_at DESC LIMIT 200",
    ).all() as Array<{id:string}>
    for (const row of rows) if (this.eligible(row.id)) this.pending.add(row.id)
    await this.pump()
  }

  private pump(): Promise<void> {
    if (this.busy) return this.busy
    this.busy = this.work().finally(() => { this.busy = null })
    return this.busy
  }

  private async work() {
    const controller = new AbortController()
    this.abort = controller
    try {
      if (!(await this.qaAvailable(controller.signal))) {
        if (!this.warned && this.pending.size) {
          this.warned = true
          this.log('QA model chưa sẵn sàng; giữ nguyên hồ sơ. Sẽ tự kiểm tra lại.')
        }
        this.pending.clear() // next periodic sweep will safely discover missing scores
        return
      }
      this.warned = false
      while (this.pending.size && !this.stopped && !controller.signal.aborted) {
        const id = this.pending.values().next().value as string
        this.pending.delete(id)
        if (!this.eligible(id)) continue
        try {
          const result = await predictAndStoreQa(this.db, this.config, id, controller.signal)
          this.log('Real QA finished for ' + id + ' (' + result.result?.model + ')')
        } catch (error) {
          if (this.stopped || controller.signal.aborted) break
          this.log('QA could not analyze ' + id + '; will retry on next sweep', error)
          // Avoid hammering the same unavailable checkpoint or stale text in
          // a single batch. Other cases remain safe to process next sweep.
          break
        }
      }
    } finally { this.abort = null }
  }

  async stop() {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.abort?.abort()
    await this.busy
    this.pending.clear()
  }
}
