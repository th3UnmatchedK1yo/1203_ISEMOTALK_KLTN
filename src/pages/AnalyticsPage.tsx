import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, RefreshCw } from 'lucide-react'
import { getAnalytics, emotionLabels, percent, provenanceLabel, resolveApiUrl, type Analytics, type Emotion } from '@/api/isemotalk'

const emotions: Emotion[] = ['neutral', 'happy', 'sad', 'angry']
const colors: Record<Emotion, string> = { neutral: 'bg-slate-500', happy: 'bg-emerald-600', sad: 'bg-blue-600', angry: 'bg-red-600' }

export function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null)
  const [error, setError] = useState('')
  const [provenance, setProvenance] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    setError('')
    getAnalytics(controller.signal, { provenance })
      .then(next => { if (!controller.signal.aborted) setData(next) })
      .catch((failure: Error) => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [provenance, refresh])

  const count = data ? Object.values(data.customerEmotion).reduce((a, b) => a + b, 0) : 0
  const metrics = data ? [
    { title: 'Tổng cuộc gọi', value: data.totals.calls },
    { title: 'Sẵn sàng đánh giá', value: data.status.ready },
    { title: 'Đã hoàn tất QA', value: data.review.reviewed },
    { title: 'Chưa hoàn tất QA', value: data.review.unreviewed + data.review.in_progress },
    { title: 'Hoàn tất / cuộc gọi sẵn sàng', value: data.status.ready ? percent(data.review.completionRate) : '—' },
    { title: 'Bất đồng âm thanh / văn bản', value: percent(data.modality.conflictRate) },
  ] : []
  const exportUrl = '/api/export/analytics.csv' + (provenance ? '?provenance=' + encodeURIComponent(provenance) : '')

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-semibold tracking-tight text-[#12394d]">Tổng quan đánh giá</h1>
        <p className="mt-2 text-base text-slate-700">Theo dõi công việc QA và dữ liệu hiện có trong hệ thống.</p>
      </div>
      <button type="button" onClick={() => setRefresh(value => value + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-teal-50"><RefreshCw size={17}/> Cập nhật</button>
    </header>
    <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-[#c4d4dc] bg-white p-4">
      <label className="block text-sm font-semibold text-slate-700">Nguồn kết quả
        <select className="mt-2 block h-11 min-w-[220px] rounded-lg border border-slate-300 bg-white px-3 text-sm" value={provenance} onChange={e => setProvenance(e.target.value)}>
          <option value="">Tất cả nguồn</option><option value="real">Kết quả inference</option><option value="imported">Nhập từ tệp</option><option value="mock">Demo / mô phỏng</option>
        </select>
      </label>
      {data && <a href={resolveApiUrl(exportUrl)} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-800 underline-offset-4 hover:underline"><Download size={17}/> Xuất thống kê đang xem</a>}
    </div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">{error} Bấm Cập nhật để thử lại.</p>}
    {!data && !error && <p role="status" className="text-slate-700">Đang tải thống kê…</p>}
    {data && <>
      <p className="text-sm leading-6 text-slate-700">Nguồn dữ liệu: <strong>{data.provenance.mock}</strong> demo · <strong>{data.provenance.imported}</strong> nhập từ tệp · <strong>{data.provenance.real}</strong> inference · <strong>{data.provenance.unknown}</strong> chưa xác định.</p>
      {data.provenance.mock > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">Thống kê đang bao gồm dữ liệu mô phỏng. Chọn nguồn kết quả để xem riêng từng nhóm; các con số này không đánh giá độ chính xác mô hình.</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(metric => <div key={metric.title} className="rounded-xl border border-[#c4d4dc] bg-white p-5">
        <p className="text-sm font-medium text-slate-700">{metric.title}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-[#12394d]">{metric.value}</p>
      </div>)}</div>
      <p className="text-sm leading-6 text-slate-600">Có {data.status.processing} cuộc gọi đang chờ hoặc đang xử lý và {data.status.failed} cuộc gọi xử lý chưa thành công. Thống kê QA và cảm xúc chỉ dùng cuộc gọi đã sẵn sàng.</p>

      {data.qaTriage && <section className="rounded-xl border border-teal-200 bg-white p-5 sm:p-6" aria-labelledby="qa-coverage-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-teal-800">AI SÀNG LỌC THEO HÀNG ĐỢI</p>
            <h2 id="qa-coverage-title" className="mt-1 text-xl font-bold text-[#12394d]">XLM-R đã chấm bao nhiêu cuộc gọi?</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">Đếm kết quả <strong>QA theo transcript</strong>, không phải nhận diện cảm xúc. Chỉ tính những bản ghi đủ điều kiện: OneVoice có kịch bản hoặc cuộc gọi đã có transcript từ inference thực.</p>
          </div>
          <Link to="/calls" className="inline-flex min-h-10 items-center rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50">Mở hàng đợi QA</Link>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {([
            ['Đủ điều kiện QA', data.qaTriage.eligible],
            ['Đã có điểm AI', data.qaTriage.scored],
            ['AI gợi ý xem kỹ', data.qaTriage.needsAttention],
            ['Chờ / cần chạy lại', data.qaTriage.waiting + data.qaTriage.needsRerun],
          ] as const).map(([label,value]) => <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-600">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
          </div>)}
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3 text-sm text-slate-700">
            <span>Độ bao phủ hồ sơ có điểm QA còn hiệu lực</span>
            <strong className="tabular-nums">{data.qaTriage.eligible
              ? (data.qaTriage.scored * 100 / data.qaTriage.eligible).toFixed(1) + '%' : '—'}</strong>
          </div>
          <progress aria-label="Tỷ lệ hồ sơ đã có kết quả XLM-R còn hiệu lực"
            max={Math.max(1,data.qaTriage.eligible)} value={data.qaTriage.scored}
            className="mt-2 h-3 w-full accent-teal-700"/>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            {data.qaTriage.routine} cuộc chưa có cảnh báo mạnh · {data.qaTriage.waiting} chưa có kết quả · {data.qaTriage.needsRerun} cần chạy lại.
            Đây là tỷ lệ hồ sơ có kết quả, <strong>không phải độ chính xác</strong>, độ bao phủ toàn bộ token hay tốc độ xử lý 10.000 cuộc.
          </p>
        </div>
      </section>}

      <section className="rounded-xl border border-[#c4d4dc] bg-white p-5 sm:p-6" aria-labelledby="emotion-distribution-title">
        <h2 id="emotion-distribution-title" className="text-lg font-semibold text-[#12394d]">Cảm xúc trên các câu của khách hàng</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Đếm theo câu nói đã gán vai trò khách hàng. Dùng nhãn QA khi đã sửa; các câu còn lại dùng dự đoán gốc.</p>
        {count > 0 ? <div className="mt-5 space-y-4">{emotions.map(emotion => <div key={emotion} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
          <span className="font-medium text-slate-800">{emotionLabels[emotion]}</span>
          <div aria-hidden="true" className="h-4 overflow-hidden rounded-full bg-slate-100"><div className={colors[emotion] + ' h-full'} style={{ width: `${data.customerEmotion[emotion] / count * 100}%` }}/></div>
          <span className="text-right font-semibold tabular-nums">{data.customerEmotion[emotion]}</span>
        </div>)}</div> : <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">Chưa có câu của khách hàng kèm nhãn cảm xúc. Không thể suy ra khách hàng bình thường hoặc ít rủi ro từ việc thiếu dữ liệu.</p>}
        {data.coverage && <div className="mt-5 border-t border-slate-200 pt-4 text-sm leading-7 text-slate-700">
          <p><strong>{data.coverage.customerWithEmotion}/{data.coverage.customerUtterances}</strong> câu khách hàng có nhãn · <strong>{data.coverage.callsWithCustomerEmotion}</strong> cuộc gọi có dữ liệu cảm xúc khách hàng.</p>
          <p><strong>{data.coverage.unknownSpeakerUtterances}</strong> câu chưa xác định người nói không nằm trong biểu đồ · <strong>{data.coverage.unpredictedUtterances}</strong> câu chưa có dự đoán kết hợp.</p>
        </div>}
      </section>

      <section className="rounded-xl border border-[#c4d4dc] bg-white p-5" aria-labelledby="attention-title">
        <h2 id="attention-title" className="text-lg font-semibold text-[#12394d]">Cuộc gọi ưu tiên xem xét</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Gợi ý từ các quy tắc cảm xúc, chuyển biến và bất đồng giữa nhánh mô hình. Đây không phải xác suất rủi ro hay điểm năng lực nhân viên.</p>
        {data.attention.length === 0 ? <p className="mt-4 text-sm text-slate-700">Không có cuộc gọi ưu tiên cao chưa hoàn tất trong nguồn đang chọn.</p> :
          <div className="mt-4 divide-y divide-slate-200">{data.attention.map(call => <Link key={call.id} to={'/calls/' + encodeURIComponent(call.id)} className="flex flex-wrap items-center justify-between gap-3 py-4 text-base text-teal-900 hover:underline">
            <span><strong>{call.title}</strong><span className="mt-1 block text-sm text-slate-600">{call.id} · {provenanceLabel(call.provenance)}</span></span>
            <span className="shrink-0 text-sm text-slate-700">{call.momentCount} điểm cần xem xét</span>
          </Link>)}</div>}
      </section>
      <p className="text-sm leading-6 text-slate-600">Tỉ lệ bất đồng dùng {data.modality.utterancesWithBoth} câu có đủ cả đầu ra âm thanh và văn bản; {data.modality.conflicts} câu có nhãn khác nhau. Không có cả hai nhánh thì tỉ lệ hiển thị “—”.</p>
    </>}
  </div>
}
