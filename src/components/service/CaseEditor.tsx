import type { FormEvent } from 'react'
import { caseLabels, updateCase, type CaseDetail, type CaseStatus, type ServiceCase } from '@/api/service'
import { FormNotice } from './FormNotice'
import { useServiceForm } from './useServiceForm'
import { field, label, primary } from './styles'

export type Perform = (operation: () => Promise<CaseDetail>, message: string) => Promise<CaseDetail | null>
export function CaseEditor({ record, actor, busy, perform }: { record: ServiceCase; actor: string; busy: boolean; perform: Perform }) {
  const initial = { title: record.title, customerName: record.customerName, customerRef: record.customerRef, queueName: record.queueName, externalTicketId: record.externalTicketId, reason: record.reason, owner: record.owner, status: record.status, outcomeNote: record.outcomeNote, changeNote: '' }
  const form = useServiceForm(`case-${record.id}`, record.version, initial)
  const v = form.values
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await perform(() => updateCase(record.id, { ...v, actor, baseVersion: form.baseVersion }), 'Đã lưu hồ sơ vụ việc và lịch sử.')
    if (result) form.accept({ ...v, changeNote: '' }, result.case.version)
  }
  return <form className="mt-4 space-y-4" onSubmit={event => void submit(event)}><FormNotice {...form}/><fieldset disabled={busy || form.stale} className="min-w-0 space-y-4 disabled:opacity-70">
    <label className={label}>Tiêu đề *<input required maxLength={200} className={field} value={v.title} onChange={e => form.set({ title: e.target.value })}/></label>
    <label className={label}>Nội dung cần xử lý<textarea rows={3} maxLength={3000} className={field} value={v.reason} onChange={e => form.set({ reason: e.target.value })}/></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className={label}>Khách hàng<input maxLength={120} className={field} value={v.customerName} onChange={e => form.set({ customerName: e.target.value })}/></label><label className={label}>Mã khách / đơn tham chiếu<input maxLength={160} className={field} value={v.customerRef} onChange={e => form.set({ customerRef: e.target.value })}/></label><label className={label}>Người phụ trách<input maxLength={120} className={field} value={v.owner} onChange={e => form.set({ owner: e.target.value })}/></label><label className={label}>Bộ phận / hàng đợi<input maxLength={120} className={field} value={v.queueName} onChange={e => form.set({ queueName: e.target.value })}/></label><label className={label}>Ticket ngoài hệ thống<input maxLength={160} className={field} value={v.externalTicketId} onChange={e => form.set({ externalTicketId: e.target.value })}/></label><label className={label}>Trạng thái vụ việc<select className={field} value={v.status} onChange={e => form.set({ status: e.target.value as CaseStatus })}>{Object.entries(caseLabels).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label></div>
    <label className={label}>Kết quả xử lý{v.status === 'resolved' ? ' *' : ''}<textarea rows={3} required={v.status === 'resolved'} maxLength={3000} className={field} value={v.outcomeNote} onChange={e => form.set({ outcomeNote: e.target.value })}/></label>
    <label className={label}>Lý do thay đổi{record.status === 'resolved' && v.status !== 'resolved' ? ' / mở lại *' : ''}<textarea rows={2} required={record.status === 'resolved' && v.status !== 'resolved'} maxLength={2000} className={field} value={v.changeNote} onChange={e => form.set({ changeNote: e.target.value })}/></label>
    <p className="text-sm text-slate-700">Để giải quyết vụ việc, cần ghi kết quả và hoàn thành hoặc hủy rõ lý do các việc đang chờ.</p>
    <button className={primary} disabled={busy || !actor.trim() || !form.dirty} type="submit">Lưu hồ sơ vụ việc</button>
  </fieldset></form>
}
