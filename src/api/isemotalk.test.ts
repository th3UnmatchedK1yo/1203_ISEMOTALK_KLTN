import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAnalytics, getCalls, getCall, getSystemStatus, uploadRecording, importAnalysis, resolveApiUrl, percent, saveReview } from './isemotalk'

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

  it('passes source and processing filters to the backend instead of mixing demo and inference', async () => {
    const requests: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      requests.push(url)
      return new Response(JSON.stringify({ items: [], total: 0, counts: {} }), { headers: { 'Content-Type': 'application/json' } })
    })
    await getCalls({ provenance: 'real', status: 'ready' })
    const query = new URL(requests[0], 'http://localhost').searchParams
    expect(query.get('provenance')).toBe('real')
    expect(query.get('status')).toBe('ready')
  })

  it('rejects a response that finishes after its route request was cancelled', async () => {
    const controller = new AbortController()
    let finish!: (value: unknown) => void
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => new Promise(resolve => { finish = resolve }),
    }))
    const request = getCall('CALL-0001', controller.signal)
    await Promise.resolve()
    controller.abort()
    finish({ utterances: [], moments: [], version: 1 })
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('preserves the conflict code so the review UI can keep the local draft', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'Saved elsewhere', code: 'version_conflict' }), {
      status: 409, headers: { 'Content-Type': 'application/json' },
    }))
    await expect(saveReview('CALL-0001', { baseVersion: 1, utterances: {}, moments: {} }))
      .rejects.toMatchObject({ status: 409, code: 'version_conflict' })
  })

  it('shows missing or invalid scores as unavailable instead of a misleading percentage', () => {
    expect(percent(0.82)).toBe('82%')
    expect(percent(null)).toBe('—')
    expect(percent(Number.NaN)).toBe('—')
    expect(percent(82)).toBe('—')
  })

  it('surfaces row-level import validation details so the user can fix the file', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      error: 'Tệp chứa dữ liệu không hợp lệ.',
      details: ['Dòng 3: end phải lớn hơn start.', 'Dòng 5: speaker không hợp lệ.'],
    }), { status: 400, headers: { 'Content-Type': 'application/json' } }))
    const failure = await importAnalysis(new FormData()).catch(error => error as Error)
    if (!(failure instanceof Error)) throw new Error('Expected an import validation error')
    expect(failure.message).toContain('Tệp chứa dữ liệu không hợp lệ.')
    expect(failure.message).toContain('Dòng 3: end phải lớn hơn start.')
    expect(failure.message).toContain('Dòng 5: speaker không hợp lệ.')
  })

  it('bounds displayed API details and excludes objects or empty entries', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      error: 'Invalid import',
      details: [{ secret: 'not a user-facing string' }, ' ', 'First useful detail', 'x'.repeat(5000), 'Third detail', 'Fourth detail'],
    }), { status: 400, headers: { 'Content-Type': 'application/json' } }))
    const failure = await importAnalysis(new FormData()).catch(error => error as Error)
    if (!(failure instanceof Error)) throw new Error('Expected an import validation error')
    expect(failure.message).toContain('First useful detail')
    expect(failure.message).toContain('Third detail')
    expect(failure.message).not.toContain('Fourth detail')
    expect(failure.message).not.toContain('secret')
    expect(failure.message.length).toBeLessThan(850)
  })

})
