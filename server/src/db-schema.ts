import type { DB } from './db'
import { DATA_TABLES, findDataViolations, tableContract } from './db-contract'

export const SCHEMA_VERSION = 1
export const MIGRATION_NAME = 'database_integrity_20261123'
export const EXPECTED_TABLES = [...DATA_TABLES, 'schema_migrations'] as const
export const GUARD_NAMES = DATA_TABLES.flatMap(t => ['insert', 'update'].map(op => `guard_${t}_${op}`))
export const REQUIRED_INDEXES = ['idx_calls_date', 'idx_calls_priority', 'idx_utterances_call_order']

// Every column used by the application is checked, including fields outside domain predicates.
export const REQUIRED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  calls: 'id title agent_name customer_name call_date duration audio_file audio_name audio_mime peaks channels source provenance speaker_source agent_channel status stage progress error attempts stage_log priority dominant_emotion negative_ratio moment_count escalation_count recovery_count disagreement_count avg_confidence review_status overall_note reviewed_at version created_at updated_at'.split(' '),
  utterances: 'call_id id idx speaker text start end orig_text orig_speaker ac_emotion ac_conf lx_emotion lx_conf fu_emotion fu_conf agreement review_decision review_emotion review_note flagged'.split(' '),
  moment_reviews: 'call_id moment_id relevance note evidence_key'.split(' '),
  id_counters: 'name value'.split(' '),
  call_workflows: 'call_id version fields_json updated_at'.split(' '),
  workflow_events: 'id call_id version at event_json'.split(' '),
  audio_cleanup_jobs: 'call_id created_at attempts last_error'.split(' '),
  schema_migrations: 'version name applied_at'.split(' '),
}

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

function fail(message: string): never {
  throw new Error(`${message}. Run npm run db:check before changing data; back up the database and recordings before repair.`)
}

/** Inspect declarations too: foreign_key_check cannot detect a missing FK definition. */
export function schemaProblems(db: DB, versioned: boolean): string[] {
  const objects = db.prepare('SELECT name,type FROM sqlite_master').all() as Array<{ name: string; type: string }>
  const tables = new Set(objects.filter(o => o.type === 'table').map(o => o.name))
  const problems: string[] = EXPECTED_TABLES.filter(t => !tables.has(t)).map(t => `Missing table: ${t}`)
  const keys: Record<string, string[]> = {
    calls: ['id'], utterances: ['call_id', 'id'], moment_reviews: ['call_id', 'moment_id'],
    id_counters: ['name'], call_workflows: ['call_id'], workflow_events: ['id'], audio_cleanup_jobs: ['call_id'], schema_migrations: ['version'],
  }
  for (const [table, key] of Object.entries(keys)) {
    if (!tables.has(table)) continue
    const columns = db.pragma(`table_info(${table})`) as Array<{ name: string; pk: number }>
    const present = new Set(columns.map(c => c.name))
    for (const name of REQUIRED_COLUMNS[table] ?? []) if (!present.has(name)) problems.push(`Missing column: ${table}.${name}`)
    const actual = columns.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name)
    if (actual.join(',') !== key.join(',')) problems.push(`Invalid primary key: ${table}`)
  }
  for (const table of ['utterances', 'moment_reviews', 'call_workflows', 'workflow_events']) {
    if (!tables.has(table)) continue
    const foreignKeys = db.pragma(`foreign_key_list(${table})`) as Array<{ table: string; from: string; to: string; on_delete: string }>
    if (!foreignKeys.some(f => f.table === 'calls' && f.from === 'call_id' && f.to === 'id' && f.on_delete === 'CASCADE')) {
      problems.push(`Missing cascading call foreign key: ${table}`)
    }
  }
  for (const [table, columns] of [['workflow_events', ['call_id', 'version']], ...(versioned ? [['utterances', ['call_id', 'idx']]] : [])] as Array<[string, string[]]>) {
    if (!tables.has(table)) continue
    const indexes = db.pragma(`index_list(${table})`) as Array<{ name: string; unique: number; partial: number }>
    const found = indexes.some(i => i.unique === 1 && i.partial === 0 &&
      (db.prepare('SELECT name FROM pragma_index_info(?) ORDER BY seqno').all(i.name) as Array<{ name: string }>).map(c => c.name).join(',') === columns.join(','))
    if (!found) problems.push(`Missing unique key: ${table}(${columns.join(',')})`)
  }
  if (versioned) {
    for (const [names, type] of [[GUARD_NAMES, 'trigger'], [REQUIRED_INDEXES, 'index']] as const) {
      const present = new Set(objects.filter(o => o.type === type).map(o => o.name))
      for (const name of names) if (!present.has(name)) problems.push(`Missing ${type}: ${name}`)
    }
  }
  return problems
}

export function migrateDatabase(db: DB): void {
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY CHECK(version > 0),
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`)
    const versions = db.prepare('SELECT version,name FROM schema_migrations ORDER BY version').all() as Array<{ version: number; name: string }>
    if (versions.some(v => v.version > SCHEMA_VERSION)) fail('Database was created by a newer schema version')
    if (versions.length) {
      if (versions.length !== 1 || versions[0].version !== SCHEMA_VERSION || versions[0].name !== MIGRATION_NAME) fail('Unrecognized database migration history')
      const problems = schemaProblems(db, true)
      if (problems.length) fail(`Incomplete database schema: ${problems.join('; ')}`)
      return
    }
    db.exec(SCHEMA)
    const columns = db.pragma('table_info(moment_reviews)') as Array<{ name: string }>
    if (!columns.some(c => c.name === 'evidence_key')) db.exec('ALTER TABLE moment_reviews ADD COLUMN evidence_key TEXT')

    const problems = schemaProblems(db, false)
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
      for (const operation of ['INSERT', 'UPDATE']) {
        db.exec(`CREATE TRIGGER guard_${table}_${operation.toLowerCase()}
          BEFORE ${operation} ON ${table} WHEN NOT (${tableContract(table, 'NEW.')})
          BEGIN SELECT RAISE(ABORT, 'ISEmoTalk database constraint: ${table}'); END`)
      }
    }
    // The counter survives deletion and starts beyond every existing call ID.
    db.prepare(`INSERT INTO id_counters (name, value)
      SELECT 'calls', COALESCE(MAX(CAST(SUBSTR(id,6) AS INTEGER)),0) FROM calls WHERE id GLOB 'CALL-[0-9]*'
      ON CONFLICT(name) DO UPDATE SET value=MAX(id_counters.value,excluded.value)`).run()
    const installedProblems = schemaProblems(db, true)
    if (installedProblems.length) fail(`Database migration postcondition failed: ${installedProblems.join('; ')}`)
    db.prepare('INSERT INTO schema_migrations(version,name,applied_at) VALUES (?,?,?)')
      .run(SCHEMA_VERSION, MIGRATION_NAME, new Date().toISOString())
  }).immediate()
}
