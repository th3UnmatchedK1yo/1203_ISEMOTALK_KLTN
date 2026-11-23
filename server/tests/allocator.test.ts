import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { openDb } from '../src/db'
import { insertCall, nextCallId, deleteCall } from '../src/repo'

it('keeps allocated call IDs unique across deletion and database reopen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'isemo-allocator-'))
  const file = path.join(dir, 'calls.db')
  let db = openDb(file)
  try {
    const first = nextCallId(db)
    insertCall(db, { id: first, title: 'one', agentName: '', customerName: '', callDate: new Date().toISOString(), source: 'results_import', agentChannel: 0, stageLog: [] })
    deleteCall(db, first)
    db.close()
    db = openDb(file)
    const second = nextCallId(db)
    const third = nextCallId(db)
    expect(new Set([first, second, third]).size).toBe(3)
    expect(first).toBe('CALL-0001')
    expect(second).toBe('CALL-0002')
    expect(third).toBe('CALL-0003')
  } finally {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
