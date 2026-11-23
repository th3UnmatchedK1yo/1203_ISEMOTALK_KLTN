import type { ServiceEventKind, ServiceSnapshot } from '../../shared/service-contract'
import type { DB } from './db'
import type { DataViolation } from './db-contract'
import { serviceCounters } from './service-schema'
import { EventSnapshot } from './service-validation'

function describesChange(snapshot: ServiceSnapshot, kind: ServiceEventKind): boolean {
  if ([snapshot.contact, snapshot.task, snapshot.attempt].some(row => row && row.caseId !== snapshot.case.id)) return false
  switch (kind) {
    case 'case_created': return snapshot.case.version === 1 && snapshot.case.status === 'open' && !snapshot.attempt
    case 'case_updated': return !snapshot.contact && !snapshot.task && !snapshot.attempt
    case 'case_resolved': return snapshot.case.status === 'resolved' && !!snapshot.case.resolvedAt && !!snapshot.case.outcomeNote
    case 'case_reopened': return snapshot.case.status !== 'resolved' && !snapshot.case.resolvedAt
    case 'task_added': return snapshot.task?.status === 'pending'
    case 'task_updated': return !!snapshot.task
    case 'contact_added': return !!snapshot.contact
    case 'recording_deleted': return snapshot.contact?.source === 'recording_import' && snapshot.contact.callId === null && !!snapshot.contact.recordedCallId
    case 'callback_attempted': {
      const { task, attempt } = snapshot
      return !!attempt && task?.kind === 'callback' && attempt.taskId === task.id && (attempt.outcome === 'connected'
        ? task.status === 'completed' && task.resultNote === attempt.note && attempt.nextDueAt === null
        : task.status === 'pending' && !!attempt.nextDueAt && task.dueAt === attempt.nextDueAt && attempt.nextDueAt > attempt.occurredAt)
    }
    default: return false
  }
}

// Per-row CHECKs run in PRAGMA integrity_check. Cross-table invariants and the
// full typed payload of each historical event need an additional read-only pass.
export function serviceDataViolations(db: DB): DataViolation[] {
  const issues: DataViolation[] = []
  const check = (table: string, rule: string, predicate: string, params: Record<string, string | number> = {}) => {
    const { n } = db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${predicate}`).get(params) as { n: number }
    if (n) {
      const rows = db.prepare(`SELECT rowid FROM ${table} WHERE ${predicate} ORDER BY rowid LIMIT 10`).all(params) as Array<{ rowid: number }>
      issues.push({ table, rule, count: n, sampleRowIds: rows.map(r => r.rowid) })
    }
  }
  check('service_cases', 'aggregate_history', `version<>(SELECT count(*) FROM service_events WHERE case_id=service_cases.id)
    OR version<>COALESCE((SELECT max(version) FROM service_events WHERE case_id=service_cases.id),0)`)
  check('service_cases', 'resolved_pending_tasks', `status='resolved' AND EXISTS
    (SELECT 1 FROM follow_up_tasks WHERE case_id=service_cases.id AND status='pending')`)
  check('follow_up_attempts', 'callback_task', `NOT EXISTS
    (SELECT 1 FROM follow_up_tasks WHERE id=follow_up_attempts.task_id AND case_id=follow_up_attempts.case_id AND kind='callback')`)
  check('follow_up_tasks', 'connected_attempt', `kind='callback' AND (status='completed')<>EXISTS
    (SELECT 1 FROM follow_up_attempts WHERE task_id=follow_up_tasks.id AND outcome='connected')`)
  for (const [table, prefix] of Object.entries(serviceCounters))
    check(table, 'counter_high_water', `CAST(substr(id,@start) AS INTEGER)>COALESCE((SELECT value FROM id_counters WHERE name=@table),-1)`, { start: prefix.length + 2, table })

  const issue: DataViolation = { table: 'service_events', rule: 'event_snapshot', count: 0, sampleRowIds: [] }
  const rows = db.prepare('SELECT rowid,case_id,version,kind,at,snapshot_json FROM service_events').iterate() as Iterable<{
    rowid: number; case_id: string; version: number; kind: ServiceEventKind; at: string; snapshot_json: string
  }>
  for (const row of rows) {
    let valid = false
    try {
      const result = EventSnapshot.safeParse(JSON.parse(row.snapshot_json))
      valid = result.success && result.data.case.id === row.case_id && result.data.case.version === row.version &&
        result.data.case.updatedAt === row.at && describesChange(result.data, row.kind)
    } catch { /* Malformed JSON is an invalid event. Omit customer text from the report. */ }
    if (!valid) {
      issue.count++
      if (issue.sampleRowIds.length < 10) issue.sampleRowIds.push(row.rowid)
    }
  }
  if (issue.count) issues.push(issue)
  return issues
}
