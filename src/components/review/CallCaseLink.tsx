import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { addContact, caseLabels, getCase, getCases, type CaseListItem } from '@/api/service'
import { FormNotice } from '@/components/service/FormNotice'
import { useServiceForm } from '@/components/service/useServiceForm'
import { button, field, label, primary } from '@/components/service/styles'

type LinkedCase = Pick<CaseListItem, 'id' | 'title' | 'status' | 'openTaskCount'>
export function CallCaseLink({ callId, callDate }: { callId: string; callDate: string }) {
  const [linked, setLinked] = useState<LinkedCase | null>(null)
  const [lookup, setLookup] = useState<'loading' | 'known' | 'error'>('loading')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const form = useServiceForm(`link-call-${callId}`, 0, { caseId: '', actor: '' })
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLookup('loading'); setError('')
    void getCases({ callId }, controller.signal).then(result => {
      if (!controller.signal.aborted) { setLinked(result.items[0] ?? null); setLookup('known') }
    }).catch((e: Error) => { if (!controller.signal.aborted) { setError(e.message); setLookup('error') } })
    return () => controller.abort()
  }, [callId, revision])
  const link = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || lookup !== 'known' || linked) return
    setSaving(true); setError('')
    try {
      const current = await getCase(form.values.caseId.trim())
      if (!mounted.current) return
      const result = await addContact(current.case.id, { actor: form.values.actor, baseVersion: current.case.version, disposition: 'recording', direction: 'unknown', occurredAt: callDate, externalContactId: '', note: '', callId })
      if (!mounted.current) return
      form.accept({ caseId: '', actor: '' })
      setLinked({ ...result.case, openTaskCount: result.tasks.filter(task => task.status === 'pending').length })
      setLookup('known')
    } catch (e) { if (mounted.current) setError((e as Error).message) } finally { if (mounted.current) setSaving(false) }
  }
  return <section className="rounded-lg border border-[#b7cbd5] bg-white p-5">
    <h2 className="text-lg font-semibold text-[#12394d]">Vụ việc & xử lý tiếp</h2>
    <div className="mt-3"><FormNotice {...form}/></div>
    {error && <p role="alert" className="mt-3 text-sm text-red-900">{error}</p>}
    {lookup === 'loading' && <p role="status" className="mt-2 text-sm">Đang kiểm tra liên kết vụ việc…</p>}
    {lookup === 'error' && <div className="mt-3"><p className="text-sm text-slate-700">Chưa xác định được bản ghi đã liên kết hay chưa.</p><button className={button + ' mt-3'} type="button" onClick={() => setRevision(value => value + 1)}>Kiểm tra lại liên kết</button></div>}
    {lookup === 'known' && (linked ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{linked.title}</p><p className="mt-1 text-sm text-slate-700">{linked.id} · {caseLabels[linked.status]} · {linked.openTaskCount} việc đang chờ</p><p className="mt-2 text-sm text-slate-700">Theo dõi người phụ trách, thời hạn và kết quả ở vụ việc này.</p></div><Link to={'/cases/' + encodeURIComponent(linked.id)} className={primary}>Mở hồ sơ vụ việc</Link></div> : <>
      <p className="mt-2 text-sm text-slate-700">Sau khi nghe và xác nhận bằng chứng, tạo hoặc liên kết vụ việc để giao việc, đặt hạn và theo dõi các lần gọi lại.</p>
      <div className="mt-4"><Link className={primary} to={'/cases/new?callId=' + encodeURIComponent(callId)}>Tạo vụ việc từ cuộc gọi</Link></div>
      <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-teal-900">Liên kết vào vụ việc đã có</summary><form className="mt-3 grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={event => void link(event)}><label className={label}>Mã vụ việc *<input required className={field} value={form.values.caseId} maxLength={100} onChange={e => form.set({ caseId: e.target.value })} placeholder="CASE-…"/></label><label className={label}>Người ghi nhận *<input required className={field} value={form.values.actor} maxLength={120} onChange={e => form.set({ actor: e.target.value })}/></label><button className={button} disabled={saving} type="submit">{saving ? 'Đang liên kết…' : 'Liên kết bản ghi'}</button></form></details>
    </>)}
  </section>
}
