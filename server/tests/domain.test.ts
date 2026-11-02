import { describe, expect, it } from 'vitest'
import { derive, detectMoments, type Emotion, type Speaker, type Utterance } from '../src/domain'
import { parseTime, parseUtteranceFile, ImportError } from '../src/importers'

let n = 0
const u = (speaker: Speaker, start: number, end: number, emotion: Emotion, conf = 0.8, ac?: Emotion, lx?: Emotion): Utterance => ({
  id: `u${++n}`,
  idx: n,
  speaker,
  text: 't',
  start,
  end,
  fused: { emotion, confidence: conf },
  acoustic: ac ? { emotion: ac, confidence: 0.8 } : null,
  lexical: lx ? { emotion: lx, confidence: 0.8 } : null,
  agreement: ac && lx ? (ac === lx ? 'high' : 'conflict') : null,
  review: { decision: null, emotion: null, note: '' },
  flagged: false,
  textEdited: false,
  speakerEdited: false,
})

describe('detectMoments', () => {
  it('finds escalation, recovery and sustained negativity on the customer arc', () => {
    const utts = [
      u('customer', 0, 5, 'neutral'),
      u('agent', 5, 8, 'neutral'),
      u('customer', 8, 14, 'angry', 0.9),
      u('customer', 14, 20, 'angry', 0.8),
      u('customer', 20, 28, 'sad', 0.7),
      u('customer', 28, 34, 'happy', 0.7),
    ]
    const types = detectMoments(utts).map((m) => m.type)
    expect(types).toContain('escalation')
    expect(types).toContain('sustained_negative')
    expect(types).toContain('recovery')
  })

  it('ignores low-confidence changes and agent emotion when computing the arc', () => {
    const utts = [u('customer', 0, 5, 'neutral'), u('agent', 5, 9, 'angry', 0.99), u('customer', 9, 14, 'angry', 0.4)]
    expect(detectMoments(utts)).toHaveLength(0)
  })

  it('flags strong acoustic/lexical conflicts for any speaker', () => {
    const m = detectMoments([u('agent', 0, 5, 'neutral', 0.7, 'sad', 'neutral')])
    expect(m.map((x) => x.type)).toEqual(['modality_disagreement'])
  })

  it('produces stable ids so reviewer verdicts survive recomputation', () => {
    const utts = [u('customer', 0, 5, 'neutral'), u('customer', 5, 9, 'angry', 0.9)]
    expect(detectMoments(utts).map((m) => m.id)).toEqual(detectMoments([...utts]).map((m) => m.id))
  })
})

describe('derive', () => {
  it('rates a calm call low and a hostile one high', () => {
    expect(derive([u('customer', 0, 10, 'neutral'), u('customer', 10, 20, 'happy')]).priority).toBe('low')
    const hostile = derive([u('customer', 0, 5, 'neutral'), u('customer', 5, 15, 'angry', 0.9), u('customer', 15, 25, 'angry', 0.9), u('customer', 25, 35, 'angry', 0.9)])
    expect(hostile.priority).toBe('high')
    expect(hostile.negativeRatio).toBeGreaterThan(0.8)
    expect(hostile.dominantEmotion).toBe('angry')
  })
  it('returns an empty summary when nothing has been predicted yet', () => {
    expect(derive([{ ...u('customer', 0, 5, 'neutral'), fused: null }]).avgConfidence).toBeNull()
  })
})

describe('importers', () => {
  it('parses flexible time formats', () => {
    expect(parseTime('1:05')).toBe(65)
    expect(parseTime('01:02:03.5')).toBe(3723.5)
    expect(parseTime('7,25')).toBe(7.25)
    expect(parseTime('abc')).toBeNull()
  })
  it('requires predictions only for results import', () => {
    const csv = Buffer.from('start,end,speaker,text\n0,3,agent,Xin chào\n')
    expect(parseUtteranceFile(csv, 't.csv', false).utterances[0].fused).toBeNull()
    expect(() => parseUtteranceFile(csv, 't.csv', true)).toThrow(ImportError)
  })
  it('rejects unsupported extensions and malformed JSON', () => {
    expect(() => parseUtteranceFile(Buffer.from('x'), 'a.txt', false)).toThrow(/json hoặc .csv/)
    expect(() => parseUtteranceFile(Buffer.from('{oops'), 'a.json', false)).toThrow(/JSON/)
  })
})
