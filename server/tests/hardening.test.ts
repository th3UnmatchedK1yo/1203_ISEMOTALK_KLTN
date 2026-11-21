import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeApp, RESULTS_JSON } from './helpers'
import { Pipeline } from '../src/pipeline'

let t: ReturnType<typeof makeApp> | undefined
beforeEach(() => { t = makeApp() })
afterEach(async () => {
  if (!t) return
  await t.pipeline.onIdle()
  t.cleanup()
  t = undefined
})

const wav = Buffer.from('RIFF....WAVEfmt ')
async function imported() {
  const r = await t!.api.post('/api/calls/import').attach('results', Buffer.from(JSON.stringify(RESULTS_JSON)), 'r.json')
  expect(r.status).toBe(202)
  await t!.pipeline.onIdle()
  return (await t!.api.get(`/api/calls/${r.body.id}`)).body
}

describe('job and upload integrity', () => {
  it('rejects an untrusted web origin before creating or deleting local calls', async () => {
    await t!.api.post('/api/calls/import').set('Origin', 'https://untrusted.example').attach('results', Buffer.from(JSON.stringify(RESULTS_JSON)), 'r.json').expect(403)
    expect((await t!.api.get('/api/calls')).body.total).toBe(0)
    const created = await t!.api.post('/api/calls/import').set('Origin', 'http://localhost:5173').attach('results', Buffer.from(JSON.stringify(RESULTS_JSON)), 'r.json').expect(202)
    await t!.pipeline.onIdle()
    await t!.api.delete(`/api/calls/${created.body.id}`).set('Origin', 'https://untrusted.example').expect(403)
    expect((await t!.api.get(`/api/calls/${created.body.id}`)).status).toBe(200)
  })
  it('uses a safe default for an unknown sort key', async () => {
    await imported()
    const { body } = await t!.api.get('/api/calls?sort=constructor').expect(200)
    expect(body.total).toBe(1)
  })
  it('never reuses a deleted ID or applies late ASR to a replacement call', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const original = t!.client.transcribe.bind(t!.client)
    vi.spyOn(t!.client, 'transcribe').mockImplementation(async () => { await gate; return original() })
    const old = await t!.api.post('/api/calls/upload').attach('audio', wav, 'old.wav')
    try {
      expect((await t!.api.get(`/api/calls/${old.body.id}`)).body.stage).toBe('transcribe')
      await t!.api.delete(`/api/calls/${old.body.id}`).expect(204)
      const replacement = await t!.api.post('/api/calls/import').field('title', 'Replacement').attach('results', Buffer.from(JSON.stringify(RESULTS_JSON)), 'new.json')
      expect(replacement.status).toBe(202)
      expect(replacement.body.id).not.toBe(old.body.id)
      release()
      await t!.pipeline.onIdle()
      const { body } = await t!.api.get(`/api/calls/${replacement.body.id}`)
      expect(body.status).toBe('ready')
      expect(body.utterances.map((u: { text: string }) => u.text)).toEqual(RESULTS_JSON.utterances.map((u) => u.text))
      expect((await t!.api.get(`/api/calls/${old.body.id}`)).status).toBe(404)
    } finally { release() }
  })

  it('aborts the outstanding inference wait when a processing call is deleted', async () => {
    let release!: () => void
    let signal: AbortSignal | undefined
    const original = t!.client.transcribe.bind(t!.client)
    vi.spyOn(t!.client, 'transcribe').mockImplementation(async (_req, options) => {
      signal = options?.signal
      await new Promise<void>((resolve, reject) => {
        release = resolve
        signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true })
      })
      return original()
    })
    const created = await t!.api.post('/api/calls/upload').attach('audio', wav, 'pending.wav')
    try {
      await t!.api.delete(`/api/calls/${created.body.id}`).expect(204)
      expect(signal?.aborted).toBe(true)
      await t!.pipeline.onIdle()
      const next = await imported()
      expect(next.status).toBe('ready')
    } finally { release?.() }
  })

  it('validates metadata before moving audio and leaves no orphan directory', async () => {
    await t!.api.post('/api/calls/upload').field('callDate', 'invalid').attach('audio', wav, 'bad.wav').expect(400)
    expect(fs.readdirSync(t!.config.uploadsDir).filter((name) => name !== '.tmp')).toEqual([])
    expect((await t!.api.get('/api/calls')).body.total).toBe(0)
  })

  it('rolls back a failed import and removes the moved audio', async () => {
    t!.db.exec("CREATE TRIGGER reject_test_utterance BEFORE INSERT ON utterances BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END")
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await t!.api.post('/api/calls/import').attach('audio', wav, 'call.wav').attach('results', Buffer.from(JSON.stringify(RESULTS_JSON)), 'r.json').expect(500)
      expect((await t!.api.get('/api/calls')).body.total).toBe(0)
      expect(fs.readdirSync(t!.config.uploadsDir).filter((name) => name !== '.tmp')).toEqual([])
    } finally { logged.mockRestore() }
  })

  it('rejects a hidden attachment from another import mode instead of leaking its temp file', async () => {
    await t!.api.post('/api/calls/upload').attach('audio', wav, 'call.wav').attach('results', Buffer.from('{}'), 'hidden.json').expect(400)
    expect(fs.readdirSync(`${t!.config.uploadsDir}/.tmp`)).toEqual([])
  })

  it.each(['page=1.5', 'page=Infinity', 'pageSize=1.5', 'pageSize=-1'])('rejects invalid pagination %s', async (query) => {
    await t!.api.get(`/api/calls?${query}`).expect(400)
  })

  it('preserves provided speakers and mock provenance when diarization fills unknown roles', async () => {
    vi.spyOn(t!.client, 'diarize').mockResolvedValue({ method: 'mock', speakers: ['customer', 'agent'] })
    const original = t!.client.emotion.bind(t!.client)
    vi.spyOn(t!.client, 'emotion').mockImplementation(async (req) => ({ ...await original(req), provenance: 'real' }))
    const rows = [{ speaker: 'agent', start: 0, end: 4, text: 'Provided agent' }, { speaker: 'unknown', start: 4, end: 8, text: 'Unassigned' }]
    const r = await t!.api.post('/api/calls/upload').attach('audio', wav, 'call.wav').attach('transcript', Buffer.from(JSON.stringify(rows)), 't.json')
    await t!.pipeline.onIdle()
    const { body } = await t!.api.get(`/api/calls/${r.body.id}`)
    expect(body.status).toBe('ready')
    expect(body.utterances.map((u: { speaker: string }) => u.speaker)).toEqual(['agent', 'agent'])
    expect(body.provenance).toBe('mock')
  })
  it('keeps roles unassigned when a real diarizer only finds anonymous speakers', async () => {
    vi.spyOn(t!.client, 'diarize').mockResolvedValue({ method: 'model', speakers: ['unknown'], evidence: { adapter: 'pyannote', mock: false } })
    const rows = [{ speaker: 'unknown', start: 0, end: 4, text: 'Anonymous speaker' }]
    const r = await t!.api.post('/api/calls/upload').attach('audio', wav, 'call.wav').attach('transcript', Buffer.from(JSON.stringify(rows)), 't.json')
    await t!.pipeline.onIdle()
    const { body } = await t!.api.get(`/api/calls/${r.body.id}`)
    expect(body.speakerSource).toBe('unassigned')
    expect(body.utterances[0].speaker).toBe('unknown')
    const stage = body.stageLog.find((s: { stage: string }) => s.stage === 'diarize')
    expect(stage.evidence).toMatchObject({ adapter: 'pyannote', mock: false })
    expect(stage.detail).toContain('vai trò')
  })

  it('persists the evidence returned by the completed stage and its elapsed time', async () => {
    const original = t!.client.transcribe.bind(t!.client)
    vi.spyOn(t!.client, 'transcribe').mockImplementation(async () => ({ ...await original(), evidence: { adapter: 'test-asr', model: 'fixture-v1', device: 'cpu', mock: true, verified: false } }))
    const r = await t!.api.post('/api/calls/upload').attach('audio', wav, 'call.wav')
    await t!.pipeline.onIdle()
    const { body } = await t!.api.get(`/api/calls/${r.body.id}`)
    const stage = body.stageLog.find((s: { stage: string }) => s.stage === 'transcribe')
    expect(stage.evidence).toEqual({ adapter: 'test-asr', model: 'fixture-v1', device: 'cpu', mock: true, verified: false })
    expect(stage.provenance).toBe('mock')
    expect(stage.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('commits stage outputs and their completion checkpoint together', async () => {
    t!.db.exec(`CREATE TRIGGER reject_test_checkpoint BEFORE UPDATE OF stage_log ON calls
      WHEN json_extract(NEW.stage_log, '$[1].state') = 'done' AND json_extract(OLD.stage_log, '$[1].state') = 'running'
      BEGIN SELECT RAISE(ABORT, 'simulated checkpoint failure'); END`)
    const r = await t!.api.post('/api/calls/upload').attach('audio', wav, 'call.wav')
    await t!.pipeline.onIdle()
    const { body } = await t!.api.get(`/api/calls/${r.body.id}`)
    expect(body.status).toBe('failed')
    expect(body.utterances).toHaveLength(0)
    expect(body.stageLog[1].state).toBe('failed')
  })

  it('leaves interrupted work resumable before closing the database', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const original = t!.client.transcribe.bind(t!.client)
    vi.spyOn(t!.client, 'transcribe').mockImplementation(async () => { await gate; return original() })
    const r = await t!.api.post('/api/calls/upload').attach('audio', wav, 'call.wav')
    try {
      const stopping = t!.pipeline.stop()
      release()
      await stopping
      const { body } = await t!.api.get(`/api/calls/${r.body.id}`)
      expect(body.status).toBe('queued')
      expect(body.stageLog.find((s: { stage: string }) => s.stage === 'transcribe').state).toBe('pending')
      expect(body.utterances).toHaveLength(0)
      const resumed = new Pipeline(t!.db, t!.config, t!.client)
      resumed.resume()
      await resumed.onIdle()
      expect((await t!.api.get(`/api/calls/${r.body.id}`)).body.status).toBe('ready')
      expect(t!.client.calls.filter((stage) => stage === 'probe')).toHaveLength(1)
    } finally { release() }
  })
})

describe('durable review evidence', () => {
  it('does not reuse a moment verdict when the supporting customer turns change', async () => {
    const rows = [
      { speaker: 'customer', start: 0, end: 4, text: 'Sad', fused: { emotion: 'sad', confidence: 0.8 } },
      { speaker: 'customer', start: 4, end: 8, text: 'Calm', fused: { emotion: 'neutral', confidence: 0.8 } },
      { speaker: 'customer', start: 8, end: 12, text: 'Angry', fused: { emotion: 'angry', confidence: 0.9 } },
    ]
    const created = await t!.api.post('/api/calls/import').attach('results', Buffer.from(JSON.stringify(rows)), 'r.json')
    await t!.pipeline.onIdle()
    const call = (await t!.api.get(`/api/calls/${created.body.id}`)).body
    const saved = await t!.api.put(`/api/calls/${call.id}/review`).send({ baseVersion: call.version, moments: { 'escalation:u0003': { relevance: true, note: 'Calm to angry' } } }).expect(200)
    const edited = await t!.api.put(`/api/calls/${call.id}/review`).send({ baseVersion: saved.body.version, utterances: { u0002: { speaker: 'agent' } } }).expect(200)
    const moment = edited.body.moments.find((m: { id: string }) => m.id === 'escalation:u0003')
    expect(moment.fromEmotion).toBe('sad')
    expect(moment.relevance).toBeNull()
    expect(moment.note).toBe('')
    const exported = (await t!.api.get(`/api/calls/${call.id}/export.json`)).body
    expect(exported.momentReviews).toEqual(expect.arrayContaining([expect.objectContaining({ momentId: 'escalation:u0003', note: 'Calm to angry' })]))
  })
  it('treats the overall note as review activity and exposes original prediction inputs', async () => {
    const call = await imported()
    const saved = await t!.api.put(`/api/calls/${call.id}/review`).send({ baseVersion: call.version, overallNote: 'Needs callback' }).expect(200)
    expect(saved.body.reviewStatus).toBe('in_progress')
    const edited = await t!.api.put(`/api/calls/${call.id}/review`).send({ baseVersion: saved.body.version, utterances: { u0001: { text: 'Corrected transcript', speaker: 'customer' } } }).expect(200)
    expect(edited.body.utterances[0]).toMatchObject({ originalText: 'Chào bạn', originalSpeaker: 'agent', predictionInputChanged: true, fused: { emotion: 'neutral', confidence: 0.85 } })
  })

  it('exports the full review and stage evidence without dropping overall or moment notes', async () => {
    const call = await imported()
    const momentId = call.moments[0].id
    const saved = await t!.api.put(`/api/calls/${call.id}/review`).send({ baseVersion: call.version, overallNote: 'Follow up tomorrow', complete: true, utterances: { u0001: { text: 'Edited', flagged: true, decision: 'confirmed' } }, moments: { [momentId]: { relevance: false, note: 'Not useful' } } }).expect(200)
    const { body } = await t!.api.get(`/api/calls/${call.id}/export.json`)
    expect(body.call).toMatchObject({ id: call.id, overallNote: 'Follow up tomorrow', reviewStatus: 'reviewed', reviewedAt: saved.body.reviewedAt, version: saved.body.version, provenance: 'imported' })
    expect(body.utterances[0]).toMatchObject({ id: 'u0001', originalText: 'Chào bạn', originalSpeaker: 'agent', predictionInputChanged: true, flagged: true, review: { decision: 'confirmed' } })
    expect(body.moments).toEqual(expect.arrayContaining([expect.objectContaining({ id: momentId, relevance: false, note: 'Not useful' })]))
    expect(body.stageLog).toEqual(saved.body.stageLog)
  })

  it('reports explicit customer coverage instead of silently merging unknown speakers', async () => {
    await imported()
    const unknown = [{ speaker: 'unknown', start: 0, end: 3, text: 'Unassigned', fused: { emotion: 'angry', confidence: 0.8 } }]
    await t!.api.post('/api/calls/import').attach('results', Buffer.from(JSON.stringify(unknown)), 'u.json')
    await t!.pipeline.onIdle()
    const { body } = await t!.api.get('/api/analytics')
    expect(body.coverage).toEqual({ customerUtterances: 3, customerWithEmotion: 3, unknownSpeakerUtterances: 1, unpredictedUtterances: 0, callsWithCustomerEmotion: 1 })
  })
  it('does not include unassigned customer risk in the low-priority filter or count', async () => {
    const unknown = [{ speaker: 'unknown', start: 0, end: 3, text: 'Unassigned', fused: { emotion: 'angry', confidence: 0.8 } }]
    await t!.api.post('/api/calls/import').attach('results', Buffer.from(JSON.stringify(unknown)), 'u.json')
    await t!.pipeline.onIdle()
    expect((await t!.api.get('/api/calls?priority=low')).body.total).toBe(0)
    expect((await t!.api.get('/api/analytics')).body.priority).toEqual({ high: 0, medium: 0, low: 0, unknown: 1 })
  })
})
