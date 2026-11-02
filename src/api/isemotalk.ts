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
}

export interface CallDetail extends CallItem {
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
  counts: { total: number; attention: number; processing: number; failed: number }
}

export interface Analytics {
  totals: { calls: number; utterances: number; durationSeconds: number }
  status: { ready: number; processing: number; failed: number }
  provenance: { mock: number; real: number; imported: number; unknown: number }
  review: { unreviewed: number; in_progress: number; reviewed: number; completionRate: number }
  priority: { high: number; medium: number; low: number }
  customerEmotion: Record<Emotion, number>
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
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// In local development connect directly to the Express API. This also works when
// Vite was launched before its proxy config was updated (a common HMR pitfall).
// For a deployed build, same-origin /api remains the default.
const apiOrigin = (
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? 'http://127.0.0.1:3001' : '')
).replace(/\\/$/, '')

export function resolveApiUrl(url: string | null): string | undefined {
  if (!url) return undefined
  if (/^https?:\\/\\//.test(url)) return url
  return apiOrigin + (url.startsWith('/') ? url : '/' + url)
}

function requireShape<T>(value: T, valid: (input: T) => boolean, endpoint: string): T {
  if (!valid(value)) {
    throw new ApiError('API ' + endpoint + ' trả cấu trúc dữ liệu không hợp lệ. Kiểm tra cổng backend và phiên bản code.', 502)
  }
  return value
}

async function json<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(resolveApiUrl(url)!, { ...options, headers: { Accept: 'application/json', ...(options.headers ?? {}) } })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ApiError('Không kết nối được Express API tại cổng 3001. Mở PowerShell và chạy npm run dev:api.', 0)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new ApiError(
      'API trả về nội dung không phải JSON (' + (contentType || 'không có Content-Type') +
      '). Có thể request /api đang bị Vite trả về index.html. Hãy kiểm tra backend cổng 3001.',
      response.status,
    )
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApiError('Không đọc được JSON từ Express API.', response.status)
  }

  if (!response.ok) {
    const errorBody = body as { error?: string; code?: string } | null
    throw new ApiError(errorBody?.error ?? 'API trả lỗi HTTP ' + response.status + '.', response.status, errorBody?.code)
  }
  if (body == null || typeof body !== 'object') {
    throw new ApiError('API không trả dữ liệu JSON hợp lệ.', 502)
  }
  return body as T
}

export function getCalls(
  filters: { search?: string; review?: string; priority?: string; page?: number; pageSize?: number },
  signal?: AbortSignal,
): Promise<CallList> {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.review) params.set('review', filters.review)
  if (filters.priority) params.set('priority', filters.priority)
  params.set('sort', 'date')
  params.set('dir', 'desc')
  params.set('page', String(filters.page ?? 1))
  params.set('pageSize', String(filters.pageSize ?? 15))
  return json<CallList>('/api/calls?' + params.toString(), { signal })
    .then(data => requireShape(data, x => Array.isArray(x.items) && typeof x.total === 'number' && !!x.counts, '/api/calls'))
}

export function getCall(id: string, signal?: AbortSignal): Promise<CallDetail> {
  return json<CallDetail>('/api/calls/' + encodeURIComponent(id), { signal })
    .then(data => requireShape(data, x => Array.isArray(x.utterances) && Array.isArray(x.moments) && typeof x.version === 'number', '/api/calls/:id'))
}

export function saveReview(id: string, payload: ReviewPayload): Promise<CallDetail> {
  return json<CallDetail>('/api/calls/' + encodeURIComponent(id) + '/review', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(data => requireShape(data, x => Array.isArray(x.utterances) && typeof x.version === 'number', '/api/calls/:id/review'))
}

export function getAnalytics(signal?: AbortSignal): Promise<Analytics> {
  return json<Analytics>('/api/analytics', { signal })
    .then(data => requireShape(data, x => !!x.totals && !!x.review && !!x.customerEmotion, '/api/analytics'))
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

export function clock(seconds: number): string {
  const n = Math.max(0, Math.floor(seconds || 0))
  return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0')
}

export function percent(value: number | null | undefined): string {
  return value == null ? '—' : String(Math.round(value * 100)) + '%'
}

export function provenanceLabel(value: Provenance | null): string {
  if (value === 'mock') return 'Dữ liệu demo · AI mô phỏng'
  if (value === 'imported') return 'Kết quả nhập từ tệp'
  if (value === 'real') return 'Kết quả inference'
  return 'Chưa xác định nguồn dữ liệu'
}
