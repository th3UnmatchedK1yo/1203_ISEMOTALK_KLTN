import type { CaseDetail, CaseList, CaseListItem, FollowUpAttempt, FollowUpTask, ServiceCase, ServiceContact, ServiceEvent } from '../../shared/service-contract'
import type { DB } from './db'
import { HttpError } from './review'
import type { CaseQuery } from './service-validation'

const caseCols = `c.id, c.title, c.customer_name AS customerName, c.customer_ref AS customerRef, c.queue_name AS queueName,
  c.external_ticket_id AS externalTicketId, c.reason, c.owner, c.status, c.outcome_note AS outcomeNote, c.version,
  c.created_at AS createdAt, c.updated_at AS updatedAt, c.resolved_at AS resolvedAt`
export const contactCols = `id, case_id AS caseId, direction, disposition, occurred_at AS occurredAt,
  external_contact_id AS externalContactId, note, call_id AS callId, recorded_call_id AS recordedCallId, source, created_at AS createdAt`
export const taskCols = `id, case_id AS caseId, kind, action, owner, due_at AS dueAt, status, result_note AS resultNote,
  created_at AS createdAt, updated_at AS updatedAt`
const attemptCols = `id, case_id AS caseId, task_id AS taskId, actor, occurred_at AS occurredAt, outcome, note, next_due_at AS nextDueAt`

export function readCase(db: DB, id: string): ServiceCase {
  const row = db.prepare(`SELECT ${caseCols} FROM service_cases c WHERE id=?`).get(id) as ServiceCase | undefined
  if (!row) throw new HttpError(404, 'Không tìm thấy vụ việc.')
  return row
}

export function readPendingTask(db: DB, caseId: string, taskId: string): FollowUpTask {
  const row = db.prepare(`SELECT ${taskCols} FROM follow_up_tasks WHERE case_id=? AND id=?`).get(caseId, taskId) as FollowUpTask | undefined
  if (!row) throw new HttpError(404, 'Không tìm thấy công việc trong vụ việc này.')
  if (row.status !== 'pending') throw new HttpError(409, 'Công việc đã kết thúc. Hãy tạo công việc mới nếu cần.')
  return row
}

// Caller holds one transaction so related rows, totals and snapshots describe the same version.
export function readCaseDetail(db: DB, id: string, fullHistory = false): CaseDetail {
  const current = readCase(db, id)
  const contacts = db.prepare(`SELECT ${contactCols} FROM service_contacts WHERE case_id=? ORDER BY occurred_at DESC,id DESC`).all(id) as ServiceContact[]
  const tasks = db.prepare(`SELECT ${taskCols} FROM follow_up_tasks WHERE case_id=? ORDER BY due_at,id`).all(id) as FollowUpTask[]
  const attempts = db.prepare(`SELECT ${attemptCols} FROM follow_up_attempts WHERE case_id=? ORDER BY occurred_at DESC,id DESC`).all(id) as FollowUpAttempt[]
  const rows = db.prepare(`SELECT case_id AS caseId, version, at, actor, kind, change_note AS changeNote, snapshot_json AS json
    FROM service_events WHERE case_id=? ORDER BY version DESC ${fullHistory ? '' : 'LIMIT 100'}`).all(id) as Array<Omit<ServiceEvent,'snapshot'> & { json: string }>
  const history = rows.map(({ json, ...event }) => ({ ...event, snapshot: JSON.parse(json) }))
  const { total } = db.prepare('SELECT count(*) AS total FROM service_events WHERE case_id=?').get(id) as { total: number }
  return { case: current, contacts, tasks, attempts, history, historyTotal: total }
}

export function listCases(db: DB, query: CaseQuery): CaseList {
  const parts: string[] = []
  const params: Record<string, string | number> = { now: new Date().toISOString(), limit: query.pageSize, offset: (query.page - 1) * query.pageSize }
  if (query.search) {
    params.search = '%' + query.search.replace(/[\\%_]/g, ch => '\\' + ch) + '%'
    const searchable = ['id','title','customer_name','customer_ref','queue_name','external_ticket_id','owner','reason']
    parts.push('(' + searchable.map(col => `c.${col} LIKE @search ESCAPE '\\'`).join(' OR ') + ')')
  }
  if (query.status) { parts.push('c.status=@status'); params.status = query.status }
  if (query.owner) { parts.push('c.owner=@owner'); params.owner = query.owner }
  if (query.callId) {
    parts.push('EXISTS (SELECT 1 FROM service_contacts WHERE case_id=c.id AND call_id=@callId)')
    params.callId = query.callId
  }
  const pending = "FROM follow_up_tasks WHERE case_id=c.id AND status='pending'"
  const overdue = pending + ' AND due_at<@now'
  if (query.overdue === '1') parts.push(`EXISTS (SELECT 1 ${overdue})`)
  const from = 'FROM service_cases c' + (parts.length ? ' WHERE ' + parts.join(' AND ') : '')
  const { total } = db.prepare('SELECT count(*) AS total ' + from).get(params) as { total: number }
  const items = db.prepare(`SELECT ${caseCols}, (SELECT count(*) ${pending}) AS openTaskCount,
    (SELECT count(*) ${overdue}) AS overdueTaskCount, (SELECT MIN(due_at) ${pending}) AS nextDueAt,
    (SELECT count(*) FROM service_contacts WHERE case_id=c.id) AS contactCount
    ${from} ORDER BY c.updated_at DESC,c.id DESC LIMIT @limit OFFSET @offset`).all(params) as CaseListItem[]
  return { items, total, page: query.page, pageSize: query.pageSize }
}
