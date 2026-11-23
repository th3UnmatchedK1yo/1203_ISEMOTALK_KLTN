import { createHash } from 'node:crypto'
import type { z } from 'zod'
import type { CaseDetail, ContactInput, FollowUpAttempt, FollowUpTask, ServiceCase, ServiceContact, ServiceEventKind, ServiceSnapshot, TaskInput } from '../../shared/service-contract'
import type { DB } from './db'
import { HttpError } from './review'
import { contactCols, readCase, readCaseDetail, readPendingTask } from './service-read'
import { serviceCounters } from './service-schema'
import { AddAttempt, CreateCase, EditCase, EditTask, EventSnapshot } from './service-validation'

function nextId(db: DB, name: keyof typeof serviceCounters) {
  const row = db.prepare('UPDATE id_counters SET value=value+1 WHERE name=? RETURNING value').get(name) as { value: number }
  return serviceCounters[name] + '-' + String(row.value).padStart(6, '0')
}
type Children = Omit<ServiceSnapshot, 'case'>
interface Change { kind: ServiceEventKind; changeNote?: string; children?: Children }
interface Mutation { actor: string; baseVersion: number }

function appendEvent(db: DB, current: ServiceCase, actor: string, change: Change) {
  const snapshot = EventSnapshot.parse({ case: current, ...change.children })
  db.prepare(`INSERT INTO service_events(case_id,version,at,actor,kind,change_note,snapshot_json)
    VALUES (?,?,?,?,?,?,?)`).run(current.id, current.version, current.updatedAt, actor, change.kind, change.changeNote ?? '', JSON.stringify(snapshot))
}

function insertContact(db: DB, caseId: string, input: ContactInput, now: string): ServiceContact {
  const callId = input.callId ?? null
  if (callId) {
    if (!db.prepare('SELECT 1 FROM calls WHERE id=?').get(callId)) throw new HttpError(404, 'Không tìm thấy cuộc gọi để liên kết.')
    if (db.prepare('SELECT 1 FROM service_contacts WHERE recorded_call_id=?').get(callId))
      throw new HttpError(409, 'Cuộc gọi này đã được liên kết với một vụ việc.', { code: 'recording_already_linked' })
  }
  const row: ServiceContact = {
    id: nextId(db, 'service_contacts'), caseId, direction: input.direction, disposition: input.disposition,
    externalContactId: input.externalContactId, note: input.note, occurredAt: input.occurredAt,
    callId, recordedCallId: callId, source: callId ? 'recording_import' : 'manual', createdAt: now,
  }
  db.prepare(`INSERT INTO service_contacts(id,case_id,direction,disposition,occurred_at,external_contact_id,note,call_id,recorded_call_id,source,created_at)
    VALUES (@id,@caseId,@direction,@disposition,@occurredAt,@externalContactId,@note,@callId,@recordedCallId,@source,@createdAt)`).run(row)
  return row
}

function insertTask(db: DB, caseId: string, input: TaskInput, now: string): FollowUpTask {
  const row: FollowUpTask = {
    id: nextId(db, 'follow_up_tasks'), caseId, kind: input.kind, action: input.action, owner: input.owner,
    dueAt: input.dueAt, status: 'pending', resultNote: '', createdAt: now, updatedAt: now,
  }
  db.prepare(`INSERT INTO follow_up_tasks(id,case_id,kind,action,owner,due_at,status,result_note,created_at,updated_at)
    VALUES (@id,@caseId,@kind,@action,@owner,@dueAt,@status,@resultNote,@createdAt,@updatedAt)`).run(row)
  return row
}

export function createServiceCase(db: DB, input: z.infer<typeof CreateCase>): CaseDetail {
  return db.transaction(() => {
    const { requestId = null, ...normalized } = input
    // Zod has normalized defaults, key order, whitespace and UTC timestamps.
    if (normalized.contact) normalized.contact = { ...normalized.contact, callId: normalized.contact.callId ?? null }
    const fingerprint = requestId ? createHash('sha256').update(JSON.stringify(normalized)).digest('hex') : null
    if (requestId) {
      const earlier = db.prepare('SELECT id,creation_fingerprint FROM service_cases WHERE creation_request_id=?')
        .get(requestId) as { id: string; creation_fingerprint: string } | undefined
      if (earlier) {
        if (earlier.creation_fingerprint !== fingerprint)
          throw new HttpError(409, 'Mã yêu cầu đã tạo một vụ việc với nội dung khác.', { code: 'creation_request_conflict', caseId: earlier.id })
        return readCaseDetail(db, earlier.id)
      }
    }
    const id = nextId(db, 'service_cases')
    const now = new Date().toISOString()
    db.prepare(`INSERT INTO service_cases(id,title,customer_name,customer_ref,queue_name,external_ticket_id,reason,owner,status,outcome_note,version,created_at,updated_at,creation_request_id,creation_fingerprint)
      VALUES (@id,@title,@customerName,@customerRef,@queueName,@externalTicketId,@reason,@owner,@status,@outcomeNote,1,@now,@now,@requestId,@fingerprint)`).run({ ...input, id, now, requestId, fingerprint })
    const children: Children = {}
    if (input.contact) children.contact = insertContact(db, id, input.contact, now)
    if (input.task) children.task = insertTask(db, id, input.task, now)
    appendEvent(db, readCase(db,id), input.actor, { kind: 'case_created', children })
    return readCaseDetail(db, id)
  }).immediate()
}

// This runs under BEGIN IMMEDIATE (or the existing recording-deletion transaction).
// Reserve one version across the entire aggregate before writing any child.
function applyChange(db: DB, current: ServiceCase, input: Mutation, run: (now: string) => Change) {
  const now = new Date().toISOString()
  const cas = db.prepare('UPDATE service_cases SET version=version+1, updated_at=? WHERE id=? AND version=?')
    .run(now, current.id, input.baseVersion)
  if (!cas.changes) throw new HttpError(409, 'Vụ việc đã thay đổi. Hãy tải lại trước khi lưu.', { code: 'version_conflict', currentVersion: current.version })
  const change = run(now)
  appendEvent(db, readCase(db, current.id), input.actor, change)
}

function mutate(db: DB, id: string, input: Mutation, run: (current: ServiceCase, now: string) => Change, child = true) {
  return db.transaction(() => {
    const current = readCase(db, id)
    applyChange(db, current, input, now => {
      if (child && current.status === 'resolved') throw new HttpError(409, 'Hãy mở lại vụ việc trước khi thay đổi liên hệ hoặc công việc.')
      return run(current, now)
    })
    return readCaseDetail(db, id)
  }).immediate()
}

export function updateServiceCase(db: DB, id: string, input: z.infer<typeof EditCase>) {
  return mutate(db, id, input, (current, now) => {
    let kind: ServiceEventKind = 'case_updated'
    if (input.status === 'resolved') {
      if (!input.outcomeNote) throw new HttpError(400, 'Cần ghi kết quả trước khi giải quyết vụ việc.')
      if (db.prepare("SELECT 1 FROM follow_up_tasks WHERE case_id=? AND status='pending' LIMIT 1").get(id))
        throw new HttpError(409, 'Còn công việc đang chờ. Hãy hoàn thành hoặc hủy trước khi giải quyết vụ việc.', { code: 'pending_tasks' })
      if (current.status !== 'resolved') kind = 'case_resolved'
    } else if (current.status === 'resolved') {
      if (!input.changeNote) throw new HttpError(400, 'Cần ghi lý do mở lại vụ việc.')
      kind = 'case_reopened'
    }
    const resolvedAt = input.status === 'resolved' ? current.resolvedAt ?? now : null
    db.prepare(`UPDATE service_cases SET title=@title, customer_name=@customerName, customer_ref=@customerRef,
      queue_name=@queueName, external_ticket_id=@externalTicketId, reason=@reason, owner=@owner,
      status=@status, outcome_note=@outcomeNote, resolved_at=@resolvedAt WHERE id=@id`).run({ ...input, id, resolvedAt })
    return { kind, changeNote: input.changeNote }
  }, false)
}

export function addCaseContact(db: DB, id: string, input: ContactInput & Mutation) {
  return mutate(db, id, input, (_current, now) => ({
    kind: 'contact_added', children: { contact: insertContact(db, id, input, now) },
  }))
}

export function addCaseTask(db: DB, id: string, input: TaskInput & Mutation) {
  return mutate(db, id, input, (_current, now) => ({
    kind: 'task_added', children: { task: insertTask(db, id, input, now) },
  }))
}

function saveTask(db: DB, task: FollowUpTask) {
  db.prepare(`UPDATE follow_up_tasks SET action=@action, owner=@owner, due_at=@dueAt, status=@status,
    result_note=@resultNote, updated_at=@updatedAt WHERE id=@id AND case_id=@caseId`).run(task)
}

export function updateCaseTask(db: DB, id: string, taskId: string, input: z.infer<typeof EditTask>) {
  return mutate(db, id, input, (_current, now) => {
    const task = readPendingTask(db, id, taskId)
    if (task.kind === 'callback' && input.status === 'completed')
      throw new HttpError(409, 'Hãy ghi một lần gọi đã kết nối để hoàn thành công việc gọi lại.')
    Object.assign(task, { status: input.status, action: input.action, owner: input.owner, dueAt: input.dueAt, resultNote: input.resultNote, updatedAt: now })
    saveTask(db, task)
    return { kind: 'task_updated', children: { task } }
  })
}

export function recordAttempt(db: DB, id: string, taskId: string, input: z.infer<typeof AddAttempt>) {
  return mutate(db, id, input, (_current, now) => {
    const task = readPendingTask(db, id, taskId)
    if (task.kind !== 'callback') throw new HttpError(409, 'Chỉ công việc gọi lại mới có lần thử gọi.')
    const occurredAt = input.occurredAt ?? now
    const nextDueAt = input.nextDueAt ?? null
    if (input.outcome === 'connected') {
      if (nextDueAt) throw new HttpError(400, 'Lần gọi đã kết nối không có hạn thử lại.')
      task.status = 'completed'
      task.resultNote = input.note
    } else {
      if (!nextDueAt || nextDueAt <= occurredAt) throw new HttpError(400, 'Hạn thử lại phải sau thời điểm của lần gọi.')
      task.dueAt = nextDueAt
    }
    task.updatedAt = now
    const attempt: FollowUpAttempt = { id: nextId(db, 'follow_up_attempts'), caseId: id, taskId, actor: input.actor, occurredAt, nextDueAt, note: input.note, outcome: input.outcome }
    db.prepare(`INSERT INTO follow_up_attempts(id,case_id,task_id,actor,occurred_at,outcome,note,next_due_at)
      VALUES (@id,@caseId,@taskId,@actor,@occurredAt,@outcome,@note,@nextDueAt)`).run(attempt)
    saveTask(db, task)
    return { kind: 'callback_attempted', children: { attempt, task } }
  })
}

export function recordCaseRecordingDeletion(db: DB, callId: string) {
  if (!db.inTransaction) throw new Error('Recording deletion requires an enclosing transaction')
  const contact = db.prepare(`SELECT ${contactCols} FROM service_contacts WHERE call_id=?`).get(callId) as ServiceContact | undefined
  if (!contact) return
  const current = readCase(db, contact.caseId)
  applyChange(db, current, { baseVersion: current.version, actor: 'Hệ thống' }, () => {
    db.prepare('UPDATE service_contacts SET call_id=NULL WHERE id=?').run(contact.id)
    return { kind: 'recording_deleted', children: { contact: { ...contact, callId: null } } }
  })
}
