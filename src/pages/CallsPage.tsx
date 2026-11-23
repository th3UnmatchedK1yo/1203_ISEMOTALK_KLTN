import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Search, RefreshCw, Upload } from 'lucide-react'
import { getCalls, clock, emotionLabels, provenanceLabel, type CallList } from '@/api/isemotalk'
import { startPolling } from '@/lib/polling'

const priorities = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' }
const reviews = { unreviewed: 'Chưa xem xét', in_progress: 'Đang xem xét', reviewed: 'Đã xem xét' }
const processing = { ready: 'Sẵn sàng', queued: 'Đang chờ', processing: 'Đang xử lý', failed: 'Cần thử lại' }

export function CallsPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState('')
  const [review, setReview] = useState('')
  const [provenance, setProvenance] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [data, setData] = useState<CallList | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput); setPage(1) }, 250)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setLoading(true)
    setError('')
    return startPolling({
      load: signal => getCalls({ search, priority, review, provenance, status, page, pageSize: 10 }, signal),
      onData: next => { setData(next); setError(''); setLoading(false) },
      onError: failure => { setError(failure.message); setLoading(false) },
      shouldContinue: next => next.counts.processing > 0,
      intervalMs: 4000,
    })
  }, [search, priority, review, provenance, status, page, refresh])

  const select = 'mt-2 h-11 w-full rounded-lg border border-[#b5c9d2] bg-white px-3 text-sm font-medium text-slate-800'
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-semibold tracking-tight text-[#12394d]">Cuộc gọi cần xem xét</h1>
        <p className="mt-2 text-base text-slate-700">Nghe lại bằng chứng, kiểm tra cảm xúc và ghi nhận hướng xử lý.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setRefresh(n => n + 1)} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-teal-50 disabled:opacity-50"><RefreshCw size={17}/> Cập nhật</button>
        <Link to="/calls/new" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0E5665] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0B4554]"><Upload size={17}/> Thêm cuộc gọi</Link>
      </div>
    </header>
    {data && <p className="text-sm leading-6 text-slate-700">Tổng cộng <strong>{data.counts.total}</strong> cuộc gọi · <strong>{data.counts.attention}</strong> ưu tiên cao · <strong>{data.counts.processing}</strong> đang xử lý · <strong>{data.counts.failed}</strong> cần thử lại</p>}
    <section className="rounded-xl border border-[#c4d4dc] bg-white p-4" aria-label="Tìm và lọc cuộc gọi">
      <label className="relative block"><span className="sr-only">Tìm mã, tiêu đề hoặc khách hàng</span><Search aria-hidden="true" className="absolute left-3 top-3.5 text-slate-600" size={18}/>
        <input type="search" className="h-12 w-full rounded-lg border border-[#b5c9d2] bg-white pl-11 pr-4 text-base" placeholder="Tìm mã, tiêu đề, khách hàng…" value={searchInput} onChange={e => setSearchInput(e.target.value)}/>
      </label>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block text-sm font-semibold text-slate-700">Nguồn kết quả<select className={select} value={provenance} onChange={e => { setProvenance(e.target.value); setPage(1) }}>
          <option value="">Tất cả nguồn</option><option value="real">Kết quả inference</option><option value="imported">Nhập từ tệp</option><option value="mock">Demo / mô phỏng</option>
        </select></label>
        <label className="block text-sm font-semibold text-slate-700">Mức ưu tiên<select className={select} value={priority} onChange={e => { setPriority(e.target.value); setPage(1) }}>
          <option value="">Mọi mức ưu tiên</option><option value="high">Cao</option><option value="medium">Trung bình</option><option value="low">Thấp</option>
        </select></label>
        <label className="block text-sm font-semibold text-slate-700">Đánh giá của QA<select className={select} value={review} onChange={e => { setReview(e.target.value); setPage(1) }}>
          <option value="">Mọi trạng thái</option><option value="unreviewed">Chưa xem xét</option><option value="in_progress">Đang xem xét</option><option value="reviewed">Đã xem xét</option>
        </select></label>
        <label className="block text-sm font-semibold text-slate-700">Xử lý dữ liệu<select className={select} value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Mọi trạng thái</option><option value="ready">Sẵn sàng</option><option value="queued">Đang chờ</option><option value="processing">Đang xử lý</option><option value="failed">Cần thử lại</option>
        </select></label>
      </div>
    </section>
    {error && <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"><AlertCircle size={19} className="shrink-0"/>{error}</div>}
    <div className="overflow-x-auto rounded-xl border border-[#c4d4dc] bg-white shadow-sm" aria-busy={loading}>
      <table className="w-full min-w-[1060px] text-left text-sm">
        <caption className="sr-only">Danh sách cuộc gọi, nguồn kết quả và trạng thái đánh giá</caption>
        <thead className="border-b bg-slate-50"><tr>
          <th scope="col" className="px-5 py-4">Cuộc gọi</th><th scope="col" className="px-4 py-4">Nhân viên / Khách hàng</th><th scope="col" className="px-4 py-4">Thời lượng</th>
          <th scope="col" className="px-4 py-4">Cảm xúc khách hàng</th><th scope="col" className="px-4 py-4">Ưu tiên (SER)</th><th scope="col" className="px-4 py-4">AI QA</th><th scope="col" className="px-4 py-4">Đánh giá</th><th scope="col" className="px-4 py-4">Xử lý</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-200">
          {!loading && data?.items.map(call => <tr key={call.id} className="hover:bg-teal-50/70 focus-within:bg-teal-50/70">
            <td className="max-w-[340px] px-5 py-4"><Link to={'/calls/' + encodeURIComponent(call.id)} className="block text-base font-semibold text-teal-900 underline-offset-4 hover:underline">{call.title}</Link>
              <p className="mt-1 text-sm text-slate-600">{call.id} · {provenanceLabel(call.provenance)}</p></td>
            <td className="px-4 py-4">{call.agentName || 'Chưa có tên'}<div className="mt-1 text-slate-600">{call.customerName || 'Chưa có tên'}</div></td>
            <td className="px-4 py-4 font-mono tabular-nums">{clock(call.duration)}</td>
            <td className="px-4 py-4">{call.dominantEmotion ? emotionLabels[call.dominantEmotion] : call.status === 'ready' ? 'Chưa đủ dữ liệu' : '—'}</td>
            <td className="px-4 py-4">{call.status !== 'ready' ? '—' : call.dominantEmotion === null ? 'Chưa đủ dữ liệu' : <span className={call.priority === 'high' ? 'font-semibold text-red-800' : 'font-medium'}>{priorities[call.priority]}</span>}</td>
            <td className="px-4 py-4">{!call.qaTriage ? <span className="text-slate-500">Chưa chạy</span> : call.qaTriage.outdated
              ? <span className="font-medium text-amber-900">Cần chạy lại (transcript đã sửa)</span>
              : <div className="space-y-1"><span className={'font-semibold ' + (call.qaTriage.label === 'needs_attention' ? 'text-amber-900' : 'text-teal-900')}>
                {call.qaTriage.label === 'needs_attention' ? 'Gợi ý xem lại' : 'Chưa cần ưu tiên'}
              </span><p className="text-xs text-slate-600">P(cần xem) {(call.qaTriage.score * 100).toFixed(0)}%{call.qaTriage.truncated ? ' · text bị cắt' : ''}</p></div>}</td>
            <td className="px-4 py-4">{reviews[call.reviewStatus]}</td>
            <td className="px-4 py-4"><span className={'inline-flex rounded-md border px-2 py-1 font-medium ' + (call.status === 'failed' ? 'border-amber-200 bg-amber-50 text-amber-900' : call.status === 'ready' ? 'border-teal-200 bg-teal-50 text-teal-900' : 'border-slate-200 bg-slate-50 text-slate-800')}>{processing[call.status]}</span></td>
          </tr>)}
          {!loading && data?.items.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-slate-700">Không tìm thấy cuộc gọi phù hợp. Thử thay đổi bộ lọc hoặc thêm cuộc gọi mới.</td></tr>}
          {loading && <tr><td colSpan={7} role="status" className="p-8 text-center text-slate-700">Đang tải danh sách cuộc gọi…</td></tr>}
        </tbody>
      </table>
    </div>
    {data && <nav aria-label="Phân trang cuộc gọi" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span>{data.total} kết quả{data.counts.processing > 0 && ' · Tự cập nhật khi có cuộc gọi đang xử lý'}</span>
      <div className="flex items-center gap-3">
        <button type="button" disabled={loading || page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-40">Trước</button>
        <span>Trang {data.page} / {pages}</span>
        <button type="button" disabled={loading || page * data.pageSize >= data.total} onClick={() => setPage(p => p + 1)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:opacity-40">Sau</button>
      </div>
    </nav>}
    <p className="text-sm leading-6 text-slate-600">Ưu tiên (SER) dựa trên các câu có vai trò khách hàng được xác định, còn “AI QA” là kết quả riêng của XLM-R phân loại transcript. Điểm model không phải độ chính xác hay kết luận nhân viên sai. Kết quả cũ khi sửa transcript sẽ được đánh dấu cần chạy lại.</p>
  </div>
}
