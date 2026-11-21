import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpInferenceClient } from '../src/inference/client'

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
        json: async () => ({ provenance: 'mock', predictions: [] }),
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
})
