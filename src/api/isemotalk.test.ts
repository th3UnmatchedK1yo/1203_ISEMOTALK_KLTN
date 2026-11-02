import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAnalytics, getCalls, getCall, resolveApiUrl } from './isemotalk'

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
})
