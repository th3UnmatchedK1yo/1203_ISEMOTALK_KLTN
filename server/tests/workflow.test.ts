import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeApp, RESULTS_JSON } from './helpers'

let t: ReturnType<typeof makeApp>
let id: string
beforeEach(async () => {
  t = makeApp()
  const response = await t.api.post('/api/calls/import').attach('results', Buffer.from(JSON.stringify(RESULTS_JSON)), 'workflow-fixture.json')
  expect(response.status).toBe(202)
  id = response.body.id
  await t.pipeline.onIdle()
})
afterEach(() => t.cleanup())

const followUp = () => ({
  baseVersion: 0, externalContactId: 'PBX-DEMO-41', ticketId: 'DEMO-CASE-41', queueName: 'Hậu mãi',
  reason: 'Khách cần xác nhận tiến độ hoàn tiền', resolution: 'follow_up',
  owner: 'Nhóm hậu mãi', nextAction: 'Xác minh giao dịch rồi gọi lại',
  followUpAt: '2027-01-15T08:00:00.000Z', reviewerName: 'QA demo', outcomeNote: '',
})

describe('business workflow', () => {
  it('returns an empty workflow for existing calls without inventing CRM data', async () => {
    const r = await t.api.get(`/api/calls/${id}/workflow`)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ callId: id, version: 0, resolution: 'unassessed', ticketId: '', externalContactId: '', history: [] })
    expect((await t.api.get('/api/calls/missing/workflow')).status).toBe(404)
  })

  it('requires an owner, due date and action for a follow-up', async () => {
    for (const field of ['owner', 'nextAction', 'followUpAt']) {
      const r = await t.api.put(`/api/calls/${id}/workflow`).send({ ...followUp(), [field]: '' })
      expect(r.status).toBe(400)
    }
    expect((await t.api.get(`/api/calls/${id}/workflow`)).body.version).toBe(0)
  })

  it('persists follow-up and an audit event independently of SER review', async () => {
    const original = (await t.api.get(`/api/calls/${id}`)).body
    const saved = await t.api.put(`/api/calls/${id}/workflow`).send(followUp())
    expect(saved.status).toBe(200)
    expect(saved.body).toMatchObject({ version: 1, ticketId: 'DEMO-CASE-41', resolution: 'follow_up', followUpAt: followUp().followUpAt })
    expect(saved.body.history).toHaveLength(1)
    expect(saved.body.history[0]).toMatchObject({ reviewerName: 'QA demo', version: 1 })
    expect(saved.body.history[0].changedFields).toContain('resolution')
    expect((await t.api.get(`/api/calls/${id}/workflow`)).body).toEqual(saved.body)
    const unchanged = (await t.api.get(`/api/calls/${id}`)).body
    expect(unchanged.version).toBe(original.version)
    expect(unchanged.reviewStatus).toBe(original.reviewStatus)
    expect(unchanged.utterances).toEqual(original.utterances)
  })

  it('rejects stale writes without changing saved outcome or history', async () => {
    expect((await t.api.put(`/api/calls/${id}/workflow`).send(followUp())).status).toBe(200)
    const stale = await t.api.put(`/api/calls/${id}/workflow`).send({ ...followUp(), owner: 'Wrong overwrite' })
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('version_conflict')
    const after = (await t.api.get(`/api/calls/${id}/workflow`)).body
    expect(after.owner).toBe('Nhóm hậu mãi')
    expect(after.history).toHaveLength(1)
  })

  it('requires a resolution note and clears an active follow-up when resolved', async () => {
    await t.api.put(`/api/calls/${id}/workflow`).send(followUp())
    const closed = { ...followUp(), baseVersion: 1, resolution: 'resolved' }
    expect((await t.api.put(`/api/calls/${id}/workflow`).send(closed)).status).toBe(400)
    const saved = await t.api.put(`/api/calls/${id}/workflow`).send({ ...closed, outcomeNote: 'Đã xác nhận hoàn tiền với khách.' })
    expect(saved.status).toBe(200)
    expect(saved.body.followUpAt).toBeNull()
    expect(saved.body.history).toHaveLength(2)
    expect(saved.body.history[0].resolution).toBe('resolved')
  })

  it('rejects invalid dates, empty reviewer, unknown fields and fractional versions', async () => {
    for (const patch of [{ followUpAt: 'not a date' }, { reviewerName: '   ' }, { baseVersion: 0.5 }, { resolution: 'happy' }, { injected: 'bad' }]) {
      const r = await t.api.put(`/api/calls/${id}/workflow`).send({ ...followUp(), ...patch })
      expect(r.status).toBe(400)
    }
  })

  it('deletes the workflow and history when its call is removed', async () => {
    await t.api.put(`/api/calls/${id}/workflow`).send(followUp())
    expect((await t.api.delete(`/api/calls/${id}`)).status).toBe(204)
    expect((await t.api.get(`/api/calls/${id}/workflow`)).status).toBe(404)
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM call_workflows').get()).toEqual({ n: 0 })
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM workflow_events').get()).toEqual({ n: 0 })
  })

  it('keeps the full workflow audit in JSON export while bounding the panel history', async () => {
    for (let version = 0; version < 52; version++) {
      const saved = await t.api.put(`/api/calls/${id}/workflow`).send({ ...followUp(), baseVersion: version, outcomeNote: `Update ${version + 1}` })
      expect(saved.status).toBe(200)
    }
    expect((await t.api.get(`/api/calls/${id}/workflow`)).body.history).toHaveLength(50)
    const exported = await t.api.get(`/api/calls/${id}/export.json`)
    expect(exported.status).toBe(200)
    expect(exported.body.workflow.history).toHaveLength(52)
    expect(exported.body.workflow.history.at(-1).version).toBe(1)
  })
})
