import { attemptOutcomes, caseStatuses, contactDirections, contactDispositions, eventKinds, taskKinds, taskStatuses } from '../../shared/service-contract'
import type { DB } from './db'

const inSet = (column: string, values: readonly string[]) => `${column} IN (${values.map(v => "'" + v + "'").join(',')})`
const utc = (column: string) => `COALESCE(length(${column})=24 AND strftime('%Y-%m-%dT%H:%M:%fZ', ${column}, '+0 seconds')=${column},0)`
const nonempty = (column: string) => `length(trim(${column})) > 0`
const time = (name: string) => `${name} TEXT NOT NULL CHECK (${utc(name)})`
const label = (name: string, max: number, required = false) =>
  `${name} TEXT NOT NULL CHECK (length(${name}) <= ${max}${required ? ' AND ' + nonempty(name) : ''})`

// SQLite preserves each CREATE declaration in sqlite_schema. Comparing these same
// declarations also audits composite FKs, unique keys and CHECKs on empty tables.
const tables = {
  service_cases: `id TEXT PRIMARY KEY NOT NULL, ${label('title',200,true)}, ${label('customer_name',120)},
    ${label('customer_ref',160)}, ${label('queue_name',120)}, ${label('external_ticket_id',160)},
    ${label('reason',3000)}, ${label('owner',120)}, status TEXT NOT NULL CHECK (${inSet('status',caseStatuses)}),
    ${label('outcome_note',3000)}, version INTEGER NOT NULL CHECK(version>=1), ${time('created_at')}, ${time('updated_at')},
    creation_request_id TEXT UNIQUE, creation_fingerprint TEXT, resolved_at TEXT,
    CHECK ((creation_request_id IS NULL AND creation_fingerprint IS NULL) OR
      (creation_request_id IS NOT NULL AND length(trim(creation_request_id)) BETWEEN 1 AND 128 AND
       creation_fingerprint IS NOT NULL AND length(creation_fingerprint)=64 AND creation_fingerprint NOT GLOB '*[^0-9a-f]*')),
    CHECK ((status='resolved' AND ${nonempty('outcome_note')} AND ${utc('resolved_at')})
      OR (status<>'resolved' AND resolved_at IS NULL))`,
  service_contacts: `id TEXT PRIMARY KEY NOT NULL, case_id TEXT NOT NULL REFERENCES service_cases(id),
    direction TEXT NOT NULL CHECK (${inSet('direction',contactDirections)}),
    disposition TEXT NOT NULL CHECK (${inSet('disposition',contactDispositions)}), ${time('occurred_at')},
    ${label('external_contact_id',160)}, ${label('note',2000)}, call_id TEXT UNIQUE REFERENCES calls(id) ON DELETE SET NULL,
    recorded_call_id TEXT UNIQUE, source TEXT NOT NULL, ${time('created_at')},
    CHECK ((disposition='recording' AND source='recording_import' AND recorded_call_id IS NOT NULL
      AND length(trim(recorded_call_id))>0 AND (call_id IS NULL OR call_id=recorded_call_id))
      OR (disposition<>'recording' AND source='manual' AND call_id IS NULL AND recorded_call_id IS NULL))`,
  follow_up_tasks: `id TEXT PRIMARY KEY NOT NULL, case_id TEXT NOT NULL REFERENCES service_cases(id),
    kind TEXT NOT NULL CHECK (${inSet('kind',taskKinds)}), ${label('action',2000,true)}, ${label('owner',120,true)},
    ${time('due_at')}, status TEXT NOT NULL CHECK (${inSet('status',taskStatuses)}), ${label('result_note',2000)},
    ${time('created_at')}, ${time('updated_at')}, UNIQUE(case_id,id),
    CHECK (status='pending' OR ${nonempty('result_note')})`,
  follow_up_attempts: `id TEXT PRIMARY KEY NOT NULL, case_id TEXT NOT NULL, task_id TEXT NOT NULL,
    ${label('actor',120,true)}, ${time('occurred_at')}, outcome TEXT NOT NULL CHECK (${inSet('outcome',attemptOutcomes)}),
    ${label('note',2000,true)}, next_due_at TEXT, FOREIGN KEY(case_id,task_id) REFERENCES follow_up_tasks(case_id,id),
    CHECK ((outcome='connected' AND next_due_at IS NULL) OR (outcome<>'connected' AND ${utc('next_due_at')} AND next_due_at>occurred_at))`,
  service_events: `case_id TEXT NOT NULL REFERENCES service_cases(id), version INTEGER NOT NULL CHECK(version>=1),
    ${time('at')}, ${label('actor',120,true)}, kind TEXT NOT NULL CHECK (${inSet('kind',eventKinds)}), ${label('change_note',2000)},
    snapshot_json TEXT NOT NULL CHECK (CASE WHEN json_valid(snapshot_json) THEN
      COALESCE(json_type(snapshot_json)='object' AND json_extract(snapshot_json,'$.case.id')=case_id
        AND json_extract(snapshot_json,'$.case.version')=version,0) ELSE 0 END), PRIMARY KEY(case_id,version)`,
}
export const SERVICE_TABLES = Object.keys(tables)
export const serviceCounters = { service_cases: 'CASE', service_contacts: 'CONTACT', follow_up_tasks: 'TASK', follow_up_attempts: 'ATTEMPT' } as const
const objects: Array<{ name: string; sql: string }> = Object.entries(tables)
  .map(([name, columns]) => ({ name, sql: `CREATE TABLE ${name} (${columns}) STRICT` }))

for (const [name, target] of Object.entries({
  idx_service_cases_updated: 'service_cases(updated_at DESC,id)',
  idx_service_cases_status: 'service_cases(status,updated_at DESC)',
  idx_service_cases_owner: 'service_cases(owner,updated_at DESC)',
  idx_service_contacts_case: 'service_contacts(case_id,occurred_at DESC,id)',
  idx_follow_up_tasks_due: 'follow_up_tasks(case_id,status,due_at)',
  idx_follow_up_attempts_case: 'follow_up_attempts(case_id,occurred_at DESC,id)',
})) objects.push({ name, sql: `CREATE INDEX ${name} ON ${target}` })

for (const table of ['follow_up_attempts', 'service_events']) {
  for (const operation of ['UPDATE', 'DELETE']) {
    const name = 'immutable_' + table + '_' + operation.toLowerCase()
    objects.push({ name, sql: `CREATE TRIGGER ${name} BEFORE ${operation} ON ${table}
      BEGIN SELECT RAISE(ABORT,'Service history is append-only'); END` })
  }
}

export function installServiceSchema(db: DB) {
  for (const object of objects) db.exec(object.sql)
  const addCounter = db.prepare('INSERT INTO id_counters(name,value) VALUES (?,0)')
  for (const name of Object.keys(serviceCounters)) addCounter.run(name)
}

const normalize = (sql: string) => sql.replace(/\s+/g,' ').trim()
export function serviceSchemaProblems(db: DB): string[] {
  const problems: string[] = []
  const declarations = db.prepare('SELECT name,sql FROM sqlite_schema WHERE sql IS NOT NULL').all() as Array<{name: string; sql: string}>
  const saved = new Map(declarations.map(row => [row.name, normalize(row.sql)]))
  for (const { name, sql } of objects) {
    if (saved.get(name) !== normalize(sql)) problems.push('Missing or damaged declaration: ' + name)
  }
  const counters = new Set((db.prepare('SELECT name FROM id_counters').all() as Array<{ name: string }>).map(r => r.name))
  for (const name of Object.keys(serviceCounters)) if (!counters.has(name)) problems.push('Missing ID counter: ' + name)
  return problems
}
