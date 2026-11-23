import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ApiError, getCall } from '@/api/isemotalk'
import { createCase, type CaseFields } from '@/api/service'
import { getWorkflow, localDateTime } from '@/api/workflow'
import { ContactFields, contactInput, type ContactValues } from '@/components/service/ContactFields'
import { TaskFields, taskInput, type TaskValues } from '@/components/service/TaskFields'
import { FormNotice } from '@/components/service/FormNotice'
import { useServiceForm } from '@/components/service/useServiceForm'
import { button, field, label, panel, primary } from '@/components/service/styles'

interface Seed { title: string; customerName: string; owner: string; reason: string; queueName: string; externalTicketId: string; externalContactId: string; occurredAt: string; taskOwner: string; action: string; dueAt: string }
const emptySeed: Seed = { title: '', customerName: '', owner: '', reason: '', queueName: '', externalTicketId: '', externalContactId: '', occurredAt: '', taskOwner: '', action: '', dueAt: '' }

export function NewCasePage() {
  const [params] = useSearchParams()
  const callId = params.get('callId') ?? ''
  const [seed, setSeed] = useState<Seed | null>(callId ? null : emptySeed)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!callId) { setSeed(emptySeed); return }
    const controller = new AbortController()
    setSeed(null); setError('')
    void Promise.all([getCall(callId, controller.signal), getWorkflow(callId, controller.signal)]).then(([call, workflow]) => {
      if (!controller.signal.aborted) setSeed({ title: call.title, customerName: call.customerName, owner: workflow.owner, reason: workflow.reason, queueName: workflow.queueName, externalTicketId: workflow.ticketId, externalContactId: workflow.externalContactId, occurredAt: localDateTime(call.callDate), taskOwner: workflow.owner, action: workflow.nextAction, dueAt: localDateTime(workflow.followUpAt) })
    }).catch((e: Error) => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [callId])
  return <div className="mx-auto max-w-5xl space-y-5"><Link className="inline-flex items-center gap-2 text-sm font-semibold text-teal-900" to="/cases"><ArrowLeft size={18}/> Vụ việc</Link><header><h1 className="text-3xl font-semibold tracking-tight text-[#12394d]">Tạo vụ việc</h1><p className="mt-2 text-slate-700">Ghi nhận một vấn đề cần theo dõi qua nhiều lần liên hệ.</p></header>{error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-red-900">{error}</p>}{!seed && !error && <p role="status">Đang lấy thông tin cuộc gọi…</p>}{seed && <NewCaseForm key={callId || 'new'} seed={seed} callId={callId}/>}</div>
}

function NewCaseForm({ seed, callId }: { seed: Seed; callId: string }) {
  const navigate = useNavigate()
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const initial = useMemo(() => ({ requestId: crypto.randomUUID(), title: seed.title, customerName: seed.customerName, customerRef: '', queueName: seed.queueName, externalTicketId: seed.externalTicketId, reason: seed.reason, owner: seed.owner, actor: '', withContact: true, contactDisposition: callId ? 'recording' : 'callback_requested', contactDirection: callId ? 'unknown' : 'inbound', contactAt: seed.occurredAt, contactExternalId: seed.externalContactId, contactNote: '', callId, withTask: false, taskKind: 'callback', taskAction: seed.action, taskOwner: seed.taskOwner, taskDueAt: seed.dueAt }), [seed, callId])
  const form = useServiceForm(`new-case-${callId || 'manual'}`, 0, initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const conflict = error instanceof ApiError && error.status === 409 && error.code === 'creation_request_conflict' ? error : null
  const startSeparateCase = () => {
    form.set({ requestId: crypto.randomUUID() })
    setError(null)
  }
  const v = form.values
  const contact = { disposition: v.contactDisposition, direction: v.contactDirection, occurredAt: v.contactAt, externalContactId: v.contactExternalId, note: v.contactNote, callId: v.callId }
  const task = { kind: v.taskKind, action: v.taskAction, owner: v.taskOwner, dueAt: v.taskDueAt }
  const setContact = (patch: Partial<ContactValues>) => form.set({ contactDisposition: patch.disposition ?? v.contactDisposition, contactDirection: patch.direction ?? v.contactDirection, contactAt: patch.occurredAt ?? v.contactAt, contactExternalId: patch.externalContactId ?? v.contactExternalId, contactNote: patch.note ?? v.contactNote, callId: patch.callId ?? v.callId })
  const setTask = (patch: Partial<TaskValues>) => form.set({ taskKind: patch.kind ?? v.taskKind, taskAction: patch.action ?? v.taskAction, taskOwner: patch.owner ?? v.taskOwner, taskDueAt: patch.dueAt ?? v.taskDueAt })
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || conflict) return
    setSaving(true); setError(null)
    try {
      const fields: CaseFields = { title: v.title, customerName: v.customerName, customerRef: v.customerRef, queueName: v.queueName, externalTicketId: v.externalTicketId, reason: v.reason, owner: v.owner, status: 'open', outcomeNote: '' }
      const result = await createCase({ ...fields, actor: v.actor, requestId: v.requestId, ...(v.withContact ? { contact: contactInput(contact) } : {}), ...(v.withTask ? { task: taskInput(task) } : {}) })
      if (!mounted.current) {
        try {
          const key = `isemotalk.service.new-case-${callId || 'manual'}`
          const submitted = JSON.stringify({ baseVersion: form.baseVersion, values: v })
          if (sessionStorage.getItem(key) === submitted) sessionStorage.removeItem(key)
        } catch { /* The idempotency key also prevents a replay from creating a duplicate. */ }
        return
      }
      form.accept(initial)
      // Clear synchronously before navigation: unmount must not leave a submitted draft.
      try { sessionStorage.removeItem(`isemotalk.service.new-case-${callId || 'manual'}`) } catch { /* No stored draft. */ }
      navigate('/cases/' + encodeURIComponent(result.case.id))
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e : new Error('Không thể tạo vụ việc.'))
    } finally { if (mounted.current) setSaving(false) }
  }
  return <form onSubmit={event => void submit(event)} className="space-y-5">
    <FormNotice {...form}/>
    {callId && <p className="rounded-md border border-teal-300 bg-teal-50 p-3 text-sm text-teal-950">Thông tin từ {callId} được điền để bạn kiểm tra. Vụ việc và công việc chỉ được tạo khi bạn lưu; ghi chú cũ của cuộc gọi vẫn được giữ.</p>}
    {error && <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-red-900">
      <p className="whitespace-pre-wrap">{error.message}</p>
      {conflict && <>
        <p className="mt-2">Bạn có thể mở vụ việc đã tạo. Nếu nội dung đang nhập là một vụ việc khác, chọn tạo thành vụ việc mới rồi kiểm tra và lưu.</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {conflict.caseId && <Link className="font-semibold underline" to={'/cases/' + encodeURIComponent(conflict.caseId)}>Mở vụ việc {conflict.caseId}</Link>}
          <button type="button" className={button} onClick={startSeparateCase}>Tạo thành vụ việc mới</button>
        </div>
      </>}
    </div>}
    <fieldset disabled={saving || form.stale} className="min-w-0 space-y-5 disabled:opacity-70">
      <section className={panel + ' space-y-4'}><h2 className="text-xl font-semibold">Vấn đề của khách</h2><label className={label}>Tiêu đề vụ việc *<input className={field} required maxLength={200} value={v.title} onChange={e => form.set({ title: e.target.value })} placeholder="Ví dụ: Hoàn tiền đơn hàng chưa về tài khoản"/></label><label className={label}>Nội dung cần xử lý<textarea className={field} maxLength={3000} rows={3} value={v.reason} onChange={e => form.set({ reason: e.target.value })}/></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className={label}>Tên khách hàng<input className={field} maxLength={120} value={v.customerName} onChange={e => form.set({ customerName: e.target.value })}/></label><label className={label}>Mã khách / mã đơn tham chiếu<input className={field} maxLength={160} value={v.customerRef} onChange={e => form.set({ customerRef: e.target.value })}/></label><label className={label}>Người phụ trách vụ việc<input className={field} maxLength={120} value={v.owner} onChange={e => form.set({ owner: e.target.value })}/></label><label className={label}>Bộ phận / hàng đợi<input className={field} maxLength={120} value={v.queueName} onChange={e => form.set({ queueName: e.target.value })}/></label><label className={label}>Ticket ở hệ thống khác<input className={field} maxLength={160} value={v.externalTicketId} onChange={e => form.set({ externalTicketId: e.target.value })}/></label><label className={label}>Người ghi nhận *<input className={field} required maxLength={120} value={v.actor} onChange={e => form.set({ actor: e.target.value })}/><span className="mt-1 block text-sm font-normal text-slate-700">Tên tự khai trong bản local.</span></label></div>
      </section>
      <section className={panel}><label className="flex items-center gap-3 text-lg font-semibold"><input type="checkbox" checked={v.withContact} onChange={e => form.set({ withContact: e.target.checked })} className="h-4 w-4"/> Ghi nhận lần liên hệ đầu tiên</label>{v.withContact && <div className="mt-5"><ContactFields values={contact} set={setContact}/></div>}</section>
      <section className={panel}><label className="flex items-center gap-3 text-lg font-semibold"><input type="checkbox" checked={v.withTask} onChange={e => form.set({ withTask: e.target.checked })} className="h-4 w-4"/> Giao việc tiếp theo</label><p className="mt-2 text-sm text-slate-700">Yêu cầu gọi lại cần được giao cho người phụ trách và có hạn thực hiện.</p>{v.withTask && <div className="mt-5"><TaskFields values={task} set={setTask}/></div>}</section>
      <div className="flex flex-wrap items-center justify-between gap-3"><Link className={button} to="/cases">Quay lại danh sách</Link><button type="submit" className={primary} disabled={saving || !!conflict}>{saving ? 'Đang tạo…' : 'Tạo vụ việc và lưu thông tin'}</button></div>
    </fieldset>
  </form>
}
