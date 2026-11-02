import { stringify } from 'csv-stringify/sync'
import type { DB } from './db'
import { EMOTIONS, MOMENT_TYPES, type Emotion, type MomentType, detectMoments, finalEmotion } from './domain'
import * as repo from './repo'

type Row = Record<string, any>

export interface AnalyticsFilter {
  provenance?: string
  from?: string
  to?: string
}

function filteredCalls(db: DB, f: AnalyticsFilter): Row[] {
  const where: string[] = []
  const args: unknown[] = []
  if (f.provenance) (where.push('provenance = ?'), args.push(f.provenance))
  if (f.from) (where.push('call_date >= ?'), args.push(f.from))
  if (f.to) (where.push('call_date <= ?'), args.push(`${f.to}T23:59:59.999Z`))
  return db.prepare(`SELECT * FROM calls ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`).all(...args) as Row[]
}

const zeroEmotions = (): Record<Emotion, number> => ({ neutral: 0, happy: 0, sad: 0, angry: 0 })

export function buildAnalytics(db: DB, f: AnalyticsFilter) {
  const calls = filteredCalls(db, f)
  const ready = calls.filter((c) => c.status === 'ready')

  const statusCounts = { ready: ready.length, processing: 0, failed: 0 }
  for (const c of calls) {
    if (c.status === 'failed') statusCounts.failed++
    else if (c.status !== 'ready') statusCounts.processing++
  }

  const review = { unreviewed: 0, in_progress: 0, reviewed: 0 }
  const priority = { high: 0, medium: 0, low: 0 }
  const provenance = { mock: 0, real: 0, imported: 0, unknown: 0 }
  for (const c of calls) provenance[(c.provenance as keyof typeof provenance) ?? 'unknown']++
  for (const c of ready) {
    review[c.review_status as keyof typeof review]++
    priority[c.priority as keyof typeof priority]++
  }

  const customerEmotion = zeroEmotions()
  const quality = { reviewed: 0, confirmed: 0, corrected: 0 }
  const byPredicted: Record<Emotion, { confirmed: number; corrected: number }> = {
    neutral: { confirmed: 0, corrected: 0 },
    happy: { confirmed: 0, corrected: 0 },
    sad: { confirmed: 0, corrected: 0 },
    angry: { confirmed: 0, corrected: 0 },
  }
  const corrections = new Map<string, number>()
  const momentsByType = Object.fromEntries(MOMENT_TYPES.map((t) => [t, 0])) as Record<MomentType, number>
  const relevance = { relevant: 0, notRelevant: 0, undecided: 0 }
  let withBoth = 0
  let conflicts = 0
  let totalUtterances = 0
  let totalSeconds = 0

  const getUtts = db.prepare('SELECT * FROM utterances WHERE call_id = ? ORDER BY idx')
  const getMomentReviews = db.prepare('SELECT moment_id, relevance FROM moment_reviews WHERE call_id = ?')
  for (const c of ready) {
    totalSeconds += c.duration ?? 0
    const utts = (getUtts.all(c.id) as Row[]).map(repo.mapUtterance)
    totalUtterances += utts.length
    for (const u of utts) {
      const fe = finalEmotion(u)
      if (u.speaker === 'customer' && fe) customerEmotion[fe]++
      if (u.acoustic && u.lexical) {
        withBoth++
        if (u.agreement === 'conflict') conflicts++
      }
      if (u.review.decision && u.fused) {
        quality.reviewed++
        if (u.review.decision === 'confirmed') {
          quality.confirmed++
          byPredicted[u.fused.emotion].confirmed++
        } else if (u.review.emotion) {
          quality.corrected++
          byPredicted[u.fused.emotion].corrected++
          const k = `${u.fused.emotion}>${u.review.emotion}`
          corrections.set(k, (corrections.get(k) ?? 0) + 1)
        }
      }
    }
    const rv = new Map((getMomentReviews.all(c.id) as Row[]).map((m) => [m.moment_id as string, m.relevance as number | null]))
    for (const m of detectMoments(utts)) {
      momentsByType[m.type]++
      const r = rv.get(m.id)
      if (r === 1) relevance.relevant++
      else if (r === 0) relevance.notRelevant++
      else relevance.undecided++
    }
  }

  // Calls per day for the last 14 days (by call date)
  const days: { date: string; calls: number; highPriority: number }[] = []
  const today = new Date()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    days.push({ date: key, calls: 0, highPriority: 0 })
  }
  for (const c of ready) {
    const d = new Date(c.call_date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const slot = days.find((x) => x.date === key)
    if (slot) {
      slot.calls++
      if (c.priority === 'high') slot.highPriority++
    }
  }

  const attention = ready
    .filter((c) => c.priority === 'high' && c.review_status !== 'reviewed')
    .sort((a, b) => b.negative_ratio - a.negative_ratio)
    .slice(0, 8)
    .map((c) => ({
      id: c.id,
      title: c.title,
      agentName: c.agent_name,
      callDate: c.call_date,
      negativeRatio: c.negative_ratio,
      momentCount: c.moment_count,
      provenance: c.provenance,
    }))

  return {
    filter: f,
    totals: { calls: calls.length, utterances: totalUtterances, durationSeconds: totalSeconds },
    status: statusCounts,
    provenance,
    review: {
      ...review,
      completionRate: ready.length ? review.reviewed / ready.length : 0,
    },
    priority,
    customerEmotion,
    modelQuality: {
      ...quality,
      agreementRate: quality.reviewed ? quality.confirmed / quality.reviewed : null,
      byPredicted: EMOTIONS.map((e) => ({ emotion: e, ...byPredicted[e] })),
      topCorrections: [...corrections.entries()]
        .map(([k, count]) => ({ from: k.split('>')[0] as Emotion, to: k.split('>')[1] as Emotion, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    },
    moments: { byType: momentsByType, relevance },
    modality: { utterancesWithBoth: withBoth, conflicts, conflictRate: withBoth ? conflicts / withBoth : null },
    daily: days,
    attention,
  }
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/** Neutralise spreadsheet formula injection in free-text cells. */
const safe = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v)
const BOM = '\uFEFF' // makes Excel read Vietnamese diacritics correctly
const pct = (v: number | null | undefined): string => (v == null ? '' : (v * 100).toFixed(1))

const REVIEW_COLUMNS = [
  'call_id', 'title', 'agent', 'customer', 'call_date', 'provenance', 'review_status',
  'utterance_id', 'start', 'end', 'speaker', 'text',
  'acoustic_emotion', 'acoustic_confidence', 'lexical_emotion', 'lexical_confidence',
  'fused_emotion', 'fused_confidence', 'agreement',
  'reviewer_decision', 'final_emotion', 'reviewer_note', 'flagged', 'text_edited', 'speaker_edited',
]

export function exportReviewsCsv(db: DB, ids?: string[], provenance?: string): string {
  let rows = db.prepare("SELECT * FROM calls WHERE status = 'ready' ORDER BY call_date, id").all() as Row[]
  if (ids?.length) rows = rows.filter((r) => ids.includes(r.id))
  if (provenance) rows = rows.filter((r) => r.provenance === provenance)
  const out: (string | number)[][] = [REVIEW_COLUMNS]
  for (const c of rows) {
    for (const u of repo.getUtterances(db, c.id)) {
      out.push([
        c.id, safe(c.title), safe(c.agent_name), safe(c.customer_name), c.call_date, c.provenance ?? '', c.review_status,
        u.id, u.start.toFixed(2), u.end.toFixed(2), u.speaker, safe(u.text),
        u.acoustic?.emotion ?? '', pct(u.acoustic?.confidence), u.lexical?.emotion ?? '', pct(u.lexical?.confidence),
        u.fused?.emotion ?? '', pct(u.fused?.confidence), u.agreement ?? '',
        u.review.decision ?? '', finalEmotion(u) ?? '', safe(u.review.note), u.flagged ? 1 : 0,
        u.textEdited ? 1 : 0, u.speakerEdited ? 1 : 0,
      ])
    }
  }
  return BOM + stringify(out)
}

export function exportAnalyticsCsv(db: DB, f: AnalyticsFilter): string {
  const a = buildAnalytics(db, f)
  const rows: (string | number)[][] = [['section', 'key', 'value']]
  const add = (s: string, k: string, v: string | number | null) => rows.push([s, k, v ?? ''])
  add('tong_quan', 'so_cuoc_goi', a.totals.calls)
  add('tong_quan', 'so_cau_noi', a.totals.utterances)
  add('tong_quan', 'tong_thoi_luong_giay', Math.round(a.totals.durationSeconds))
  for (const [k, v] of Object.entries(a.status)) add('trang_thai_xu_ly', k, v)
  for (const [k, v] of Object.entries(a.provenance)) add('nguon_ket_qua', k, v)
  for (const [k, v] of Object.entries(a.review)) add('xem_xet', k, k === 'completionRate' ? pct(v as number) : (v as number))
  for (const [k, v] of Object.entries(a.priority)) add('uu_tien', k, v)
  for (const [k, v] of Object.entries(a.customerEmotion)) add('cam_xuc_khach_hang_sau_xem_xet', k, v)
  add('chat_luong_mo_hinh', 'cau_da_xem_xet', a.modelQuality.reviewed)
  add('chat_luong_mo_hinh', 'xac_nhan', a.modelQuality.confirmed)
  add('chat_luong_mo_hinh', 'sua', a.modelQuality.corrected)
  add('chat_luong_mo_hinh', 'ty_le_dong_thuan_pct', pct(a.modelQuality.agreementRate))
  for (const e of a.modelQuality.byPredicted) {
    add('dong_thuan_theo_cam_xuc_du_doan', `${e.emotion}_xac_nhan`, e.confirmed)
    add('dong_thuan_theo_cam_xuc_du_doan', `${e.emotion}_sua`, e.corrected)
  }
  for (const [k, v] of Object.entries(a.moments.byType)) add('khoanh_khac_quan_trong', k, v)
  for (const [k, v] of Object.entries(a.moments.relevance)) add('khoanh_khac_danh_gia', k, v)
  add('bat_dong_am_thanh_van_ban', 'cau_co_ca_hai', a.modality.utterancesWithBoth)
  add('bat_dong_am_thanh_van_ban', 'xung_dot', a.modality.conflicts)
  add('bat_dong_am_thanh_van_ban', 'ty_le_pct', pct(a.modality.conflictRate))
  return BOM + stringify(rows)
}
