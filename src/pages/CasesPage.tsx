import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, RefreshCw, Search } from 'lucide-react'
import { caseLabels, dateLabel, getCases, type CaseList, type CaseStatus } from '@/api/service'
import { button, field, label, primary } from '@/components/service/styles'

export function CasesPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<CaseStatus | ''>('')
  const [overdue, setOverdue] = useState(false)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [data, setData] = useState<CaseList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    const timer = window.setTimeout(() => {
      void getCases({ search, status, overdue, page, pageSize: 20 }, controller.signal).then(result => {
        if (!controller.signal.aborted) { setData(result); setLoading(false) }
      }).catch((e: Error) => { if (!controller.signal.aborted) { setError(e.message); setLoading(false) } })
    }, 200)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [search, status, overdue, page, revision])

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 text-sm font-semibold uppercase tracking-wider text-teal-800">Xử lý sau liên hệ</p><h1 className="text-3xl font-semibold tracking-tight text-[#12394d]">Vụ việc & việc cần làm</h1><p className="mt-2 max-w-3xl text-slate-700">Theo dõi vấn đề của khách qua các lần liên hệ. Mỗi việc có người phụ trách, thời hạn và kết quả được ghi nhận.</p></div>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={loading} onClick={() => setRevision(n => n + 1)}><RefreshCw size={17}/> Cập nhật</button><Link className={primary} to="/cases/new"><Plus size={18}/> Tạo vụ việc</Link></div>
    </header>
    <section className="grid items-end gap-4 rounded-lg border border-[#b7cbd5] bg-white p-4 md:grid-cols-[minmax(220px,1fr)_260px_auto]" aria-label="Tìm và lọc vụ việc">
      <label className={label}>Tìm vụ việc<div className="relative"><Search size={18} aria-hidden="true" className="absolute left-3 top-5 text-slate-600"/><input type="search" className={field + ' pl-10'} value={search} placeholder="Mã vụ việc, vấn đề, khách hàng…" onChange={e => { setSearch(e.target.value); setPage(1) }}/></div></label>
      <label className={label}>Trạng thái<select className={field} value={status} onChange={e => { setStatus(e.target.value as CaseStatus | ''); setPage(1) }}><option value="">Tất cả trạng thái</option>{Object.entries(caseLabels).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-red-900"><input type="checkbox" checked={overdue} onChange={e => { setOverdue(e.target.checked); setPage(1) }} className="h-4 w-4"/> Có việc quá hạn</label>
    </section>
    {error && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">{error}</div>}
    <div className="overflow-x-auto rounded-lg border border-[#b7cbd5] bg-white" aria-busy={loading}>
      <table className="w-full min-w-[900px] text-left text-sm"><caption className="sr-only">Vụ việc, người phụ trách và công việc đang chờ</caption><thead className="border-b bg-slate-50"><tr><th scope="col" className="px-5 py-4">Vụ việc / khách hàng</th><th scope="col" className="px-4 py-4">Trạng thái</th><th scope="col" className="px-4 py-4">Phụ trách</th><th scope="col" className="px-4 py-4">Việc đang chờ</th><th scope="col" className="px-4 py-4">Hạn gần nhất</th></tr></thead>
        <tbody className="divide-y divide-slate-200">
          {loading && <tr><td colSpan={5} className="p-8 text-center" role="status">Đang tải vụ việc…</td></tr>}
          {!loading && !error && data?.items.map(item => <tr key={item.id}><td className="max-w-[440px] px-5 py-4"><Link className="text-base font-semibold text-teal-900 underline-offset-4 hover:underline" to={'/cases/' + encodeURIComponent(item.id)}>{item.title}</Link><p className="mt-1 text-slate-700">{item.id} · {item.customerName || item.customerRef || 'Chưa có tên khách'}</p><p className="mt-1 text-slate-600">{item.contactCount} lần liên hệ{item.externalTicketId ? ` · Ticket ${item.externalTicketId}` : ''}</p></td><td className="px-4 py-4"><span className={'inline-flex rounded border px-2 py-1 font-medium ' + (item.status === 'resolved' ? 'border-teal-300 bg-teal-50 text-teal-900' : 'border-slate-300 bg-slate-50')}>{caseLabels[item.status]}</span></td><td className="px-4 py-4">{item.owner || 'Chưa phân công'}<p className="mt-1 text-slate-600">{item.queueName}</p></td><td className="px-4 py-4">{item.openTaskCount ? `${item.openTaskCount} việc` : 'Không có việc chờ'}{item.overdueTaskCount > 0 && <p className="mt-1 font-semibold text-red-800">{item.overdueTaskCount} việc quá hạn</p>}</td><td className="px-4 py-4">{item.nextDueAt ? dateLabel(item.nextDueAt) : '—'}</td></tr>)}
          {!loading && !error && data?.items.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-700"><p className="font-semibold">Chưa có vụ việc phù hợp.</p><p className="mt-2">Tạo vụ việc từ yêu cầu gọi lại hoặc liên kết một bản ghi đã phân tích.</p></td></tr>}
        </tbody>
      </table>
    </div>
    {data && <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Phân trang vụ việc"><p>{data.total} vụ việc · Thời gian theo múi giờ thiết bị</p><div className="flex items-center gap-3"><button className={button} disabled={loading || page <= 1} onClick={() => setPage(p => p - 1)}>Trước</button><span>Trang {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button className={button} disabled={loading || page * data.pageSize >= data.total} onClick={() => setPage(p => p + 1)}>Sau</button></div></nav>}
    <p className="max-w-4xl text-sm leading-relaxed text-slate-700">Liên hệ được nhập thủ công hoặc nối từ bản ghi. Việc đặt hạn gọi lại ghi nhận trách nhiệm xử lý; nhân viên thực hiện cuộc gọi qua tổng đài của mình.</p>
  </div>
}
