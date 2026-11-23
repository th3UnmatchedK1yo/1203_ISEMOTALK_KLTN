import { z } from 'zod'
import { attemptOutcomes, caseStatuses, contactDirections, contactDispositions, taskKinds, taskStatuses } from '../../shared/service-contract'

const text = (max: number) => z.string().trim().max(max).refine(s => !s.includes('\0'), 'Ký tự không hợp lệ.')
const required = (max: number) => text(max).refine(s => s.length > 0, 'Cần nhập nội dung.')
// Accept an explicit offset only. The date validator rejects impossible calendar
// dates before Date can silently normalize them to the next month.
const utc = z.iso.datetime({ offset: true }).transform(s => new Date(s).toISOString()).refine(s => s.length === 24)
const actor = required(120)
const id = required(160)
const version = z.number().int().min(1)
const mutation = { actor, baseVersion: version }
const fields = {
  title: required(200), customerName: text(120), customerRef: text(160), queueName: text(120),
  externalTicketId: text(160), reason: text(3000), owner: text(120), status: z.enum(caseStatuses), outcomeNote: text(3000),
}
const contact = {
  direction: z.enum(contactDirections), disposition: z.enum(contactDispositions), occurredAt: utc,
  externalContactId: text(160).default(''), note: text(2000).default(''), callId: id.nullish(),
}
const task = { kind: z.enum(taskKinds), action: required(2000), owner: required(120), dueAt: utc }
function validContact(value: { disposition: string; callId?: string | null }) {
  return (value.disposition === 'recording') === Boolean(value.callId)
}
const sourceMessage = { message: 'Liên hệ có bản ghi cần mã cuộc gọi. Các hình thức khác phải để trống mã cuộc gọi.', path: ['callId'] }
export const CreateCase = z.strictObject({
  title: fields.title, customerName: fields.customerName.default(''), customerRef: fields.customerRef.default(''),
  queueName: fields.queueName.default(''), externalTicketId: fields.externalTicketId.default(''),
  reason: fields.reason.default(''), owner: fields.owner.default(''), outcomeNote: fields.outcomeNote.default(''),
  status: z.literal('open').default('open'), actor, requestId: required(128).optional(),
  contact: z.strictObject(contact).refine(validContact, sourceMessage).optional(), task: z.strictObject(task).optional(),
})
export const EditCase = z.strictObject({ ...fields, ...mutation, changeNote: text(2000).default('') })
export const AddContact = z.strictObject({ ...contact, ...mutation }).refine(validContact, sourceMessage)
export const AddTask = z.strictObject({ ...task, ...mutation })
export const EditTask = z.strictObject({
  ...mutation, action: task.action, owner: task.owner, dueAt: utc, status: z.enum(taskStatuses), resultNote: text(2000),
}).refine(v => v.status === 'pending' || !!v.resultNote, { message: 'Cần ghi kết quả hoặc lý do hủy.', path: ['resultNote'] })
export const AddAttempt = z.strictObject({
  ...mutation, outcome: z.enum(attemptOutcomes), note: required(2000), occurredAt: utc.optional(), nextDueAt: utc.nullish(),
})
// Record shapes describe historical snapshots, including a recording whose live FK is now NULL.
const caseRecord = z.strictObject({ ...fields, id, version, createdAt: utc, updatedAt: utc, resolvedAt: utc.nullable() })
const contactRecord = z.strictObject({ ...contact, id, caseId: id, recordedCallId: id.nullable(), callId: id.nullable(),
  source: z.enum(['manual','recording_import']), createdAt: utc })
const taskRecord = z.strictObject({ ...task, id, caseId: id, status: z.enum(taskStatuses), resultNote: text(2000), createdAt: utc, updatedAt: utc })
const attemptRecord = z.strictObject({ id, caseId: id, taskId: id, actor, occurredAt: utc, outcome: z.enum(attemptOutcomes), note: required(2000), nextDueAt: utc.nullable() })
export const EventSnapshot = z.strictObject({ case: caseRecord, contact: contactRecord.optional(), task: taskRecord.optional(), attempt: attemptRecord.optional() })
const page = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(1_000_000))
export const ListQuery = z.strictObject({
  page: page.default(1), pageSize: page.pipe(z.number().max(100)).default(25),
  status: z.enum(caseStatuses).optional(), search: text(200).optional(), owner: text(120).optional(),
  overdue: z.enum(['1','0']).optional(), callId: id.optional(),
})
export type CaseQuery = z.infer<typeof ListQuery>
