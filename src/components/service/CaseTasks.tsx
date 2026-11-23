import { useMemo, useState, type FormEvent } from 'react'
import { addTask, attemptLabels, dateLabel, isoFromLocal, recordAttempt, taskLabels, taskStatusLabels, updateTask, type AttemptOutcome, type FollowUpAttempt, type FollowUpTask, type ServiceCase, type TaskStatus } from '@/api/service'
import { localDateTime } from '@/api/workflow'
import { FormNotice } from './FormNotice'
import { TaskFields, taskInput } from './TaskFields'
import { useServiceForm } from './useServiceForm'
import { button, field, label, primary } from './styles'
import type { Perform } from './CaseEditor'
import { useServiceHasUnsaved } from './ServiceNavigationGuard'

interface Context { record: ServiceCase; actor: string; busy: boolean; perform: Perform }
export function NewTaskForm({ record, actor, busy, perform }: Context) {
  const initial = { kind: 'callback', action: '', owner: record.owner, dueAt: '' }
  const form = useServiceForm(`new-task-${record.id}`, record.version, initial)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await perform(() => addTask(record.id, { ...taskInput(form.values), actor, baseVersion: form.baseVersion }), 'Đã giao việc. Nhân viên thực hiện cuộc gọi hoặc xử lý qua hệ thống nghiệp vụ.')
    if (result) form.accept(initial, result.case.version)
  }
  return <form className="mt-4 space-y-4" onSubmit={event => void submit(event)}><FormNotice {...form}/><fieldset className="min-w-0 space-y-4 disabled:opacity-70" disabled={busy || form.stale}><TaskFields values={form.values} set={form.set}/><button className={primary} disabled={busy || !actor.trim()} type="submit">Giao việc</button></fieldset></form>
}

export function TaskRow({ task, attempts, ...context }: Context & { task: FollowUpTask; attempts: FollowUpAttempt[] }) {
  const hasUnsaved = useServiceHasUnsaved()
  const hasDraft = (kind: string) => { try { return !!sessionStorage.getItem(`isemotalk.service.${kind}-${task.id}`) } catch { return false } }
  const [action, setAction] = useState<'edit' | 'attempt' | null>(() => hasDraft('attempt') ? 'attempt' : hasDraft('edit-task') ? 'edit' : null)
  const pending = task.status === 'pending'
  const overdue = pending && Date.parse(task.dueAt) < Date.now()
  return <article className="min-w-0 border-t border-slate-300 py-5 first:border-t-0 first:pt-0">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-slate-700">{taskLabels[task.kind]} · {task.id}</p><h3 className="mt-1 whitespace-pre-wrap break-words text-lg font-semibold text-[#12394d]">{task.action}</h3><p className="mt-2 text-sm">{task.owner} · Hạn {dateLabel(task.dueAt)}</p></div><span className={'rounded border px-2 py-1 text-sm font-semibold ' + (overdue ? 'border-red-300 bg-red-50 text-red-900' : 'border-slate-300 bg-slate-50 text-slate-800')}>{overdue ? 'Quá hạn' : taskStatusLabels[task.status]}</span></div>
    {task.resultNote && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">Kết quả: {task.resultNote}</p>}
    {attempts.length > 0 && <ol className="mt-4 space-y-3 border-l-2 border-slate-300 pl-4 text-sm" aria-label="Các lần thử gọi lại">{attempts.map(attempt => <li key={attempt.id}><p className="font-semibold">{attemptLabels[attempt.outcome]} · {dateLabel(attempt.occurredAt)}</p><p className="mt-1 whitespace-pre-wrap">{attempt.actor}: {attempt.note}</p>{attempt.nextDueAt && <p className="mt-1 text-slate-700">Hẹn thử lại trước {dateLabel(attempt.nextDueAt)}</p>}</li>)}</ol>}
    {pending && context.record.status !== 'resolved' && <div className="mt-4 flex flex-wrap gap-2">{task.kind === 'callback' && <button className={primary} type="button" disabled={context.busy} onClick={() => setAction(value => value === 'attempt' ? null : 'attempt')}>Ghi nhận kết quả gọi lại</button>}<button className={button} type="button" disabled={context.busy} onClick={() => setAction(value => value === 'edit' ? null : 'edit')}>{task.kind === 'callback' ? 'Sửa hạn / phân công / hủy' : 'Cập nhật / hoàn thành'}</button></div>}
    {!pending && (action || hasDraft('attempt') || hasDraft('edit-task') || hasUnsaved(`attempt-${task.id}`) || hasUnsaved(`edit-task-${task.id}`)) && <div className="mt-3 space-y-2"><p className="text-sm text-amber-900">Công việc đã kết thúc. Bản nháp còn giữ có thể tải về để đối chiếu.</p><div className="flex flex-wrap gap-3">{task.kind === 'callback' && <button className={button} type="button" onClick={() => setAction('attempt')}>Xem bản nháp gọi lại</button>}<button className={button} type="button" onClick={() => setAction('edit')}>Xem bản nháp công việc</button></div></div>}
    <div hidden={action !== 'attempt'}>{task.kind === 'callback' && <AttemptForm task={task} {...context} busy={context.busy || !pending || context.record.status === 'resolved'} onSaved={() => setAction(null)}/>}</div>
    <div hidden={action !== 'edit'}><TaskEditor task={task} {...context} busy={context.busy || !pending || context.record.status === 'resolved'} onSaved={() => setAction(null)}/></div>
  </article>
}

function AttemptForm({ task, record, actor, busy, perform, onSaved }: Context & { task: FollowUpTask; onSaved: () => void }) {
  const initial = useMemo(() => ({ outcome: 'no_answer', note: '', occurredAt: '', nextDueAt: '' }), [])
  const form = useServiceForm(`attempt-${task.id}`, record.version, initial)
  const v = form.values
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await perform(() => recordAttempt(record.id, task.id, { actor, baseVersion: form.baseVersion, outcome: v.outcome as AttemptOutcome, note: v.note, occurredAt: isoFromLocal(v.occurredAt), ...(v.outcome !== 'connected' ? { nextDueAt: isoFromLocal(v.nextDueAt) } : {}) }), v.outcome === 'connected' ? 'Đã hoàn thành việc gọi lại. Trạng thái vụ việc vẫn do người phụ trách xác nhận.' : 'Đã lưu lần gọi chưa kết nối và hạn thử lại; công việc vẫn đang chờ.')
    if (result) { form.accept(initial, result.case.version); try { sessionStorage.removeItem(`isemotalk.service.attempt-${task.id}`) } catch { /* No stored draft. */ } onSaved() }
  }
  return <form className="mt-4 rounded-md border border-teal-300 bg-teal-50/40 p-4" onSubmit={event => void submit(event)}><h4 className="mb-3 font-semibold">Kết quả cuộc gọi do nhân viên thực hiện</h4><FormNotice {...form}/><fieldset disabled={busy || form.stale} className="min-w-0 space-y-4 disabled:opacity-70"><div className="grid gap-4 md:grid-cols-2"><label className={label}>Kết quả<select className={field} value={v.outcome} onChange={e => form.set({ outcome: e.target.value })}>{Object.entries(attemptLabels).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label><label className={label}>Thời điểm thử gọi *<input type="datetime-local" required className={field} value={v.occurredAt} onChange={e => form.set({ occurredAt: e.target.value })}/></label></div><label className={label}>Ghi nhận kết quả *<textarea rows={2} required maxLength={2000} className={field} value={v.note} onChange={e => form.set({ note: e.target.value })}/></label>{v.outcome !== 'connected' ? <label className={label}>Hạn thử lại *<input type="datetime-local" required className={field} value={v.nextDueAt} onChange={e => form.set({ nextDueAt: e.target.value })}/></label> : <p className="text-sm text-slate-700">Chỉ chọn khi đã trao đổi với khách. Hộp thư thoại / IVR có kết quả riêng. Hoàn thành việc gọi lại không tự giải quyết vụ việc.</p>}<button type="submit" disabled={busy || !actor.trim()} className={primary}>Lưu kết quả gọi lại</button></fieldset></form>
}

function TaskEditor({ task, record, actor, busy, perform, onSaved }: Context & { task: FollowUpTask; onSaved: () => void }) {
  const initial = { kind: task.kind, action: task.action, owner: task.owner, dueAt: localDateTime(task.dueAt), status: task.status, resultNote: task.resultNote }
  const form = useServiceForm(`edit-task-${task.id}`, record.version, initial)
  const v = form.values
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await perform(() => updateTask(record.id, task.id, { action: v.action, owner: v.owner, dueAt: isoFromLocal(v.dueAt), status: v.status, resultNote: v.resultNote, actor, baseVersion: form.baseVersion }), 'Đã lưu công việc và lịch sử thay đổi.')
    if (result) { form.accept(v, result.case.version); try { sessionStorage.removeItem(`isemotalk.service.edit-task-${task.id}`) } catch { /* No stored draft. */ } onSaved() }
  }
  return <form className="mt-4 rounded-md border border-slate-300 bg-slate-50 p-4" onSubmit={event => void submit(event)}><FormNotice {...form}/><fieldset disabled={busy || form.stale} className="min-w-0 space-y-4 disabled:opacity-70"><TaskFields kindEditable={false} values={v} set={patch => form.set({ ...patch, kind: task.kind })}/><label className={label}>Trạng thái công việc<select className={field} value={v.status} onChange={e => form.set({ status: e.target.value as TaskStatus })}><option value="pending">Cần thực hiện</option>{task.kind === 'backoffice' && <option value="completed">Đã hoàn thành</option>}<option value="cancelled">Hủy công việc</option></select></label><label className={label}>{v.status === 'cancelled' ? 'Lý do hủy *' : 'Ghi nhận kết quả'}<textarea required={v.status !== 'pending'} rows={2} maxLength={2000} className={field} value={v.resultNote} onChange={e => form.set({ resultNote: e.target.value })}/></label><button className={primary} type="submit" disabled={busy || !actor.trim() || !form.dirty}>Lưu công việc</button></fieldset></form>
}
