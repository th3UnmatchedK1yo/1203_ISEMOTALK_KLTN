import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BriefcaseBusiness, History, Save } from 'lucide-react'
import { ApiError } from '@/api/isemotalk'
import { getWorkflow, saveWorkflow, workflowFields, localDateTime, resolutionLabels, type CallWorkflow, type WorkflowFields, type Resolution } from '@/api/workflow'
import { parseWorkflowDraft, persistWorkflowDraft, workflowDraftKey as draftKey, type WorkflowDraft as LocalDraft } from '@/lib/workflowDraft'

const inputClass = 'mt-1 w-full min-w-0 rounded-md border border-slate-400 bg-white px-3 py-2 text-base text-slate-900'
const fieldNames: Record<string, string> = {
  externalContactId: 'mã liên hệ', ticketId: 'mã ticket', queueName: 'hàng đợi', reason: 'lý do gọi',
  resolution: 'kết quả xử lý', nextAction: 'việc cần làm', owner: 'người phụ trách', followUpAt: 'hạn gọi lại', outcomeNote: 'ghi nhận kết quả', reviewerName: 'người cập nhật',
}
function readDraft(id: string): LocalDraft | null {
  try { return parseWorkflowDraft(sessionStorage.getItem(draftKey(id))) } catch { return null }
}
function clearDraft(id: string) { try { sessionStorage.removeItem(draftKey(id)) } catch { /* private browser storage may be disabled */ } }

export function CallWorkflowPanel({ callId }: { callId: string }) {
  const [saved, setSaved] = useState<CallWorkflow | null>(null)
  const [fields, setFields] = useState<WorkflowFields | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const [stale, setStale] = useState<LocalDraft | null>(null)
  const [retry, setRetry] = useState(0)
  const current = useRef(0)
  const saveController = useRef<AbortController | null>(null)

  useEffect(() => {
    const generation = ++current.current
    const controller = new AbortController()
    setSaved(null); setFields(null); setDirty(false); setSaving(false); setStale(null); setStorageError(false); setError(''); setMessage('')
    void getWorkflow(callId, controller.signal).then(next => {
      if (generation !== current.current) return
      setSaved(next)
      const local = readDraft(callId)
      if (local && local.baseVersion === next.version) {
        setFields(local.fields); setDirty(true); setMessage('Đã khôi phục hồ sơ đang sửa trong phiên này.')
      } else {
        setFields(workflowFields(next)); setStale(local)
      }
    }).catch((e: Error) => { if (!controller.signal.aborted && generation === current.current) setError(e.message) })
    return () => { current.current++; controller.abort(); saveController.current?.abort() }
  }, [callId, retry])

  useEffect(() => {
    if (!dirty || !fields || !saved || stale) return
    try {
      if (!persistWorkflowDraft(sessionStorage, callId, { baseVersion: saved.version, fields })) setStale(readDraft(callId))
      setStorageError(false)
    } catch { setStorageError(true) }
  }, [dirty, fields, saved, callId, stale])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    if (!storageError || !dirty) return
    const guard = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (link && !link.hasAttribute('download') && !window.confirm('Bản nháp hồ sơ chưa được giữ trong trình duyệt. Rời trang và bỏ các thay đổi chưa lưu?')) {
        event.preventDefault(); event.stopPropagation()
      }
    }
    document.addEventListener('click', guard, true)
    return () => document.removeEventListener('click', guard, true)
  }, [storageError, dirty])

  const update = (patch: Partial<WorkflowFields>) => { if (stale || saving) return; setFields(f => f ? { ...f, ...patch } : f); setDirty(true); setMessage('') }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!fields || !saved || saving || stale) return
    const generation = current.current
    const controller = new AbortController()
    saveController.current = controller
    setSaving(true); setError(''); setMessage('')
    try {
      const next = await saveWorkflow(callId, saved.version, fields, controller.signal)
      if (generation !== current.current) return
      setSaved(next); setFields(workflowFields(next)); setDirty(false); setStale(null); clearDraft(callId)
      setMessage('Đã lưu hồ sơ xử lý và lịch sử thay đổi.')
    } catch (e) {
      if (generation !== current.current || controller.signal.aborted) return
      const err = e as ApiError
      setError(err.code === 'version_conflict' ? 'Hồ sơ đã thay đổi ở tab khác. Bản đang sửa được giữ. Tải bản nháp về trước khi nạp hồ sơ mới.' : err.message)
    } finally { if (generation === current.current) setSaving(false) }
  }
  const exportDraft = () => {
    const body = stale ?? (fields && saved ? { baseVersion: saved.version, fields } : null)
    if (!body) return
    const url = URL.createObjectURL(new Blob([JSON.stringify({ callId, ...body }, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `${callId}-workflow-draft.json`; a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const reload = () => {
    if ((dirty || stale) && !window.confirm('Nạp hồ sơ đã lưu sẽ bỏ bản nháp đang giữ. Bạn đã tải bản nháp cần giữ chưa?')) return
    clearDraft(callId); setRetry(n => n + 1)
  }
  const overdue = saved?.resolution === 'follow_up' && saved.followUpAt && Date.parse(saved.followUpAt) < Date.now()

  return <details className="rounded-lg border border-[#b7cbd5] bg-white" open={stale ? true : undefined}>
    <summary className="cursor-pointer px-5 py-4 text-[#102D43] marker:text-teal-800">
      <span className="ml-1 inline-flex flex-wrap items-center gap-x-3 gap-y-1 align-middle">
        <BriefcaseBusiness size={20} aria-hidden="true"/><span className="font-semibold">Hồ sơ xử lý sau cuộc gọi</span>
        {saved && <span className="text-sm text-slate-700">{saved.ticketId ? `${saved.ticketId} · ` : ''}{resolutionLabels[saved.resolution]}</span>}
        {overdue && <span className="text-sm font-semibold text-red-800">Quá hạn gọi lại</span>}
        {dirty && <span className="text-sm font-medium text-amber-800">Chưa lưu</span>}
      </span>
    </summary>
    <div className="border-t border-[#d4e0e6] p-5">
      <p className="mb-4 text-sm leading-relaxed text-slate-700">Ghi nhận bối cảnh và việc cần làm tiếp. Kết quả xử lý do người phụ trách xác nhận; cảm xúc và trạng thái QA không tự đóng vụ việc.</p>
      {error && <div role="alert" className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}<div className="mt-2 flex flex-wrap gap-4"><button type="button" className="underline" onClick={reload}>Nạp hồ sơ đã lưu</button>{fields && <button type="button" className="underline" onClick={exportDraft}>Tải bản nháp về</button>}</div></div>}
      {stale && <div role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Có bản nháp từ phiên bản cũ. Hệ thống tạm khóa chỉnh sửa để giữ bản nháp; tải về để đối chiếu trước khi nhập lại.<div className="mt-2 flex flex-wrap gap-4"><button type="button" className="underline" onClick={exportDraft}>Tải bản nháp</button><button type="button" className="underline" onClick={reload}>Bỏ bản nháp cũ và nạp hồ sơ</button></div></div>}
      {storageError && dirty && <div role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Không giữ được bản nháp trong trình duyệt. Hãy lưu hồ sơ hoặc tải bản nháp trước khi rời trang.<button type="button" className="ml-2 underline" onClick={exportDraft}>Tải bản nháp về</button></div>}
      {!fields && !error && <p role="status" className="text-sm text-slate-700">Đang tải hồ sơ…</p>}
      {fields && <form onSubmit={e => void submit(e)}>
        <fieldset disabled={saving || !!stale} className="min-w-0 space-y-4 disabled:opacity-70">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium">Mã liên hệ từ tổng đài<input value={fields.externalContactId} onChange={e => update({ externalContactId: e.target.value })} maxLength={160} className={inputClass} placeholder="Chưa liên kết"/></label>
            <label className="text-sm font-medium">Mã ticket / vụ việc<input value={fields.ticketId} onChange={e => update({ ticketId: e.target.value })} maxLength={160} className={inputClass} placeholder="Mã trong hệ thống hỗ trợ"/></label>
            <label className="text-sm font-medium">Hàng đợi / bộ phận<input value={fields.queueName} onChange={e => update({ queueName: e.target.value })} maxLength={120} className={inputClass} placeholder="Ví dụ: Hậu mãi"/></label>
          </div>
          <label className="block text-sm font-medium">Lý do liên hệ<textarea value={fields.reason} onChange={e => update({ reason: e.target.value })} rows={2} maxLength={1000} className={inputClass}/></label>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium">Trạng thái vụ việc<select value={fields.resolution} onChange={e => update({ resolution: e.target.value as Resolution, ...(e.target.value !== 'follow_up' ? { followUpAt: null } : {}) })} className={inputClass}>{Object.entries(resolutionLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="text-sm font-medium">Người phụ trách{fields.resolution === 'follow_up' ? ' *' : ''}<input value={fields.owner} onChange={e => update({ owner: e.target.value })} required={fields.resolution === 'follow_up'} maxLength={120} className={inputClass}/></label>
            <label className="text-sm font-medium">Người cập nhật *<input value={fields.reviewerName} onChange={e => update({ reviewerName: e.target.value })} required maxLength={120} className={inputClass}/></label>
          </div>
          {fields.resolution === 'follow_up' && <div className="grid gap-4 rounded-md border border-amber-300 bg-amber-50 p-4 md:grid-cols-[minmax(220px,1fr)_2fr]">
            <label className="text-sm font-medium">Hạn gọi lại *<input type="datetime-local" value={localDateTime(fields.followUpAt)} onChange={e => { const date = new Date(e.target.value); update({ followUpAt: Number.isFinite(date.getTime()) ? date.toISOString() : null }) }} required className={inputClass}/><span className="mt-1 block text-sm font-normal text-slate-700">Theo múi giờ trên thiết bị.</span></label>
            <label className="text-sm font-medium">Việc cần làm tiếp *<textarea value={fields.nextAction} onChange={e => update({ nextAction: e.target.value })} required rows={2} maxLength={2000} className={inputClass}/></label>
          </div>}
          {fields.resolution !== 'follow_up' && <label className="block text-sm font-medium">Việc cần làm tiếp<textarea value={fields.nextAction} onChange={e => update({ nextAction: e.target.value })} rows={2} maxLength={2000} className={inputClass}/></label>}
          <label className="block text-sm font-medium">Ghi nhận kết quả{fields.resolution === 'resolved' ? ' *' : ''}<textarea value={fields.outcomeNote} onChange={e => update({ outcomeNote: e.target.value })} required={fields.resolution === 'resolved'} rows={2} maxLength={3000} className={inputClass}/></label>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700">Tên người cập nhật là thông tin tự khai trong bản local.</p>
            <button type="submit" disabled={!dirty || saving} className="inline-flex items-center gap-2 rounded-md bg-[#0E5665] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save size={17} aria-hidden="true"/>{saving ? 'Đang lưu…' : 'Lưu hồ sơ xử lý'}</button>
          </div>
        </fieldset>
      </form>}
      {message && <p role="status" className="mt-3 text-sm font-medium text-teal-900">{message}</p>}
      {!!saved?.history.length && <section className="mt-5 border-t border-[#d4e0e6] pt-4">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold"><History size={17} aria-hidden="true"/> Lịch sử cập nhật gần nhất</h3>
        <ol className="mt-3 max-h-64 space-y-3 overflow-y-auto text-sm">
          {saved.history.map(event => <li key={event.version} className="border-l-2 border-[#8cb3bd] pl-3">
            <p className="font-medium">{resolutionLabels[event.resolution]} · {event.reviewerName}</p>
            <p className="mt-0.5 text-slate-700">{new Date(event.at).toLocaleString('vi-VN')} · phiên bản {event.version}</p>
            <p className="mt-1 text-slate-700">Đã đổi: {event.changedFields.map(f => fieldNames[f] ?? f).join(', ')}.</p>
            {(event.outcomeNote || event.nextAction) && <p className="mt-1 whitespace-pre-wrap">{event.outcomeNote || event.nextAction}</p>}
          </li>)}
        </ol>
      </section>}
    </div>
  </details>
}
