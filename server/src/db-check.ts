import path from 'node:path'
import { auditDatabase } from './db-audit'

function main() {
  const args = process.argv.slice(2)
  const dataDir = path.resolve(process.env.ISEMO_DATA_DIR ?? 'server/data')
  let dbFile = path.join(dataDir, 'isemotalk.db')
  let uploadsDir: string | undefined
  const json = args.includes('--json')
  try {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (arg === '--json') continue
      if (arg === '--help' || arg === '-h') {
        console.log('Usage: npm run db:check -- [--db PATH] [--uploads PATH] [--json]\nRead-only inspection. Never creates, migrates, repairs or deletes data. Exit 0: all checked layers pass; exit 1: review required.')
        return
      }
      if (arg !== '--db' && arg !== '--uploads') throw new Error(`Unknown option: ${arg}`)
      const value = args[++i]
      if (!value || value.startsWith('--')) throw new Error(`Missing path after ${arg}`)
      if (arg === '--db') dbFile = path.resolve(value)
      else uploadsDir = path.resolve(value)
    }
    const report = auditDatabase(dbFile, uploadsDir ?? path.join(path.dirname(dbFile), 'uploads'))
    if (json) console.log(JSON.stringify(report, null, 2))
    else {
      console.log(`ISEmoTalk database check — ${report.ok ? 'PASS' : 'REVIEW REQUIRED'} (read-only)`)
      console.log(`Schema: ${report.schemaVersion} / expected ${report.expectedSchemaVersion}`)
      console.log(`Rows: ${Object.entries(report.counts).map(([k, n]) => `${k}=${n}`).join(', ')}`)
      console.log(`SQLite integrity: ${report.integrity.join('; ') || 'unavailable'}`)
      console.log(`Foreign key failures: ${report.foreignKeys.length}; domain failures: ${report.domainViolations.length}`)
      for (const issue of report.schemaIssues) console.log(`Schema: ${issue}`)
      for (const issue of report.foreignKeys) console.log(`Foreign key: ${issue.table}, rowid=${issue.rowid}, parent=${issue.parent}`)
      for (const issue of report.domainViolations) console.log(`Domain: ${issue.table}.${issue.rule} count=${issue.count}, sample rowids=${issue.sampleRowIds.join(',')}`)
      console.log(`Recordings checked: ${report.storage.checkedAudio}; missing: ${report.storage.missingAudio.length}; unsafe/unreadable: ${report.storage.unsafeAudio.length}`)
      if (report.storage.missingAudio.length) console.log(`Missing recording call IDs: ${report.storage.missingAudio.join(', ')}`)
      if (report.storage.unsafeAudio.length) console.log(`Unsafe/unreadable recording call IDs: ${report.storage.unsafeAudio.join(', ')}`)
      console.log(`Pending audio cleanup: ${report.storage.pendingCleanup.length}`)
      for (const job of report.storage.pendingCleanup) console.log(`Cleanup: ${job.callId}, attempts=${job.attempts}`)
      for (const note of report.notes) console.log(note)
    }
    if (!report.ok) process.exitCode = 1
  } catch (error) {
    if (json) console.log(JSON.stringify({ ok: false, readOnly: true, error: (error as Error).message }))
    else console.error((error as Error).message)
    process.exitCode = 1
  }
}

main()
