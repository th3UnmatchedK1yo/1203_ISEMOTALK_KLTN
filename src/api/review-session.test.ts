import { describe, expect, it } from 'vitest'
import type { CallDetail } from './isemotalk'
import { buildReviewPayload, createReviewForm, hasReviewChanges, restoreReviewDraft, serializeReviewDraft } from '../lib/reviewSession'

const call: CallDetail = {
  id: 'CALL-0042', title: 'Review fixture', agentName: '', customerName: '',
  callDate: '2026-11-22T00:00:00Z', duration: 4, source: 'results_import', provenance: 'imported',
  status: 'ready', stage: null, progress: 100, error: null, priority: 'low',
  dominantEmotion: 'neutral', negativeRatio: 0, momentCount: 1, disagreementCount: 0,
  reviewStatus: 'unreviewed', hasAudio: false, utteranceCount: 2, reviewedCount: 0,
  updatedAt: '2026-11-22T00:00:00Z', stageLog: [], attempts: 0,
  audioUrl: null, audioName: null, peaks: null, speakerSource: 'provided', version: 3,
  overallNote: '', reviewedAt: null, avgConfidence: 0.8, escalationCount: 0, recoveryCount: 0,
  utterances: [
    { id: 'u1', idx: 0, start: 0, end: 2, text: 'Xin chào', speaker: 'agent', acoustic: null,
      lexical: null, fused: { emotion: 'neutral', confidence: 0.8 }, agreement: null,
      review: { decision: null, emotion: null, note: '' }, flagged: false, textEdited: false, speakerEdited: false },
    { id: 'u2', idx: 1, start: 2, end: 4, text: 'Cảm ơn', speaker: 'customer', acoustic: null,
      lexical: null, fused: { emotion: 'neutral', confidence: 0.8 }, agreement: null,
      review: { decision: null, emotion: null, note: '' }, flagged: false, textEdited: false, speakerEdited: false },
  ],
  moments: [{ id: 'm1', type: 'recovery', start: 2, end: 4, description: '', utteranceIds: ['u2'], relevance: null, note: '' }],
}

describe('review draft recovery and payloads', () => {
  it('does not reopen a call or manufacture activity when nothing changed', () => {
    const payload = buildReviewPayload(call, createReviewForm(call))
    expect(payload).toEqual({ baseVersion: 3, utterances: {}, moments: {} })
    expect(hasReviewChanges(payload)).toBe(false)
  })

  it('sends only edited fields and distinguishes an explicit clear from an unchanged note', () => {
    const saved = { ...call, overallNote: 'Old note', reviewStatus: 'reviewed' as const }
    const form = createReviewForm(saved)
    form.utterances.u2 = { ...form.utterances.u2, text: 'Xin cảm ơn', speaker: 'unknown' }
    form.overallNote = ''
    form.complete = false
    expect(buildReviewPayload(saved, form)).toEqual({
      baseVersion: 3, utterances: { u2: { text: 'Xin cảm ơn', speaker: 'unknown' } },
      moments: {}, overallNote: '', complete: false,
    })
    expect(saved.utterances[1].text).toBe('Cảm ơn')
  })

  it('retains a decision and its corrected emotion together in the review payload', () => {
    const form = createReviewForm(call)
    form.utterances.u1 = { ...form.utterances.u1, decision: 'corrected', emotion: 'happy' }
    expect(buildReviewPayload(call, form).utterances).toEqual({ u1: { decision: 'corrected', emotion: 'happy' } })
  })

  it('restores an unsaved transcript, review note and moment decision after a refresh', () => {
    const raw = JSON.stringify({ schema: 1, callId: 'CALL-0042', baseVersion: 3,
      updatedAt: '2026-11-22T01:00:00Z', utterances: { u2: { text: 'Bản nháp', note: 'Nghe lại' } },
      moments: { m1: { relevance: false, note: '' } }, overallNote: 'Cần kiểm tra', complete: true })
    const restored = restoreReviewDraft(call, raw)
    expect(restored.kind).toBe('restored')
    if (restored.kind !== 'restored') throw new Error('Expected a recoverable draft')
    expect(restored.form.utterances.u2.text).toBe('Bản nháp')
    expect(restored.form.utterances.u2.note).toBe('Nghe lại')
    expect(restored.form.utterances.u1.text).toBe('Xin chào')
    expect(restored.form.moments).toEqual({ m1: { relevance: false, note: '' } })
    expect(restored.form.overallNote).toBe('Cần kiểm tra')
    expect(restored.form.complete).toBe(true)
  })

  it('does not apply an older draft over a newer saved version and retains its content for recovery', () => {
    const raw = JSON.stringify({ schema: 1, callId: 'CALL-0042', baseVersion: 2,
      updatedAt: '2026-11-22T01:00:00Z', utterances: { u2: { note: 'Do not lose this' } }, moments: {} })
    const restored = restoreReviewDraft(call, raw)
    expect(restored.kind).toBe('conflict')
    if (restored.kind !== 'conflict') throw new Error('Expected a version conflict')
    expect(restored.draft.utterances.u2.note).toBe('Do not lose this')
  })

  it('refuses drafts for a different call, missing utterance IDs, and malformed corrections', () => {
    const draft = { schema: 1, callId: 'CALL-0042', baseVersion: 3,
      updatedAt: '2026-11-22T01:00:00Z', utterances: {}, moments: {} }
    expect(restoreReviewDraft(call, JSON.stringify({ ...draft, callId: 'CALL-9999' })).kind).toBe('invalid')
    expect(restoreReviewDraft(call, JSON.stringify({ ...draft, utterances: { deleted: { note: 'Old text' } } })).kind).toBe('conflict')
    expect(restoreReviewDraft(call, JSON.stringify({ ...draft, utterances: { u2: { decision: 'corrected', emotion: '' } } })).kind).toBe('invalid')
    expect(restoreReviewDraft(call, '{broken json').kind).toBe('invalid')
  })

  it('serializes a sparse draft with identity and version, without copying untouched transcript', () => {
    const form = createReviewForm(call)
    form.overallNote = 'Only this changed'
    expect(JSON.parse(serializeReviewDraft(call, form, new Date('2026-11-22T01:00:00Z')))).toEqual({
      schema: 1, callId: 'CALL-0042', updatedAt: '2026-11-22T01:00:00.000Z', baseVersion: 3,
      utterances: {}, moments: {}, overallNote: 'Only this changed',
    })
  })
})
