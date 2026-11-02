import path from 'node:path'
import type { Config } from './config'
import type { DB } from './db'
import { type CallSource, type Provenance, type Speaker, type SpeakerSource, type StageEntry, type StageKey, STAGE_ORDER } from './domain'
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

export class Pipeline {
  private queue: string[] = []
  private running = false
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
    if (!this.queue.includes(id)) this.queue.push(id)
    void this.pump()
  }

  /** Resolves when nothing is queued or running. Used by tests and graceful shutdown. */
  onIdle(): Promise<void> {
    if (!this.running && this.queue.length === 0) return Promise.resolve()
    return new Promise((resolve) => this.idleWaiters.push(resolve))
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.queue.length) {
        const id = this.queue.shift()!
        try {
          await this.run(id)
        } catch (e) {
          this.log(`pipeline crashed for ${id}`, e)
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

  private async run(id: string): Promise<void> {
    const row = repo.getCallRow(this.db, id)
    if (!row) return
    let log = JSON.parse(row.stage_log) as StageEntry[]
    this.save(id, log, { status: 'processing', error: null })

    for (const entry of log) {
      if (entry.state === 'done' || entry.state === 'skipped') continue
      entry.state = 'running'
      entry.startedAt = new Date().toISOString()
      entry.detail = undefined
      this.save(id, log, { stage: entry.stage })
      try {
        const outcome = await this.runStage(id, entry.stage)
        entry.state = outcome.skipped ? 'skipped' : 'done'
        entry.detail = outcome.detail
        entry.endedAt = new Date().toISOString()
        this.save(id, log)
      } catch (e) {
        const message = e instanceof InferenceError || e instanceof PipelineError ? e.message : `Lỗi nội bộ: ${(e as Error).message}`
        if (!(e instanceof InferenceError || e instanceof PipelineError)) this.log(`stage ${entry.stage} failed for ${id}`, e)
        entry.state = 'failed'
        entry.detail = message
        entry.endedAt = new Date().toISOString()
        this.save(id, log, { status: 'failed', error: message, stage: entry.stage })
        return
      }
    }
    this.save(id, log, { status: 'ready', stage: null, error: null, progress: 100 })
  }

  private audioPath(row: Row): string {
    if (!row.audio_file) throw new PipelineError('Cuộc gọi này không có tệp âm thanh. Hãy tạo lại bằng cách tải lên bản ghi âm.')
    return path.resolve(this.config.uploadsDir, row.audio_file)
  }

  private async runStage(id: string, stage: StageKey): Promise<{ detail?: string; skipped?: boolean }> {
    const row = repo.getCallRow(this.db, id)!
    const utts = () => repo.getUtterances(this.db, id)

    switch (stage) {
      case 'validate': {
        const p = await this.client.probe({ path: this.audioPath(row) })
        if (p.duration < this.config.minDurationSec) throw new PipelineError('Tệp âm thanh quá ngắn (dưới 1 giây).')
        if (p.duration > this.config.maxDurationSec) throw new PipelineError('Tệp âm thanh quá dài (tối đa 3 giờ).')
        const existing = utts()
        const lastEnd = existing.reduce((m, u) => Math.max(m, u.end), 0)
        if (existing.length && lastEnd > p.duration + 2)
          throw new PipelineError(
            `Transcript dài hơn âm thanh (${lastEnd.toFixed(1)}s so với ${p.duration.toFixed(1)}s). Kiểm tra lại tệp đã chọn.`,
          )
        repo.updateCall(this.db, id, { duration: p.duration, peaks: p.peaks, channels: p.channels })
        return { detail: `${p.duration.toFixed(1)} giây · ${p.channels === 1 ? 'mono' : p.channels + ' kênh'} · ${p.sampleRate} Hz` }
      }

      case 'transcribe': {
        const r = await this.client.transcribe({ path: this.audioPath(row), agentChannel: row.agent_channel })
        if (!r.segments.length) throw new PipelineError('Không phát hiện lời nói trong bản ghi âm.')
        repo.replaceUtterances(
          this.db,
          id,
          r.segments.map((s) => ({ speaker: s.speaker ?? 'unknown', text: s.text, start: s.start, end: s.end })),
        )
        const speakerSource: SpeakerSource = r.speakerSource === 'channel' ? 'channel' : r.speakerSource === 'mock' ? 'mock' : 'unassigned'
        repo.updateCall(this.db, id, { provenance: r.provenance, speakerSource })
        return { detail: `${r.segments.length} câu · ${r.provenance === 'mock' ? 'ASR mô phỏng' : 'ASR thật (cần đối chiếu transcript)'}` }
      }

      case 'diarize': {
        const current = utts()
        if (!current.some((u) => u.speaker === 'unknown')) {
          if (!row.speaker_source) repo.updateCall(this.db, id, { speakerSource: 'provided' satisfies SpeakerSource })
          return { skipped: true, detail: 'Đã có nhãn người nói' }
        }
        const r = await this.client.diarize({
          path: this.audioPath(row),
          segments: current.map((u) => ({ start: u.start, end: u.end, text: u.text })),
        })
        if (r.method === 'none') {
          repo.updateCall(this.db, id, { speakerSource: 'unassigned' satisfies SpeakerSource })
          return { skipped: true, detail: r.detail ?? 'Ghi âm mono, chưa có mô hình tách người nói — cần gán người nói thủ công khi xem xét.' }
        }
        const map: Record<string, Speaker> = {}
        current.forEach((u, i) => (map[u.id] = r.speakers[i] ?? 'unknown'))
        repo.setSpeakers(this.db, id, map)
        repo.updateCall(this.db, id, { speakerSource: (r.method === 'mock' ? 'mock' : 'model') satisfies SpeakerSource })
        return { detail: r.method === 'mock' ? 'Mô phỏng' : 'Đã tách người nói bằng mô hình' }
      }

      case 'emotion': {
        const current = utts()
        const r = await this.client.emotion({
          path: this.audioPath(row),
          utterances: current.map((u) => ({ id: u.id, start: u.start, end: u.end, text: u.text, speaker: u.speaker })),
        })
        const byId: Record<string, (typeof r.predictions)[number]> = {}
        r.predictions.forEach((p) => (byId[p.id] = p))
        const missing = current.filter((u) => !byId[u.id])
        if (missing.length) throw new PipelineError(`Mô hình không trả kết quả cho ${missing.length} câu.`)
        repo.setPredictions(this.db, id, byId)
        const prov: Provenance = r.provenance === 'mock' || row.provenance === 'mock' ? 'mock' : 'real'
        repo.updateCall(this.db, id, { provenance: prov })
        return { detail: `${current.length} câu${prov === 'mock' ? ' · mô phỏng' : ''}` }
      }

      case 'finalize': {
        const d = repo.refreshDerived(this.db, id)
        if (row.source === 'results_import' && !row.duration) {
          const end = utts().reduce((m, u) => Math.max(m, u.end), 0)
          repo.updateCall(this.db, id, { duration: end })
        }
        return { detail: `Ưu tiên: ${d.priority}, ${d.momentCount} khoảnh khắc quan trọng` }
      }
    }
  }
}

export class PipelineError extends Error {}
