import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { assertCallAudioOwnership } from './audio-storage'
import { findDataViolations, type DataViolation } from './db-contract'
import { EXPECTED_TABLES, knownHistory, SCHEMA_VERSION, schemaProblems } from './db-schema'

interface ForeignKeyFailure { table: string; rowid: number | null; parent: string; fkid: number }
export interface DatabaseAudit {
  ok: boolean
  readOnly: true
  schemaVersion: number
  expectedSchemaVersion: number
  schemaIssues: string[]
  counts: Record<string, number>
  integrity: string[]
  foreignKeys: ForeignKeyFailure[]
  domainViolations: DataViolation[]
  storage: { checkedAudio: number; missingAudio: string[]; unsafeAudio: string[]; pendingCleanup: Array<{ callId: string; attempts: number }> }
  notes: string[]
}

/** Opens an existing file read-only; never call openDb (which migrates) here. */
export function auditDatabase(file: string, uploadsDir: string): DatabaseAudit {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    db.pragma('query_only = ON')
    db.pragma('foreign_keys = ON')
    // One read transaction gives relational queries a consistent snapshot.
    // Filesystem observations cannot be atomic with that snapshot.
    return db.transaction(() => {
      const report: DatabaseAudit = {
        ok: false, readOnly: true, schemaVersion: 0, expectedSchemaVersion: SCHEMA_VERSION,
        schemaIssues: [], counts: {}, integrity: [], foreignKeys: [], domainViolations: [],
        storage: { checkedAudio: 0, missingAudio: [], unsafeAudio: [], pendingCleanup: [] },
        notes: ['The database is opened read-only. File availability is observed separately; no migration, cleanup or repair is performed.'],
      }
      const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(r => r.name))
      const attempt = (label: string, operation: () => void) => {
        try { operation() } catch (error) { report.schemaIssues.push(`${label}: ${(error as Error).message}`) }
      }
      attempt('Integrity inspection', () => { report.integrity = (db.pragma('integrity_check') as Array<{ integrity_check: string }>).map(r => r.integrity_check) })
      attempt('Foreign key inspection', () => { report.foreignKeys = db.pragma('foreign_key_check') as ForeignKeyFailure[] })
      if (tables.has('schema_migrations')) {
        attempt('Migration history', () => {
          const versions = db.prepare('SELECT version,name FROM schema_migrations ORDER BY version').all() as Array<{ version: number; name: string }>
          report.schemaVersion = versions.at(-1)?.version ?? 0
          if (!knownHistory(versions)) {
            report.schemaIssues.push('Unrecognized or incomplete migration history.')
          }
        })
      }
      if (report.schemaVersion !== SCHEMA_VERSION) report.schemaIssues.push(`Schema version ${report.schemaVersion}; application expects ${SCHEMA_VERSION}. Older versions require migration.`)
      attempt('Schema declarations', () => { report.schemaIssues.push(...schemaProblems(db, report.schemaVersion)) })
      for (const table of EXPECTED_TABLES) {
        if (tables.has(table)) attempt(`Count ${table}`, () => { report.counts[table] = (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n })
      }
      attempt('Domain inspection', () => { report.domainViolations = findDataViolations(db) })
      if (tables.has('audio_cleanup_jobs')) attempt('Cleanup inspection', () => {
        report.storage.pendingCleanup = (db.prepare('SELECT call_id,attempts FROM audio_cleanup_jobs ORDER BY created_at,call_id').all() as Array<{ call_id: string; attempts: number }>).map(r => ({ callId: r.call_id, attempts: r.attempts }))
      })
      if (tables.has('calls')) attempt('Recording inspection', () => {
        const audio = db.prepare('SELECT id,audio_file FROM calls WHERE audio_file IS NOT NULL').all() as Array<{ id: string; audio_file: string }>
        report.storage.checkedAudio = audio.length
        for (const row of audio) {
          try {
            assertCallAudioOwnership(uploadsDir, row.id, row.audio_file)
            const target = path.resolve(uploadsDir, ...row.audio_file.split(/[\\/]/))
            if (!fs.existsSync(target)) report.storage.missingAudio.push(row.id)
            else if (!fs.statSync(target).isFile()) report.storage.unsafeAudio.push(row.id)
          } catch { report.storage.unsafeAudio.push(row.id) }
        }
      })
      report.ok = report.schemaIssues.length === 0 && report.integrity.length === 1 && report.integrity[0] === 'ok' &&
        report.foreignKeys.length === 0 && report.domainViolations.length === 0 &&
        report.storage.missingAudio.length === 0 && report.storage.unsafeAudio.length === 0 && report.storage.pendingCleanup.length === 0
      return report
    }).deferred()
  } finally { db.close() }
}
