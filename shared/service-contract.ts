export const caseStatuses = ['open', 'waiting_customer', 'waiting_internal', 'resolved'] as const
export const contactDirections = ['inbound', 'outbound', 'unknown'] as const
export const contactDispositions = ['recording', 'callback_requested', 'abandoned_in_queue', 'agent_unanswered', 'no_recording', 'unknown'] as const
export const taskKinds = ['callback', 'backoffice'] as const
export const taskStatuses = ['pending', 'completed', 'cancelled'] as const
export const attemptOutcomes = ['connected', 'no_answer', 'busy', 'voicemail'] as const
export const eventKinds = ['case_created', 'case_updated', 'case_resolved', 'case_reopened', 'contact_added', 'task_added', 'task_updated', 'callback_attempted', 'recording_deleted'] as const
export type CaseStatus = typeof caseStatuses[number]
export type ContactDirection = typeof contactDirections[number]
export type ContactDisposition = typeof contactDispositions[number]
export type TaskKind = typeof taskKinds[number]
export type TaskStatus = typeof taskStatuses[number]
export type AttemptOutcome = typeof attemptOutcomes[number]
export type ServiceEventKind = typeof eventKinds[number]

export interface CaseFields {
  title: string
  customerName: string
  customerRef: string
  queueName: string
  externalTicketId: string
  reason: string
  owner: string
  status: CaseStatus
  outcomeNote: string
}
export interface ServiceCase extends CaseFields {
  id: string
  version: number
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}
export interface CaseListItem extends ServiceCase {
  openTaskCount: number
  overdueTaskCount: number
  nextDueAt: string | null
  contactCount: number
}
export interface CaseList {
  items: CaseListItem[]
  total: number
  page: number
  pageSize: number
}
export interface ContactInput {
  direction: ContactDirection
  disposition: ContactDisposition
  occurredAt: string
  externalContactId: string
  note: string
  callId?: string | null
}
export interface ServiceContact extends ContactInput {
  id: string
  caseId: string
  callId: string | null
  recordedCallId: string | null
  source: 'manual' | 'recording_import'
  createdAt: string
}
export interface TaskInput {
  kind: TaskKind
  action: string
  owner: string
  dueAt: string
}
export interface FollowUpTask extends TaskInput {
  id: string
  caseId: string
  status: TaskStatus
  resultNote: string
  createdAt: string
  updatedAt: string
}
export interface FollowUpAttempt {
  id: string
  taskId: string
  caseId: string
  actor: string
  occurredAt: string
  outcome: AttemptOutcome
  note: string
  nextDueAt: string | null
}
export interface ServiceSnapshot {
  case: ServiceCase
  contact?: ServiceContact
  task?: FollowUpTask
  attempt?: FollowUpAttempt
}
export interface ServiceEvent {
  caseId: string
  version: number
  at: string
  actor: string
  kind: ServiceEventKind
  changeNote: string
  snapshot: ServiceSnapshot
}
export interface CaseDetail {
  case: ServiceCase
  contacts: ServiceContact[]
  tasks: FollowUpTask[]
  attempts: FollowUpAttempt[]
  history: ServiceEvent[]
  historyTotal: number
}
