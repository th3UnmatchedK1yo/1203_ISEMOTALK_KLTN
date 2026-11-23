import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { insertCall, nextCallId } from '../src/repo'
import { seedDemo } from '../src/seed'
import { findDataViolations } from '../src/db-contract'
import { makeApp } from './helpers'

let t: ReturnType<typeof makeApp>
const fields = { title: 'Ticket 10%_A', customerName: '', customerRef: 'CUS-A', queueName: 'Sales', externalTicketId: 'REF-1', reason: 'Refund', owner: 'Mai', status: 'open', outcomeNote: '' }
const actor = 'An'
const time = '2026-11-23T09:00:00+07:00'
const later = '2026-11-24T09:00:00+07:00'
const contact = { direction: 'inbound', disposition: 'callback_requested', occurredAt: time, externalContactId: '', note: '' }
const task = { kind: 'callback', action: 'Call customer', owner: 'Mai', dueAt: '2000-01-01T12:00:00Z' }
const create = (extra = {}) => t.api.post('/api/cases').send({ ...fields, actor, ...extra })
const makeCall = () => insertCall(t.db, { id: 'CALL-0012', title: 'Evidence', agentName: '', customerName: '', callDate: time, source: 'upload', agentChannel: 0, stageLog: [], audioFile: 'CALL-0012/audio.wav' })

beforeEach(() => { t = makeApp() })
afterEach(async () => { await t.pipeline.stop(); t.cleanup() })

describe('service operations', () => {
  it('records and finishes a callback and internal work before a human resolves the case', async () => {
    const initial = (await create({ contact, task }).expect(201)).body
    const base = '/api/cases/' + initial.case.id
    const cb = base + '/tasks/' + initial.tasks[0].id
    expect(initial.case.version).toBe(1)
    expect(initial.contacts[0]).toMatchObject({ source: 'manual', callId: null, occurredAt: '2026-11-23T02:00:00.000Z' })
    expect(initial.history[0].snapshot).toEqual({ case: initial.case, contact: initial.contacts[0], task: initial.tasks[0] })
    expect(t.db.prepare('SELECT COUNT(*) n FROM calls').get()).toEqual({ n: 0 })
    expect(t.client.calls).toEqual([])
    const list = await t.api.get('/api/cases').query({ search: '%_', overdue: '1', owner: 'Mai' }).expect(200)
    expect(list.body.items[0]).toMatchObject({ openTaskCount: 1, overdueTaskCount: 1, contactCount: 1, nextDueAt: '2000-01-01T12:00:00.000Z' })
    await t.api.put(base).send({ ...fields, actor, baseVersion: 1, status: 'resolved', outcomeNote: 'Done' }).expect(409)
    const attempted = await t.api.post(cb + '/attempts').send({ baseVersion: 1, actor, outcome: 'no_answer', note: 'Rang out', occurredAt: time, nextDueAt: later }).expect(200)
    expect(attempted.body.tasks[0]).toMatchObject({ status: 'pending', dueAt: '2026-11-24T02:00:00.000Z' })
    const connected = await t.api.post(cb + '/attempts').send({ baseVersion: 2, actor, outcome: 'connected', note: 'Confirmed', occurredAt: later }).expect(200)
    expect(connected.body.tasks[0]).toMatchObject({ status: 'completed', resultNote: 'Confirmed' })
    expect(connected.body.case.status).toBe('open')
    expect(connected.body.attempts).toHaveLength(2)
    makeCall()
    await t.api.post(base + '/contacts').send({ ...contact, disposition: 'recording', callId: 'CALL-0012', baseVersion: 3, actor }).expect(200)
    const added = await t.api.post(base + '/tasks').send({ ...task, kind: 'backoffice', baseVersion: 4, actor }).expect(200)
    const backoffice = added.body.tasks.find((row: { kind: string }) => row.kind === 'backoffice')
    const edit = { action: task.action, owner: task.owner, dueAt: task.dueAt, status: 'completed', resultNote: 'Payment checked' }
    await t.api.put(base + '/tasks/' + backoffice.id).send({ ...edit, baseVersion: 5, actor }).expect(200)
    const resolved = await t.api.put(base).send({ ...fields, actor, baseVersion: 6, status: 'resolved', outcomeNote: 'Refund confirmed' }).expect(200)
    expect(resolved.body.case.resolvedAt).toMatch(/Z$/)
    await t.api.post(base + '/contacts').send({ ...contact, actor, baseVersion: 7 }).expect(409)
    await t.api.put(base).send({ ...fields, actor, baseVersion: 7 }).expect(400)
    const reopened = await t.api.put(base).send({ ...fields, actor, baseVersion: 7, changeNote: 'Customer called again' }).expect(200)
    expect(reopened.body.historyTotal).toBe(8)
    expect(reopened.body.history[0]).toMatchObject({ kind: 'case_reopened', changeNote: 'Customer called again', snapshot: { case: { resolvedAt: null, version: 8 } } })
    expect(reopened.body.history.at(-1).snapshot).toEqual(initial.history[0].snapshot)
    expect(findDataViolations(t.db)).toEqual([])
  })

  it('returns the original case on an idempotent create replay and refuses a conflicting body', async () => {
    const requestId = 'e0b4d891-2d13-4acc-9856-785a2b5f19ac'
    const first = (await create({ requestId, task, contact }).expect(201)).body
    const savedCounters = t.db.prepare('SELECT * FROM id_counters ORDER BY name').all()
    const path = '/api/cases/' + first.case.id
    const updated = (await t.api.put(path).send({ ...fields, actor, baseVersion: 1, reason: 'More detail' }).expect(200)).body
    const repeated = (await create({ requestId, task, contact: { ...contact, callId: null, occurredAt: '2026-11-23T02:00:00.000Z' } }).expect(201)).body
    expect(repeated).toEqual(updated)
    const conflict = await create({ requestId, title: 'Different issue', task, contact }).expect(409)
    expect(conflict.body).toMatchObject({ code: 'creation_request_conflict', caseId: first.case.id })
    expect(t.db.prepare('SELECT COUNT(*) n FROM service_cases').get()).toEqual({ n: 1 })
    expect(t.db.prepare('SELECT * FROM id_counters ORDER BY name').all()).toEqual(savedCounters)
    expect((await t.api.get(path)).body).toEqual(updated)
    expect(JSON.stringify(updated)).not.toContain(requestId)
  })

  it('uses one aggregate version for concurrent child edits and preserves ownership between cases', async () => {
    const a = (await create({ task }).expect(201)).body
    const b = (await create().expect(201)).body
    const path = '/api/cases/' + a.case.id
    const results = await Promise.all([
      t.api.post(path + '/contacts').send({ ...contact, actor, baseVersion: 1 }),
      t.api.post(path + '/tasks').send({ ...task, actor, baseVersion: 1 }),
    ])
    expect(results.map(r => r.status).sort()).toEqual([200, 409])
    const detail = (await t.api.get(path).expect(200)).body
    expect(detail.case.version).toBe(2)
    expect(detail.historyTotal).toBe(2)
    expect(detail.tasks.length + detail.contacts.length).toBe(2)
    await t.api.post('/api/cases/' + b.case.id + '/tasks/' + a.tasks[0].id + '/attempts').send({ actor, baseVersion: 1, outcome: 'connected', note: 'X' }).expect(404)
  })

  it('rejects invalid dates, contradictory contact sources and unsupported transitions atomically', async () => {
    await create({ contact: { ...contact, occurredAt: '2026-02-31T10:00:00Z' } }).expect(400)
    await create({ contact: { ...contact, callId: 'CALL-0012' } }).expect(400)
    await create({ contact: { ...contact, disposition: 'recording' } }).expect(400)
    await create({ contact: { ...contact, disposition: 'recording', callId: 'unknown' } }).expect(404)
    const created = (await create({ task }).expect(201)).body
    const path = '/api/cases/' + created.case.id + '/tasks/' + created.tasks[0].id
    await t.api.put(path).send({ actor, baseVersion: 1, owner: 'Mai', action: 'Call', dueAt: time, status: 'completed', resultNote: 'No attempt' }).expect(409)
    for (const outcome of ['busy', 'no_answer', 'voicemail']) {
      await t.api.post(path + '/attempts').send({ actor, baseVersion: 1, outcome, occurredAt: time, note: 'Called', nextDueAt: time }).expect(400)
      await t.api.post(path + '/attempts').send({ actor, baseVersion: 1, outcome, occurredAt: time, note: 'Called' }).expect(400)
    }
    await t.api.post(path + '/attempts').send({ actor, baseVersion: 1, outcome: 'connected', note: 'Reached' }).expect(200)
    await t.api.put(path).send({ actor, baseVersion: 2, owner: 'Mai', action: 'Again', dueAt: time, status: 'pending', resultNote: '' }).expect(409)
    expect((await t.api.get('/api/cases')).body.total).toBe(1)
  })

  it('preserves evidence IDs after deletion and rolls back a failed contact or deletion event', async () => {
    makeCall()
    const recording = { ...contact, disposition: 'recording', callId: 'CALL-0012' }
    const original = (await create({ contact: recording, task }).expect(201)).body
    const path = '/api/cases/' + original.case.id
    await create({ contact: recording }).expect(409)
    expect((await t.api.get('/api/cases').query({ callId: recording.callId })).body.total).toBe(1)
    t.db.exec("CREATE TRIGGER no_event BEFORE INSERT ON service_events BEGIN SELECT RAISE(ABORT,'event failed'); END")
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await t.api.post(path + '/contacts').send({ ...contact, baseVersion: 1, actor }).expect(500)
      await t.api.delete('/api/calls/CALL-0012').expect(500)
    } finally { log.mockRestore() }
    expect((await t.api.get(path)).body).toEqual(original)
    expect(t.db.prepare('SELECT id FROM calls').get()).toEqual({ id: 'CALL-0012' })
    expect(t.db.prepare('SELECT * FROM audio_cleanup_jobs').all()).toEqual([])
    t.db.exec('DROP TRIGGER no_event')
    await t.api.delete('/api/calls/CALL-0012').expect(204)
    const detail = (await t.api.get(path).expect(200)).body
    expect(detail.contacts[0]).toMatchObject({ callId: null, recordedCallId: 'CALL-0012' })
    expect(detail.history[0]).toMatchObject({ kind: 'recording_deleted', version: 2, snapshot: { contact: detail.contacts[0] } })
    expect(detail.tasks).toEqual(original.tasks)
    const exported = await t.api.get(path + '/export.json').expect(200)
    expect(exported.body.linkedRecordingIds).toEqual(['CALL-0012'])
    expect(exported.body.sources).toBeTruthy()
    expect(findDataViolations(t.db)).toEqual([])
  })

  it('records mock evidence removed by demo reset and rolls back reset on event failure', async () => {
    const mockId = nextCallId(t.db)
    insertCall(t.db, { id: mockId, title: 'Seeded fixture', agentName: '', customerName: '', callDate: time,
      source: 'results_import', provenance: 'mock', agentChannel: 0, stageLog: [] })
    const original = (await create({ contact: { ...contact, disposition: 'recording', callId: mockId }, task }).expect(201)).body
    const path = '/api/cases/' + original.case.id
    t.db.exec("CREATE TRIGGER reject_reset_event BEFORE INSERT ON service_events BEGIN SELECT RAISE(ABORT,'event failed'); END")
    expect(() => seedDemo(t.db, t.config, { reset: true })).toThrow(/event failed/)
    expect((await t.api.get(path)).body).toEqual(original)
    expect(t.db.prepare('SELECT id FROM calls').all()).toEqual([{ id: mockId }])
    t.db.exec('DROP TRIGGER reject_reset_event')
    seedDemo(t.db, t.config, { reset: true })
    const current = (await t.api.get(path)).body
    expect(current.contacts[0]).toMatchObject({ recordedCallId: mockId, callId: null })
    expect(current.case.version).toBe(2)
    expect(current.history[0]).toMatchObject({ kind: 'recording_deleted', version: 2, snapshot: { contact: current.contacts[0] } })
    expect(current.history[1]).toEqual(original.history[0])
    expect(current.tasks).toEqual(original.tasks)
    expect((await t.api.post(path + '/tasks').send({ ...task, actor, baseVersion: 1 })).status).toBe(409)
  })

  it('exports all versions while detail shows the latest 100', async () => {
    const first = (await create().expect(201)).body
    const path = '/api/cases/' + first.case.id
    for (let v = 1; v <= 100; v++) await t.api.put(path).send({ ...fields, reason: 'Change ' + v, baseVersion: v, actor }).expect(200)
    const detail = (await t.api.get(path).expect(200)).body
    expect(detail.history).toHaveLength(100)
    expect(detail.historyTotal).toBe(101)
    const full = (await t.api.get(path + '/export.json').expect(200)).body
    expect(full.history).toHaveLength(101)
    expect(full.history.at(-1)).toEqual(first.history[0])
  })
})

describe('stored service data and list boundaries', () => {
  it('filters literal search, status and owner before paginating', async () => {
    const withLiteral = (await create({ title: 'Ticket \\%_one', owner: 'Lan', task }).expect(201)).body
    await create({ title: 'Ticket Axone' }).expect(201)
    await create({ title: 'Ticket other' }).expect(201)
    const filtered = (await t.api.get('/api/cases').query({ search: '\\%_', pageSize: 1, status: 'open', owner: 'Lan' }).expect(200)).body
    expect(filtered).toMatchObject({ total: 1, page: 1, pageSize: 1, items: [{ id: withLiteral.case.id }] })
    const second = (await t.api.get('/api/cases').query({ search: 'Ticket', page: 2, pageSize: 2 }).expect(200)).body
    expect(second.items).toHaveLength(1)
    expect(second.total).toBe(3)
    const blank = (await t.api.get('/api/cases?search=&status=&owner=&overdue=&callId=&page=&pageSize=').expect(200)).body
    expect(blank).toMatchObject({ total: 3, page: 1, pageSize: 25 })
    for (const query of [{ status: 'unknown' }, { page: 0 }, { pageSize: 101 }, { page: '1.2' }, { overdue: 'true' }])
      await t.api.get('/api/cases').query(query).expect(400)
  })

  it('enforces immutable evidence, typed domains and composite task ownership in SQLite', async () => {
    const a = (await create({ task }).expect(201)).body
    const b = (await create().expect(201)).body
    const attempts = '/api/cases/' + a.case.id + '/tasks/' + a.tasks[0].id + '/attempts'
    await t.api.post(attempts).send({ actor, baseVersion: 1, outcome: 'busy', note: 'Occupied', occurredAt: time, nextDueAt: later }).expect(200)
    expect(() => t.db.exec('DELETE FROM follow_up_attempts')).toThrow(/append-only/)
    expect(() => t.db.exec("UPDATE service_events SET actor='Replacement'")).toThrow(/append-only/)
    expect(() => t.db.prepare("INSERT INTO follow_up_attempts SELECT 'ATTEMPT-X', ?, task_id, actor, occurred_at, outcome, note, next_due_at FROM follow_up_attempts").run(b.case.id)).toThrow(/FOREIGN KEY/)
    expect(() => t.db.exec("UPDATE service_cases SET status='resolved'")).toThrow(/CHECK/)
    expect(() => t.db.exec("UPDATE follow_up_tasks SET due_at='bad date'")).toThrow(/CHECK/)
    expect(() => t.db.exec("UPDATE follow_up_tasks SET due_at='2026-02-30T10:11:10.000Z'")).toThrow(/CHECK/)
    expect(t.db.pragma('foreign_key_check')).toEqual([])
  })

  it('reports missing case events, a malformed snapshot and inconsistent work without exposing its text', async () => {
    await create({ task }).expect(201)
    t.db.exec(`UPDATE service_cases SET version=3, status='resolved', resolved_at=updated_at, outcome_note='CONFIDENTIAL';
      DROP TRIGGER immutable_service_events_update;
      UPDATE service_events SET snapshot_json=json_object('case', json_object('id',case_id,'version',version));
      UPDATE id_counters SET value=0 WHERE name='service_cases'`)
    const report = findDataViolations(t.db)
    expect(report.map(rule => rule.rule)).toEqual(expect.arrayContaining(['aggregate_history','event_snapshot','resolved_pending_tasks','counter_high_water']))
    expect(JSON.stringify(report)).not.toContain('CONFIDENTIAL')
  })
})
