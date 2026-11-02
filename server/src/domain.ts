// Domain model + pure logic shared by pipeline, review and analytics.
// Nothing in this file touches the database or the network.

export const EMOTIONS = ['neutral', 'happy', 'sad', 'angry'] as const
export type Emotion = (typeof EMOTIONS)[number]

export const EMOTION_LABELS_VI: Record<Emotion, string> = {
  neutral: 'Bình thường',
  happy: 'Vui',
  sad: 'Buồn',
  angry: 'Tức giận',
}

export type Speaker = 'agent' | 'customer' | 'unknown'
export type Agreement = 'high' | 'partial' | 'conflict'
export type Priority = 'low' | 'medium' | 'high'
export type ReviewStatus = 'unreviewed' | 'in_progress' | 'reviewed'
export type ProcessingStatus = 'queued' | 'processing' | 'ready' | 'failed'
export type Provenance = 'mock' | 'real' | 'imported'
export type CallSource = 'upload' | 'transcript_import' | 'results_import'
export type SpeakerSource = 'channel' | 'model' | 'provided' | 'mock' | 'unassigned'

export type StageKey = 'validate' | 'transcribe' | 'diarize' | 'emotion' | 'finalize'
export const STAGE_ORDER: StageKey[] = ['validate', 'transcribe', 'diarize', 'emotion', 'finalize']
export type StageState = 'pending' | 'running' | 'done' | 'skipped' | 'failed'
export interface StageEntry {
  stage: StageKey
  state: StageState
  startedAt?: string
  endedAt?: string
  detail?: string
}

export interface Prediction {
  emotion: Emotion
  confidence: number // 0..1
}

export interface ReviewState {
  decision: 'confirmed' | 'corrected' | null
  emotion: Emotion | null
  note: string
}

export interface Utterance {
  id: string
  idx: number
  speaker: Speaker
  text: string
  start: number // seconds
  end: number // seconds
  acoustic: Prediction | null
  lexical: Prediction | null
  fused: Prediction | null
  agreement: Agreement | null
  review: ReviewState
  flagged: boolean
  textEdited: boolean
  speakerEdited: boolean
}

export type MomentType =
  | 'escalation'
  | 'recovery'
  | 'sustained_negative'
  | 'modality_disagreement'
  | 'high_confidence_change'

export const MOMENT_TYPES: MomentType[] = [
  'escalation',
  'recovery',
  'sustained_negative',
  'modality_disagreement',
  'high_confidence_change',
]

export interface Moment {
  id: string
  type: MomentType
  start: number
  end: number
  emotion: Emotion | null
  fromEmotion: Emotion | null
  description: string
  utteranceIds: string[]
}

// ---------------------------------------------------------------------------
// Basic helpers
// ---------------------------------------------------------------------------

export const isNegative = (e: Emotion | null | undefined): boolean => e === 'sad' || e === 'angry'
const severity = (e: Emotion): number => (e === 'angry' ? 2 : e === 'sad' ? 1 : 0)

export function computeAgreement(
  acoustic: Prediction | null,
  lexical: Prediction | null,
): Agreement | null {
  if (!acoustic || !lexical) return null
  if (acoustic.emotion !== lexical.emotion) return 'conflict'
  return Math.abs(acoustic.confidence - lexical.confidence) > 0.25 ? 'partial' : 'high'
}

/** Emotion after human review: a correction overrides the model, otherwise the fused model output. */
export function finalEmotion(u: Pick<Utterance, 'fused' | 'review'>): Emotion | null {
  if (u.review.decision === 'corrected' && u.review.emotion) return u.review.emotion
  return u.fused?.emotion ?? null
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

// ---------------------------------------------------------------------------
// Critical moments. Derived from MODEL output (fused / modality predictions) so
// they stay stable while a reviewer works; the reviewer's relevance verdict is
// stored separately, keyed by the deterministic moment id.
// ---------------------------------------------------------------------------

const CONF_STRONG = 0.6
const CONF_RECOVERY = 0.5 // recovery is worth surfacing even when the model is only moderately sure
const CONF_HIGH = 0.85
const SUSTAINED_MIN_RUN = 3
const SUSTAINED_MIN_SECONDS = 20

const fmtClock = (s: number): string => {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function detectMoments(utterances: Utterance[]): Moment[] {
  const moments: Moment[] = []
  const ordered = [...utterances].sort((a, b) => a.start - b.start)
  const hasCustomer = ordered.some((u) => u.speaker === 'customer')
  // The customer's emotional arc is what QA cares about. If speakers are not
  // assigned yet, fall back to every utterance rather than reporting nothing.
  const arc = ordered.filter((u) => u.fused && (hasCustomer ? u.speaker === 'customer' : true))

  for (let i = 1; i < arc.length; i++) {
    const prev = arc[i - 1]
    const cur = arc[i]
    const p = prev.fused!
    const c = cur.fused!
    if (c.emotion === p.emotion) continue

    if (isNegative(c.emotion) && severity(c.emotion) > severity(p.emotion) && c.confidence >= CONF_STRONG) {
      moments.push({
        id: `escalation:${cur.id}`,
        type: 'escalation',
        start: cur.start,
        end: cur.end,
        emotion: c.emotion,
        fromEmotion: p.emotion,
        description: `Khách hàng chuyển từ "${EMOTION_LABELS_VI[p.emotion]}" sang "${EMOTION_LABELS_VI[c.emotion]}" lúc ${fmtClock(cur.start)}.`,
        utteranceIds: [prev.id, cur.id],
      })
    } else if (isNegative(p.emotion) && !isNegative(c.emotion) && c.confidence >= CONF_RECOVERY) {
      moments.push({
        id: `recovery:${cur.id}`,
        type: 'recovery',
        start: cur.start,
        end: cur.end,
        emotion: c.emotion,
        fromEmotion: p.emotion,
        description: `Khách hàng hồi phục từ "${EMOTION_LABELS_VI[p.emotion]}" về "${EMOTION_LABELS_VI[c.emotion]}" lúc ${fmtClock(cur.start)}.`,
        utteranceIds: [prev.id, cur.id],
      })
    } else if (c.confidence >= CONF_HIGH) {
      moments.push({
        id: `high_confidence_change:${cur.id}`,
        type: 'high_confidence_change',
        start: cur.start,
        end: cur.end,
        emotion: c.emotion,
        fromEmotion: p.emotion,
        description: `Cảm xúc đổi từ "${EMOTION_LABELS_VI[p.emotion]}" sang "${EMOTION_LABELS_VI[c.emotion]}" với độ tin cậy cao (${Math.round(c.confidence * 100)}%).`,
        utteranceIds: [prev.id, cur.id],
      })
    }
  }

  // Sustained negative runs
  let run: Utterance[] = []
  const flush = () => {
    if (run.length === 0) return
    const span = run[run.length - 1].end - run[0].start
    if (run.length >= SUSTAINED_MIN_RUN || span >= SUSTAINED_MIN_SECONDS) {
      const dominant = run.some((u) => u.fused!.emotion === 'angry') ? 'angry' : 'sad'
      moments.push({
        id: `sustained_negative:${run[0].id}`,
        type: 'sustained_negative',
        start: run[0].start,
        end: run[run.length - 1].end,
        emotion: dominant,
        fromEmotion: null,
        description: `Cảm xúc tiêu cực kéo dài ${Math.round(span)} giây qua ${run.length} câu (${fmtClock(run[0].start)}–${fmtClock(run[run.length - 1].end)}).`,
        utteranceIds: run.map((u) => u.id),
      })
    }
    run = []
  }
  for (const u of arc) {
    if (isNegative(u.fused!.emotion)) run.push(u)
    else flush()
  }
  flush()

  // Acoustic vs lexical conflict (any speaker)
  for (const u of ordered) {
    if (u.agreement !== 'conflict' || !u.acoustic || !u.lexical) continue
    if (Math.max(u.acoustic.confidence, u.lexical.confidence) < CONF_STRONG) continue
    moments.push({
      id: `modality_disagreement:${u.id}`,
      type: 'modality_disagreement',
      start: u.start,
      end: u.end,
      emotion: u.fused?.emotion ?? null,
      fromEmotion: null,
      description: `Giọng nói cho thấy "${EMOTION_LABELS_VI[u.acoustic.emotion]}" nhưng nội dung cho thấy "${EMOTION_LABELS_VI[u.lexical.emotion]}" (${fmtClock(u.start)}).`,
      utteranceIds: [u.id],
    })
  }

  return moments.sort((a, b) => a.start - b.start || a.type.localeCompare(b.type))
}

// ---------------------------------------------------------------------------
// Call summary + review priority
// ---------------------------------------------------------------------------

export interface CallDerived {
  priority: Priority
  dominantEmotion: Emotion | null
  negativeRatio: number
  momentCount: number
  escalationCount: number
  recoveryCount: number
  disagreementCount: number
  avgConfidence: number | null
}

/**
 * Priority score (0-100) used to triage the review queue:
 *   40  share of customer talk time that is negative (saturates at 50 %)
 *   20  escalations (saturates at 2)
 *   25  at least one sustained negative stretch
 *   15  modality conflicts (saturates at 3)
 * high >= 50, medium >= 25, otherwise low.
 */
export function priorityScore(d: Pick<CallDerived, 'negativeRatio' | 'escalationCount' | 'disagreementCount'>, sustained: number): number {
  return (
    40 * Math.min(d.negativeRatio / 0.5, 1) +
    20 * (Math.min(d.escalationCount, 2) / 2) +
    25 * (sustained > 0 ? 1 : 0) +
    15 * (Math.min(d.disagreementCount, 3) / 3)
  )
}

export function derive(utterances: Utterance[]): CallDerived {
  const predicted = utterances.filter((u) => u.fused)
  if (predicted.length === 0) {
    return {
      priority: 'low',
      dominantEmotion: null,
      negativeRatio: 0,
      momentCount: 0,
      escalationCount: 0,
      recoveryCount: 0,
      disagreementCount: 0,
      avgConfidence: null,
    }
  }
  const moments = detectMoments(utterances)
  const hasCustomer = predicted.some((u) => u.speaker === 'customer')
  const basis = hasCustomer ? predicted.filter((u) => u.speaker === 'customer') : predicted

  const weight = (u: Utterance) => Math.max(u.end - u.start, 0.5)
  const totalW = basis.reduce((a, u) => a + weight(u), 0)
  const negW = basis.filter((u) => isNegative(u.fused!.emotion)).reduce((a, u) => a + weight(u), 0)
  const negativeRatio = totalW > 0 ? negW / totalW : 0

  const tally: Record<Emotion, number> = { neutral: 0, happy: 0, sad: 0, angry: 0 }
  for (const u of basis) tally[u.fused!.emotion] += weight(u)
  const dominantEmotion = (Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0] as Emotion) ?? null

  const escalationCount = moments.filter((m) => m.type === 'escalation').length
  const recoveryCount = moments.filter((m) => m.type === 'recovery').length
  const disagreementCount = predicted.filter((u) => u.agreement === 'conflict').length
  const sustained = moments.filter((m) => m.type === 'sustained_negative').length
  const avgConfidence = predicted.reduce((a, u) => a + u.fused!.confidence, 0) / predicted.length

  const score = priorityScore({ negativeRatio, escalationCount, disagreementCount }, sustained)
  const priority: Priority = score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low'

  return {
    priority,
    dominantEmotion,
    negativeRatio,
    momentCount: moments.length,
    escalationCount,
    recoveryCount,
    disagreementCount,
    avgConfidence,
  }
}
