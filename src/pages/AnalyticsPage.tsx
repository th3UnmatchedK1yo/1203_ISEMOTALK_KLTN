import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAnalytics, emotionLabels, percent, type Analytics, type Emotion } from '@/api/isemotalk'

export function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const ac = new AbortController()
    getAnalytics(ac.signal).then(setData).catch((e: Error) => {if (!ac.signal.aborted) setError(e.message)})
    return () => ac.abort()
  }, [])
  if (error) return <div role="alert" className="rounded-md border border-red-300 p-4 text-red-700">{error}</div>
  if (!data) return <p className="text-slate-500">Đang tải thống kê từ SQLite…</p>
  const metrics = [
    { title: 'Tổng cuộc gọi', value: data.totals.calls },
    { title: 'Sẵn sàng đánh giá', value: data.status.ready },
    { title: 'Đã đánh giá', value: data.review.reviewed },
    { title: 'Cần xem xét', value: data.review.unreviewed + data.review.in_progress },
    { title: 'Tỉ lệ hoàn thành', value: percent(data.review.completionRate) },
    { title: 'Xung đột âm thanh / văn bản', value: percent(data.modality.conflictRate) },
  ]
  const emotions: Emotion[] = ['neutral','happy','sad','angry']
  const colors: Record<Emotion, string> = {neutral:'bg-slate-400',happy:'bg-emerald-500',sad:'bg-blue-500',angry:'bg-red-500'}
  const denom = Math.max(1, Object.values(data.customerEmotion).reduce((a,b)=>a+b,0))
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold">Phân tích chất lượng cuộc gọi</h1><p className="mt-1 text-sm text-slate-500">Thống kê được tính từ cơ sở dữ liệu SQLite · gồm cả dữ liệu demo nếu đã nạp.</p></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{metrics.map(m => <div key={m.title} className="rounded-lg border bg-white p-4"><p className="text-xs text-slate-500">{m.title}</p><p className="mt-1 text-2xl font-semibold">{m.value}</p></div>)}</div>
    <div className="rounded-lg border bg-white p-5"><h2 className="font-medium">Phân bố cảm xúc khách hàng (sau chỉnh sửa)</h2>
      <div className="mt-4 space-y-3">{emotions.map(e=><div key={e} className="grid grid-cols-[100px_1fr_45px] items-center gap-3 text-sm"><span>{emotionLabels[e]}</span><div className="h-3 overflow-hidden rounded bg-slate-100"><div className={colors[e]+' h-full'} style={{width:`${data.customerEmotion[e]/denom*100}%`}}/></div><span className="text-right">{data.customerEmotion[e]}</span></div>)}</div>
    </div>
    <div className="rounded-lg border bg-white p-5"><h2 className="font-medium">Cuộc gọi ưu tiên xem xét</h2>
      {data.attention.length===0 ? <p className="mt-3 text-sm text-slate-500">Không có cuộc gọi ưu tiên cao chưa hoàn tất.</p> :
        <div className="mt-3 divide-y">{data.attention.map(c=><Link key={c.id} to={'/calls/'+encodeURIComponent(c.id)} className="flex justify-between gap-3 py-3 text-sm hover:text-blue-700"><span><strong>{c.id}</strong> · {c.title}</span><span className="shrink-0 text-slate-500">{c.momentCount} điểm chú ý</span></Link>)}</div>}
    </div>
    <p className="text-xs text-slate-500">Nguồn dữ liệu: {data.provenance.mock} demo, {data.provenance.imported} nhập từ tệp, {data.provenance.real} inference. Dữ liệu demo không phải kết quả mô hình nghiên cứu.</p>
  </div>
}
