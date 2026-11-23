import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, RefreshCw } from 'lucide-react'
import { ApiError, resolveApiUrl } from '@/api/isemotalk'
import { attemptLabels, caseLabels, contactLabels, dateLabel, directionLabels, eventLabels, getCase, taskStatusLabels, type CaseDetail, type ServiceSnapshot } from '@/api/service'
import { CaseEditor, type Perform } from '@/components/service/CaseEditor'
import { CaseContactForm } from '@/components/service/CaseContactForm'
import { NewTaskForm, TaskRow } from '@/components/service/CaseTasks'
import { button, field, label, panel } from '@/components/service/styles'

export function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>()
  return caseId ? <CaseSession key={caseId} caseId={caseId}/> : <p role="alert">Không có mã vụ việc.</p>
}

function CaseSession({ caseId }: { caseId: string }) {
  const [data, setData] = useState<CaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [conflict, setConflict] = useState(false)
  const [actor, setActor] = useState(() => { try { return sessionStorage.getItem('isemotalk.service.actor') ?? '' } catch { return '' } })
  const busyRef = useRef(false)
  const mounted = useRef(true)
  const errorRef = useRef<HTMLDivElement>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void getCase(caseId, controller.signal).then(result => {
      if (!controller.signal.aborted) { setData(result); setError(''); setConflict(false); setLoading(false) }
    }).catch((e: Error) => { if (!controller.signal.aborted) { setError(e.message); setLoading(false) } })
    return () => controller.abort()
  }, [caseId, revision])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  const perform: Perform = async (operation, successMessage) => {
    if (busyRef.current || conflict || loading) return null
    busyRef.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const result = await operation()
      if (!mounted.current) return null
      setData(result); setMessage(successMessage)
      return result
    } catch (e) {
      if (mounted.current) {
        const failure = e as ApiError
        setError(failure.message)
        if (failure.code === 'version_conflict') setConflict(true)
      }
      return null
    } finally { busyRef.current = false; if (mounted.current) setBusy(false) }
  }
  const updateActor = (value: string) => { setActor(value); try { sessionStorage.setItem('isemotalk.service.actor', value) } catch { /* Name can be entered for each form. */ } }
  const reload = () => { setMessage(''); setRevision(n => n + 1) }
  const context = data ? { record: data.case, actor, busy: busy || conflict || loading, perform } : null
  const tasks = data ? [...data.tasks].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || a.dueAt.localeCompare(b.dueAt)) : []
  const pending = tasks.filter(task => task.status === 'pending')
  return <div className="space-y-5">
    <Link to="/cases" className="inline-flex items-center gap-2 text-sm font-semibold text-teal-900"><ArrowLeft size={18}/> Danh sách vụ việc</Link>
    {error && <div tabIndex={-1} ref={errorRef} role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900"><p className="whitespace-pre-wrap">{error}</p>{conflict && <p className="mt-2 text-sm">Có thay đổi từ nơi khác. Nội dung đang nhập được giữ. Nạp phiên bản mới, rồi đối chiếu bản nháp trước khi sửa tiếp.</p>}<button type="button" className="mt-2 font-semibold underline" disabled={busy} onClick={reload}>Nạp phiên bản mới</button></div>}
    {loading && !data && <p role="status">Đang tải vụ việc…</p>}
    {data && context && <>
      <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="mb-2 text-sm font-semibold text-slate-700">{data.case.id} · Phiên bản {data.case.version}</p><h1 className="break-words text-3xl font-semibold tracking-tight text-[#12394d]">{data.case.title}</h1><p className="mt-3 flex flex-wrap items-center gap-3"><span className="rounded-md border border-teal-300 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-950">{caseLabels[data.case.status]}</span><span className="text-sm text-slate-700">{pending.length} việc đang chờ · {data.contacts.length} lần liên hệ</span></p></div><div className="flex flex-wrap gap-2"><button className={button} disabled={busy || loading} onClick={reload}><RefreshCw size={17}/> Cập nhật</button><a className={button} download href={resolveApiUrl(`/api/cases/${encodeURIComponent(caseId)}/export.json`)}><Download size={17}/> Xuất hồ sơ</a></div></header>
      <div className="flex flex-wrap items-end gap-4 rounded-md border border-[#b7cbd5] bg-white px-5 py-4"><label className={label + ' w-full sm:w-80'}>Người ghi nhận cho các thao tác *<input className={field} maxLength={120} value={actor} onChange={e => updateActor(e.target.value)} placeholder="Nhập tên để cập nhật"/></label><p className="max-w-2xl text-sm text-slate-700">Tên tự khai trong bản local. Mỗi lần lưu ghi lại người cập nhật, thời điểm và phiên bản vụ việc.</p></div>
      {message && <p role="status" className="rounded-md border border-teal-300 bg-teal-50 p-3 text-sm font-medium text-teal-950">{message}</p>}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,1fr)]">
        <section className={panel} aria-labelledby="case-work"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 id="case-work" className="text-xl font-semibold text-[#12394d]">Việc cần làm</h2><span className="text-sm text-slate-700">Thời gian theo múi giờ thiết bị</span></div>{tasks.length === 0 && <p className="mb-4 text-slate-700">Chưa có việc được giao. Thêm người phụ trách và hạn xử lý cho bước tiếp theo.</p>}{tasks.map(task => <TaskRow key={task.id} task={task} attempts={data.attempts.filter(a => a.taskId === task.id)} {...context}/>)}{<details className="mt-4 border-t border-slate-300 pt-4"><summary className="cursor-pointer font-semibold text-teal-900">{data.case.status === 'resolved' ? 'Bản nháp công việc còn giữ (nếu có)' : 'Giao thêm việc'}</summary>{data.case.status === 'resolved' && <p className="mt-3 text-sm text-amber-900">Vụ việc đã giải quyết. Bạn có thể tải bản nháp; cần mở lại vụ việc trước khi giao việc.</p>}<NewTaskForm {...context} busy={context.busy || data.case.status === 'resolved'}/></details>}</section>
        <section className={panel} aria-labelledby="case-info"><h2 id="case-info" className="text-xl font-semibold text-[#12394d]">Hồ sơ vụ việc</h2><dl className="mt-4 space-y-3 text-sm"><div><dt className="font-semibold text-slate-600">Khách hàng / tham chiếu</dt><dd className="mt-1 break-words">{data.case.customerName || 'Chưa có tên'}{data.case.customerRef ? ` · ${data.case.customerRef}` : ''}</dd></div><div><dt className="font-semibold text-slate-600">Phụ trách</dt><dd className="mt-1">{data.case.owner || 'Chưa phân công'}{data.case.queueName ? ` · ${data.case.queueName}` : ''}</dd></div>{data.case.externalTicketId && <div><dt className="font-semibold text-slate-600">Ticket ngoài hệ thống</dt><dd className="mt-1 break-words">{data.case.externalTicketId}</dd></div>}<div><dt className="font-semibold text-slate-600">Nội dung cần xử lý</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{data.case.reason || 'Chưa ghi nhận'}</dd></div>{data.case.outcomeNote && <div><dt className="font-semibold text-slate-600">Kết quả</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{data.case.outcomeNote}</dd></div>}<div><dt className="font-semibold text-slate-600">Cập nhật gần nhất</dt><dd className="mt-1">{dateLabel(data.case.updatedAt)}</dd></div></dl><details className="mt-5 border-t border-slate-300 pt-4"><summary className="cursor-pointer font-semibold text-teal-900">{data.case.status === 'resolved' ? 'Cập nhật / mở lại vụ việc' : 'Cập nhật / giải quyết vụ việc'}</summary><CaseEditor {...context}/></details></section>
      </div>
      <section className={panel} aria-labelledby="case-contacts"><h2 id="case-contacts" className="text-xl font-semibold text-[#12394d]">Các lần liên hệ & bản ghi</h2>{data.contacts.length === 0 && <p className="mt-3 text-slate-700">Chưa ghi nhận lần liên hệ nào.</p>}<ol className="mt-4 divide-y divide-slate-200">{data.contacts.map(contact => <li key={contact.id} className="py-4 first:pt-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{contactLabels[contact.disposition]}</h3><p className="mt-1 text-sm text-slate-700">{dateLabel(contact.occurredAt)} · {directionLabels[contact.direction]} · {contact.source === 'manual' ? 'Nhập thủ công' : 'Liên kết bản ghi'}</p><p className="mt-1 text-sm text-slate-600">{contact.id}{contact.externalContactId ? ` · Mã tổng đài: ${contact.externalContactId}` : ''}</p></div>{contact.callId ? <Link className={button} to={'/calls/' + encodeURIComponent(contact.callId)}>Mở bản ghi {contact.callId}</Link> : contact.recordedCallId ? <span className="text-sm font-medium text-amber-900">Bản ghi {contact.recordedCallId} đã xóa</span> : <span className="text-sm text-slate-600">Không có bản ghi / kết quả SER</span>}</div>{contact.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{contact.note}</p>}</li>)}</ol>{<details className="mt-4 border-t border-slate-300 pt-4"><summary className="cursor-pointer font-semibold text-teal-900">{data.case.status === 'resolved' ? 'Bản nháp liên hệ còn giữ (nếu có)' : 'Thêm lần liên hệ / liên kết bản ghi'}</summary>{data.case.status === 'resolved' && <p className="mt-3 text-sm text-amber-900">Vụ việc đã giải quyết. Bạn có thể tải bản nháp; cần mở lại vụ việc trước khi thêm liên hệ.</p>}<CaseContactForm {...context} busy={context.busy || data.case.status === 'resolved'}/></details>}</section>
      <section className={panel}><h2 className="text-xl font-semibold text-[#12394d]">Lịch sử xử lý</h2><p className="mt-2 text-sm text-slate-700">Hiển thị {data.history.length} / {data.historyTotal} thay đổi. Tệp xuất chứa toàn bộ lịch sử.</p><ol className="mt-5 space-y-4">{data.history.map(event => <li key={event.version} className="border-l-2 border-[#8cb3bd] pl-4 text-sm"><p className="font-semibold">{eventLabels[event.kind]} · {event.actor}</p><p className="mt-1 text-slate-600">{dateLabel(event.at)} · phiên bản {event.version}</p>{event.changeNote && <p className="mt-1 whitespace-pre-wrap">{event.changeNote}</p>}{event.snapshot.task && <p className="mt-1">{event.snapshot.task.action} · {taskStatusLabels[event.snapshot.task.status]} · {event.snapshot.task.owner} · {dateLabel(event.snapshot.task.dueAt)}</p>}<details className="mt-2"><summary className="cursor-pointer text-teal-900 underline-offset-4 hover:underline">Xem dữ liệu đã lưu tại thời điểm này</summary><HistorySnapshot snapshot={event.snapshot}/></details></li>)}</ol></section>
    </>}
  </div>
}

function HistorySnapshot({ snapshot: s }: { snapshot: ServiceSnapshot }) {
  const pairs = [
    ['Vụ việc', `${s.case.id} · ${s.case.title}`], ['Trạng thái', caseLabels[s.case.status]],
    ['Khách / tham chiếu', [s.case.customerName, s.case.customerRef].filter(Boolean).join(' · ')],
    ['Phụ trách / bộ phận', [s.case.owner, s.case.queueName].filter(Boolean).join(' · ')],
    ['Ticket ngoài', s.case.externalTicketId], ['Nội dung', s.case.reason], ['Kết quả vụ việc', s.case.outcomeNote],
    ...(s.contact ? [['Liên hệ', `${s.contact.id} · ${contactLabels[s.contact.disposition]} · ${dateLabel(s.contact.occurredAt)}`], ['Hồ sơ cuộc gọi', s.contact.recordedCallId ?? 'Không liên kết'], ['Ghi chú liên hệ', s.contact.note]] : []),
    ...(s.task ? [['Công việc', `${s.task.id} · ${s.task.action}`], ['Phân công / hạn', `${s.task.owner} · ${dateLabel(s.task.dueAt)}`], ['Trạng thái việc', taskStatusLabels[s.task.status]], ['Kết quả việc', s.task.resultNote]] : []),
    ...(s.attempt ? [['Lần gọi lại', `${attemptLabels[s.attempt.outcome]} · ${dateLabel(s.attempt.occurredAt)}`], ['Ghi nhận', s.attempt.note], ['Hạn thử lại', s.attempt.nextDueAt ? dateLabel(s.attempt.nextDueAt) : 'Không đặt']] : []),
  ].filter(([, value]) => value)
  return <dl className="mt-3 grid gap-x-4 gap-y-2 rounded-md border border-slate-300 bg-slate-50 p-4 text-sm sm:grid-cols-[160px_minmax(0,1fr)]">{pairs.map(([name, value]) => <div key={name} className="contents"><dt className="font-semibold text-slate-700">{name}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div>)}</dl>
}
