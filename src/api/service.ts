import { apiJson } from './isemotalk'
import type { AttemptOutcome, CaseDetail, CaseFields, CaseList, CaseStatus, ContactInput, TaskInput, TaskStatus } from '../../shared/service-contract'
export type * from '../../shared/service-contract'

const casesUrl = '/api/cases'
const detailUrl = (id: string) => `${casesUrl}/${encodeURIComponent(id)}`
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export function getCases(filters: { search?: string; status?: CaseStatus | ''; owner?: string; overdue?: boolean; callId?: string; page?: number; pageSize?: number } = {}, signal?: AbortSignal) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value !== '' && value != null && value !== false) params.set(key, value === true ? '1' : String(value))
  return apiJson<CaseList>(`${casesUrl}?${params}`, { signal })
}
export const getCase = (id: string, signal?: AbortSignal) => apiJson<CaseDetail>(detailUrl(id), { signal })
export const createCase = (body: CaseFields & { actor: string; requestId?: string; contact?: ContactInput; task?: TaskInput }) => apiJson<CaseDetail>(casesUrl, json('POST', body))
export const updateCase = (id: string, body: CaseFields & { actor: string; baseVersion: number; changeNote?: string }) => apiJson<CaseDetail>(detailUrl(id), json('PUT', body))
export const addContact = (id: string, body: ContactInput & { actor: string; baseVersion: number }) => apiJson<CaseDetail>(`${detailUrl(id)}/contacts`, json('POST', body))
export const addTask = (id: string, body: TaskInput & { actor: string; baseVersion: number }) => apiJson<CaseDetail>(`${detailUrl(id)}/tasks`, json('POST', body))
export const updateTask = (id: string, taskId: string, body: { action: string; owner: string; dueAt: string; status: TaskStatus; resultNote: string; actor: string; baseVersion: number }) => apiJson<CaseDetail>(`${detailUrl(id)}/tasks/${encodeURIComponent(taskId)}`, json('PUT', body))
export const recordAttempt = (id: string, taskId: string, body: { outcome: AttemptOutcome; note: string; nextDueAt?: string; occurredAt?: string; actor: string; baseVersion: number }) => apiJson<CaseDetail>(`${detailUrl(id)}/tasks/${encodeURIComponent(taskId)}/attempts`, json('POST', body))

export const caseLabels = { open: 'Đang xử lý', waiting_customer: 'Chờ khách phản hồi', waiting_internal: 'Chờ nội bộ', resolved: 'Đã giải quyết' } as const
export const contactLabels = { recording: 'Có hồ sơ cuộc gọi để QA', callback_requested: 'Khách yêu cầu gọi lại', abandoned_in_queue: 'Khách rời hàng đợi', agent_unanswered: 'Một nhân viên không nhận lượt gọi', no_recording: 'Đã liên hệ, không có bản ghi', unknown: 'Chưa rõ kết quả liên hệ' } as const
export const directionLabels = { inbound: 'Khách gọi đến', outbound: 'Nhân viên gọi ra', unknown: 'Chưa xác định chiều gọi' } as const
export const taskLabels = { callback: 'Gọi lại khách', backoffice: 'Xử lý nội bộ' } as const
export const taskStatusLabels = { pending: 'Cần thực hiện', completed: 'Đã hoàn thành', cancelled: 'Đã hủy' } as const
export const attemptLabels = { connected: 'Đã nói chuyện với khách', no_answer: 'Khách không nghe máy', busy: 'Máy bận', voicemail: 'Gặp hộp thư thoại / IVR' } as const
export const eventLabels = { case_created: 'Tạo vụ việc', case_updated: 'Cập nhật vụ việc', case_resolved: 'Giải quyết vụ việc', case_reopened: 'Mở lại vụ việc', contact_added: 'Thêm lần liên hệ', task_added: 'Giao việc', task_updated: 'Cập nhật công việc', callback_attempted: 'Ghi nhận lần gọi lại', recording_deleted: 'Xóa bản ghi đã liên kết' } as const
export function dateLabel(value: string | null | undefined) { return value ? new Date(value).toLocaleString('vi-VN') : 'Chưa đặt' }
export function isoFromLocal(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('Hãy nhập ngày và giờ hợp lệ.')
  return date.toISOString()
}
