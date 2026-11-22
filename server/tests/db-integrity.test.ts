import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDb, type DB } from '../src/db'
import { insertCall, nextCallId, replaceUtterances } from '../src/repo'

const roots: string[] = []
const handles: DB[] = []
afterEach(() => {
  for (const db of handles.splice(0)) if (db.open) db.close()
  for (const dir of roots.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})
function track(db: DB) { handles.push(db); return db }
function file() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'isemo-db-integrity-'))
  roots.push(dir)
  return path.join(dir, 'isemotalk.db')
}
function seed(db: DB, id = 'CALL-0042') {
  insertCall(db, { id, title: 'Fixture', agentName: '', customerName: '', callDate: '2026-11-23T00:00:00.000Z', source: 'results_import', agentChannel: 0, stageLog: [] })
  replaceUtterances(db, id, [{ speaker: 'customer', text: 'Tôi cần hỗ trợ.', start: 0, end: 2 }])
}
function legacy(target: string, missingEvidence = false, lineEnding = '\n') {
  const db = track(new Database(target))
  db.pragma('foreign_keys = OFF') // Model a historical writer that omitted per-connection FK enforcement.
  const sql = fs.readFileSync(new URL('./fixtures/pre-integrity-schema.sql', import.meta.url), 'utf8').replace(/\r?\n/g, lineEnding)
  db.exec(missingEvidence ? sql.replace(/  evidence_key TEXT,\r?\n/, '') : sql)
  if (missingEvidence) expect((db.pragma('table_info(moment_reviews)') as Array<{ name: string }>).some(c => c.name === 'evidence_key')).toBe(false)
  return db
}

describe('database domain enforcement', () => {
  it.each([
    ['NULL primary key', 'UPDATE calls SET id=NULL'],
    ['empty primary key', "UPDATE calls SET id=''"],
    ['status enum', "UPDATE calls SET status='finished'"],
    ['source enum', "UPDATE calls SET source='anything'"],
    ['negative duration', 'UPDATE calls SET duration=-1'],
    ['infinite duration', 'UPDATE calls SET duration=1e999'],
    ['progress bounds', 'UPDATE calls SET progress=101'],
    ['integer progress', 'UPDATE calls SET progress=1.5'],
    ['positive version', 'UPDATE calls SET version=0'],
    ['boolean channel mapping', 'UPDATE calls SET agent_channel=8'],
    ['nonnegative count', 'UPDATE calls SET moment_count=-1'],
    ['ratio bounds', 'UPDATE calls SET negative_ratio=2'],
    ['valid JSON', "UPDATE calls SET stage_log='broken'"],
    ['JSON array shape', "UPDATE calls SET stage_log='{}'"],
    ['speaker enum', "UPDATE utterances SET speaker='sales'"],
    ['nonempty interval', 'UPDATE utterances SET end=start'],
    ['nonnegative interval', 'UPDATE utterances SET start=-1'],
    ['boolean flag', 'UPDATE utterances SET flagged=2'],
    ['confidence range', "UPDATE utterances SET fu_emotion='sad', fu_conf=1.1"],
    ['paired prediction', "UPDATE utterances SET fu_emotion='angry'"],
    ['emotion enum', "UPDATE utterances SET fu_emotion='bored', fu_conf=.8"],
    ['review correction label', "UPDATE utterances SET review_decision='corrected'"],
    ['confirmation requires prediction', "UPDATE utterances SET review_decision='confirmed'"],
  ])('rejects %s even when bypassing the API', (_name, sql) => {
    const db = track(openDb(':memory:'))
    seed(db)
    expect(() => db.exec(sql)).toThrow()
    expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
  })

  it('rejects invalid INSERTs and duplicate utterance ordering', () => {
    const db = track(openDb(':memory:'))
    seed(db)
    expect(() => db.prepare('INSERT INTO calls(id,title,call_date,source,created_at,updated_at) VALUES (?,?,?,?,?,?)')
      .run(null, 'Invalid', '2026-11-23', 'upload', '2026-11-23', '2026-11-23')).toThrow()
    expect(() => db.exec("INSERT INTO utterances(call_id,id,idx,text,start,end) VALUES ('CALL-0042','other',0,'Duplicate',3,4)")).toThrow()
    expect(() => db.exec("INSERT INTO utterances(call_id,id,idx,text,start,end) VALUES ('CALL-0042','bad',1,'Invalid',4,3)")).toThrow()
    expect(() => db.exec("INSERT INTO moment_reviews(call_id,moment_id,relevance) VALUES ('CALL-0042','m',2)")).toThrow()
    expect(() => db.exec("INSERT INTO id_counters(name,value) VALUES (NULL,1)")).toThrow()
  })

  it('initializes workflow/cleanup schema centrally and enforces their keys and JSON', () => {
    const db = track(openDb(':memory:'))
    seed(db)
    for (const table of ['call_workflows', 'workflow_events', 'audio_cleanup_jobs', 'schema_migrations']) {
      expect(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)).toBeDefined()
    }
    expect(() => db.exec("INSERT INTO call_workflows(call_id,version,fields_json,updated_at) VALUES (NULL,1,'{}','2026-11-23')")).toThrow()
    expect(() => db.exec("INSERT INTO call_workflows VALUES ('CALL-0042',1,'[]','2026-11-23')")).toThrow()
    expect(() => db.exec("INSERT INTO workflow_events(call_id,version,at,event_json) VALUES ('CALL-0042',0,'2026-11-23','{}')")).toThrow()
    expect(() => db.exec("INSERT INTO audio_cleanup_jobs(call_id,created_at,attempts) VALUES ('CALL-0042','2026-11-23',-1)")).toThrow()
  })

  it('enforces foreign keys and cascades all call children while cleanup survives', () => {
    const db = track(openDb(':memory:'))
    seed(db)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(() => db.exec("INSERT INTO utterances(call_id,id,idx,text,start,end) VALUES ('missing','u',0,'x',0,1)")).toThrow(/FOREIGN KEY/)
    db.exec(`INSERT INTO moment_reviews(call_id,moment_id) VALUES ('CALL-0042','m');
      INSERT INTO call_workflows VALUES ('CALL-0042',1,'{}','2026-11-23');
      INSERT INTO workflow_events(call_id,version,at,event_json) VALUES ('CALL-0042',1,'2026-11-23','{}');
      INSERT INTO audio_cleanup_jobs(call_id,created_at) VALUES ('CALL-0042','2026-11-23');
      DELETE FROM calls WHERE id='CALL-0042';`)
    for (const table of ['utterances', 'moment_reviews', 'call_workflows', 'workflow_events']) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 })
    }
    expect(db.prepare('SELECT COUNT(*) AS n FROM audio_cleanup_jobs').get()).toEqual({ n: 1 })
    expect(db.pragma('foreign_key_check')).toEqual([])
  })
})

describe('additive schema migration', () => {
  it.each(['\n', '\r\n'])('preserves valid legacy content, adds missing evidence, installs guards, and runs once (EOL %j)', (lineEnding) => {
    const target = file()
    let db = legacy(target, true, lineEnding)
    seed(db)
    db.exec("INSERT INTO moment_reviews(call_id,moment_id,relevance,note) VALUES ('CALL-0042','m',1,'Keep note')")
    db.exec("INSERT INTO call_workflows VALUES ('CALL-0042',1,'{\"reason\":\"Keep reason\"}','2026-11-23')")
    db.exec("INSERT INTO workflow_events(call_id,version,at,event_json) VALUES ('CALL-0042',1,'2026-11-23','{\"version\":1}')")
    const calls = db.prepare('SELECT * FROM calls').all()
    const utterances = db.prepare('SELECT * FROM utterances').all()
    const events = db.prepare('SELECT * FROM workflow_events').all()
    db.close()
    db = track(openDb(target))
    expect(db.prepare('SELECT * FROM calls').all()).toEqual(calls)
    expect(db.prepare('SELECT * FROM utterances').all()).toEqual(utterances)
    expect(db.prepare('SELECT * FROM workflow_events').all()).toEqual(events)
    expect(db.prepare('SELECT note,evidence_key FROM moment_reviews').get()).toEqual({ note: 'Keep note', evidence_key: null })
    expect(nextCallId(db)).toBe('CALL-0043')
    expect(() => db.exec("UPDATE calls SET status='invalid'")).toThrow()
    expect(() => db.exec("INSERT INTO utterances(call_id,id,idx,text,start,end) VALUES ('CALL-0042','duplicate',0,'x',3,4)")).toThrow()
    const migrations = db.prepare('SELECT * FROM schema_migrations').all()
    expect(migrations).toHaveLength(1)
    db.close()
    db = track(openDb(target))
    expect(db.prepare('SELECT * FROM schema_migrations').all()).toEqual(migrations)
    expect(nextCallId(db)).toBe('CALL-0044')
  })

  it.each([
    "UPDATE calls SET stage_log='bad json'",
    "INSERT INTO utterances(call_id,id,idx,text,start,end) VALUES ('CALL-0042','duplicate',0,'x',3,4)",
    "INSERT INTO utterances(call_id,id,idx,text,start,end) VALUES ('missing','orphan',0,'x',0,1)",
  ])('rejects incompatible legacy data without changing it: %s', (sql) => {
    const target = file()
    const before = legacy(target, true)
    seed(before)
    before.exec(sql)
    const callRows = before.prepare('SELECT * FROM calls').all()
    const utteranceRows = before.prepare('SELECT * FROM utterances').all()
    before.close()
    expect(() => openDb(target)).toThrow(/db:check/)
    const after = track(new Database(target, { readonly: true, fileMustExist: true }))
    expect(after.prepare('SELECT * FROM calls').all()).toEqual(callRows)
    expect(after.prepare('SELECT * FROM utterances').all()).toEqual(utteranceRows)
    expect(after.prepare("SELECT name FROM sqlite_master WHERE name IN ('schema_migrations','audio_cleanup_jobs')").all()).toEqual([])
    expect((after.pragma('table_info(moment_reviews)') as Array<{ name: string }>).some(c => c.name === 'evidence_key')).toBe(false)
  })

  it('refuses a schema from a newer application instead of downgrading it', () => {
    const target = file()
    const db = track(openDb(target))
    db.exec('UPDATE schema_migrations SET version=999')
    db.close()
    expect(() => openDb(target)).toThrow(/newer|version|phiên bản/i)
    const check = track(new Database(target, { readonly: true, fileMustExist: true }))
    expect(check.prepare('SELECT version FROM schema_migrations').get()).toEqual({ version: 999 })
  })

  it('does not stamp a migration when a legacy index name masks the required unique index', () => {
    const target = file()
    const before = legacy(target)
    seed(before)
    before.exec('CREATE INDEX idx_utterances_call_order ON utterances(text)')
    before.close()
    expect(() => openDb(target)).toThrow(/unique|schema/i)
    const after = track(new Database(target, { readonly: true }))
    expect(after.prepare("SELECT name FROM sqlite_master WHERE name='schema_migrations'").get()).toBeUndefined()
    expect(after.prepare('SELECT COUNT(*) AS n FROM calls').get()).toEqual({ n: 1 })
    expect(after.pragma('index_info(idx_utterances_call_order)')).toEqual([expect.objectContaining({ name: 'text' })])
  })

  it('rejects a missing required column even if remaining predicates and keys still work', () => {
    const target = file()
    const db = track(openDb(target))
    db.exec('ALTER TABLE calls DROP COLUMN audio_name')
    db.close()
    expect(() => openDb(target)).toThrow(/audio_name/)
  })

  it('checks FK declarations as well as existing orphan rows before migration', () => {
    const target = file()
    const db = track(new Database(target))
    const sql = fs.readFileSync(new URL('./fixtures/pre-integrity-schema.sql', import.meta.url), 'utf8')
      .replaceAll(' REFERENCES calls(id) ON DELETE CASCADE', '')
    db.exec(sql)
    db.close()
    expect(() => openDb(target)).toThrow(/foreign key/i)
    const after = track(new Database(target, { readonly: true }))
    expect(after.prepare("SELECT name FROM sqlite_master WHERE name='schema_migrations'").get()).toBeUndefined()
  })
})
