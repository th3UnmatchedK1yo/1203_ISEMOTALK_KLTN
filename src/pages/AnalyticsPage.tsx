import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Download, RefreshCw } from 'lucide-react'
import { getAnalytics, emotionLabels, provenanceLabel, resolveApiUrl, type Analytics, type Emotion } from '@/api/isemotalk'

const emotions: Emotion[] = ['neutral', 'happy', 'sad', 'angry']
const colors: Record<Emotion,string> = { neutral:'bg-slate-500', happy:'bg-emerald-600', sad:'bg-blue-600', angry:'bg-rose-600' }

export function AnalyticsPage() {
  const [data, setData] = useState<Analytics|null>(null)
  const [error,setError] = useState('')
  const [provenance,setProvenance] = useState('')
  const [refresh,setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setError('')
    getAnalytics(controller.signal,{provenance})
      .then(next => { if(!controller.signal.aborted) setData(next) })
      .catch((e: Error) => { if(!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  },[provenance,refresh])

  const eligible=data?.qaTriage?.eligible ?? 0
  const scored=data?.qaTriage?.scored ?? 0
  const flagged=data?.qaTriage?.needsAttention ?? 0
  const pendingQa=data ? data.review.unreviewed+data.review.in_progress : 0
  const emotionCount=data ? Object.values(data.customerEmotion).reduce((n,v)=>n+v,0) : 0
  const exportUrl='/api/export/analytics.csv'+(provenance?'?provenance='+encodeURIComponent(provenance):'')
  const metrics=data ? [
    {label:'Tổng hồ sơ',value:data.totals.calls,desc:'Ghi âm và dữ liệu nhập'},
    {label:'XLM-R đã sàng lọc',value:scored,desc:'Có kết quả còn hiệu lực'},
    {label:'AI gợi ý nghe trước',value:flagged,desc:'Nhãn needs_attention thử nghiệm'},
    {label:'QA đã hoàn tất',value:data.review.reviewed,desc:'Con người đã lưu đánh giá'},
  ] : []

  return <div className="mx-auto max-w-6xl space-y-7 text-slate-800">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
      <div className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-wider text-teal-800">Theo dõi sau cuộc gọi</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#12394d]">Tổng quan phân tích</h1>
        <p className="mt-2 text-sm leading-6 text-slate-700">Đã quét bao nhiêu cuộc gọi, cuộc nào cần nghe trước và còn bao nhiêu việc QA? Đây là trang báo cáo tổng hợp, không dùng để phân tích một file riêng lẻ.</p>
      </div>
      <button type="button" onClick={()=>setRefresh(n=>n+1)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-white"><RefreshCw size={16}/> Cập nhật</button>
    </header>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <label className="text-sm font-semibold text-slate-700">Nguồn dữ liệu
        <select className="mt-1 block h-10 min-w-[210px] rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={provenance} onChange={e=>setProvenance(e.target.value)}>
          <option value="">Tất cả nguồn</option>
          <option value="real">AI phân tích audio</option>
          <option value="imported">Nhập từ tệp</option>
          <option value="mock">Dữ liệu mô phỏng</option>
        </select>
      </label>
      <div className="flex items-center gap-4">
        <Link to="/guide" className="text-sm font-semibold text-teal-800 hover:underline">Cách dùng trang này</Link>
        {data && <a href={resolveApiUrl(exportUrl)} className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800 hover:underline"><Download size={16}/> Xuất CSV</a>}
      </div>
    </div>
    {error && <p role="alert" className="rounded-md border border-red-200 bg-white p-4 text-sm text-red-800">{error}</p>}
    {!data && !error && <p role="status" className="text-sm text-slate-700">Đang tổng hợp thống kê…</p>}
    {data && <>
      {data.provenance.mock>0 && <p className="border-l-[3px] border-amber-500 bg-white px-4 py-3 text-sm text-slate-700">Dữ liệu đang gồm {data.provenance.mock} hồ sơ mô phỏng. Chọn nguồn “AI phân tích audio” để xem riêng inference.</p>}
      <section aria-labelledby="ops-stat-title">
        <h2 id="ops-stat-title" className="text-lg font-bold text-[#12394d]">Kết quả vận hành</h2>
        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 md:grid-cols-4">
          {metrics.map(m=><div key={m.label} className="bg-white p-5">
            <p className="text-xs font-semibold text-slate-600">{m.label}</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-[#12394d]">{m.value}</p>
            <p className="mt-2 text-xs text-slate-500">{m.desc}</p>
          </div>)}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="qa-coverage-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="qa-coverage-title" className="text-lg font-bold text-[#12394d]">XLM-R đã chấm bao nhiêu cuộc gọi?</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">Chấm ở đây nghĩa là <strong>đã sàng lọc văn bản</strong>, không phải chấm chất lượng dịch vụ hay cảm xúc. Mỗi hồ sơ đủ điều kiện có thể có một chỉ số từ XLM-R.</p>
          </div>
          <Link to="/calls" className="inline-flex items-center gap-1.5 text-sm font-bold text-teal-800 hover:underline">Mở hàng đợi QA <ArrowRight size={16}/></Link>
        </div>
        <div className="mt-5 flex flex-wrap items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums text-[#12394d]">{scored}</span>
          <span className="text-sm text-slate-600">/ {eligible} hồ sơ đủ điều kiện đã có kết quả</span>
          <span className="ml-auto text-sm font-bold tabular-nums text-slate-900">{eligible ? (100*scored/eligible).toFixed(1)+'%' : '—'}</span>
        </div>
        <progress aria-label="Tỉ lệ hồ sơ đủ điều kiện đã có kết quả XLM-R" className="mt-3 h-2 w-full accent-teal-700" max={Math.max(1,eligible)} value={scored}/>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          {data.qaTriage ? data.qaTriage.waiting+' chưa có kết quả · '+data.qaTriage.needsRerun+' cần chạy lại · '+data.qaTriage.routine+' không được AI ưu tiên.' : 'Chưa có hồ sơ đủ điều kiện trong phạm vi nguồn này.'}
          {' '}<strong>100% là đã quét hết hồ sơ đủ điều kiện, không phải AI chính xác 100%.</strong>
        </p>
      </section>

      <section className="grid gap-5 md:grid-cols-2" aria-label="Công việc còn lại">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold text-slate-900">Tình trạng xử lý audio</h2>
          <div className="mt-3 divide-y divide-slate-100 text-sm">
            <p className="flex justify-between py-2"><span>Đang chờ hoặc xử lý</span><strong>{data.status.processing}</strong></p>
            <p className="flex justify-between py-2"><span>Chạy thất bại</span><strong>{data.status.failed}</strong></p>
            <p className="flex justify-between py-2"><span>XLM-R chờ / cần chạy lại</span><strong>{data.qaTriage ? data.qaTriage.waiting+data.qaTriage.needsRerun : 0}</strong></p>
          </div>
          <Link to="/scan" className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-teal-800 hover:underline">Theo dõi lô audio <ArrowRight size={15}/></Link>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold text-slate-900">Công việc của người QA</h2>
          <div className="mt-3 divide-y divide-slate-100 text-sm">
            <p className="flex justify-between py-2"><span>Chưa hoàn tất đánh giá</span><strong>{pendingQa}</strong></p>
            <p className="flex justify-between py-2"><span>Đã hoàn tất đánh giá</span><strong>{data.review.reviewed}</strong></p>
            <p className="flex justify-between py-2"><span>AI gợi ý nghe trước</span><strong>{flagged}</strong></p>
          </div>
          <Link to="/calls" className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-teal-800 hover:underline">Nghe và đánh giá <ArrowRight size={15}/></Link>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="emotion-overview-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="emotion-overview-title" className="text-lg font-bold text-[#12394d]">Giám sát cảm xúc khách hàng</h2>
          <Link to="/research" className="text-sm font-semibold text-teal-800 hover:underline">Cách SER hoạt động</Link>
        </div>
        {emotionCount===0 ? <div className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
          <p><strong>Chưa đủ dữ liệu để vẽ biểu đồ cảm xúc.</strong> XLM-R chỉ sàng lọc nội dung transcript. SER F4 chưa có đầu ra đã xác minh trên web này.</p>
          <p className="mt-2 text-slate-600">Khi SER và vai trò người nói thực sự hoạt động, trang này mới tổng hợp cảm xúc; không suy ra khách hàng hài lòng khi chưa có nhãn.</p>
        </div> : <>
          <p className="mt-2 text-xs text-slate-600">Chỉ đếm nhãn cảm xúc trên câu đã gán vai trò khách hàng. Cần kiểm tra nguồn nhập/mô phỏng trước khi dùng.</p>
          <div className="mt-4 max-w-3xl space-y-3">
            {emotions.map(e=><div key={e} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
              <span>{emotionLabels[e]}</span>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className={colors[e]+' h-full'} style={{width:String(100*data.customerEmotion[e]/emotionCount)+'%'}}/></div>
              <span className="text-right font-semibold tabular-nums">{data.customerEmotion[e]}</span>
            </div>)}
          </div>
          {data.coverage && <p className="mt-4 text-xs text-slate-600">{data.coverage.customerWithEmotion}/{data.coverage.customerUtterances} câu khách hàng có nhãn; {data.coverage.unknownSpeakerUtterances} câu chưa xác định người nói không được tính.</p>}
        </>}
      </section>
      {data.attention.length>0 && <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-bold text-slate-900">Cuộc gọi cần nghe lại từ nhãn cảm xúc</h2>
        <p className="mt-1 text-xs text-slate-600">Danh sách này khác với gợi ý XLM-R. Chỉ có giá trị khi nhãn SER được kiểm chứng.</p>
        <div className="mt-3 divide-y divide-slate-100">{data.attention.map(c=><Link key={c.id} to={'/calls/'+encodeURIComponent(c.id)} className="flex justify-between gap-4 py-3 text-sm text-teal-800 hover:underline">
          <span>{c.title}<span className="ml-2 text-xs text-slate-500">{c.id} · {provenanceLabel(c.provenance)}</span></span>
          <span className="shrink-0 text-xs text-slate-600">{c.momentCount} đoạn</span>
        </Link>)}</div>
      </section>}
      <p className="text-xs leading-5 text-slate-500">Bất đồng âm thanh / văn bản chỉ tính được khi hai nhánh dự đoán cùng có đầu ra. Hiện có {data.modality.utterancesWithBoth} câu có cả hai nhánh trong bộ lọc đang chọn.</p>
    </>}
  </div>
}
