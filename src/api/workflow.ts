import { apiJson } from './isemotalk'

export type Resolution = 'unassessed' | 'open' | 'follow_up' | 'resolved'
export const resolutionLabels: Record<Resolution, string> = {
  unassessed: 'Chưa xác định', open: 'Đang xử lý', follow_up: 'Cần gọi lại', resolved: 'Đã giải quyết',
}
export interface WorkflowFields {
  externalContactId: string
  ticketId: string
  queueName: string
  reason: string
  resolution: Resolution
  nextAction: string
  owner: string
  followUpAt: string | null
  outcomeNote: string
  reviewerName: string
}
export interface CallWorkflow extends WorkflowFields {
  callId: string
  version: number
  updatedAt: string | null
  history: Array<{
    version: number; at: string; reviewerName: string; changedFields: string[];
    resolution: Resolution; outcomeNote: string; nextAction: string; owner: string; followUpAt: string | null;
  }>
}
export const workflowFields = (w: WorkflowFields): WorkflowFields => ({
  externalContactId: w.externalContactId, ticketId: w.ticketId, queueName: w.queueName, reason: w.reason,
  resolution: w.resolution, nextAction: w.nextAction, owner: w.owner, followUpAt: w.followUpAt,
  outcomeNote: w.outcomeNote, reviewerName: w.reviewerName,
})

export function getWorkflow(callId: string, signal?: AbortSignal) {
  return apiJson<CallWorkflow>(`/api/calls/${encodeURIComponent(callId)}/workflow`, { signal })
}
export function saveWorkflow(callId: string, baseVersion: number, fields: WorkflowFields, signal?: AbortSignal) {
  return apiJson<CallWorkflow>(`/api/calls/${encodeURIComponent(callId)}/workflow`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseVersion, ...fields }), signal,
  })
}

/** datetime-local uses the browser's timezone; persistence always uses ISO UTC. */
export function localDateTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
