import type { Express } from 'express'
import { z } from 'zod'
import type { DB } from './db'
import { getCallRow } from './repo'
import { HttpError } from './review'

const Resolution = z.enum(['unassessed', 'open', 'follow_up', 'resolved'])
const shortText = (max: number) => z.string().trim().max(max).default('')
const Fields = z.object({
  externalContactId: shortText(160),
  ticketId: shortText(160),
  queueName: shortText(120),
  reason: shortText(1000),
  resolution: Resolution.default('unassessed'),
  nextAction: shortText(2000),
  owner: shortText(120),
  followUpAt: z.union([z.string().datetime({ offset: true }), z.literal(''), z.null()]).default(null),
  outcomeNote: shortText(3000),
  reviewerName: z.string().trim().min(1, 'Cần ghi tên người cập nhật.').max(120),
})
const WorkflowBody = Fields.extend({ baseVersion: z.number().int().min(0) }).strict().superRefine((v, ctx) => {
  if (v.resolution === 'follow_up') {
    if (!v.owner) ctx.addIssue({ code: 'custom', path: ['owner'], message: 'Cần người phụ trách gọi lại.' })
    if (!v.nextAction) ctx.addIssue({ code: 'custom', path: ['nextAction'], message: 'Cần ghi việc cần làm tiếp.' })
    if (!v.followUpAt) ctx.addIssue({ code: 'custom', path: ['followUpAt'], message: 'Cần hạn gọi lại.' })
  }
  if (v.resolution === 'resolved' && !v.outcomeNote) {
    ctx.addIssue({ code: 'custom', path: ['outcomeNote'], message: 'Cần ghi kết quả trước khi đóng vụ việc.' })
  }
})

type WorkflowFields = Omit<z.infer<typeof Fields>, 'followUpAt'> & { followUpAt: string | null }
interface WorkflowEvent {
  version: number
  at: string
  reviewerName: string
  changedFields: string[]
  resolution: WorkflowFields['resolution']
  outcomeNote: string
  nextAction: string
  owner: string
  followUpAt: string | null
  schemaVersion?: 2
  snapshot?: WorkflowFields
  snapshotStatus?: 'complete' | 'legacy_partial'
}
export interface CallWorkflow extends WorkflowFields {
  callId: string
  version: number
  updatedAt: string | null
  history: WorkflowEvent[]
}

const emptyFields = (): WorkflowFields => ({
  externalContactId: '', ticketId: '', queueName: '', reason: '', resolution: 'unassessed',
  nextAction: '', owner: '', followUpAt: null, outcomeNote: '', reviewerName: '',
})

export function getWorkflow(db: DB, callId: string, options: { fullHistory?: boolean } = {}): CallWorkflow {
  if (!getCallRow(db, callId)) throw new HttpError(404, 'Không tìm thấy cuộc gọi.')
  const row = db.prepare('SELECT version, fields_json, updated_at FROM call_workflows WHERE call_id=?').get(callId) as
    { version: number; fields_json: string; updated_at: string } | undefined
  const history = db.prepare(`SELECT event_json FROM workflow_events WHERE call_id=? ORDER BY version DESC${options.fullHistory ? '' : ' LIMIT 50'}`).all(callId) as Array<{ event_json: string }>
  return {
    ...emptyFields(), ...(row ? JSON.parse(row.fields_json) as WorkflowFields : {}),
    callId, version: row?.version ?? 0, updatedAt: row?.updated_at ?? null,
    history: history.map(e => {
      const event = JSON.parse(e.event_json) as WorkflowEvent
      // Older events stored selected outcome fields only. Preserve their bytes
      // and expose that limitation instead of borrowing values from today's form.
      return { ...event, snapshotStatus: event.schemaVersion === 2 && event.snapshot != null ? 'complete' as const : 'legacy_partial' as const }
    }),
  }
}

export function saveWorkflow(db: DB, callId: string, body: unknown): CallWorkflow {
  const input = WorkflowBody.parse(body)
  return db.transaction(() => {
    const current = getWorkflow(db, callId)
    if (current.version !== input.baseVersion) {
      throw new HttpError(409, 'Hồ sơ đã được cập nhật ở nơi khác. Bản đang sửa vẫn được giữ; tải lại trước khi lưu.', {
        code: 'version_conflict', currentVersion: current.version,
      })
    }
    const { baseVersion, ...provided } = input
    const fields: WorkflowFields = {
      ...provided,
      followUpAt: provided.resolution === 'follow_up' && provided.followUpAt ? new Date(provided.followUpAt).toISOString() : null,
    }
    const changedFields = (Object.keys(fields) as Array<keyof WorkflowFields>).filter(k => fields[k] !== current[k])
    if (changedFields.length === 0) return current
    const version = baseVersion + 1
    const at = new Date().toISOString()
    db.prepare(`INSERT INTO call_workflows(call_id, version, fields_json, updated_at) VALUES (?,?,?,?)
      ON CONFLICT(call_id) DO UPDATE SET version=excluded.version, fields_json=excluded.fields_json, updated_at=excluded.updated_at`)
      .run(callId, version, JSON.stringify(fields), at)
    const event: WorkflowEvent = {
      version, at, reviewerName: fields.reviewerName, changedFields, resolution: fields.resolution,
      outcomeNote: fields.outcomeNote, nextAction: fields.nextAction, owner: fields.owner, followUpAt: fields.followUpAt,
      schemaVersion: 2, snapshot: fields, snapshotStatus: 'complete',
    }
    db.prepare('INSERT INTO workflow_events(call_id, version, at, event_json) VALUES (?,?,?,?)')
      .run(callId, version, at, JSON.stringify(event))
    return getWorkflow(db, callId)
  })()
}

export function attachWorkflowRoutes(app: Express, db: DB) {
  app.get('/api/calls/:id/workflow', (req, res) => res.json(getWorkflow(db, req.params.id)))
  app.put('/api/calls/:id/workflow', (req, res) => res.json(saveWorkflow(db, req.params.id, req.body)))
}
