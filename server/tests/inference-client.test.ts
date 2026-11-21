import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpInferenceClient, InferenceError } from '../src/inference/client'

afterEach(() => vi.unstubAllGlobals())

describe('HTTP inference contract', () => {
  it('sends snake_case agent_channel to FastAPI SER endpoint', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toEqual({
        path: '/tmp/audio.wav',
        agent_channel: 1,
        utterances: [{ id: 'u0001', start: 0, end: 2, text: 'Xin chào', speaker: 'agent' }],
      })
      return {
        ok: true,
        json: async () => ({ provenance: 'mock', predictions: [{ id: 'u0001', acoustic: null, lexical: null, fused: { emotion: 'neutral', confidence: 0.8 } }] }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = new HttpInferenceClient('http://127.0.0.1:8001')
    await client.emotion({
      path: '/tmp/audio.wav',
      agentChannel: 1,
      utterances: [{ id: 'u0001', start: 0, end: 2, text: 'Xin chào', speaker: 'agent' }],
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8001/v1/emotion')
  })

  it.each([
    { duration: -1, channels: 1, sampleRate: 16000, peaks: [0.1] },
    { duration: null, channels: 1, sampleRate: 16000, peaks: [0.1] },
    { duration: 5, channels: 0, sampleRate: 16000, peaks: [0.1] },
  ])('rejects invalid probe responses before they can be persisted', async (response) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(response))))
    await expect(new HttpInferenceClient('http://test').probe({ path: '/tmp/a.wav' })).rejects.toBeInstanceOf(InferenceError)
  })

  it('rejects malformed ASR timestamps', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ provenance: 'real', speakerSource: 'none', segments: [{ start: 3, end: 1, text: 'Xin chào' }] }))))
    await expect(new HttpInferenceClient('http://test').transcribe({ path: '/tmp/a.wav', agentChannel: 0 })).rejects.toBeInstanceOf(InferenceError)
  })

  it.each([
    { predictions: [{ id: 'u1', acoustic: null, lexical: null, fused: { emotion: 'angry', confidence: 4 } }] },
    { predictions: [{ id: 'u1', acoustic: null, lexical: null, fused: { emotion: 'surprise', confidence: 0.8 } }] },
    { predictions: [] },
    { predictions: [{ id: 'u1', acoustic: null, lexical: null, fused: { emotion: 'angry', confidence: 0.8 } }, { id: 'u1', acoustic: null, lexical: null, fused: { emotion: 'angry', confidence: 0.8 } }] },
  ])('rejects invalid emotion predictions or mismatched ID coverage', async ({ predictions }) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ provenance: 'real', predictions }))))
    await expect(new HttpInferenceClient('http://test').emotion({ path: '/tmp/a.wav', agentChannel: 0, utterances: [{ id: 'u1', start: 0, end: 2, text: 'x', speaker: 'unknown' }] })).rejects.toBeInstanceOf(InferenceError)
  })

  it('reports an interrupted response body as an inference error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => { throw new DOMException('Timed out', 'TimeoutError') } })))
    await expect(new HttpInferenceClient('http://test').probe({ path: '/tmp/a.wav' })).rejects.toBeInstanceOf(InferenceError)
  })
})
