import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAnalytics, getCalls, getCall, getSystemStatus, uploadRecording, importAnalysis, resolveApiUrl } from './isemotalk'

afterEach(() => vi.unstubAllGlobals())

describe('frontend API safety', () => {
  it('rejects Vite HTML instead of silently displaying an empty page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<!DOCTYPE html><html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(getAnalytics()).rejects.toThrow('không phải JSON')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('rejects null/invalid data instead of hanging in loading state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ))
    await expect(getCalls({})).rejects.toThrow('API không trả dữ liệu JSON hợp lệ')
  })

  it('accepts a valid backend call list response', async () => {
    const data = {
      items: [], total: 13, page: 1, pageSize: 10,
      counts: { total: 13, attention: 6, processing: 0, failed: 1 },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }),
    ))
    await expect(getCalls({ page: 1 })).resolves.toEqual(data)
  })

  it('rejects mismatched detail DTOs with a descriptive error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('{"data":"unexpected"}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ))
    await expect(getCall('CALL-0001')).rejects.toThrow('cấu trúc dữ liệu không hợp lệ')
  })

  it('normalizes relative audio links to the API origin', () => {
    const url = resolveApiUrl('/api/calls/CALL-0001/audio')
    expect(url).toContain('/api/calls/CALL-0001/audio')
    expect(resolveApiUrl('https://cdn.example.test/sample.wav')).toBe('https://cdn.example.test/sample.wav')
  })
  it('uploads audio with multipart FormData and does not set a JSON Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'CALL-0014' }), {
      status: 202, headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const form = new FormData()
    form.append('audio', new Blob(['RIFF'], { type: 'audio/wav' }), 'sample.wav')
    await expect(uploadRecording(form)).resolves.toEqual({ id: 'CALL-0014' })
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(opts.method).toBe('POST')
    expect(opts.body).toBe(form)
    expect(opts.headers).not.toHaveProperty('Content-Type')
  })

  it('imports results using the distinct import route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'CALL-0015' }), {
      status: 202, headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const form = new FormData()
    form.append('results', new Blob(['{}'], { type: 'application/json' }), 'res.json')
    await expect(importAnalysis(form)).resolves.toEqual({ id: 'CALL-0015' })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/calls/import')
  })

  it('reads mock/real adapter status rather than assuming the model is real', async () => {
    const system = {
      api: 'ok',
      inference: { reachable: true, status: 'ok', mode: 'mixed', device: 'cpu', ffmpeg: true,
        components: {
          asr: { adapter: 'phowhisper', ready: true, mock: false, detail: 'loaded' },
          diarization: { adapter: 'none', ready: true, mock: false, detail: '' },
          ser: { adapter: 'mock', ready: true, mock: true, detail: 'mock' },
        } },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(system), { headers: { 'Content-Type': 'application/json' } }),
    ))
    await expect(getSystemStatus()).resolves.toEqual(system)
  })

})
