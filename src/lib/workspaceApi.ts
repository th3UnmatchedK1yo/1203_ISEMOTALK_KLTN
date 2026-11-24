export type Emotion = 'neutral' | 'happy' | 'sad' | 'angry'
export type Prediction = { emotion: Emotion; confidence: number }
export type Provenance = 'real' | 'mock' | 'imported' | null
export type CallStatus = 'queued' | 'processing' | 'ready' | 'failed'
export type ReviewStatus = 'unreviewed' | 'in_progress' | 'reviewed'
export type Priority = 'low' | 'medium' | 'high'
export type Speaker = 'agent' | 'customer' | 'unknown'
export interface CallItem {
  id: string; title: string; callDate: string; duration: number; provenance: Provenance;
  status: CallStatus; stage: string | null; progress: number; error: string | null;
  priority: Priority; dominantEmotion: Emotion | null; negativeRatio: number;
  momentCount: number; disagreementCount: number; reviewStatus: ReviewStatus;
  hasAudio: boolean; utteranceCount: number; reviewedCount: number;
  agentName: string; customerName: string;
}
export interface Utterance {
  id: string; speaker: Speaker; start: number; end: number; text: string;
  acoustic: Prediction | null; lexical: Prediction | null; fused: Prediction | null;
  agreement: 'high' | 'partial' | 'conflict' | null;
  review: { decision: 'confirmed' | 'corrected' | null; emotion: Emotion | null; note: string };
  flagged: boolean;
}
export interface Moment {
  id: string; type: string; start: number; end: number; description: string;
  utteranceIds: string[]; relevance: boolean | null; note: string;
}
export interface CallDetail extends CallItem {
  audioUrl: string | null; audioName: string | null; speakerSource: string | null;
  version: number; overallNote: string; utterances: Utterance[]; moments: Moment[];
  stageLog: { stage: string; state: string; detail?: string }[];
}
export interface CallList {
  items: CallItem[]; total: number; page: number; pageSize: number;
  counts: { total: number; attention: number; processing: number; failed: number };
}
interface ComponentHealth { adapter: string; ready: boolean; mock: boolean; verified?: boolean; detail: string }
export interface SystemStatus {
  api: string;
  inference: { reachable: boolean; status?: string; mode?: 'real' | 'mixed' | 'mock'; device?: string;
    ffmpeg?: boolean; error?: string; components?: { asr: ComponentHealth; ser: ComponentHealth; diarization: ComponentHealth } };
}
export interface Analytics {
  totals: { calls: number; utterances: number; durationSeconds: number };
  status: { ready: number; processing: number; failed: number };
  priority: Record<Priority, number>;
  review: Record<ReviewStatus, number> & { completionRate: number };
  customerEmotion: Record<Emotion, number>;
  modelQuality: { reviewed: number; confirmed: number; corrected: number; agreementRate: number | null };
  modality: { utterancesWithBoth: number; conflicts: number; conflictRate: number | null };
  moments: { byType: Record<string, number>; relevance: { relevant: number; notRelevant: number; undecided: number } };
}
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new ApiError(body?.error || 'API trả lỗi ' + response.status, response.status)
  }
  if (response.status === 204) return undefined as T
  if (!response.headers.get('content-type')?.includes('application/json')) throw new ApiError('API không trả JSON. Kiểm tra proxy Vite và máy chủ Express.', response.status)
  return await response.json() as T
}
export const json = (body: unknown): RequestInit => ({
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
})
export const callPath = (id: string) => '/api/calls/' + encodeURIComponent(id)
export const emotions: Record<Emotion, string> = { neutral: 'Trung tính', happy: 'Vui', sad: 'Buồn', angry: 'Giận' }
export const provenanceLabel = (p: Provenance) => p === 'real' ? 'Inference thật' : p === 'mock' ? 'DỮ LIỆU MÔ PHỎNG' : p === 'imported' ? 'Kết quả nhập ngoài' : 'Chưa có kết quả'
export const stages: Record<string, string> = { validate: 'Kiểm tra audio', transcribe: 'ASR', diarize: 'Tách người nói', emotion: 'SER', finalize: 'Tổng hợp' }
export const statuses: Record<CallStatus, string> = { queued: 'Chờ xử lý', processing: 'Đang xử lý', ready: 'Đã phân tích', failed: 'Lỗi' }
export const reviewLabels: Record<ReviewStatus, string> = { unreviewed: 'Chưa xem', in_progress: 'Đang xem', reviewed: 'Đã xác minh' }
export const priorities: Record<Priority, string> = { low: 'Thấp', medium: 'Vừa', high: 'Cao' }
export const speakers: Record<Speaker, string> = { agent: 'Nhân viên', customer: 'Khách hàng', unknown: 'Chưa xác định' }
export const time = (sec: number) => { const s = Math.max(0, Math.floor(sec || 0)); return Math.floor(s / 60).toString().padStart(2, '0') + ':' + (s % 60).toString().padStart(2, '0') }
export const pct = (n: number | null | undefined) => n == null ? '—' : Math.round(n * 100) + '%'
export function uploadFile(file: File, agentChannel: string) {
  const body = new FormData(); body.set('audio', file); body.set('agentChannel', agentChannel)
  return request<{ id: string }>('/api/calls/upload', { method: 'POST', body })
}
