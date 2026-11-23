import Database from 'better-sqlite3'
import type { DB } from './db'
import { type DataTable, DATA_TABLES, findDataViolations, tableContract } from './db-contract'

import { SERVICE_TABLES, installServiceSchema, serviceSchemaProblems } from './service-schema'

export const SCHEMA_VERSION = 2
export const MIGRATION_NAME = 'database_integrity_20261123'
const MIGRATIONS = [MIGRATION_NAME, 'service_operations_20261123'] as const
export function knownHistory(versions: Array<{ version: number; name: string }>): boolean {
  return versions.length <= MIGRATIONS.length && versions.every((row, i) => row.version === i + 1 && row.name === MIGRATIONS[i])
}
const V1_TABLES = [...DATA_TABLES, 'schema_migrations'] as const
export const EXPECTED_TABLES = [...V1_TABLES, ...SERVICE_TABLES]
const guardSql = (table: DataTable, operation: 'INSERT' | 'UPDATE') => `CREATE TRIGGER guard_${table}_${operation.toLowerCase()}
  BEFORE ${operation} ON ${table} WHEN NOT (${tableContract(table, 'NEW.')})
  BEGIN SELECT RAISE(ABORT, 'ISEmoTalk database constraint: ${table}'); END`
const v1Indexes = [
  { name: 'idx_calls_date', table: 'calls', columns: 'call_date', unique: 0 },
  { name: 'idx_calls_priority', table: 'calls', columns: 'priority', unique: 0 },
  { name: 'idx_utterances_call_order', table: 'utterances', columns: 'call_id,idx', unique: 1 },
]

const JOURNAL_SCHEMA = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY CHECK(version > 0),
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`

const SCHEMA = `
CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  agent_name TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  call_date TEXT NOT NULL,
  duration REAL NOT NULL DEFAULT 0,
  audio_file TEXT,
  audio_name TEXT,
  audio_mime TEXT,
  peaks TEXT,
  channels INTEGER,
  source TEXT NOT NULL,
  provenance TEXT,
  speaker_source TEXT,
  agent_channel INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  stage TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  stage_log TEXT NOT NULL DEFAULT '[]',
  priority TEXT NOT NULL DEFAULT 'low',
  dominant_emotion TEXT,
  negative_ratio REAL NOT NULL DEFAULT 0,
  moment_count INTEGER NOT NULL DEFAULT 0,
  escalation_count INTEGER NOT NULL DEFAULT 0,
  recovery_count INTEGER NOT NULL DEFAULT 0,
  disagreement_count INTEGER NOT NULL DEFAULT 0,
  avg_confidence REAL,
  review_status TEXT NOT NULL DEFAULT 'unreviewed',
  overall_note TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (${tableContract('calls')})
);

CREATE TABLE IF NOT EXISTS utterances (
  call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  speaker TEXT NOT NULL DEFAULT 'unknown',
  text TEXT NOT NULL,
  start REAL NOT NULL,
  end REAL NOT NULL,
  orig_text TEXT,
  orig_speaker TEXT,
  ac_emotion TEXT, ac_conf REAL,
  lx_emotion TEXT, lx_conf REAL,
  fu_emotion TEXT, fu_conf REAL,
  agreement TEXT,
  review_decision TEXT,
  review_emotion TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  flagged INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (call_id, id),
  CHECK (${tableContract('utterances')})
);

CREATE TABLE IF NOT EXISTS moment_reviews (
  call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  moment_id TEXT NOT NULL,
  relevance INTEGER,
  note TEXT NOT NULL DEFAULT '',
  evidence_key TEXT,
  PRIMARY KEY (call_id, moment_id),
  CHECK (${tableContract('moment_reviews')})
);

CREATE INDEX IF NOT EXISTS idx_calls_date ON calls(call_date);
CREATE INDEX IF NOT EXISTS idx_calls_priority ON calls(priority);

CREATE TABLE IF NOT EXISTS id_counters (
  name TEXT PRIMARY KEY NOT NULL,
  value INTEGER NOT NULL,
  CHECK (${tableContract('id_counters')})
);

CREATE TABLE IF NOT EXISTS call_workflows (
  call_id TEXT PRIMARY KEY NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  fields_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (${tableContract('call_workflows')})
);
CREATE TABLE IF NOT EXISTS workflow_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  at TEXT NOT NULL,
  event_json TEXT NOT NULL,
  UNIQUE(call_id, version),
  CHECK (${tableContract('workflow_events')})
);
CREATE TABLE IF NOT EXISTS audio_cleanup_jobs (
  call_id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  CHECK (${tableContract('audio_cleanup_jobs')})
);
`

interface Column { name: string; type: string; pk: number; notnull: number; dflt_value: string | null }

// Version 1 installed the same logical schema on fresh and pre-versioned
// databases. SQLite can describe its own DDL without a second handwritten
// column manifest. This temporary reference never opens an application file.
let expectedColumns: Map<string, Column[]> | undefined
function versionOneColumns() {
  if (!expectedColumns) {
    const reference = new Database(':memory:')
    try {
      reference.exec(SCHEMA)
      reference.exec(JOURNAL_SCHEMA)
      expectedColumns = new Map(V1_TABLES.map(table => [table, reference.pragma(`table_info(${table})`) as Column[]]))
    } finally { reference.close() }
  }
  return expectedColumns
}
const legacyNullableKeys = new Set(['calls.id', 'id_counters.name', 'call_workflows.call_id'])
const normalizeDefault = (value: string | null) => value?.trim().replace(/^\((.*)\)$/, '$1') ?? null

function fail(message: string): never {
  throw new Error(`${message}. Run npm run db:check before changing data; back up the database and recordings before repair.`)
}

/** Inspect declarations too: foreign_key_check cannot detect a missing FK definition. */
export function schemaProblems(db: DB, version: number): string[] {
  const objects = db.prepare('SELECT name,type,sql FROM sqlite_master').all() as Array<{ name: string; type: string; sql: string | null }>
  const tables = new Set(objects.filter(o => o.type === 'table').map(o => o.name))
  const problems: string[] = V1_TABLES.filter(t => !tables.has(t)).map(t => `Missing table: ${t}`)
  for (const [table, expected] of versionOneColumns()) {
    if (!tables.has(table)) continue
    const actual = db.pragma(`table_info(${table})`) as Column[]
    const byName = new Map(actual.map(c => [c.name, c]))
    for (const column of expected) {
      const c = byName.get(column.name)
      const key = table + '.' + column.name
      if (!c) {
        problems.push('Missing column: ' + key)
        continue
      }
      const oldPk = c.notnull === 0 && column.notnull === 1 && legacyNullableKeys.has(key)
      if (c.type.toUpperCase() !== column.type || (c.notnull !== column.notnull && !oldPk) ||
          normalizeDefault(c.dflt_value) !== normalizeDefault(column.dflt_value) || c.pk !== column.pk)
        problems.push('Incompatible column: ' + key)
    }
    const names = new Set(expected.map(c => c.name))
    for (const c of actual) {
      if (!names.has(c.name) && (c.pk || (c.notnull && c.dflt_value === null)))
        problems.push('Unexpected required column: ' + table + '.' + c.name)
    }
  }
  for (const table of ['utterances', 'moment_reviews', 'call_workflows', 'workflow_events']) {
    if (!tables.has(table)) continue
    const foreignKeys = db.pragma(`foreign_key_list(${table})`) as Array<{ table: string; from: string; to: string; on_delete: string }>
    if (!foreignKeys.some(f => f.table === 'calls' && f.from === 'call_id' && f.to === 'id' && f.on_delete === 'CASCADE')) {
      problems.push(`Missing cascading call foreign key: ${table}`)
    }
  }
  for (const [table, columns] of [['workflow_events', ['call_id', 'version']], ...(version >= 1 ? [['utterances', ['call_id', 'idx']]] : [])] as Array<[string, string[]]>) {
    if (!tables.has(table)) continue
    const indexes = db.pragma(`index_list(${table})`) as Array<{ name: string; unique: number; partial: number }>
    const found = indexes.some(i => i.unique === 1 && i.partial === 0 &&
      (db.prepare('SELECT name FROM pragma_index_info(?) ORDER BY seqno').all(i.name) as Array<{ name: string }>).map(c => c.name).join(',') === columns.join(','))
    if (!found) problems.push(`Missing unique key: ${table}(${columns.join(',')})`)
  }
  if (version >= 1) {
    const definitions = new Map(objects.map(o => [o.name, o.sql?.replace(/\s+/g, ' ').trim()]))
    const verify = (name: string, sql: string) => {
      if (definitions.get(name) !== sql.replace(/\s+/g, ' ').trim()) problems.push('Missing or damaged declaration: ' + name)
    }
    for (const expected of v1Indexes) {
      const index = db.prepare('SELECT "unique",partial FROM pragma_index_list(?) WHERE name=?').get(expected.table, expected.name) as { unique: number; partial: number } | undefined
      const columns = db.prepare('SELECT name FROM pragma_index_info(?) ORDER BY seqno').all(expected.name) as Array<{ name: string }>
      if (index?.unique !== expected.unique || index.partial || columns.map(c => c.name).join(',') !== expected.columns)
        problems.push('Missing or damaged index: ' + expected.name)
    }
    for (const table of DATA_TABLES) {
      for (const op of ['INSERT','UPDATE'] as const) verify(`guard_${table}_${op.toLowerCase()}`, guardSql(table, op))
    }
    if (tables.has('id_counters') && !db.prepare("SELECT 1 FROM id_counters WHERE name='calls'").get())
      problems.push('Missing ID counter: calls')
  }
  if (version >= 2 && tables.has('id_counters')) problems.push(...serviceSchemaProblems(db))
  return problems
}

export function migrateDatabase(db: DB): void {
  db.transaction(() => {
    db.exec(JOURNAL_SCHEMA)
    const versions = db.prepare('SELECT version,name FROM schema_migrations ORDER BY version').all() as Array<{ version: number; name: string }>
    if (versions.some(v => v.version > SCHEMA_VERSION)) fail('Database was created by a newer schema version')
    if (!knownHistory(versions)) fail('Unrecognized database migration history')
    const stamp = (version: number) => db.prepare('INSERT INTO schema_migrations(version,name,applied_at) VALUES (?,?,?)')
      .run(version, MIGRATIONS[version - 1], new Date().toISOString())
    if (!versions.length) {
      installLegacySchema(db)
      stamp(1)
    }
    const existingVersion = versions.at(-1)?.version ?? 1
    const problems = schemaProblems(db, existingVersion)
    if (problems.length) fail(`Incomplete database schema: ${problems.join('; ')}`)
    if (existingVersion === SCHEMA_VERSION) return
    const violations = findDataViolations(db)
    const foreignKeys = db.pragma('foreign_key_check') as unknown[]
    if (violations.length || foreignKeys.length) fail('Version 1 data violates its integrity contract')
    installServiceSchema(db)
    const installedProblems = schemaProblems(db, SCHEMA_VERSION)
    if (installedProblems.length) fail(`Service migration postcondition failed: ${installedProblems.join('; ')}`)
    stamp(2)
  }).immediate()
}

function installLegacySchema(db: DB) {
  db.exec(SCHEMA)
  const columns = db.pragma('table_info(moment_reviews)') as Array<{ name: string }>
  if (!columns.some(c => c.name === 'evidence_key')) db.exec('ALTER TABLE moment_reviews ADD COLUMN evidence_key TEXT')

  const problems = schemaProblems(db, 0)
  if (problems.length) fail(`Legacy database schema needs review: ${problems.join('; ')}`)

  const violations = findDataViolations(db)
  const foreignKeys = db.pragma('foreign_key_check') as unknown[]
  if (violations.length || foreignKeys.length) fail(`Legacy database needs review (${violations.map(v => `${v.table}.${v.rule}: ${v.count}`).join('; ')}; foreign keys: ${foreignKeys.length})`)

  // Both fresh and previously-created tables receive equivalent protection.
  // No rebuild, renumbering, or silent repair of legacy data is performed.
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_utterances_call_order ON utterances(call_id,idx)')
  // The new unique order index replaces the old identical nonunique index.
  // UNIQUE(call_id,version) also serves reverse history scans without a second index.
  db.exec('DROP INDEX IF EXISTS idx_utt_call; DROP INDEX IF EXISTS idx_workflow_events_call;')
  for (const table of DATA_TABLES) {
    for (const op of ['INSERT','UPDATE'] as const) db.exec(guardSql(table, op))
  }
  // The counter survives deletion and starts beyond every existing call ID.
  db.prepare(`INSERT INTO id_counters (name, value)
    SELECT 'calls', COALESCE(MAX(CAST(SUBSTR(id,6) AS INTEGER)),0) FROM calls WHERE id GLOB 'CALL-[0-9]*'
    ON CONFLICT(name) DO UPDATE SET value=MAX(id_counters.value,excluded.value)`).run()
}
