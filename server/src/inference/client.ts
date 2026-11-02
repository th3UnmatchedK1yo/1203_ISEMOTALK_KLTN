import type { Prediction, Speaker } from '../domain'

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
}

export interface DiarizeResult {
  speakers: Speaker[] // aligned with the request segments
  method: 'model' | 'mock' | 'none'
  detail?: string
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
}

export type InferenceErrorCode = 'unavailable' | 'not_ready' | 'bad_input' | 'failed'

export class InferenceError extends Error {
  constructor(public code: InferenceErrorCode, message: string) {
    super(message)
  }
}

export interface InferenceClient {
  health(): Promise<HealthInfo>
  probe(req: { path: string }): Promise<ProbeResult>
  transcribe(req: { path: string; agentChannel: number }): Promise<TranscribeResult>
  diarize(req: { path: string; segments: TranscribeSegment[] }): Promise<DiarizeResult>
  emotion(req: { path: string; utterances: EmotionRequestItem[] }): Promise<EmotionResult>
}

export class HttpInferenceClient implements InferenceClient {
  constructor(private baseUrl: string) {}

  private async call<T>(method: 'GET' | 'POST', route: string, body: unknown, timeoutMs: number): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${route}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
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
    return (await res.json()) as T
  }

  health() {
    return this.call<HealthInfo>('GET', '/v1/health', undefined, 4_000)
  }
  probe(req: { path: string }) {
    return this.call<ProbeResult>('POST', '/v1/audio/probe', req, 120_000)
  }
  transcribe(req: { path: string; agentChannel: number }) {
    return this.call<TranscribeResult>('POST', '/v1/transcribe', { path: req.path, agent_channel: req.agentChannel }, 60 * 60_000)
  }
  diarize(req: { path: string; segments: TranscribeSegment[] }) {
    return this.call<DiarizeResult>('POST', '/v1/diarize', req, 30 * 60_000)
  }
  emotion(req: { path: string; utterances: EmotionRequestItem[] }) {
    return this.call<EmotionResult>('POST', '/v1/emotion', req, 30 * 60_000)
  }
}
