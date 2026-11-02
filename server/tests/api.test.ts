import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeApp, RESULTS_JSON } from './helpers'

let t: ReturnType<typeof makeApp>
beforeEach(() => {
  t = makeApp()
})
afterEach(() => t.cleanup())

const importResults = async () => {
  const res = await t.api
    .post('/api/calls/import')
    .attach('results', Buffer.from(JSON.stringify(RESULTS_JSON)), 'results.json')
  expect(res.status).toBe(202)
  await t.pipeline.onIdle()
  return res.body.id as string
}

const wav = Buffer.from('RIFF....WAVEfmt ')

describe('results import', () => {
  it('creates a ready, imported call with derived moments', async () => {
    const id = await importResults()
    const { body } = await t.api.get(`/api/calls/${id}`)
    expect(body.status).toBe('ready')
    expect(body.provenance).toBe('imported')
    expect(body.title).toBe('Cuộc gọi nhập')
    expect(body.utterances).toHaveLength(4)
    expect(body.utterances[1].agreement).toBe('conflict')
    expect(body.moments.map((m: { type: string }) => m.type)).toEqual(expect.arrayContaining(['sustained_negative', 'modality_disagreement']))
    expect(body.priority).toBe('high')
    expect(body.hasAudio).toBe(false)
  })

  it('reports row-level errors for bad CSV and stores nothing', async () => {
    const csv = 'start,end,speaker,text,fused_emotion,fused_confidence\n0,5,agent,Xin chào,neutral,80\n5,3,customer,Sai thời gian,angry,90\n6,9,customer,Cảm xúc lạ,furious,90\n'
    const res = await t.api.post('/api/calls/import').attach('results', Buffer.from(csv), 'bad.csv')
    expect(res.status).toBe(400)
    expect(res.body.details.join(' ')).toContain('Dòng 2')
    expect(res.body.details.join(' ')).toContain('Dòng 3')
    expect((await t.api.get('/api/calls')).body.total).toBe(0)
  })

  it('accepts CSV with mm:ss timestamps, percent confidences and Vietnamese labels', async () => {
    const csv = '\uFEFFstart,end,speaker,text,emotion,confidence\n00:00,00:05,Nhân viên,Chào bạn,Bình thường,80%\n00:05,00:09,Khách hàng,Tôi rất bực,Tức giận,0.9\n'
    const res = await t.api.post('/api/calls/import').attach('results', Buffer.from(csv), 'ok.csv')
    expect(res.status).toBe(202)
    await t.pipeline.onIdle()
    const { body } = await t.api.get(`/api/calls/${res.body.id}`)
    expect(body.utterances[0]).toMatchObject({ speaker: 'agent', start: 0, end: 5 })
    expect(body.utterances[1].fused).toEqual({ emotion: 'angry', confidence: 0.9 })
  })
})

describe('audio upload pipeline', () => {
  it('runs every stage and marks the result as mock when the service says so', async () => {
    const res = await t.api.post('/api/calls/upload').field('title', 'Bản ghi 1').attach('audio', wav, 'call.wav')
    expect(res.status).toBe(202)
    await t.pipeline.onIdle()
    const { body } = await t.api.get(`/api/calls/${res.body.id}`)
    expect(body.status).toBe('ready')
    expect(body.provenance).toBe('mock')
    expect(body.speakerSource).toBe('channel')
    expect(body.duration).toBe(20)
    expect(body.peaks).toHaveLength(50)
    expect(body.stageLog.map((s: { state: string }) => s.state)).toEqual(['done', 'done', 'skipped', 'done', 'done'])
    expect(body.utterances[1].fused.emotion).toBe('angry')
  })

  it('rejects unsupported audio types', async () => {
    const res = await t.api.post('/api/calls/upload').attach('audio', Buffer.from('x'), 'notes.txt')
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('WAV')
  })

  it('requires an audio file', async () => {
    const res = await t.api.post('/api/calls/upload').field('title', 'x')
    expect(res.status).toBe(400)
  })

  it('fails visibly and resumes from the failed stage on retry', async () => {
    t.client.failTranscribe = 1
    const { body: created } = await t.api.post('/api/calls/upload').attach('audio', wav, 'call.wav')
    await t.pipeline.onIdle()
    let { body } = await t.api.get(`/api/calls/${created.id}`)
    expect(body.status).toBe('failed')
    expect(body.error).toContain('không khả dụng')
    expect(body.stageLog[0].state).toBe('done')
    expect(body.stageLog[1].state).toBe('failed')

    const probesBefore = t.client.calls.filter((c) => c === 'probe').length
    expect((await t.api.post(`/api/calls/${created.id}/retry`)).status).toBe(202)
    await t.pipeline.onIdle()
    ;({ body } = await t.api.get(`/api/calls/${created.id}`))
    expect(body.status).toBe('ready')
    expect(body.attempts).toBe(1)
    expect(t.client.calls.filter((c) => c === 'probe').length).toBe(probesBefore) // validate was not repeated
  })

  it('refuses to retry a call that did not fail', async () => {
    const id = await (async () => {
      const r = await t.api.post('/api/calls/import').attach('results', Buffer.from(JSON.stringify(RESULTS_JSON)), 'r.json')
      await t.pipeline.onIdle()
      return r.body.id
    })()
    expect((await t.api.post(`/api/calls/${id}/retry`)).status).toBe(409)
  })

  it('transcript import skips ASR and drops any predictions in the file', async () => {
    const res = await t.api
      .post('/api/calls/upload')
      .attach('audio', wav, 'call.wav')
      .attach('transcript', Buffer.from(JSON.stringify(RESULTS_JSON.utterances.slice(0, 2))), 'transcript.json')
    expect(res.status).toBe(202)
    await t.pipeline.onIdle()
    const { body } = await t.api.get(`/api/calls/${res.body.id}`)
    expect(body.source).toBe('transcript_import')
    expect(body.speakerSource).toBe('provided')
    expect(t.client.calls).not.toContain('transcribe')
    expect(body.provenance).toBe('mock') // came from the (fake) model, not from the file
  })

  it('rejects a transcript that is longer than the audio', async () => {
    t.client.duration = 8
    const res = await t.api
      .post('/api/calls/upload')
      .attach('audio', wav, 'call.wav')
      .attach('transcript', Buffer.from(JSON.stringify(RESULTS_JSON.utterances)), 'transcript.json')
    await t.pipeline.onIdle()
    const { body } = await t.api.get(`/api/calls/${res.body.id}`)
    expect(body.status).toBe('failed')
    expect(body.error).toContain('Transcript dài hơn âm thanh')
  })

  it('serves audio with range support', async () => {
    const { body: created } = await t.api.post('/api/calls/upload').attach('audio', wav, 'call.wav')
    await t.pipeline.onIdle()
    const res = await t.api.get(`/api/calls/${created.id}/audio`).set('Range', 'bytes=0-3')
    expect(res.status).toBe(206)
    expect(res.headers['content-type']).toContain('audio/wav')
  })
})

describe('review workflow', () => {
  it('persists decisions, bumps the version and finishes the review', async () => {
    const id = await importResults()
    let { body: call } = await t.api.get(`/api/calls/${id}`)
    expect(call.reviewStatus).toBe('unreviewed')

    const u0 = call.utterances[0].id
    const u1 = call.utterances[1].id
    const momentId = call.moments[0].id
    const saved = await t.api.put(`/api/calls/${id}/review`).send({
      baseVersion: call.version,
      utterances: {
        [u0]: { decision: 'confirmed' },
        [u1]: { decision: 'corrected', emotion: 'sad', note: 'Giọng run, không gắt', flagged: true, speaker: 'customer', text: 'Tôi rất tức giận!' },
      },
      moments: { [momentId]: { relevance: true, note: 'Đúng' } },
    })
    expect(saved.status).toBe(200)
    expect(saved.body.version).toBe(call.version + 1)
    expect(saved.body.reviewStatus).toBe('in_progress')
    expect(saved.body.utterances[1]).toMatchObject({ review: { decision: 'corrected', emotion: 'sad', note: 'Giọng run, không gắt' }, flagged: true, textEdited: true })
    expect(saved.body.utterances[1].fused.emotion).toBe('angry') // model output is never overwritten
    expect(saved.body.moments.find((m: { id: string }) => m.id === momentId)).toMatchObject({ relevance: true, note: 'Đúng' })
    expect(saved.body.reviewedCount).toBe(2)

    const done = await t.api.put(`/api/calls/${id}/review`).send({ baseVersion: saved.body.version, complete: true, overallNote: 'Xong' })
    expect(done.body.reviewStatus).toBe('reviewed')
    expect(done.body.overallNote).toBe('Xong')
    ;({ body: call } = await t.api.get(`/api/calls/${id}`))
    expect(call.reviewStatus).toBe('reviewed')
    expect(call.reviewedAt).toBeTruthy()
  })

  it('rejects stale saves with 409 instead of overwriting', async () => {
    const id = await importResults()
    const { body: call } = await t.api.get(`/api/calls/${id}`)
    await t.api.put(`/api/calls/${id}/review`).send({ baseVersion: call.version, overallNote: 'A' }).expect(200)
    const stale = await t.api.put(`/api/calls/${id}/review`).send({ baseVersion: call.version, overallNote: 'B' })
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('version_conflict')
    expect((await t.api.get(`/api/calls/${id}`)).body.overallNote).toBe('A')
  })

  it('validates corrections and is all-or-nothing', async () => {
    const id = await importResults()
    const { body: call } = await t.api.get(`/api/calls/${id}`)
    const [a, b] = call.utterances
    const bad = await t.api.put(`/api/calls/${id}/review`).send({
      baseVersion: call.version,
      utterances: { [a.id]: { decision: 'confirmed' }, [b.id]: { decision: 'corrected', emotion: 'angry' } }, // same as model
    })
    expect(bad.status).toBe(400)
    const after = (await t.api.get(`/api/calls/${id}`)).body
    expect(after.version).toBe(call.version)
    expect(after.utterances[0].review.decision).toBeNull() // first edit rolled back
    expect((await t.api.put(`/api/calls/${id}/review`).send({ baseVersion: call.version, utterances: { nope: { note: 'x' } } })).status).toBe(400)
  })

  it('refuses to review a call that is not processed yet', async () => {
    t.client.failTranscribe = 1
    const { body } = await t.api.post('/api/calls/upload').attach('audio', Buffer.from('RIFF'), 'x.wav')
    await t.pipeline.onIdle()
    const res = await t.api.put(`/api/calls/${body.id}/review`).send({ baseVersion: 1 })
    expect(res.status).toBe(409)
  })
})

describe('calls list, analytics and export', () => {
  it('filters, sorts and paginates on the server', async () => {
    await importResults()
    await t.api.post('/api/calls/import').field('title', 'Cuộc gọi bình thường').attach(
      'results',
      Buffer.from(JSON.stringify({ utterances: [{ speaker: 'customer', start: 0, end: 4, text: 'Cảm ơn', fused: { emotion: 'happy', confidence: 0.9 } }] })),
      'ok.json',
    )
    await t.pipeline.onIdle()
    const all = (await t.api.get('/api/calls?sort=priority&dir=desc')).body
    expect(all.total).toBe(2)
    expect(all.items[0].priority).toBe('high')
    expect(all.counts.attention).toBe(1)
    expect((await t.api.get('/api/calls?priority=low')).body.total).toBe(1)
    expect((await t.api.get('/api/calls?search=bình')).body.items[0].title).toBe('Cuộc gọi bình thường')
    expect((await t.api.get('/api/calls?search=%25')).body.total).toBe(0) // % is literal, not a wildcard
    expect((await t.api.get('/api/calls?pageSize=1&page=2')).body.items).toHaveLength(1)
  })

  it('computes analytics from stored review data and filters by provenance', async () => {
    const id = await importResults()
    const { body: call } = await t.api.get(`/api/calls/${id}`)
    await t.api.put(`/api/calls/${id}/review`).send({
      baseVersion: call.version,
      utterances: {
        [call.utterances[1].id]: { decision: 'confirmed' },
        [call.utterances[3].id]: { decision: 'corrected', emotion: 'angry' },
      },
    })
    const a = (await t.api.get('/api/analytics')).body
    expect(a.totals.calls).toBe(1)
    expect(a.modelQuality).toMatchObject({ reviewed: 2, confirmed: 1, corrected: 1, agreementRate: 0.5 })
    expect(a.modelQuality.topCorrections[0]).toEqual({ from: 'sad', to: 'angry', count: 1 })
    expect(a.customerEmotion.angry).toBe(3) // 2 model angry + 1 corrected sad->angry
    expect(a.modality).toMatchObject({ utterancesWithBoth: 2, conflicts: 1 })
    expect(a.attention).toHaveLength(1)
    expect((await t.api.get('/api/analytics?provenance=mock')).body.totals.calls).toBe(0)
  })

  it('exports review CSV with BOM, decisions and formula-injection protection', async () => {
    const id = await importResults()
    const { body: call } = await t.api.get(`/api/calls/${id}`)
    await t.api.put(`/api/calls/${id}/review`).send({
      baseVersion: call.version,
      utterances: { [call.utterances[0].id]: { decision: 'corrected', emotion: 'happy', note: '=HYPERLINK("http://evil")' } },
    })
    const res = await t.api.get('/api/export/reviews.csv')
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.text.charCodeAt(0)).toBe(0xfeff)
    expect(res.text).toContain('reviewer_decision')
    expect(res.text).toContain('corrected,happy')
    expect(res.text).toContain(`"'=HYPERLINK`)
    expect(res.text).not.toMatch(/,=HYPERLINK/)
    const analyticsCsv = await t.api.get('/api/export/analytics.csv')
    expect(analyticsCsv.text).toContain('chat_luong_mo_hinh')
  })

  it('round-trips a call through JSON export and re-import', async () => {
    const id = await importResults()
    const exported = (await t.api.get(`/api/calls/${id}/export.json`)).body
    const res = await t.api.post('/api/calls/import').attach('results', Buffer.from(JSON.stringify(exported)), 'again.json')
    expect(res.status).toBe(202)
    await t.pipeline.onIdle()
    const copy = (await t.api.get(`/api/calls/${res.body.id}`)).body
    expect(copy.utterances).toHaveLength(4)
    expect(copy.utterances[1].fused).toEqual({ emotion: 'angry', confidence: 0.88 })
  })

  it('deletes a call and its audio', async () => {
    const { body } = await t.api.post('/api/calls/upload').attach('audio', wav, 'call.wav')
    await t.pipeline.onIdle()
    expect((await t.api.delete(`/api/calls/${body.id}`)).status).toBe(204)
    expect((await t.api.get(`/api/calls/${body.id}`)).status).toBe(404)
    expect((await t.api.get(`/api/calls/${body.id}/audio`)).status).toBe(404)
  })

  it('reports inference availability', async () => {
    const { body } = await t.api.get('/api/system/status')
    expect(body.inference.reachable).toBe(true)
    expect(body.inference.mode).toBe('mock')
  })
})
