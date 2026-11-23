// Typed client for the existing Express + SQLite application API.
// All timestamps are seconds; all model confidence values are in [0, 1].
export type Emotion = 'neutral' | 'happy' | 'sad' | 'angry'
export type Speaker = 'agent' | 'customer' | 'unknown'
export type Provenance = 'mock' | 'real' | 'imported'
export type ReviewStatus = 'unreviewed' | 'in_progress' | 'reviewed'
export type ProcessingStatus = 'queued' | 'processing' | 'ready' | 'failed'
export type Priority = 'low' | 'medium' | 'high'

export interface Prediction {
  emotion: Emotion
  confidence: number
}

export interface Utterance {
  id: string
  idx: number
  speaker: Speaker
  text: string
  start: number
  end: number
  acoustic: Prediction | null
  lexical: Prediction | null
  fused: Prediction | null
  agreement: 'high' | 'partial' | 'conflict' | null
  review: { decision: 'confirmed' | 'corrected' | null; emotion: Emotion | null; note: string }
  flagged: boolean
  textEdited: boolean
  speakerEdited: boolean
  originalText?: string
  originalSpeaker?: Speaker
  predictionInputChanged?: boolean
}

export interface Moment {
  id: string
  type: string
  start: number
  end: number
  description: string
  utteranceIds: string[]
  relevance: boolean | null
  note: string
  reviewOutdated?: boolean
}

export interface CallItem {
  id: string
  title: string
  agentName: string
  customerName: string
  callDate: string
  duration: number
  source: string
  provenance: Provenance | null
  status: ProcessingStatus
  stage: string | null
  progress: number
  error: string | null
  priority: Priority
  dominantEmotion: Emotion | null
  negativeRatio: number
  momentCount: number
  disagreementCount: number
  reviewStatus: ReviewStatus
  hasAudio: boolean
  utteranceCount: number
  reviewedCount: number
  updatedAt: string
  qaTriage?: { label: 'routine' | 'needs_attention'; score: number; outdated: boolean; truncated: boolean } | null
}

export type StageKey = 'validate' | 'transcribe' | 'diarize' | 'emotion' | 'finalize'
export interface StageEntry {
  stage: StageKey
  state: 'pending' | 'running' | 'done' | 'skipped' | 'failed'
  startedAt?: string
  endedAt?: string
  detail?: string
  durationMs?: number
  provenance?: Provenance
  evidence?: { adapter: string; model?: string; device?: string; mock: boolean; verified?: boolean; timingMode?: 'word_aligned' | 'audio_window'; timingWarning?: string; speakerTurns?: Array<{ start: number; end: number; speakerId: 'A' | 'B' }> }
}

export interface ComponentHealth {
  adapter: string
  ready: boolean
  mock: boolean
  verified?: boolean
  loaded?: boolean
  detail: string
}
export interface InferenceHealth {
  status: 'ok' | 'degraded'
  mode: 'mock' | 'real' | 'mixed'
  device: string
  ffmpeg: boolean
  components: {
    asr: ComponentHealth
    diarization: ComponentHealth
    ser: ComponentHealth
  }
  qa?: { ready: boolean; loaded?: boolean; adapter?: string; detail?: string; domain?: string }
}
export interface SystemStatus {
  api: 'ok'
  previewOnly?: boolean
  demoData?: boolean
  speechDemo?: boolean
  automation?: { qa: boolean; asr: boolean; ser: boolean }
  inference: { reachable: boolean; error?: string } & Partial<InferenceHealth>
}

export interface CallDetail extends CallItem {
  stageLog: StageEntry[]
  attempts: number
  audioUrl: string | null
  audioName: string | null
  peaks: number[] | null
  speakerSource: string | null
  version: number
  overallNote: string
  reviewedAt: string | null
  avgConfidence: number | null
  escalationCount: number
  recoveryCount: number
  utterances: Utterance[]
  moments: Moment[]
}

export interface CallList {
  items: CallItem[]
  total: number
  page: number
  pageSize: number
  counts: { total: number; attention: number; processing: number; failed: number; qaAttention?: number; qaPending?: number }
}

export interface Analytics {
  totals: { calls: number; utterances: number; durationSeconds: number }
  status: { ready: number; processing: number; failed: number }
  provenance: { mock: number; real: number; imported: number; unknown: number }
  qaTriage?: { eligible: number; scored: number; needsAttention: number; routine: number; waiting: number; needsRerun: number }
  review: { unreviewed: number; in_progress: number; reviewed: number; completionRate: number }
  priority: { high: number; medium: number; low: number; unknown?: number }
  customerEmotion: Record<Emotion, number>
  coverage?: {
    customerUtterances: number
    customerWithEmotion: number
    unknownSpeakerUtterances: number
    unpredictedUtterances: number
    callsWithCustomerEmotion: number
  }
  modality: { utterancesWithBoth: number; conflicts: number; conflictRate: number | null }
  moments: { byType: Record<string, number>; relevance: { relevant: number; notRelevant: number; undecided: number } }
  attention: Array<{ id: string; title: string; agentName: string; negativeRatio: number; momentCount: number; provenance: Provenance | null }>
}

export interface ReviewPatch {
  decision?: 'confirmed' | 'corrected' | null
  emotion?: Emotion | null
  note?: string
  flagged?: boolean
  text?: string
  speaker?: Speaker
}

export interface ReviewPayload {
  baseVersion: number
  utterances: Record<string, ReviewPatch>
  moments: Record<string, { relevance: boolean | null; note?: string }>
  overallNote?: string
  complete?: boolean
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly caseId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// In local development connect directly to the Express API. This also works when
// Vite was launched before its proxy config was updated (a common HMR pitfall).
// For a deployed build, same-origin /api remains the default.
const requestedApiOrigin: string =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? 'http://127.0.0.1:3001' : '')
const apiOrigin = requestedApiOrigin.endsWith('/') ? requestedApiOrigin.slice(0, -1) : requestedApiOrigin

export function resolveApiUrl(url: string | null): string | undefined {
  if (!url) return undefined
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return apiOrigin + (url.startsWith('/') ? url : '/' + url)
}

function requireShape<T>(value: T, valid: (input: T) => boolean, endpoint: string): T {
  if (!valid(value)) {
    throw new ApiError('API ' + endpoint + ' trả cấu trúc dữ liệu không hợp lệ. Hãy kiểm tra phiên bản ứng dụng rồi thử lại.', 502)
  }
  return value
}

export async function apiJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(resolveApiUrl(url)!, { ...options, headers: { Accept: 'application/json', ...(options.headers ?? {}) } })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ApiError('Không kết nối được dịch vụ. Kiểm tra ứng dụng máy chủ đang chạy rồi thử lại.', 0)
  }
  options.signal?.throwIfAborted()

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new ApiError(
      'API trả về nội dung không phải JSON (' + (contentType || 'không có Content-Type') +
      '). Hãy kiểm tra kết nối và phiên bản ứng dụng.',
      response.status,
    )
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    options.signal?.throwIfAborted()
    throw new ApiError('Không đọc được phản hồi từ dịch vụ.', response.status)
  }
  options.signal?.throwIfAborted()

  if (!response.ok) {
    const errorBody = body as { error?: unknown; code?: unknown; details?: unknown; caseId?: unknown } | null
    const details: string[] = []
    if (Array.isArray(errorBody?.details)) {
      for (const detail of errorBody.details) {
        if (typeof detail !== 'string') continue
        const readable = detail.replace(/\s+/g, ' ').trim()
        if (!readable) continue
        details.push(readable.length > 240 ? readable.slice(0, 239) + '…' : readable)
        if (details.length === 3) break
      }
    }
    const summary = typeof errorBody?.error === 'string' ? errorBody.error : 'API trả lỗi HTTP ' + response.status + '.'
    throw new ApiError([summary, ...details.map(detail => '• ' + detail)].join('\n'), response.status,
      typeof errorBody?.code === 'string' ? errorBody.code : undefined,
      typeof errorBody?.caseId === 'string' && /^CASE-[0-9]{6,19}$/.test(errorBody.caseId) ? errorBody.caseId : undefined)
  }
  if (body == null || typeof body !== 'object') {
    throw new ApiError('API không trả dữ liệu JSON hợp lệ.', 502)
  }
  return body as T
}

export function getCalls(
  filters: { search?: string; review?: string; priority?: string; provenance?: string; status?: string; datasetScope?: 'business'|'speech_only'|'all'; sort?: 'qa_attention'|'date'; page?: number; pageSize?: number },
  signal?: AbortSignal,
): Promise<CallList> {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.review) params.set('review', filters.review)
  if (filters.priority) params.set('priority', filters.priority)
  if (filters.provenance) params.set('provenance', filters.provenance)
  if (filters.status) params.set('status', filters.status)
  if (filters.datasetScope) params.set('datasetScope', filters.datasetScope)
  params.set('sort', filters.sort === 'qa_attention' ? 'qa_attention' : 'date')
  params.set('dir', 'desc')
  params.set('page', String(filters.page ?? 1))
  params.set('pageSize', String(filters.pageSize ?? 15))
  return apiJson<CallList>('/api/calls?' + params.toString(), { signal })
    .then(data => requireShape(data, x => Array.isArray(x.items) && typeof x.total === 'number' && !!x.counts, '/api/calls'))
}

export function getCall(id: string, signal?: AbortSignal): Promise<CallDetail> {
  return apiJson<CallDetail>('/api/calls/' + encodeURIComponent(id), { signal })
    .then(data => requireShape(data, x => Array.isArray(x.utterances) && Array.isArray(x.moments) && typeof x.version === 'number', '/api/calls/:id'))
}

export function saveReview(id: string, payload: ReviewPayload): Promise<CallDetail> {
  return apiJson<CallDetail>('/api/calls/' + encodeURIComponent(id) + '/review', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(data => requireShape(data, x => Array.isArray(x.utterances) && typeof x.version === 'number', '/api/calls/:id/review'))
}

export function getAnalytics(signal?: AbortSignal, filters: { provenance?: string } = {}): Promise<Analytics> {
  const params = new URLSearchParams()
  if (filters.provenance) params.set('provenance', filters.provenance)
  return apiJson<Analytics>('/api/analytics' + (params.size ? '?' + params.toString() : ''), { signal })
    .then(data => requireShape(data, x => !!x.totals && !!x.review && !!x.customerEmotion, '/api/analytics'))
}

export function getSystemStatus(signal?: AbortSignal): Promise<SystemStatus> {
  return apiJson<SystemStatus>('/api/system/status', { signal })
    .then(data => requireShape(data, x => x.api === 'ok' && !!x.inference, '/api/system/status'))
}

export function uploadRecording(form: FormData): Promise<{ id: string }> {
  return apiJson<{ id: string }>('/api/calls/upload', { method: 'POST', body: form })
    .then(data => requireShape(data, x => typeof x.id === 'string', '/api/calls/upload'))
}

export function importAnalysis(form: FormData): Promise<{ id: string }> {
  return apiJson<{ id: string }>('/api/calls/import', { method: 'POST', body: form })
    .then(data => requireShape(data, x => typeof x.id === 'string', '/api/calls/import'))
}

export function retryProcessing(id: string): Promise<{ id: string }> {
  return apiJson<{ id: string }>('/api/calls/' + encodeURIComponent(id) + '/retry', { method: 'POST' })
}

export const stageLabels: Record<StageKey, string> = {
  validate: 'Kiểm tra âm thanh',
  transcribe: 'Chuyển giọng nói thành văn bản',
  diarize: 'Nhận diện người nói',
  emotion: 'Phân tích cảm xúc',
  finalize: 'Tổng hợp kết quả',
}

export const emotionLabels: Record<Emotion, string> = {
  neutral: 'Bình thường',
  happy: 'Vui',
  sad: 'Buồn',
  angry: 'Tức giận',
}

export const emotionColors: Record<Emotion, string> = {
  neutral: '#94a3b8',
  happy: '#10b981',
  sad: '#3b82f6',
  angry: '#ef4444',
}

export const emotionBadgeClasses: Record<Emotion, string> = {
  neutral: 'border-slate-300 bg-slate-100 text-slate-800',
  happy: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  sad: 'border-blue-200 bg-blue-50 text-blue-900',
  angry: 'border-red-200 bg-red-50 text-red-900',
}

export const speakerLabels: Record<Speaker, string> = { agent: 'Nhân viên', customer: 'Khách hàng', unknown: 'Chưa rõ người nói' }

export function clock(seconds: number): string {
  const n = Math.max(0, Math.floor(seconds || 0))
  return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0')
}

export function percent(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) || value < 0 || value > 1 ? '—' : String(Math.round(value * 100)) + '%'
}

export function provenanceLabel(value: Provenance | null): string {
  if (value === 'mock') return 'Dữ liệu demo · AI mô phỏng'
  if (value === 'imported') return 'Kết quả nhập từ tệp'
  if (value === 'real') return 'Kết quả inference'
  return 'Chưa xác định nguồn dữ liệu'
}
