import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { openDb } from '../src/db'
import { auditDatabase } from '../src/db-audit'
import { insertCall } from '../src/repo'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }) })
function paths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'isemo-db-check-'))
  dirs.push(dir)
  return { dir, file: path.join(dir, 'isemotalk.db'), uploads: path.join(dir, 'uploads') }
}
function cli(args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'server/src/db-check.ts', ...args], { cwd: process.cwd(), encoding: 'utf8' })
}
function seed(file: string, audioFile?: string) {
  const db = openDb(file)
  insertCall(db, { id: 'CALL-0001', title: 'CONFIDENTIAL CUSTOMER CONTENT', agentName: '', customerName: '', callDate: '2026-11-23T00:00:00.000Z', source: 'results_import', agentChannel: 0, stageLog: [], audioFile })
  return db
}

describe('read-only database diagnostic', () => {
  it('does not create a missing database or directory', () => {
    const p = paths()
    const missing = path.join(p.dir, 'missing', 'database.db')
    expect(() => auditDatabase(missing, p.uploads)).toThrow()
    expect(fs.existsSync(path.dirname(missing))).toBe(false)
    const result = cli(['--db', missing, '--json'])
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, readOnly: true })
    expect(fs.existsSync(path.dirname(missing))).toBe(false)
  })

  it('checks a closed clean database without changing its bytes or exposing transcript/customer content', () => {
    const p = paths()
    seed(p.file).close()
    const bytes = fs.readFileSync(p.file)
    const result = auditDatabase(p.file, p.uploads)
    expect(result).toMatchObject({ ok: true, readOnly: true, schemaVersion: 3, counts: { calls: 1, utterances: 0 } })
    expect(result.integrity).toEqual(['ok'])
    expect(result.foreignKeys).toEqual([])
    expect(result.domainViolations).toEqual([])
    expect(result.storage.pendingCleanup).toEqual([])
    expect(fs.readFileSync(p.file)).toEqual(bytes)
    expect(JSON.stringify(result)).not.toContain('CONFIDENTIAL')
    const command = cli(['--db', p.file, '--uploads', p.uploads, '--json'])
    expect(command.status).toBe(0)
    expect(JSON.parse(command.stdout)).toMatchObject({ ok: true, schemaVersion: 3 })
  })

  it('distinguishes structurally valid legacy data from invalid domains, orphan rows and duplicate ordering without migrating', () => {
    const p = paths()
    const db = new Database(p.file)
    db.pragma('foreign_keys = OFF')
    db.exec(fs.readFileSync(new URL('./fixtures/pre-integrity-schema.sql', import.meta.url), 'utf8'))
    db.exec(`INSERT INTO calls(id,title,call_date,source,created_at,updated_at,stage_log)
      VALUES ('CALL-0001','CONFIDENTIAL','2026-11-23','results_import','2026-11-23','2026-11-23','broken');
      INSERT INTO utterances(call_id,id,idx,text,start,end) VALUES ('missing','orphan',0,'CONFIDENTIAL',0,1);
      INSERT INTO utterances(call_id,id,idx,text,start,end) VALUES ('CALL-0001','u1',0,'CONFIDENTIAL',0,1);
      INSERT INTO utterances(call_id,id,idx,text,start,end) VALUES ('CALL-0001','u2',0,'CONFIDENTIAL',1,2);`)
    db.close()
    const bytes = fs.readFileSync(p.file)
    const result = auditDatabase(p.file, p.uploads)
    expect(result.ok).toBe(false)
    expect(result.schemaVersion).toBe(0)
    expect(result.integrity).toEqual(['ok'])
    expect(result.foreignKeys).toHaveLength(1)
    expect(result.domainViolations.map(v => v.rule)).toEqual(expect.arrayContaining(['json_arrays', 'unique_call_order']))
    expect(JSON.stringify(result)).not.toContain('CONFIDENTIAL')
    expect(fs.readFileSync(p.file)).toEqual(bytes)
    const check = new Database(p.file, { readonly: true })
    expect(check.prepare("SELECT name FROM sqlite_master WHERE name='schema_migrations'").get()).toBeUndefined()
    check.close()
  })

  it('reports missing/unsafe recordings and pending cleanup separately from relational integrity', () => {
    const p = paths()
    const db = seed(p.file, path.join('CALL-0001', 'audio.wav'))
    db.exec("INSERT INTO audio_cleanup_jobs(call_id,created_at,attempts,last_error) VALUES ('CALL-0002','2026-11-23',1,'EACCES: details')")
    db.close()
    let result = auditDatabase(p.file, p.uploads)
    expect(result.ok).toBe(false)
    expect(result.storage.missingAudio).toEqual(['CALL-0001'])
    expect(result.storage.pendingCleanup).toEqual([{ callId: 'CALL-0002', attempts: 1 }])
    const update = new Database(p.file)
    update.exec("UPDATE calls SET audio_file='../someone-else/audio.wav'")
    update.close()
    result = auditDatabase(p.file, p.uploads)
    expect(result.storage.unsafeAudio).toEqual(['CALL-0001'])
    expect(result.foreignKeys).toEqual([])
    expect(result.domainViolations).toEqual([])
  })

  it('reports a schema missing required columns instead of declaring it healthy', () => {
    const p = paths()
    const db = new Database(p.file)
    db.exec('CREATE TABLE calls(id TEXT PRIMARY KEY)')
    db.close()
    const result = auditDatabase(p.file, p.uploads)
    expect(result.ok).toBe(false)
    expect(result.schemaIssues.length).toBeGreaterThan(0)
    expect(fs.existsSync(p.uploads)).toBe(false)
  })

  it('rejects unknown CLI flags without initializing the default database', () => {
    const result = cli(['--repair'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Unknown option')
  })

  it('reports missing non-domain columns in a versioned database', () => {
    const p = paths()
    const db = seed(p.file)
    db.exec('ALTER TABLE calls DROP COLUMN audio_name')
    db.close()
    const result = auditDatabase(p.file, p.uploads)
    expect(result.ok).toBe(false)
    expect(result.schemaIssues.join(' ')).toContain('audio_name')
  })

  it('restores a stopped-service directory backup with the same database rows and recording bytes', () => {
    const p = paths()
    const audio = path.join(p.uploads, 'CALL-0001', 'audio.wav')
    fs.mkdirSync(path.dirname(audio), { recursive: true })
    fs.writeFileSync(audio, Buffer.from('test recording bytes'))
    const db = seed(p.file, path.join('CALL-0001', 'audio.wav'))
    db.exec("INSERT INTO call_workflows VALUES ('CALL-0001',1,'{\"ticketId\":\"T-1\"}','2026-11-23')")
    const original = db.prepare('SELECT * FROM calls').all()
    db.close()
    const restore = paths()
    fs.cpSync(p.dir, restore.dir, { recursive: true })
    const reopened = openDb(restore.file)
    expect(reopened.prepare('SELECT * FROM calls').all()).toEqual(original)
    expect(reopened.prepare('SELECT fields_json FROM call_workflows').get()).toEqual({ fields_json: '{"ticketId":"T-1"}' })
    reopened.close()
    expect(fs.readFileSync(path.join(restore.uploads, 'CALL-0001', 'audio.wav'))).toEqual(fs.readFileSync(audio))
    expect(auditDatabase(restore.file, restore.uploads).ok).toBe(true)
  })
})
