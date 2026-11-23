import type { DB } from './db'

// Model predictions are NOT human QA verdicts. Full-transcript hash ensures
// reviewer edits invalidate old predictions without silently changing them.
export const QA_TABLE = 'qa_triage_results'
export const QA_SCHEMA = `CREATE TABLE qa_triage_results (
  call_id TEXT PRIMARY KEY NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  input_sha256 TEXT NOT NULL CHECK(length(input_sha256)=64 AND input_sha256 NOT GLOB '*[^0-9a-f]*'),
  model_sha256 TEXT NOT NULL CHECK(length(model_sha256)=64 AND model_sha256 NOT GLOB '*[^0-9a-f]*'),
  model_name TEXT NOT NULL CHECK(length(model_name)>0),
  label TEXT NOT NULL CHECK(label IN ('needs_attention','routine')),
  score REAL NOT NULL CHECK(score >= 0 AND score <= 1),
  dataset_source TEXT NOT NULL CHECK(dataset_source = 'synthetic_onevoice'),
  truncated INTEGER NOT NULL CHECK(truncated IN (0,1)),
  created_at TEXT NOT NULL CHECK(length(created_at)>0)
) STRICT`

export function installQaSchema(db: DB): void {
  db.exec(QA_SCHEMA)
}

export function qaSchemaProblems(db: DB): string[] {
  const item = db.prepare("SELECT sql FROM sqlite_master WHERE name=? AND type='table'").get(QA_TABLE) as { sql: string } | undefined
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
  return !item || normalize(item.sql) !== normalize(QA_SCHEMA)
    ? ['Missing or altered qa_triage_results table declaration'] : []
}
