import { z } from 'zod'
import type { DB } from './db'
import { EMOTIONS, detectMoments } from './domain'
import * as repo from './repo'

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message)
  }
}

const Emotion = z.enum(EMOTIONS)

export const ReviewBody = z.object({
  baseVersion: z.number().int(),
  utterances: z
    .record(
      z.string(),
      z.object({
        decision: z.enum(['confirmed', 'corrected']).nullable().optional(),
        emotion: Emotion.nullable().optional(),
        note: z.string().max(2000).optional(),
        flagged: z.boolean().optional(),
        text: z.string().max(4000).optional(),
        speaker: z.enum(['agent', 'customer', 'unknown']).optional(),
      }),
    )
    .default({}),
  moments: z
    .record(z.string(), z.object({ relevance: z.boolean().nullable(), note: z.string().max(2000).optional() }))
    .default({}),
  overallNote: z.string().max(5000).optional(),
  /** true → mark reviewed, false → reopen, undefined → derive from activity */
  complete: z.boolean().optional(),
})
export type ReviewInput = z.infer<typeof ReviewBody>

/**
 * Applies a batch of reviewer decisions atomically.
 * The client sends its draft plus the version it started from; if someone else
 * saved in between we refuse with 409 instead of silently overwriting.
 */
export function applyReview(db: DB, callId: string, input: ReviewInput): repo.CallDetail {
  const tx = db.transaction(() => {
    const row = repo.getCallRow(db, callId)
    if (!row) throw new HttpError(404, 'Không tìm thấy cuộc gọi.')
    if (row.status !== 'ready') throw new HttpError(409, 'Cuộc gọi chưa xử lý xong nên chưa thể xem xét.')
    if (row.version !== input.baseVersion)
      throw new HttpError(409, 'Cuộc gọi đã được cập nhật ở nơi khác. Hãy tải lại trước khi lưu.', { code: 'version_conflict', currentVersion: row.version })

    const existing = new Map(repo.getUtterances(db, callId).map((u) => [u.id, u]))
    const upd = db.prepare(
      `UPDATE utterances SET text=?, speaker=?, review_decision=?, review_emotion=?, review_note=?, flagged=? WHERE call_id=? AND id=?`,
    )
    for (const [uid, patch] of Object.entries(input.utterances)) {
      const u = existing.get(uid)
      if (!u) throw new HttpError(400, `Không có câu nói "${uid}" trong cuộc gọi này.`)

      let decision = u.review.decision
      let emotion = u.review.emotion
      if (patch.decision !== undefined) {
        decision = patch.decision
        emotion = patch.decision === 'corrected' ? (patch.emotion ?? null) : null
        if (decision === 'corrected' && !emotion) throw new HttpError(400, `Câu "${uid}": cần chọn cảm xúc khi sửa.`)
        if (decision === 'corrected' && emotion === u.fused?.emotion)
          throw new HttpError(400, `Câu "${uid}": cảm xúc sửa trùng với dự đoán, hãy dùng "xác nhận".`)
        if (decision === 'confirmed' && !u.fused) throw new HttpError(400, `Câu "${uid}": chưa có dự đoán để xác nhận.`)
      }
      const text = patch.text !== undefined ? patch.text.trim() : u.text
      if (!text) throw new HttpError(400, `Câu "${uid}": nội dung không được để trống.`)
      upd.run(
        text,
        patch.speaker ?? u.speaker,
        decision,
        emotion,
        patch.note !== undefined ? patch.note.trim() : u.review.note,
        (patch.flagged ?? u.flagged) ? 1 : 0,
        callId,
        uid,
      )
    }

    const valid = new Set(detectMoments(repo.getUtterances(db, callId)).map((m) => m.id))
    const mup = db.prepare(
      `INSERT INTO moment_reviews (call_id, moment_id, relevance, note) VALUES (?,?,?,?)
       ON CONFLICT(call_id, moment_id) DO UPDATE SET relevance=excluded.relevance, note=excluded.note`,
    )
    for (const [mid, m] of Object.entries(input.moments)) {
      if (!valid.has(mid)) throw new HttpError(400, `Không có khoảnh khắc "${mid}" trong cuộc gọi này.`)
      mup.run(callId, mid, m.relevance === null ? null : m.relevance ? 1 : 0, (m.note ?? '').trim())
    }

    const active =
      (db
        .prepare(
          `SELECT COUNT(*) AS n FROM utterances WHERE call_id=? AND (review_decision IS NOT NULL OR flagged=1
             OR review_note != ? OR text != orig_text OR speaker != orig_speaker)`,
        )
        .get(callId, '') as { n: number }).n > 0 ||
      (db.prepare('SELECT COUNT(*) AS n FROM moment_reviews WHERE call_id=? AND (relevance IS NOT NULL OR note != ?)').get(callId, '') as { n: number }).n > 0

    let reviewStatus = row.review_status as string
    if (input.complete === true) reviewStatus = 'reviewed'
    else if (input.complete === false) reviewStatus = 'in_progress'
    else if (reviewStatus !== 'reviewed') reviewStatus = active ? 'in_progress' : 'unreviewed'

    repo.refreshDerived(db, callId) // speaker edits change the customer arc
    repo.updateCall(db, callId, {
      reviewStatus,
      overallNote: input.overallNote !== undefined ? input.overallNote.trim() : row.overall_note,
      reviewedAt: reviewStatus === 'reviewed' ? new Date().toISOString() : null,
      version: row.version + 1,
    })
  })
  tx()
  return repo.getCallDetail(db, callId)!
}
