import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { insertCall } from '../src/repo'
import { makeApp } from './helpers'

let t: ReturnType<typeof makeApp>
const id = 'CALL-0001'

function addCall(callId: string, title: string) {
  insertCall(t.db, {
    id: callId, title, agentName: '', customerName: '', callDate: '2026-11-23T00:00:00.000Z',
    source: 'results_import', agentChannel: 0, stageLog: [],
  })
}

beforeEach(() => {
  t = makeApp()
  addCall(id, 'Workflow fixture')
})
afterEach(async () => {
  await t.pipeline.stop()
  t.cleanup()
})

describe('literal call search', () => {
  const titles = ['C:\\work', '50% discount', 'code_a', 'a\\% suffix', 'a\\_ suffix', 'a\\b', 'plain']
  it.each([
    { search: 'C:\\work', expected: ['C:\\work'] },
    { search: '\\', expected: ['C:\\work', 'a\\% suffix', 'a\\_ suffix', 'a\\b'] },
    { search: '\\%', expected: ['a\\% suffix'] },
    { search: '\\_', expected: ['a\\_ suffix'] },
    { search: '%', expected: ['50% discount', 'a\\% suffix'] },
    { search: '_', expected: ['a\\_ suffix', 'code_a'] },
  ])('matches the literal characters in $search', async ({ search, expected }) => {
    titles.forEach((title, i) => addCall(`CALL-${i + 10}`, title))
    const result = await t.api.get('/api/calls').query({ search }).expect(200)
    expect(result.body.items.map((call: { title: string }) => call.title).sort()).toEqual(expected)
    expect(result.body.total).toBe(expected.length)
  })
})

describe('workflow history snapshots', () => {
  const initial = {
    baseVersion: 0, externalContactId: 'CONTACT-A', ticketId: 'TICKET-A', queueName: 'Original queue',
    reason: 'Original reason', resolution: 'follow_up', nextAction: 'Call the customer', owner: 'Support team',
    followUpAt: '2026-11-24T09:00:00+07:00', outcomeNote: 'Awaiting reply', reviewerName: 'Reviewer A',
  }

  it('preserves every earlier field after a later save and in JSON export', async () => {
    await t.api.put(`/api/calls/${id}/workflow`).send(initial).expect(200)
    const saved = await t.api.put(`/api/calls/${id}/workflow`).send({
      ...initial, baseVersion: 1, externalContactId: 'CONTACT-B', ticketId: 'TICKET-B', queueName: 'New queue',
      reason: 'Revised reason', resolution: 'resolved', outcomeNote: 'Refund confirmed', reviewerName: 'Reviewer B',
    }).expect(200)
    const originalSnapshot = {
      externalContactId: 'CONTACT-A', ticketId: 'TICKET-A', queueName: 'Original queue', reason: 'Original reason',
      resolution: 'follow_up', nextAction: 'Call the customer', owner: 'Support team',
      followUpAt: '2026-11-24T02:00:00.000Z', outcomeNote: 'Awaiting reply', reviewerName: 'Reviewer A',
    }
    expect(saved.body.history).toHaveLength(2)
    expect(saved.body.history[1]).toMatchObject({ schemaVersion: 2, snapshotStatus: 'complete', snapshot: originalSnapshot })
    expect(saved.body.history[0].snapshot).toMatchObject({ ticketId: 'TICKET-B', resolution: 'resolved', followUpAt: null })
    const exported = await t.api.get(`/api/calls/${id}/export.json`).expect(200)
    expect(exported.body.workflow.history[1].snapshot).toEqual(originalSnapshot)
    const persisted = t.db.prepare('SELECT event_json FROM workflow_events WHERE call_id=? AND version=1').get(id) as { event_json: string }
    expect(JSON.parse(persisted.event_json).snapshot).toEqual(originalSnapshot)
  })

  it('marks legacy events partial without inventing missing fields or rewriting their JSON', async () => {
    const rawEvent = JSON.stringify({
      version: 1, at: '2026-11-22T08:00:00.000Z', reviewerName: 'Earlier reviewer',
      changedFields: ['ticketId', 'reason', 'resolution'], resolution: 'open',
      outcomeNote: '', nextAction: '', owner: '', followUpAt: null,
    })
    await t.api.put(`/api/calls/${id}/workflow`).send(initial).expect(200)
    t.db.prepare('UPDATE workflow_events SET event_json=? WHERE call_id=? AND version=1').run(rawEvent, id)
    const fetched = await t.api.get(`/api/calls/${id}/workflow`).expect(200)
    expect(fetched.body.history[0]).toMatchObject({ snapshotStatus: 'legacy_partial', reviewerName: 'Earlier reviewer' })
    expect(fetched.body.history[0]).not.toHaveProperty('snapshot')
    expect(fetched.body.history[0]).not.toHaveProperty('schemaVersion')
    await t.api.put(`/api/calls/${id}/workflow`).send({ ...initial, baseVersion: 1, reason: 'Next revision' }).expect(200)
    const exported = await t.api.get(`/api/calls/${id}/export.json`).expect(200)
    expect(exported.body.workflow.history[0].snapshotStatus).toBe('complete')
    expect(exported.body.workflow.history[1].snapshotStatus).toBe('legacy_partial')
    const persisted = t.db.prepare('SELECT event_json FROM workflow_events WHERE call_id=? AND version=1').get(id) as { event_json: string }
    expect(persisted.event_json).toBe(rawEvent)
  })

  it('rolls back the workflow snapshot and version if its history event cannot be written', async () => {
    await t.api.put(`/api/calls/${id}/workflow`).send(initial).expect(200)
    t.db.exec(`CREATE TRIGGER reject_workflow_event BEFORE INSERT ON workflow_events
      WHEN NEW.version = 2 BEGIN SELECT RAISE(ABORT, 'simulated event write failure'); END`)
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await t.api.put(`/api/calls/${id}/workflow`).send({ ...initial, baseVersion: 1, reason: 'Must not persist' }).expect(500)
    } finally { logged.mockRestore() }
    const saved = await t.api.get(`/api/calls/${id}/workflow`).expect(200)
    expect(saved.body).toMatchObject({ version: 1, reason: 'Original reason' })
    expect(saved.body.history).toHaveLength(1)
    expect(saved.body.history[0].snapshot).toMatchObject({ reason: 'Original reason' })
  })
})
