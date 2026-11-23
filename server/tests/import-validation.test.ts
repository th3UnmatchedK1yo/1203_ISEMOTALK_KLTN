import { describe, expect, it } from 'vitest'
import { ImportError, parseTime, parseUtteranceFile } from '../src/importers'

const row = { start: 0, end: 3, text: 'Xin chào', emotion: 'happy', confidence: 0.8 }
describe('import validation', () => {
  it.each(['null', '{"utterances":[null]}', '{"utterances":[[]]}'])('rejects malformed object shape %s as a client error', (raw) => {
    expect(() => parseUtteranceFile(Buffer.from(raw), 'bad.json', true)).toThrow(ImportError)
  })
  it.each([['1%', 0.01], ['0.5%', 0.005], ['80%', 0.8], [0.8, 0.8]])('preserves explicit percentage %s', (confidence, expected) => {
    const parsed = parseUtteranceFile(Buffer.from(JSON.stringify([{ ...row, confidence }])), 'r.json', true)
    expect(parsed.utterances[0].fused?.confidence).toBe(expected)
  })
  it('refuses to invent perfect confidence when no score was supplied', () => {
    expect(() => parseUtteranceFile(Buffer.from(JSON.stringify([{ ...row, confidence: undefined }])), 'r.json', true)).toThrow(ImportError)
  })
  it.each(['%', '  '])('rejects an empty score disguised as %s', (confidence) => {
    expect(() => parseUtteranceFile(Buffer.from(JSON.stringify([{ ...row, confidence }])), 'r.json', true)).toThrow(ImportError)
  })
  it.each(['__proto__', 'constructor'])('does not treat object prototype names as emotion labels: %s', (emotion) => {
    expect(() => parseUtteranceFile(Buffer.from(JSON.stringify([{ ...row, emotion }])), 'r.json', true)).toThrow(ImportError)
  })
  it.each(['00:99', '01:99:00', '1'.repeat(400)])('rejects nonfinite or invalid timestamp %s', (value) => {
    expect(parseTime(value)).toBeNull()
  })
  it('ignores model fields in transcript imports because inference will produce predictions', () => {
    const parsed = parseUtteranceFile(Buffer.from(JSON.stringify([{ ...row, emotion: 'not-an-emotion' }])), 't.json', false)
    expect(parsed.utterances[0].fused).toBeNull()
  })
})
