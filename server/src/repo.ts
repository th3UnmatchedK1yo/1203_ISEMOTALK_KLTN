import type { DB } from './db'
import {
  type Agreement,
  type CallDerived,
  type CallSource,
  type Emotion,
  type Moment,
  type Prediction,
  type Priority,
  type ProcessingStatus,
  type Provenance,
  type ReviewStatus,
  type Speaker,
  type SpeakerSource,
  type StageEntry,
  type Utterance,
  computeAgreement,
  derive,
  detectMoments,
} from './domain'

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface CallListItem {
  id: string
  title: string
  agentName: string
  customerName: string
  callDate: string
  duration: number
  source: CallSource
  provenance: Provenance | null
  status: ProcessingStatus
  stage: string | null
  progress: number
  error: string | null
  priority: Priority
  dominantEmotion: Emotion | null
  negativeRatio: number
  momentCount: number
  disagreementCount: number
  reviewStatus: ReviewStatus
  hasAudio: boolean
  utteranceCount: number
  reviewedCount: number
  updatedAt: string
}

export interface MomentDto extends Moment {
  relevance: boolean | null
  note: string
}

export interface CallDetail extends CallListItem {
  agentChannel: number
  channels: number | null
  speakerSource: SpeakerSource | null
  audioUrl: string | null
  audioName: string | null
  peaks: number[] | null
  stageLog: StageEntry[]
  attempts: number
  overallNote: string
  reviewedAt: string | null
  version: number
  avgConfidence: number | null
  escalationCount: number
  recoveryCount: number
  utterances: Utterance[]
  moments: MomentDto[]
}

export interface NewUtterance {
  speaker: Speaker
  text: string
  start: number
  end: number
  acoustic?: Prediction | null
  lexical?: Prediction | null
  fused?: Prediction | null
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

type Row = Record<string, any>

const pred = (e: string | null, c: number | null): Prediction | null =>
  e && c != null ? { emotion: e as Emotion, confidence: c } : null

export function mapUtterance(r: Row): Utterance {
  return {
    id: r.id,
    idx: r.idx,
    speaker: r.speaker as Speaker,
    text: r.text,
    start: r.start,
    end: r.end,
    acoustic: pred(r.ac_emotion, r.ac_conf),
    lexical: pred(r.lx_emotion, r.lx_conf),
    fused: pred(r.fu_emotion, r.fu_conf),
    agreement: (r.agreement as Agreement | null) ?? null,
    review: {
      decision: (r.review_decision as 'confirmed' | 'corrected' | null) ?? null,
      emotion: (r.review_emotion as Emotion | null) ?? null,
      note: r.review_note ?? '',
    },
    flagged: !!r.flagged,
    textEdited: r.orig_text != null && r.orig_text !== r.text,
    speakerEdited: r.orig_speaker != null && r.orig_speaker !== r.speaker,
  }
}

function mapListItem(r: Row): CallListItem {
  return {
    id: r.id,
    title: r.title,
    agentName: r.agent_name,
    customerName: r.customer_name,
    callDate: r.call_date,
    duration: r.duration,
    source: r.source,
    provenance: r.provenance ?? null,
    status: r.status,
    stage: r.stage ?? null,
    progress: r.progress,
    error: r.error ?? null,
    priority: r.priority,
    dominantEmotion: r.dominant_emotion ?? null,
    negativeRatio: r.negative_ratio,
    momentCount: r.moment_count,
    disagreementCount: r.disagreement_count,
    reviewStatus: r.review_status,
    hasAudio: !!r.audio_file,
    utteranceCount: r.utt_count ?? 0,
    reviewedCount: r.reviewed_count ?? 0,
    updatedAt: r.updated_at,
  }
}

const LIST_SELECT = `
  SELECT c.*,
    (SELECT COUNT(*) FROM utterances u WHERE u.call_id = c.id) AS utt_count,
    (SELECT COUNT(*) FROM utterances u WHERE u.call_id = c.id AND u.review_decision IS NOT NULL) AS reviewed_count
  FROM calls c`

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface ListQuery {
  search?: string
  priority?: string
  review?: string
  status?: string
  provenance?: string
  source?: string
  attention?: boolean
  sort?: string
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

const SORTS: Record<string, string> = {
  date: 'c.call_date',
  title: 'c.title COLLATE NOCASE',
  duration: 'c.duration',
  negative: 'c.negative_ratio',
  moments: 'c.moment_count',
  priority: "CASE c.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END",
  review: "CASE c.review_status WHEN 'unreviewed' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END",
  status: "CASE c.status WHEN 'failed' THEN 1 WHEN 'processing' THEN 2 WHEN 'queued' THEN 3 ELSE 4 END",
}

export function listCalls(db: DB, q: ListQuery) {
  const where: string[] = []
  const args: unknown[] = []
  if (q.search?.trim()) {
    const like = `%${q.search.trim().replace(/[%_]/g, (m) => `\\${m}`)}%`
    where.push(
      "(c.id LIKE ? ESCAPE '\\' OR c.title LIKE ? ESCAPE '\\' OR c.agent_name LIKE ? ESCAPE '\\' OR c.customer_name LIKE ? ESCAPE '\\')",
    )
    args.push(like, like, like, like)
  }
  if (q.priority) (where.push('c.priority = ?'), args.push(q.priority))
  if (q.review) (where.push('c.review_status = ?'), args.push(q.review))
  if (q.status) (where.push('c.status = ?'), args.push(q.status))
  if (q.provenance) (where.push('c.provenance = ?'), args.push(q.provenance))
  if (q.source) (where.push('c.source = ?'), args.push(q.source))
  if (q.attention) where.push("c.status = 'ready' AND c.priority = 'high' AND c.review_status != 'reviewed'")
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const sortExpr = SORTS[q.sort ?? 'date'] ?? SORTS.date
  const dir = q.dir === 'asc' ? 'ASC' : 'DESC'
  const pageSize = Math.min(Math.max(q.pageSize ?? 15, 1), 100)
  const page = Math.max(q.page ?? 1, 1)

  const total = (db.prepare(`SELECT COUNT(*) AS n FROM calls c ${whereSql}`).get(...args) as Row).n as number
  const rows = db
    .prepare(`${LIST_SELECT} ${whereSql} ORDER BY ${sortExpr} ${dir}, c.call_date DESC, c.id DESC LIMIT ? OFFSET ?`)
    .all(...args, pageSize, (page - 1) * pageSize) as Row[]

  const counts = db
    .prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN status='ready' AND priority='high' AND review_status!='reviewed' THEN 1 ELSE 0 END) AS attention,
        SUM(CASE WHEN status IN ('queued','processing') THEN 1 ELSE 0 END) AS processing,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
       FROM calls`,
    )
    .get() as Row

  return {
    items: rows.map(mapListItem),
    total,
    page,
    pageSize,
    counts: {
      total: counts.total ?? 0,
      attention: counts.attention ?? 0,
      processing: counts.processing ?? 0,
      failed: counts.failed ?? 0,
    },
  }
}

export function getCallRow(db: DB, id: string): Row | undefined {
  return db.prepare(`${LIST_SELECT} WHERE c.id = ?`).get(id) as Row | undefined
}

export function getUtterances(db: DB, callId: string): Utterance[] {
  return (db.prepare('SELECT * FROM utterances WHERE call_id = ? ORDER BY idx').all(callId) as Row[]).map(mapUtterance)
}

export function getCallDetail(db: DB, id: string): CallDetail | null {
  const r = getCallRow(db, id)
  if (!r) return null
  const utterances = getUtterances(db, id)
  const reviews = new Map(
    (db.prepare('SELECT * FROM moment_reviews WHERE call_id = ?').all(id) as Row[]).map((m) => [m.moment_id as string, m]),
  )
  const moments: MomentDto[] = detectMoments(utterances).map((m) => {
    const rv = reviews.get(m.id)
    return { ...m, relevance: rv?.relevance == null ? null : !!rv.relevance, note: rv?.note ?? '' }
  })
  return {
    ...mapListItem(r),
    agentChannel: r.agent_channel,
    channels: r.channels ?? null,
    speakerSource: r.speaker_source ?? null,
    audioUrl: r.audio_file ? `/api/calls/${id}/audio` : null,
    audioName: r.audio_name ?? null,
    peaks: r.peaks ? (JSON.parse(r.peaks) as number[]) : null,
    stageLog: JSON.parse(r.stage_log) as StageEntry[],
    attempts: r.attempts,
    overallNote: r.overall_note,
    reviewedAt: r.reviewed_at ?? null,
    version: r.version,
    avgConfidence: r.avg_confidence ?? null,
    escalationCount: r.escalation_count,
    recoveryCount: r.recovery_count,
    utterances,
    moments,
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function nextCallId(db: DB): string {
  const row = db
    .prepare("SELECT MAX(CAST(SUBSTR(id, 6) AS INTEGER)) AS n FROM calls WHERE id GLOB 'CALL-[0-9]*'")
    .get() as Row
  return `CALL-${String((row.n ?? 0) + 1).padStart(4, '0')}`
}

export interface NewCall {
  id: string
  title: string
  agentName: string
  customerName: string
  callDate: string
  source: CallSource
  agentChannel: number
  audioFile?: string | null
  audioName?: string | null
  audioMime?: string | null
  provenance?: Provenance | null
  speakerSource?: SpeakerSource | null
  stageLog: StageEntry[]
}

export function insertCall(db: DB, c: NewCall): void {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO calls (id, title, agent_name, customer_name, call_date, source, agent_channel,
       audio_file, audio_name, audio_mime, provenance, speaker_source, stage_log, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'queued',?,?)`,
  ).run(
    c.id, c.title, c.agentName, c.customerName, c.callDate, c.source, c.agentChannel,
    c.audioFile ?? null, c.audioName ?? null, c.audioMime ?? null,
    c.provenance ?? null, c.speakerSource ?? null, JSON.stringify(c.stageLog), now, now,
  )
}

const COLUMNS: Record<string, string> = {
  status: 'status', stage: 'stage', progress: 'progress', error: 'error', attempts: 'attempts',
  stageLog: 'stage_log', duration: 'duration', peaks: 'peaks', channels: 'channels',
  provenance: 'provenance', speakerSource: 'speaker_source', reviewStatus: 'review_status',
  overallNote: 'overall_note', reviewedAt: 'reviewed_at', version: 'version',
}

export function updateCall(db: DB, id: string, patch: Record<string, unknown>): void {
  const sets: string[] = ['updated_at = ?']
  const args: unknown[] = [new Date().toISOString()]
  for (const [k, v] of Object.entries(patch)) {
    const col = COLUMNS[k]
    if (!col) throw new Error(`updateCall: unknown field ${k}`)
    sets.push(`${col} = ?`)
    args.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v)
  }
  db.prepare(`UPDATE calls SET ${sets.join(', ')} WHERE id = ?`).run(...args, id)
}

export function replaceUtterances(db: DB, callId: string, utts: NewUtterance[]): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM utterances WHERE call_id = ?').run(callId)
    db.prepare('DELETE FROM moment_reviews WHERE call_id = ?').run(callId)
    const ins = db.prepare(
      `INSERT INTO utterances (call_id, id, idx, speaker, text, start, end, orig_text, orig_speaker,
         ac_emotion, ac_conf, lx_emotion, lx_conf, fu_emotion, fu_conf, agreement)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    utts.forEach((u, i) => {
      ins.run(
        callId, `u${String(i + 1).padStart(4, '0')}`, i, u.speaker, u.text, u.start, u.end, u.text, u.speaker,
        u.acoustic?.emotion ?? null, u.acoustic?.confidence ?? null,
        u.lexical?.emotion ?? null, u.lexical?.confidence ?? null,
        u.fused?.emotion ?? null, u.fused?.confidence ?? null,
        computeAgreement(u.acoustic ?? null, u.lexical ?? null),
      )
    })
  })
  tx()
}

export function setSpeakers(db: DB, callId: string, speakers: Record<string, Speaker>): void {
  const st = db.prepare('UPDATE utterances SET speaker = ?, orig_speaker = ? WHERE call_id = ? AND id = ?')
  db.transaction(() => {
    for (const [id, sp] of Object.entries(speakers)) st.run(sp, sp, callId, id)
  })()
}

export function setPredictions(
  db: DB,
  callId: string,
  preds: Record<string, { acoustic: Prediction | null; lexical: Prediction | null; fused: Prediction }>,
): void {
  const st = db.prepare(
    `UPDATE utterances SET ac_emotion=?, ac_conf=?, lx_emotion=?, lx_conf=?, fu_emotion=?, fu_conf=?, agreement=?
     WHERE call_id = ? AND id = ?`,
  )
  db.transaction(() => {
    for (const [id, p] of Object.entries(preds)) {
      st.run(
        p.acoustic?.emotion ?? null, p.acoustic?.confidence ?? null,
        p.lexical?.emotion ?? null, p.lexical?.confidence ?? null,
        p.fused.emotion, p.fused.confidence, computeAgreement(p.acoustic, p.lexical), callId, id,
      )
    }
  })()
}

/** Recompute the denormalised summary columns used for sorting/filtering the calls table. */
export function refreshDerived(db: DB, callId: string): CallDerived {
  const d = derive(getUtterances(db, callId))
  db.prepare(
    `UPDATE calls SET priority=?, dominant_emotion=?, negative_ratio=?, moment_count=?, escalation_count=?,
       recovery_count=?, disagreement_count=?, avg_confidence=?, updated_at=? WHERE id=?`,
  ).run(
    d.priority, d.dominantEmotion, d.negativeRatio, d.momentCount, d.escalationCount,
    d.recoveryCount, d.disagreementCount, d.avgConfidence, new Date().toISOString(), callId,
  )
  return d
}

export function deleteCall(db: DB, id: string): { audioFile: string | null } | null {
  const r = db.prepare('SELECT audio_file FROM calls WHERE id = ?').get(id) as Row | undefined
  if (!r) return null
  db.prepare('DELETE FROM calls WHERE id = ?').run(id)
  return { audioFile: r.audio_file ?? null }
}
