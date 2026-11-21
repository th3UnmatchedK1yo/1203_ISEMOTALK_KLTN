import { describe, expect, it } from 'vitest'
import type { Moment } from './isemotalk'
import { getMomentTarget } from '../lib/reviewSession'

const moment = (type: string, start: number, utteranceIds: string[]): Moment => ({
  id: type + ':current', type, start, end: 30, utteranceIds,
  description: '', relevance: null, note: '',
})

describe('moment evidence selection', () => {
  it.each(['escalation', 'recovery', 'high_confidence_change'])('opens the current sentence at the %s playback anchor', type => {
    const target = getMomentTarget(moment(type, 20, ['previous', 'current']), [
      { id: 'previous', start: 0, end: 10 },
      { id: 'current', start: 20, end: 30 },
    ])
    expect(target).toEqual({ utteranceId: 'current', time: 20 })
  })

  it('prefers the sentence beginning at the anchor over an overlapping earlier sentence', () => {
    expect(getMomentTarget(moment('escalation', 20, ['previous', 'current']), [
      { id: 'previous', start: 0, end: 25 },
      { id: 'current', start: 20, end: 30 },
    ])).toEqual({ utteranceId: 'current', time: 20 })
  })

  it('keeps the first supporting sentence for a sustained negative run', () => {
    expect(getMomentTarget(moment('sustained_negative', 0, ['first', 'current']), [
      { id: 'current', start: 20, end: 30 },
      { id: 'first', start: 0, end: 10 },
    ])).toEqual({ utteranceId: 'first', time: 0 })
  })

  it('uses the transition anchor when both supporting sentences share a start time', () => {
    expect(getMomentTarget(moment('escalation', 20, ['previous', 'current']), [
      { id: 'previous', start: 20, end: 25 },
      { id: 'current', start: 20, end: 30 },
    ])).toEqual({ utteranceId: 'current', time: 20 })
  })

  it('selects supporting evidence containing the timestamp and never an unrelated utterance', () => {
    expect(getMomentTarget(moment('modality_disagreement', 7, ['support']), [
      { id: 'unrelated', start: 7, end: 9 },
      { id: 'support', start: 5, end: 10 },
    ])).toEqual({ utteranceId: 'support', time: 7 })
    expect(getMomentTarget(moment('escalation', 7, ['missing']), [
      { id: 'unrelated', start: 7, end: 9 },
    ])).toEqual({ utteranceId: null, time: 7 })
  })
})
