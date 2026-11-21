import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

export type DB = Database.Database

const SCHEMA = `
CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
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
  updated_at TEXT NOT NULL
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
  PRIMARY KEY (call_id, id)
);

CREATE TABLE IF NOT EXISTS moment_reviews (
  call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  moment_id TEXT NOT NULL,
  relevance INTEGER,
  note TEXT NOT NULL DEFAULT '',
  evidence_key TEXT,
  PRIMARY KEY (call_id, moment_id)
);

CREATE INDEX IF NOT EXISTS idx_calls_date ON calls(call_date);
CREATE INDEX IF NOT EXISTS idx_calls_priority ON calls(priority);
CREATE INDEX IF NOT EXISTS idx_utt_call ON utterances(call_id, idx);

CREATE TABLE IF NOT EXISTS id_counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
`

export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  const reviewColumns = db.prepare('PRAGMA table_info(moment_reviews)').all() as Array<{ name: string }>
  if (!reviewColumns.some((column) => column.name === 'evidence_key')) db.exec('ALTER TABLE moment_reviews ADD COLUMN evidence_key TEXT')
  // A counter survives deletion. Initialize additively from existing databases;
  // never rebuild user records or reassign their identifiers during migration.
  db.prepare(`INSERT INTO id_counters (name, value)
    SELECT 'calls', COALESCE(MAX(CAST(SUBSTR(id, 6) AS INTEGER)), 0) FROM calls WHERE id GLOB 'CALL-[0-9]*'
    ON CONFLICT(name) DO UPDATE SET value = MAX(id_counters.value, excluded.value)`).run()
  return db
}
