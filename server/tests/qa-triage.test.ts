import { afterEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { openDb } from '../src/db'
import { loadConfig } from '../src/config'
import { attachQaTriageRoutes } from '../src/qa-routes'
import * as repo from '../src/repo'

const dbs: Array<ReturnType<typeof openDb>> = []
afterEach(() => { for (const db of dbs.splice(0)) db.close(); vi.unstubAllGlobals() })

function setup() {
  const db = openDb(':memory:')
  dbs.push(db)
  const now = new Date().toISOString()
  repo.insertCall(db, {
    id: 'CALL-000001', title: 'Refund follow-up', agentName: 'A', customerName: 'B',
    callDate: now, source: 'results_import', agentChannel: 0,
    stageLog: [], provenance: 'imported',
  })
  repo.replaceUtterances(db, 'CALL-000001', [
    { start: 0, end: 3, text: 'Tôi chưa được hoàn tiền.', speaker: 'customer' },
  ])
  repo.updateCall(db, 'CALL-000001', { status: 'ready' })
  const app = express()
  const config = loadConfig({ inferenceUrl: 'http://127.0.0.1:8001' })
  attachQaTriageRoutes(app, db, config)
  return { db, app }
}

describe('QA predictions are evidence, not reviewer actions', () => {
  it('stores real-model provenance and detects later transcript changes', async () => {
    const { db, app } = setup()
    const endpoint = '/api/calls/CALL-000001/qa-triage'
    expect((await request(app).get(endpoint)).body).toEqual({ result: null, outdated: false })
    const digest = 'a'.repeat(64)
    const fake = vi.fn(async () => new Response(JSON.stringify({
      label: 'needs_attention', score: 0.89, model: 'xlm-roberta-qa@a',
      modelSha256: digest, dataset: 'synthetic_onevoice',
      truncated: false, source: 'model', note: 'AI suggestion; synthetic-trained.',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fake)
    const posted = await request(app).post(endpoint)
    expect(posted.status).toBe(200)
    expect(posted.body.result).toMatchObject({ score: 0.89, modelSha256: digest, source: 'model' })
    expect((await request(app).get(endpoint)).body.outdated).toBe(false)
    expect((db.prepare('SELECT COUNT(*) AS count FROM qa_triage_results').get() as { count: number }).count).toBe(1)
    db.prepare("UPDATE utterances SET text='Tôi đã nhận được tiền.' WHERE call_id=?").run('CALL-000001')
    expect((await request(app).get(endpoint)).body.outdated).toBe(true)
    db.prepare("DELETE FROM calls WHERE id=?").run('CALL-000001')
    expect(db.prepare('SELECT COUNT(*) AS count FROM qa_triage_results').get()).toEqual({ count: 0 })
  })

  it('refuses unavailable model without storing fake QA evidence', async () => {
    const { db, app } = setup()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('model unavailable', { status: 503 })))
    const response = await request(app).post('/api/calls/CALL-000001/qa-triage')
    expect(response.status).toBe(503)
    expect(db.prepare('SELECT COUNT(*) AS count FROM qa_triage_results').get()).toEqual({ count: 0 })
  })

  it('enforces foreign keys, label and score constraints', () => {
    const { db } = setup()
    const good = ['CALL-000001', 'a'.repeat(64), 'b'.repeat(64), 'real-model', 'needs_attention', .8, 'synthetic_onevoice', 0, new Date().toISOString()]
    const query = db.prepare('INSERT INTO qa_triage_results (call_id,input_sha256,model_sha256,model_name,label,score,dataset_source,truncated,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    expect(() => query.run('missing', ...good.slice(1))).toThrow()
    expect(() => query.run(...[...good.slice(0, 5), 2.0, ...good.slice(6)])).toThrow()
    expect(() => query.run(...[...good.slice(0, 4), 'angry', ...good.slice(5)])).toThrow()
    expect(() => query.run(...good)).not.toThrow()
  })
})
