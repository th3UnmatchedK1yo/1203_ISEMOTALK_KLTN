import type { CallDetail, Moment, ReviewPatch, ReviewPayload, Utterance } from '../api/isemotalk'

export interface ReviewForm {
  utterances: Record<string, ReviewPatch>
  moments: ReviewPayload['moments']
  overallNote: string
  complete: boolean
}

export interface StoredReviewDraft extends ReviewPayload {
  schema: 1
  callId: string
  updatedAt: string
}

export type DraftRecovery =
  | { kind: 'none' | 'invalid' }
  | { kind: 'conflict'; draft: StoredReviewDraft }
  | { kind: 'restored'; form: ReviewForm; updatedAt: string }

export function createReviewForm(call: CallDetail): ReviewForm {
  return {
    utterances: Object.fromEntries(call.utterances.map(u => [u.id, {
      decision: u.review.decision, emotion: u.review.emotion, note: u.review.note,
      flagged: u.flagged, text: u.text, speaker: u.speaker,
    }])),
    moments: {}, overallNote: call.overallNote, complete: call.reviewStatus === 'reviewed',
  }
}

export function buildReviewPayload(call: CallDetail, form: ReviewForm): ReviewPayload {
  const utterances: ReviewPayload['utterances'] = {}
  for (const u of call.utterances) {
    const current = form.utterances[u.id]
    if (!current) continue
    const patch: ReviewPatch = {}
    // The review endpoint consumes decision and emotion as one change.
    if (current.decision !== u.review.decision || current.emotion !== u.review.emotion) {
      patch.decision = current.decision
      patch.emotion = current.emotion
    }
    if (current.text !== u.text) patch.text = current.text
    if (current.speaker !== u.speaker) patch.speaker = current.speaker
    if (current.note !== u.review.note) patch.note = current.note
    if (current.flagged !== u.flagged) patch.flagged = current.flagged
    if (Object.keys(patch).length) utterances[u.id] = patch
  }
  const moments: ReviewPayload['moments'] = {}
  const baseline = new Map(call.moments.map(moment => [moment.id, moment]))
  for (const [id, patch] of Object.entries(form.moments)) {
    const original = baseline.get(id)
    if (original && (patch.relevance !== original.relevance || (patch.note ?? original.note) !== original.note)) {
      moments[id] = patch
    }
  }
  const payload: ReviewPayload = { baseVersion: call.version, utterances, moments }
  if (form.overallNote !== call.overallNote) payload.overallNote = form.overallNote
  if (form.complete !== (call.reviewStatus === 'reviewed')) payload.complete = form.complete
  return payload
}

export function hasReviewChanges(payload: ReviewPayload): boolean {
  return Object.keys(payload.utterances).length > 0 || Object.keys(payload.moments).length > 0
    || payload.overallNote !== undefined || payload.complete !== undefined
}

export function serializeReviewDraft(call: CallDetail, form: ReviewForm, now = new Date()): string {
  return JSON.stringify({ schema: 1, callId: call.id, updatedAt: now.toISOString(), ...buildReviewPayload(call, form) })
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const optionalText = (value: unknown, max: number) => value === undefined || (typeof value === 'string' && value.length <= max)
const optionalChoice = (value: unknown, choices: readonly unknown[]) => value === undefined || choices.includes(value)

function validPatch(value: unknown): value is ReviewPatch {
  if (!record(value)) return false
  if (!Object.keys(value).every(key => ['decision', 'emotion', 'note', 'flagged', 'text', 'speaker'].includes(key))) return false
  return optionalChoice(value.decision, [null, 'confirmed', 'corrected'])
    && optionalChoice(value.emotion, [null, 'neutral', 'happy', 'sad', 'angry'])
    && (value.decision !== 'corrected' || ['neutral', 'happy', 'sad', 'angry'].includes(String(value.emotion)))
    && optionalText(value.note, 2000) && optionalText(value.text, 4000)
    && optionalChoice(value.speaker, ['agent', 'customer', 'unknown'])
    && optionalChoice(value.flagged, [true, false])
}

function validDraft(value: unknown, callId: string): value is StoredReviewDraft {
  if (!record(value) || value.schema !== 1 || value.callId !== callId || !Number.isSafeInteger(value.baseVersion)
      || Number(value.baseVersion) < 0 || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))
      || !record(value.utterances) || !record(value.moments)) return false
  if (!Object.values(value.utterances).every(validPatch)) return false
  if (!Object.values(value.moments).every(p => record(p) && [true, false, null].includes(p.relevance as boolean | null)
      && optionalText(p.note, 2000))) return false
  return optionalText(value.overallNote, 5000) && optionalChoice(value.complete, [true, false])
}

export function restoreReviewDraft(call: CallDetail, raw: string | null): DraftRecovery {
  if (!raw) return { kind: 'none' }
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return { kind: 'invalid' } }
  if (!validDraft(parsed, call.id)) return { kind: 'invalid' }
  const utteranceIds = new Set(call.utterances.map(u => u.id))
  const momentIds = new Set(call.moments.map(m => m.id))
  if (parsed.baseVersion !== call.version || Object.keys(parsed.utterances).some(id => !utteranceIds.has(id))
      || Object.keys(parsed.moments).some(id => !momentIds.has(id))) return { kind: 'conflict', draft: parsed }
  const form = createReviewForm(call)
  for (const [id, patch] of Object.entries(parsed.utterances)) form.utterances[id] = { ...form.utterances[id], ...patch }
  form.moments = parsed.moments
  if (parsed.overallNote !== undefined) form.overallNote = parsed.overallNote
  if (parsed.complete !== undefined) form.complete = parsed.complete
  return { kind: 'restored', form, updatedAt: parsed.updatedAt }
}

export const reviewDraftKey = (callId: string) => 'isemotalk.review.v1.' + callId

export function getMomentTarget(moment: Moment, utterances: Pick<Utterance, 'id' | 'start' | 'end'>[]) {
  const byId = new Map(utterances.map(utterance => [utterance.id, utterance]))
  const supporting = moment.utteranceIds.flatMap(id => {
    const utterance = byId.get(id)
    return utterance ? [utterance] : []
  })
  // Transition evidence includes [previous, current]; its playback anchor is
  // current.start. A sustained run instead begins at its first supporting turn.
  const transition = ['escalation', 'recovery', 'high_confidence_change'].includes(moment.type)
  const anchor = transition ? supporting[supporting.length - 1] : supporting[0]
  if (anchor && anchor.start <= moment.start && moment.start < anchor.end) {
    return { utteranceId: anchor.id, time: moment.start }
  }
  const exact = supporting.find(utterance => utterance.start === moment.start)
  const containing = supporting.reduce<(typeof supporting)[number] | null>((closest, utterance) => {
    if (utterance.start > moment.start || utterance.end <= moment.start) return closest
    return !closest || utterance.start > closest.start ? utterance : closest
  }, null)
  return { utteranceId: (exact ?? containing)?.id ?? null, time: moment.start }
}
