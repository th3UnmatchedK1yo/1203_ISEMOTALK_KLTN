import { z } from 'zod'
import { EMOTIONS, type InferenceEvidence, type Prediction, type Speaker } from '../domain'

export interface ComponentHealth {
  adapter: string
  ready: boolean
  mock: boolean
  verified?: boolean
  detail: string
}

export interface HealthInfo {
  status: 'ok' | 'degraded'
  mode: 'mock' | 'real' | 'mixed'
  device: string
  ffmpeg: boolean
  components: { asr: ComponentHealth; diarization: ComponentHealth; ser: ComponentHealth }
}

export interface ProbeResult {
  duration: number
  channels: number
  sampleRate: number
  peaks: number[]
  evidence?: InferenceEvidence
}

export interface TranscribeSegment {
  start: number
  end: number
  text: string
  speaker?: Speaker
}

export interface TranscribeResult {
  segments: TranscribeSegment[]
  speakerSource: 'channel' | 'mock' | 'none'
  provenance: 'mock' | 'real'
  evidence?: InferenceEvidence
}

export interface DiarizeResult {
  speakers: Speaker[] // aligned with the request segments
  method: 'model' | 'mock' | 'none'
  detail?: string
  evidence?: InferenceEvidence
}

export interface EmotionRequestItem {
  id: string
  start: number
  end: number
  text: string
  speaker: Speaker
}

export interface EmotionResult {
  provenance: 'mock' | 'real'
  predictions: Array<{ id: string; acoustic: Prediction | null; lexical: Prediction | null; fused: Prediction }>
  evidence?: InferenceEvidence
}

export type InferenceErrorCode = 'unavailable' | 'not_ready' | 'bad_input' | 'failed'

export class InferenceError extends Error {
  constructor(public code: InferenceErrorCode, message: string) {
    super(message)
  }
}

export interface InferenceOptions { signal?: AbortSignal }

export interface InferenceClient {
  health(): Promise<HealthInfo>
  probe(req: { path: string }, options?: InferenceOptions): Promise<ProbeResult>
  transcribe(req: { path: string; agentChannel: number }, options?: InferenceOptions): Promise<TranscribeResult>
  diarize(req: { path: string; segments: TranscribeSegment[] }, options?: InferenceOptions): Promise<DiarizeResult>
  emotion(req: { path: string; utterances: EmotionRequestItem[]; agentChannel: number }, options?: InferenceOptions): Promise<EmotionResult>
}

const Evidence = z.object({
  adapter: z.string().min(1).max(200), model: z.string().max(2048).optional(),
  device: z.string().max(200).optional(), mock: z.boolean(), verified: z.boolean().optional(),
  timingMode: z.enum(['word_aligned', 'audio_window']).optional(),
  timingWarning: z.string().max(240).optional(),
})
const SpeakerValue = z.enum(['agent', 'customer', 'unknown'])
const PredictionValue = z.object({ emotion: z.enum(EMOTIONS), confidence: z.number().min(0).max(1) })
const Segment = z.object({ start: z.number().nonnegative(), end: z.number().positive(), text: z.string().trim().min(1).max(4000), speaker: SpeakerValue.optional() })
  .refine((s) => s.end > s.start, { message: 'end must be greater than start' })
const Probe = z.object({ duration: z.number().positive(), channels: z.number().int().min(1).max(32), sampleRate: z.number().int().positive(), peaks: z.array(z.number().min(0).max(1)).max(10_000), evidence: Evidence.optional() })
const Transcription = z.object({ segments: z.array(Segment).max(5000), speakerSource: z.enum(['channel', 'mock', 'none']), provenance: z.enum(['mock', 'real']), evidence: Evidence.optional() })
const Diarization = z.object({ speakers: z.array(SpeakerValue).max(5000), method: z.enum(['model', 'mock', 'none']), detail: z.string().optional(), evidence: Evidence.optional() })
const Emotions = z.object({ provenance: z.enum(['mock', 'real']), predictions: z.array(z.object({ id: z.string().min(1), acoustic: PredictionValue.nullable(), lexical: PredictionValue.nullable(), fused: PredictionValue })).max(5000), evidence: Evidence.optional() })
const Component = z.object({ adapter: z.string(), ready: z.boolean(), mock: z.boolean(), verified: z.boolean().optional(), detail: z.string() }).passthrough()
const Health = z.object({ status: z.enum(['ok', 'degraded']), mode: z.enum(['mock', 'real', 'mixed']), device: z.string(), ffmpeg: z.boolean(), components: z.object({ asr: Component, diarization: Component, ser: Component }) }).passthrough()

function validated<T>(schema: z.ZodType<T>, data: unknown, route: string): T {
  const result = schema.safeParse(data)
  if (!result.success) throw new InferenceError('failed', `Dịch vụ suy luận trả dữ liệu không hợp lệ (${route}: ${result.error.issues[0]?.path.join('.') || 'response'}).`)
  return result.data
}

export class HttpInferenceClient implements InferenceClient {
  constructor(private baseUrl: string) {}

  private async call<T>(method: 'GET' | 'POST', route: string, body: unknown, timeoutMs: number, schema: z.ZodType<T>, options?: InferenceOptions): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${route}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: options?.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      })
    } catch (e) {
      const timeout = (e as Error).name === 'TimeoutError'
      throw new InferenceError(
        'unavailable',
        timeout
          ? 'Dịch vụ suy luận phản hồi quá chậm (hết thời gian chờ).'
          : `Không kết nối được dịch vụ suy luận tại ${this.baseUrl}. Hãy khởi động bằng "npm run dev:inference".`,
      )
    }
    if (!res.ok) {
      let code: InferenceErrorCode = res.status === 503 ? 'not_ready' : res.status >= 400 && res.status < 500 ? 'bad_input' : 'failed'
      let message = `Dịch vụ suy luận lỗi (${res.status}).`
      try {
        const j = (await res.json()) as { detail?: string | { code?: string; message?: string } }
        if (typeof j.detail === 'string') message = j.detail
        else if (j.detail?.message) {
          message = j.detail.message
          if (j.detail.code === 'model_not_ready') code = 'not_ready'
        }
      } catch {
        /* keep default */
      }
      throw new InferenceError(code, message)
    }
    try {
      return validated(schema, await res.json(), route)
    } catch (e) {
      if (e instanceof InferenceError) throw e
      if ((e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError')
        throw new InferenceError('unavailable', 'Dịch vụ suy luận phản hồi quá chậm hoặc yêu cầu đã bị hủy.')
      throw new InferenceError('failed', `Dịch vụ suy luận trả JSON không hợp lệ (${route}).`)
    }
  }

  health() {
    return this.call<HealthInfo>('GET', '/v1/health', undefined, 4_000, Health)
  }
  probe(req: { path: string }, options?: InferenceOptions) {
    return this.call<ProbeResult>('POST', '/v1/audio/probe', req, 120_000, Probe, options)
  }
  transcribe(req: { path: string; agentChannel: number }, options?: InferenceOptions) {
    return this.call<TranscribeResult>('POST', '/v1/transcribe', { path: req.path, agent_channel: req.agentChannel }, 60 * 60_000, Transcription, options)
  }
  async diarize(req: { path: string; segments: TranscribeSegment[] }, options?: InferenceOptions) {
    const result = await this.call<DiarizeResult>('POST', '/v1/diarize', req, 30 * 60_000, Diarization, options)
    if (result.method !== 'none' && result.speakers.length !== req.segments.length)
      throw new InferenceError('failed', 'Mô hình trả số nhãn người nói không khớp transcript.')
    return result
  }
  async emotion(req: { path: string; utterances: EmotionRequestItem[]; agentChannel: number }, options?: InferenceOptions) {
    const result = await this.call<EmotionResult>('POST', '/v1/emotion', { path: req.path, utterances: req.utterances, agent_channel: req.agentChannel }, 30 * 60_000, Emotions, options)
    const expected = new Set(req.utterances.map((u) => u.id))
    const actual = new Set(result.predictions.map((p) => p.id))
    if (result.predictions.length !== expected.size || actual.size !== expected.size || [...actual].some((id) => !expected.has(id)))
      throw new InferenceError('failed', 'Mô hình trả kết quả thiếu, trùng hoặc sai mã câu nói.')
    return result
  }
}
