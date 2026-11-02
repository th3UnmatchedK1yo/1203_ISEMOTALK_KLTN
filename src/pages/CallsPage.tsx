import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, Search, RefreshCw, Upload } from 'lucide-react'
import { getCalls, clock, emotionLabels, provenanceLabel, type CallList, type CallItem } from '@/api/isemotalk'

const priorities = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' }
const reviews = { unreviewed: 'Chưa xem xét', in_progress: 'Đang xem xét', reviewed: 'Đã xem xét' }
const processing = { ready: 'Sẵn sàng', queued: 'Đang chờ', processing: 'Đang xử lý', failed: 'Lỗi' }

export function CallsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState('')
  const [review, setReview] = useState('')
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [data, setData] = useState<CallList | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError('')
    getCalls({ search, priority, review, page, pageSize: 10 }, ac.signal)
      .then(setData)
      .catch((e: Error) => { if (!ac.signal.aborted) setError(e.message) })
      .finally(() => { if (!ac.signal.aborted) setLoading(false) })
    return () => ac.abort()
  }, [search, priority, review, page, refresh])

  const select = 'h-9 rounded-md border bg-white px-3 text-sm'
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Danh sách cuộc gọi</h1>
          <p className="mt-1 text-sm text-slate-500">Chọn cuộc gọi để nghe, phân tích và đánh giá. Nguồn mô phỏng được ghi rõ.</p>
        </div>
        <div className="flex items-center gap-2"><button onClick={() => setRefresh(n => n + 1)} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50"><RefreshCw size={15}/> Tải lại</button>
        <Link to="/calls/new" className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-700"><Upload size={15}/> Thêm cuộc gọi</Link></div>
      </header>
      {data && <p className="text-sm text-slate-600">Tổng cộng <strong>{data.counts.total}</strong> cuộc gọi · <strong>{data.counts.attention}</strong> cần ưu tiên · <strong>{data.counts.failed}</strong> lỗi</p>}
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-2.5 text-slate-400" size={17}/>
          <input className="h-9 w-full rounded-md border pl-9 pr-3 text-sm" placeholder="Tìm mã, tiêu đề, khách hàng…" value={search} onChange={e => {setSearch(e.target.value);setPage(1)}}/>
        </label>
        <select aria-label="Lọc ưu tiên" className={select} value={priority} onChange={e => {setPriority(e.target.value);setPage(1)}}>
          <option value="">Mọi mức ưu tiên</option><option value="high">Cao</option><option value="medium">Trung bình</option><option value="low">Thấp</option>
        </select>
        <select aria-label="Lọc đánh giá" className={select} value={review} onChange={e => {setReview(e.target.value);setPage(1)}}>
          <option value="">Mọi trạng thái đánh giá</option><option value="unreviewed">Chưa xem</option><option value="in_progress">Đang xem</option><option value="reviewed">Đã xem</option>
        </select>
      </div>
      {error && <div role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={17}/>{error}</div>}
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600"><tr>
            <th className="px-4 py-3">Cuộc gọi</th><th className="px-4 py-3">Nhân viên / Khách hàng</th><th className="px-4 py-3">Thời lượng</th>
            <th className="px-4 py-3">Cảm xúc</th><th className="px-4 py-3">Ưu tiên</th><th className="px-4 py-3">Đánh giá</th><th className="px-4 py-3">Xử lý</th>
          </tr></thead>
          <tbody className="divide-y">
            {data?.items.map((call: CallItem) => <tr key={call.id} className="cursor-pointer hover:bg-slate-50 focus-within:bg-slate-50" onClick={() => navigate('/calls/'+encodeURIComponent(call.id))}>
              <td className="px-4 py-3"><button className="text-left font-medium text-blue-700 hover:underline" onClick={e => {e.stopPropagation();navigate('/calls/'+encodeURIComponent(call.id))}}>{call.id} · {call.title}</button>
                <div className="mt-1 text-xs text-slate-500">{provenanceLabel(call.provenance)}</div></td>
              <td className="px-4 py-3">{call.agentName || '—'}<div className="text-xs text-slate-500">{call.customerName || '—'}</div></td>
              <td className="px-4 py-3 font-mono">{clock(call.duration)}</td>
              <td className="px-4 py-3">{call.dominantEmotion ? emotionLabels[call.dominantEmotion] : '—'}</td>
              <td className="px-4 py-3">{priorities[call.priority]}</td>
              <td className="px-4 py-3">{reviews[call.reviewStatus]}</td>
              <td className="px-4 py-3">{processing[call.status]}</td>
            </tr>)}
            {!loading && data?.items.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500">Không tìm thấy cuộc gọi phù hợp.</td></tr>}
            {loading && <tr><td colSpan={7} className="p-8 text-center text-slate-500">Đang tải dữ liệu từ SQLite…</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <div className="flex items-center justify-between text-sm"><span>{data.total} kết quả</span><div className="flex items-center gap-3">
        <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1,p-1))} className="rounded border px-3 py-1.5 disabled:opacity-40">Trước</button>
        <span>Trang {page} / {Math.max(1,Math.ceil(data.total / data.pageSize))}</span>
        <button disabled={page * data.pageSize >= data.total} onClick={() => setPage(p => p+1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Sau</button>
      </div></div>}
    </div>
  )
}
