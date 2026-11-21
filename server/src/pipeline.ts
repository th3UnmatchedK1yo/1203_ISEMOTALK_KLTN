import path from 'node:path'
import type { Config } from './config'
import type { DB } from './db'
import { type CallSource, type InferenceEvidence, type Provenance, type Speaker, type SpeakerSource, type StageEntry, type StageKey, STAGE_ORDER, derive } from './domain'
import { InferenceError, type InferenceClient } from './inference/client'
import * as repo from './repo'

export const STAGE_LABELS: Record<StageKey, string> = {
  validate: 'Kiểm tra âm thanh',
  transcribe: 'Nhận dạng giọng nói (ASR)',
  diarize: 'Xác định người nói',
  emotion: 'Phân tích cảm xúc',
  finalize: 'Tạo kết quả',
}

const WEIGHTS: Record<StageKey, number> = { validate: 10, transcribe: 45, diarize: 15, emotion: 25, finalize: 5 }

export function planStages(source: CallSource, hasAudio: boolean): StageEntry[] {
  const skip = (s: StageKey, detail: string): StageEntry => ({ stage: s, state: 'skipped', detail })
  const pend = (s: StageKey): StageEntry => ({ stage: s, state: 'pending' })
  if (source === 'upload') return STAGE_ORDER.map(pend)
  if (source === 'transcript_import')
    return [pend('validate'), skip('transcribe', 'Đã có transcript được nhập'), pend('diarize'), pend('emotion'), pend('finalize')]
  return [
    hasAudio ? pend('validate') : skip('validate', 'Không có tệp âm thanh'),
    skip('transcribe', 'Kết quả được nhập sẵn'),
    skip('diarize', 'Kết quả được nhập sẵn'),
    skip('emotion', 'Kết quả được nhập sẵn'),
    pend('finalize'),
  ]
}

const progressOf = (log: StageEntry[]): number =>
  Math.min(
    100,
    Math.round(
      log.reduce(
        (a, e) => a + (e.state === 'done' || e.state === 'skipped' ? WEIGHTS[e.stage] : e.state === 'running' ? WEIGHTS[e.stage] / 2 : 0),
        0,
      ),
    ),
  )

type Row = Record<string, any>
interface StageOutcome {
  detail?: string
  skipped?: boolean
  provenance?: Provenance
  evidence?: InferenceEvidence
  commit?: () => void
}

class CancelledJob extends Error {}

export class Pipeline {
  private queue: string[] = []
  private running = false
  private stopped = false
  private active: { id: string; controller: AbortController } | null = null
  private idleWaiters: Array<() => void> = []

  constructor(
    private db: DB,
    private config: Config,
    private client: InferenceClient,
    private log: (msg: string, err?: unknown) => void = () => {},
  ) {}

  /** Re-queue anything that was in flight when the server last stopped. */
  resume(): void {
    const rows = this.db.prepare("SELECT id, stage_log FROM calls WHERE status IN ('queued','processing') ORDER BY created_at").all() as Row[]
    for (const r of rows) {
      const log = (JSON.parse(r.stage_log) as StageEntry[]).map((e) => (e.state === 'running' ? { ...e, state: 'pending' as const } : e))
      repo.updateCall(this.db, r.id, { stageLog: log, status: 'queued' })
      this.enqueue(r.id)
    }
  }

  enqueue(id: string): void {
    if (this.stopped || this.active?.id === id || this.queue.includes(id)) return
    this.queue.push(id)
    void this.pump()
  }

  /** Removing a call also invalidates every pending write from its current request. */
  cancel(id: string): void {
    this.queue = this.queue.filter((queued) => queued !== id)
    if (this.active?.id === id) this.active.controller.abort()
  }

  /** Stop accepting work, abort HTTP waits and checkpoint unfinished work for restart. */
  async stop(): Promise<void> {
    this.stopped = true
    this.queue = [] // durable queued rows are picked up by resume() on the next start
    this.active?.controller.abort()
    await this.onIdle()
  }

  /** Resolves when nothing is queued or running. Used by tests and graceful shutdown. */
  onIdle(): Promise<void> {
    if (!this.running && this.queue.length === 0) return Promise.resolve()
    return new Promise((resolve) => this.idleWaiters.push(resolve))
  }

  private async pump(): Promise<void> {
    if (this.running || this.stopped) return
    this.running = true
    try {
      while (this.queue.length && !this.stopped) {
        const id = this.queue.shift()!
        const controller = new AbortController()
        this.active = { id, controller }
        try {
          await this.run(id, controller.signal)
        } catch (e) {
          this.log(`pipeline crashed for ${id}`, e)
        } finally {
          this.active = null
        }
      }
    } finally {
      this.running = false
      this.idleWaiters.splice(0).forEach((r) => r())
    }
  }

  private save(id: string, log: StageEntry[], extra: Record<string, unknown> = {}): void {
    repo.updateCall(this.db, id, { stageLog: log, progress: progressOf(log), ...extra })
  }

  private exists(id: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM calls WHERE id = ?').get(id)
  }

  private guard(id: string, signal: AbortSignal): void {
    if (signal.aborted || !this.exists(id)) throw new CancelledJob()
  }

  private async run(id: string, signal: AbortSignal): Promise<void> {
    const row = repo.getCallRow(this.db, id)
    if (!row || !['queued', 'processing'].includes(row.status)) return
    const log = JSON.parse(row.stage_log) as StageEntry[]
    this.save(id, log, { status: 'processing', error: null })

    for (const entry of log) {
      if (entry.state === 'done' || entry.state === 'skipped') continue
      entry.state = 'running'
      entry.startedAt = new Date().toISOString()
      delete entry.detail
      delete entry.endedAt
      delete entry.durationMs
      delete entry.evidence
      delete entry.provenance
      const started = performance.now()
      this.save(id, log, { stage: entry.stage })
      try {
        const outcome = await this.runStage(id, entry.stage, signal)
        this.guard(id, signal)
        // Stage outputs and the completion marker are one durable checkpoint.
        // A failed write cannot leave partial ASR/SER output marked as completed.
        this.db.transaction(() => {
          outcome.commit?.()
          entry.state = outcome.skipped ? 'skipped' : 'done'
          entry.detail = outcome.detail
          entry.endedAt = new Date().toISOString()
          entry.durationMs = Math.max(0, Math.round(performance.now() - started))
          entry.provenance = outcome.provenance
          entry.evidence = outcome.evidence
          this.save(id, log)
        })()
      } catch (e) {
        if (e instanceof CancelledJob || signal.aborted || !this.exists(id)) {
          if (this.stopped && this.exists(id)) {
            entry.state = 'pending'
            delete entry.startedAt
            delete entry.endedAt
            delete entry.durationMs
            this.save(id, log, { status: 'queued', error: null })
          }
          return
        }
        const message = e instanceof InferenceError || e instanceof PipelineError ? e.message : `Lỗi nội bộ: ${(e as Error).message}`
        if (!(e instanceof InferenceError || e instanceof PipelineError)) this.log(`stage ${entry.stage} failed for ${id}`, e)
        entry.state = 'failed'
        entry.detail = message
        entry.endedAt = new Date().toISOString()
        entry.durationMs = Math.max(0, Math.round(performance.now() - started))
        this.save(id, log, { status: 'failed', error: message, stage: entry.stage })
        return
      }
    }
    this.save(id, log, { status: 'ready', stage: null, error: null, progress: 100 })
  }

  private audioPath(row: Row): string {
    if (!row.audio_file) throw new PipelineError('Cuộc gọi này không có tệp âm thanh. Hãy tạo lại bằng cách tải lên bản ghi âm.')
    const root = path.resolve(this.config.uploadsDir)
    const absolute = path.resolve(root, row.audio_file)
    const relative = path.relative(root, absolute)
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new PipelineError('Đường dẫn âm thanh không hợp lệ.')
    return absolute
  }

  private async runStage(id: string, stage: StageKey, signal: AbortSignal): Promise<StageOutcome> {
    this.guard(id, signal)
    const row = repo.getCallRow(this.db, id)!
    const utts = () => repo.getUtterances(this.db, id)

    switch (stage) {
      case 'validate': {
        const p = await this.client.probe({ path: this.audioPath(row) }, { signal })
        if (p.duration < this.config.minDurationSec) throw new PipelineError('Tệp âm thanh quá ngắn (dưới 1 giây).')
        if (p.duration > this.config.maxDurationSec) throw new PipelineError('Tệp âm thanh quá dài (tối đa 3 giờ).')
        const existing = utts()
        const lastEnd = existing.reduce((m, u) => Math.max(m, u.end), 0)
        if (existing.length && lastEnd > p.duration + 2)
          throw new PipelineError(
            `Transcript dài hơn âm thanh (${lastEnd.toFixed(1)}s so với ${p.duration.toFixed(1)}s). Kiểm tra lại tệp đã chọn.`,
          )
        return {
          detail: `${p.duration.toFixed(1)} giây · ${p.channels === 1 ? 'mono' : p.channels + ' kênh'} · ${p.sampleRate} Hz`,
          evidence: p.evidence,
          commit: () => repo.updateCall(this.db, id, { duration: p.duration, peaks: p.peaks, channels: p.channels }),
        }
      }

      case 'transcribe': {
        const r = await this.client.transcribe({ path: this.audioPath(row), agentChannel: row.agent_channel }, { signal })
        if (!r.segments.length) throw new PipelineError('Không phát hiện lời nói trong bản ghi âm.')
        if (r.segments.some((s) => s.end > row.duration + 2)) throw new PipelineError('Thời gian ASR vượt quá thời lượng âm thanh.')
        const speakerSource: SpeakerSource = r.speakerSource === 'channel' ? 'channel' : r.speakerSource === 'mock' ? 'mock' : 'unassigned'
        const provenance = r.provenance === 'mock' || r.speakerSource === 'mock' || r.evidence?.mock ? 'mock' : 'real'
        return {
          detail: `${r.segments.length} câu · ${provenance === 'mock' ? 'ASR mô phỏng' : 'ASR thật (cần đối chiếu transcript)'}`,
          provenance, evidence: r.evidence,
          commit: () => {
            repo.replaceUtterances(this.db, id, r.segments.map((s) => ({ speaker: s.speaker ?? 'unknown', text: s.text, start: s.start, end: s.end })))
            repo.updateCall(this.db, id, { provenance, speakerSource })
          },
        }
      }

      case 'diarize': {
        const current = utts()
        if (!current.some((u) => u.speaker === 'unknown')) {
          return { skipped: true, detail: 'Đã có nhãn người nói', commit: () => {
            if (!row.speaker_source) repo.updateCall(this.db, id, { speakerSource: 'provided' satisfies SpeakerSource })
          } }
        }
        const r = await this.client.diarize({
          path: this.audioPath(row),
          segments: current.map((u) => ({ start: u.start, end: u.end, text: u.text })),
        }, { signal })
        if (r.method === 'none') {
          return {
            skipped: true, detail: r.detail ?? 'Ghi âm mono, chưa có mô hình tách người nói — cần gán người nói thủ công khi xem xét.', evidence: r.evidence,
            commit: () => repo.updateCall(this.db, id, { speakerSource: 'unassigned' satisfies SpeakerSource }),
          }
        }
        if (r.speakers.length !== current.length) throw new PipelineError('Số nhãn người nói không khớp transcript.')
        const map: Record<string, Speaker> = {}
        current.forEach((u, i) => { if (u.speaker === 'unknown') map[u.id] = r.speakers[i] })
        const mock = r.method === 'mock' || r.evidence?.mock === true
        const assigned = Object.values(map).filter((speaker) => speaker !== 'unknown').length
        return {
          detail: assigned === 0
            ? 'Chưa có căn cứ gán vai trò nhân viên/khách hàng; cần gán thủ công.'
            : `${mock ? 'Gán nhãn mô phỏng' : 'Đã gán người nói bằng mô hình'} cho ${assigned} câu chưa có nhãn; giữ nguyên nhãn được cung cấp`,
          provenance: mock ? 'mock' : 'real', evidence: r.evidence,
          commit: () => {
            repo.setSpeakers(this.db, id, map)
            repo.updateCall(this.db, id, { speakerSource: (assigned === 0 ? 'unassigned' : mock ? 'mock' : 'model') satisfies SpeakerSource, ...(mock ? { provenance: 'mock' } : {}) })
          },
        }
      }

      case 'emotion': {
        const current = utts()
        const r = await this.client.emotion({
          path: this.audioPath(row),
          utterances: current.map((u) => ({ id: u.id, start: u.start, end: u.end, text: u.text, speaker: u.speaker })),
          agentChannel: row.agent_channel,
        }, { signal })
        const byId = Object.fromEntries(r.predictions.map((p) => [p.id, p]))
        const missing = current.filter((u) => !byId[u.id])
        if (missing.length || Object.keys(byId).length !== current.length || r.predictions.length !== current.length)
          throw new PipelineError('Mô hình trả kết quả thiếu, trùng hoặc sai mã câu nói.')
        const prov: Provenance = r.provenance === 'mock' || r.evidence?.mock || row.provenance === 'mock' ? 'mock' : 'real'
        return {
          detail: `${current.length} câu${prov === 'mock' ? ' · có thành phần mô phỏng' : ''}`,
          provenance: r.provenance === 'mock' || r.evidence?.mock ? 'mock' : 'real', evidence: r.evidence,
          commit: () => { repo.setPredictions(this.db, id, byId); repo.updateCall(this.db, id, { provenance: prov }) },
        }
      }

      case 'finalize': {
        const d = derive(utts())
        return {
          detail: `Ưu tiên: ${d.priority}, ${d.momentCount} khoảnh khắc quan trọng`,
          commit: () => {
            repo.refreshDerived(this.db, id)
            if (row.source === 'results_import' && !row.duration) repo.updateCall(this.db, id, { duration: utts().reduce((m, u) => Math.max(m, u.end), 0) })
          },
        }
      }
    }
  }
}

export class PipelineError extends Error {}
