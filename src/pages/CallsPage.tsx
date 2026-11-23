import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Search, RefreshCw, Upload } from 'lucide-react'
import { getCalls, getSystemStatus, clock, emotionLabels, provenanceLabel, type CallList } from '@/api/isemotalk'
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
  const [datasetScope, setDatasetScope] = useState<'business'|'speech_only'|'all'>('business')
  const [listSort, setListSort] = useState<'qa_attention' | 'date'>('qa_attention')
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [data, setData] = useState<CallList | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [qaReady, setQaReady] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput); setPage(1) }, 250)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setLoading(true)
    setError('')
    return startPolling({
      load: signal => getCalls({ search, priority, review, provenance, status, datasetScope, sort: listSort, page, pageSize: 10 }, signal),
      onData: next => { setData(next); setError(''); setLoading(false) },
      onError: failure => { setError(failure.message); setLoading(false) },
      shouldContinue: next => next.counts.processing > 0 || (qaReady && next.items.some(call =>
        call.title.startsWith('TTS TỔNG HỢP · OneVoice') && call.status === 'ready' && call.utteranceCount > 0 &&
        (!call.qaTriage || call.qaTriage.outdated))),
      intervalMs: 4000,
    })
  }, [search, priority, review, provenance, status, datasetScope, listSort, page, refresh, qaReady])

  useEffect(() => {
    const controller = new AbortController()
    void getSystemStatus(controller.signal)
      .then(health => {
        if (!controller.signal.aborted) setQaReady(health.inference.reachable === true && health.automation?.qa === true &&
          health.inference.qa?.ready === true && health.inference.qa.loaded === true)
      })
      .catch(() => { if (!controller.signal.aborted) setQaReady(false) })
    return () => controller.abort()
  }, [])

  const select = 'mt-2 h-11 w-full rounded-lg border border-[#b5c9d2] bg-white px-3 text-sm font-medium text-slate-800'
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const showSer = !!data?.items.some(call => call.dominantEmotion !== null)
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-bold tracking-tight text-[#12394d]">Hàng đợi đánh giá QA</h1>
        <p className="mt-2 text-base text-slate-700">Chọn cuộc gọi cần xem trước, nghe bằng chứng rồi ghi nhận quyết định.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setRefresh(n => n + 1)} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-teal-50 disabled:opacity-50"><RefreshCw size={17}/> Cập nhật</button>
        <Link to="/calls/new" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0E5665] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0B4554]"><Upload size={17}/> Thêm cuộc gọi</Link>
      </div>
    </header>
    {data && <div className="grid gap-3 sm:grid-cols-3" aria-label="Tình trạng hàng đợi QA">
      <div className="rounded-xl border border-amber-200 border-l-4 border-l-amber-500 bg-white px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">AI gợi ý xem trước</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{data.counts.qaAttention ?? 0}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Chưa có kết quả AI</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{data.counts.qaPending ?? 0}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Đang xử lý ghi âm</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{data.counts.processing}</p>
      </div>
    </div>}
    {qaReady && <p role="status" className="text-xs leading-5 text-teal-800">XLM-R đang tự sàng lọc transcript đủ điều kiện. Người QA vẫn quyết định sau khi nghe.</p>}
    <section className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm leading-6" aria-label="Vì sao phải sàng lọc cuộc gọi trước khi nghe">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-4xl">
          <p className="font-bold text-[#12394d]">AI quét cả hàng đợi trước; QA chỉ mở những hồ sơ cần nghe.</p>
          <p className="mt-1 text-slate-700">Khi transcript đã có, XLM-R tự chấm từng cuộc nếu chế độ tự động được bật. Cuộc có cảnh báo được đẩy lên trước, nhưng người QA vẫn phải nghe và xác minh. Đây là <strong>sàng lọc theo văn bản</strong>, không phải AI tóm tắt hay phán lỗi nhân viên.</p>
          {!qaReady && <p className="mt-2 text-amber-800">Phiên này chưa xác nhận XLM-R tự chấm đang hoạt động. Mở <strong>Tải lên → Khả năng xử lý hiện tại</strong> để xem tình trạng của ASR, QA và SER.</p>}
        </div>
        <Link to="/analytics" className="inline-flex min-h-10 shrink-0 items-center rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50">Xem AI đã quét bao nhiêu</Link>
      </div>
    </section>
    <section className="rounded-xl border border-[#c4d4dc] bg-white p-4" aria-label="Tìm và lọc cuộc gọi">
      <label className="relative block"><span className="sr-only">Tìm mã, tiêu đề hoặc khách hàng</span><Search aria-hidden="true" className="absolute left-3 top-3.5 text-slate-600" size={18}/>
        <input type="search" className="h-12 w-full rounded-lg border border-[#b5c9d2] bg-white pl-11 pr-4 text-base" placeholder="Tìm mã, tiêu đề, khách hàng…" value={searchInput} onChange={e => setSearchInput(e.target.value)}/>
      </label>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">Thứ tự xem xét
          <select className={select} value={listSort} onChange={e => { setListSort(e.target.value as 'qa_attention' | 'date'); setPage(1) }}>
            <option value="qa_attention">Gợi ý QA trước</option>
            <option value="date">Cuộc gọi mới nhất</option>
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-700">Loại dữ liệu
          <select className={select} value={datasetScope} onChange={e => { setDatasetScope(e.target.value as 'business'|'speech_only'|'all'); setPage(1) }}>
            <option value="business">Cuộc gọi CSKH / OneVoice</option>
            <option value="speech_only">Mẫu thử ASR / DataHive</option>
            <option value="all">Tất cả bản ghi</option>
          </select>
        </label>
      </div>
      <details className="group mt-4 border-t border-slate-100 pt-3">
        <summary className="cursor-pointer text-sm font-semibold text-teal-900">Bộ lọc nâng cao
          <span className="ml-2 font-normal text-slate-600">(nguồn, đánh giá, trạng thái)</span>
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block text-sm font-semibold text-slate-700">Nguồn kết quả
            <select className={select} value={provenance} onChange={e => { setProvenance(e.target.value); setPage(1) }}>
              <option value="">Tất cả nguồn</option><option value="real">Kết quả inference</option><option value="imported">Nhập từ tệp</option><option value="mock">Demo / mô phỏng</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">Mức ưu tiên SER
            <select className={select} value={priority} onChange={e => { setPriority(e.target.value); setPage(1) }}>
              <option value="">Mọi mức ưu tiên</option><option value="high">Cao</option><option value="medium">Trung bình</option><option value="low">Thấp</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">Đánh giá của QA
            <select className={select} value={review} onChange={e => { setReview(e.target.value); setPage(1) }}>
              <option value="">Mọi trạng thái</option><option value="unreviewed">Chưa xem xét</option><option value="in_progress">Đang xem xét</option><option value="reviewed">Đã xem xét</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">Xử lý dữ liệu
            <select className={select} value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
              <option value="">Mọi trạng thái</option><option value="ready">Sẵn sàng</option><option value="queued">Đang chờ</option><option value="processing">Đang xử lý</option><option value="failed">Cần thử lại</option>
            </select>
          </label>
        </div>
      </details>
    </section>
    {error && <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"><AlertCircle size={19} className="shrink-0"/>{error}</div>}
    <div className="space-y-3 md:hidden" aria-busy={loading} aria-label="Hàng đợi QA trên di động">
      {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm">Đang tải danh sách cuộc gọi…</p>}
      {!loading && data?.items.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">Không tìm thấy cuộc gọi phù hợp. Thử thay đổi bộ lọc.</p>}
      {!loading && data?.items.map(call => <article key={call.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Link to={'/calls/' + encodeURIComponent(call.id)}
          className="block break-words text-base font-bold leading-6 text-teal-900 hover:underline">{call.title}</Link>
        <p className="mt-1 text-xs text-slate-600">{call.id} · {clock(call.duration)} · {provenanceLabel(call.provenance)}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gợi ý AI QA</p>
            <p className={'mt-1 text-sm font-semibold ' +
              (call.qaTriage?.label === 'needs_attention' || call.qaTriage?.outdated ? 'text-amber-900' : 'text-slate-800')}>
              {!call.qaTriage ? 'Chưa có kết quả'
                : call.qaTriage.outdated ? 'Cần phân tích lại'
                : call.qaTriage.label === 'needs_attention' ? 'AI gợi ý xem kỹ' : 'Chưa có cảnh báo mạnh'}
            </p>
            {call.qaTriage && !call.qaTriage.outdated &&
              <p className="mt-1 text-xs text-slate-600">Điểm: {(call.qaTriage.score * 100).toFixed(1)}%</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Đánh giá QA</p>
            <p className="mt-1 text-sm text-slate-800">{reviews[call.reviewStatus]}</p>
            {showSer && <p className="mt-1 text-xs text-slate-600">{call.dominantEmotion ? emotionLabels[call.dominantEmotion] : 'Chưa có SER'}</p>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs font-semibold text-slate-600">{processing[call.status]}</span>
          <Link to={'/calls/' + encodeURIComponent(call.id)}
            className="inline-flex min-h-10 items-center rounded-lg bg-[#0e5665] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4554]">
            Mở và đánh giá
          </Link>
        </div>
      </article>)}
    </div>
    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block" aria-busy={loading}>
      <table className="w-full min-w-[700px] text-left text-sm">
        <caption className="sr-only">Hàng đợi cuộc gọi và gợi ý của AI để người QA xem xét</caption>
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-700"><tr>
          <th scope="col" className="w-[42%] px-5 py-4">Cuộc gọi</th>
          <th scope="col" className="px-4 py-4">Gợi ý AI QA</th>
          {showSer && <th scope="col" className="px-4 py-4">Cảm xúc SER</th>}
          <th scope="col" className="px-4 py-4">Đánh giá QA</th>
          <th scope="col" className="px-4 py-4">Xử lý</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-200">
          {!loading && data?.items.map(call => <tr key={call.id} className="hover:bg-teal-50/50 focus-within:bg-teal-50/70">
            <td className="max-w-[460px] px-5 py-4 align-top">
              <Link to={'/calls/' + encodeURIComponent(call.id)} className="block break-words text-base font-bold text-teal-900 underline-offset-4 hover:underline">{call.title}</Link>
              <p className="mt-1 text-xs text-slate-600">{call.id} · {clock(call.duration)} · {provenanceLabel(call.provenance)}</p>
              {(call.agentName || call.customerName) && <p className="mt-1 text-xs text-slate-600">
                {call.agentName || 'Nhân viên chưa rõ'} / {call.customerName || 'Khách chưa rõ'}
              </p>}
            </td>
            <td className="px-4 py-4 align-top">
              {!call.qaTriage
                ? <span className="text-slate-600">{call.status === 'ready' ? 'Chưa có kết quả AI' : 'Chờ xử lý'}</span>
                : call.qaTriage.outdated
                  ? <span className="font-semibold text-amber-900">Cần phân tích lại</span>
                  : <div className="space-y-1.5">
                    <span className={'inline-flex rounded-md border px-2 py-1 text-xs font-bold ' +
                      (call.qaTriage.label === 'needs_attention'
                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                        : 'border-teal-200 bg-teal-50 text-teal-900')}>
                      {call.qaTriage.label === 'needs_attention' ? 'AI gợi ý xem kỹ' : 'Chưa có cảnh báo mạnh'}
                    </span>
                    <p className="text-xs text-slate-600">Điểm cảnh báo: {(call.qaTriage.score * 100).toFixed(1)}%
                      {call.qaTriage.truncated ? ' · chưa quét hết' : ''}
                    </p>
                  </div>}
            </td>
            {showSer && <td className="px-4 py-4 align-top">
              {call.dominantEmotion ? <span className="font-semibold text-slate-800">{emotionLabels[call.dominantEmotion]} · {priorities[call.priority]}</span>
                : <span className="text-slate-500">Chưa có SER</span>}
            </td>}
            <td className="px-4 py-4 align-top"><span className={call.reviewStatus === 'reviewed' ? 'font-semibold text-teal-900' : 'text-slate-700'}>{reviews[call.reviewStatus]}</span></td>
            <td className="px-4 py-4 align-top">
              <span className={'inline-flex rounded-md border px-2 py-1 text-xs font-semibold ' +
                (call.status === 'failed' ? 'border-amber-200 bg-amber-50 text-amber-900' :
                  call.status === 'ready' ? 'border-teal-200 bg-teal-50 text-teal-900' : 'border-slate-200 bg-slate-50 text-slate-800')}>
                {processing[call.status]}
              </span>
              <Link to={'/calls/' + encodeURIComponent(call.id)} className="mt-2 block text-xs font-bold text-teal-800 underline-offset-2 hover:underline">Mở hồ sơ →</Link>
            </td>
          </tr>)}
          {!loading && data?.items.length === 0 &&
            <tr><td colSpan={showSer ? 5 : 4} className="p-8 text-center text-slate-700">Không tìm thấy cuộc gọi phù hợp. Thử thay đổi bộ lọc hoặc thêm cuộc gọi mới.</td></tr>}
          {loading && <tr><td colSpan={showSer ? 5 : 4} role="status" className="p-8 text-center text-slate-700">Đang tải danh sách cuộc gọi…</td></tr>}
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
    <p className="text-xs leading-5 text-slate-600">AI QA chỉ gợi ý cuộc gọi cần ưu tiên nghe lại, không xác định nhân viên có lỗi. Điểm model chưa được hiệu chuẩn trên tổng đài thật; dữ liệu OneVoice là TTS tổng hợp.</p>
  </div>
}
