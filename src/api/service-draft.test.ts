import { describe, expect, it } from 'vitest'
import { parseServiceDraft } from '@/lib/serviceDraft'

describe('service form recovery', () => {
  const initial = { title: '', addTask: false }
  it('keeps the saved version so an old draft cannot silently write against a newer case', () => {
    expect(parseServiceDraft(JSON.stringify({ baseVersion: 4, values: { title: 'Hoàn tiền', addTask: true } }), initial)).toEqual({ baseVersion: 4, values: { title: 'Hoàn tiền', addTask: true } })
  })
  it('rejects damaged, mistyped or unbounded stored fields', () => {
    for (const raw of ['{', '{}', JSON.stringify({ baseVersion: -1, values: initial }), JSON.stringify({ baseVersion: 1, values: { title: {}, addTask: false } }), JSON.stringify({ baseVersion: 1, values: { title: 'x'.repeat(6001), addTask: false } })]) expect(parseServiceDraft(raw, initial)).toBeNull()
  })
  it('drops unknown stored keys instead of sending them to the API', () => {
    expect(parseServiceDraft(JSON.stringify({ baseVersion: 0, values: { ...initial, source: 'provider', arbitrary: true } }), initial)?.values).toEqual(initial)
  })
})
