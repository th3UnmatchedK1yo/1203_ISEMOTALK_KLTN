import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeApp, RESULTS_JSON } from './helpers'
import type { HealthInfo } from '../src/inference/client'

let t: ReturnType<typeof makeApp>
const originalSerEnv = process.env.ISEMO_SER
beforeEach(() => { t = makeApp() })
afterEach(() => {
  if (originalSerEnv === undefined) delete process.env.ISEMO_SER
  else process.env.ISEMO_SER = originalSerEnv
  t.cleanup()
})

const wav = Buffer.from('RIFF....WAVEfmt ')
async function importedAudio() {
  t.client.duration = 40
  const response = await t.api.post('/api/calls/import')
    .attach('results', Buffer.from(JSON.stringify(RESULTS_JSON)), 'dataset-source.json')
    .attach('audio', wav, 'source.wav')
  expect(response.status).toBe(202)
  await t.pipeline.onIdle()
  return response.body.id as string
}
function genuinePartialHealth(asrAvailable = true): HealthInfo {
  return {
    status: 'degraded', mode: 'real', device: 'cuda:0', ffmpeg: true,
    components: {
      asr: { adapter: asrAvailable ? 'phowhisper' : 'not_configured', ready: asrAvailable, mock: false, detail: 'genuine-or-unavailable' },
      diarization: { adapter: 'none', ready: true, mock: false, detail: 'no automatic roles' },
      ser: { adapter: 'not_configured', ready: false, mock: false, detail: 'no verified F4' },
    },
  }
}

describe('new ASR analysis without destroying original dataset evidence', () => {
  it('can rerun a genuine uploaded WAV after an ASR update without replacing the first result', async () => {
    process.env.ISEMO_SER = 'none'
    t.client.duration = 20
    t.client.health = async () => genuinePartialHealth()
    let run = 0
    t.client.transcribe = vi.fn(async () => ({
      segments: [{ start: 0, end: 5, text: 'Bản ASR lần ' + (++run), speaker: 'unknown' as const }],
      speakerSource: 'none' as const, provenance: 'real' as const,
      evidence: {adapter:'phowhisper',mock:false,model:'pinned-test-model'},
    }))
    const first = await t.api.post('/api/calls/upload').attach('audio', wav, 'direct.wav')
    expect(first.status).toBe(202)
    await t.pipeline.onIdle()
    const before = (await t.api.get('/api/calls/' + first.body.id)).body
    expect(before.provenance).toBe('real')
    expect(before.utterances[0].text).toBe('Bản ASR lần 1')

    const rerun = await t.api.post('/api/calls/' + first.body.id + '/reprocess')
    expect(rerun.status).toBe(202)
    expect(rerun.body.id).not.toBe(first.body.id)
    await t.pipeline.onIdle()
    const latest = (await t.api.get('/api/calls/' + rerun.body.id)).body
    const original = (await t.api.get('/api/calls/' + first.body.id)).body
    expect(latest.status).toBe('ready')
    expect(latest.utterances[0].text).toBe('Bản ASR lần 2')
    expect(original.utterances).toEqual(before.utterances)
    expect(Buffer.from((await t.api.get('/api/calls/' + rerun.body.id + '/audio')).body)).toEqual(wav)
  })

  it('creates a separate job and preserves original imported transcript/predictions', async () => {
    const sourceId = await importedAudio()
    const source = (await t.api.get('/api/calls/' + sourceId)).body
    process.env.ISEMO_SER = 'none'
    t.client.health = async () => genuinePartialHealth()
    t.client.transcribe = vi.fn(async () => ({
      segments: [{ start: 0, end: 5, text: 'Đây là transcript từ ASR mới, không phải transcript nguồn.', speaker: 'unknown' as const }],
      speakerSource: 'none' as const, provenance: 'real' as const,
      evidence: { adapter: 'phowhisper', mock: false, model: 'pinned-test-model' },
    }))
    const emotion = vi.spyOn(t.client, 'emotion')
    const reprocess = await t.api.post('/api/calls/' + sourceId + '/reprocess')
    expect(reprocess.status).toBe(202)
    expect(reprocess.body.sourceCallId).toBe(sourceId)
    expect(reprocess.body.id).not.toBe(sourceId)
    await t.pipeline.onIdle()
    const child = (await t.api.get('/api/calls/' + reprocess.body.id)).body
    const unchanged = (await t.api.get('/api/calls/' + sourceId)).body
    expect(child.status).toBe('ready')
    expect(child.source).toBe('upload')
    expect(child.provenance).toBe('real')
    expect(child.utterances).toHaveLength(1)
    expect(child.utterances[0].text).toContain('ASR mới')
    expect(child.utterances[0].fused).toBeNull()
    expect(child.stageLog.find((step: {stage: string}) => step.stage === 'transcribe')).toMatchObject({
      state: 'done', provenance: 'real', evidence: {adapter: 'phowhisper', mock: false},
    })
    expect(child.stageLog.find((step: {stage: string}) => step.stage === 'emotion')).toMatchObject({
      state: 'skipped', evidence: {adapter: 'not_configured', mock: false},
    })
    expect(emotion).not.toHaveBeenCalled()
    expect(unchanged.utterances).toEqual(source.utterances)
    expect(unchanged.provenance).toBe('imported')
    const bytes = await t.api.get('/api/calls/' + reprocess.body.id + '/audio')
    expect(bytes.status).toBe(200)
    expect(Buffer.from(bytes.body)).toEqual(wav)
  })

  it('refuses to queue a job when genuine ASR is not available', async () => {
    const sourceId = await importedAudio()
    process.env.ISEMO_SER = 'none'
    t.client.health = async () => genuinePartialHealth(false)
    const blocked = await t.api.post('/api/calls/' + sourceId + '/reprocess')
    expect(blocked.status).toBe(503)
    expect((await t.api.get('/api/calls')).body.total).toBe(1)
  })

  it('refuses a Node/Python SER configuration mismatch rather than skipping a real model', async () => {
    const sourceId = await importedAudio()
    process.env.ISEMO_SER = 'none'
    t.client.health = async () => ({
      ...genuinePartialHealth(),
      components: { ...genuinePartialHealth().components,
        ser: {adapter: 'checkpoint', ready: true, mock: false, detail: 'conflict'} },
    })
    const blocked = await t.api.post('/api/calls/' + sourceId + '/reprocess')
    expect(blocked.status).toBe(503)
    expect((await t.api.get('/api/calls')).body.total).toBe(1)
  })
})
