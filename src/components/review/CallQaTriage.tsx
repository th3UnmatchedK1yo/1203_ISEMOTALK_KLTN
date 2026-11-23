import { useEffect, useState } from 'react'
import { apiJson } from '@/api/isemotalk'

// A second, independent QA model: predicts synthetic-dataset attention need.
// F4 SER remains on the audio timeline; this is NOT a human QA verdict.
export interface QaTriageResponse {
  result: null | {
    label: 'needs_attention' | 'routine'
    score: number
    model: string
    modelSha256: string
    dataset: 'synthetic_onevoice'
    truncated: boolean
    source: 'model'
    createdAt: string
  }
  outdated: boolean
  note?: string
}
export function CallQaTriage({ callId, version }: { callId: string; version: number }) {
  const [data, setData] = useState<QaTriageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setData(null)
    setError('')
    void apiJson<QaTriageResponse>('/api/calls/' + encodeURIComponent(callId) + '/qa-triage', { signal: controller.signal })
      .then(result => setData(result))
      .catch(err => { if (!controller.signal.aborted) setError((err as Error).message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [callId, version])

  const run = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await apiJson<QaTriageResponse>('/api/calls/' + encodeURIComponent(callId) + '/qa-triage', {
        method: 'POST',
      })
      setData(result)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const prediction = data?.result
  return <section className="rounded-xl border border-[#c4d4dc] bg-white p-5 shadow-sm" aria-labelledby="qa-model-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="qa-model-title" className="text-lg font-semibold text-[#12394d]">AI gợi ý cuộc gọi cần QA</h2>
        <p className="mt-1 text-sm text-slate-600">Model phân loại mức cần chú ý của cả cuộc gọi, độc lập với các nhãn cảm xúc SER.</p>
      </div>
      <button type="button" onClick={() => void run()} disabled={busy || loading}
        className="inline-flex min-h-11 items-center rounded-lg border border-teal-800 bg-white px-4 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50 disabled:opacity-50">
        {busy ? 'Đang chạy trên GPU…' : prediction ? 'Chạy lại model QA' : 'Phân tích bằng model QA'}
      </button>
    </div>
    {loading && <p role="status" className="mt-3 text-sm text-slate-600">Đang đọc kết quả QA đã lưu…</p>}
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {prediction && <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">
        {prediction.label === 'needs_attention' ? 'Gợi ý: cần QA xem xét' : 'Gợi ý: chưa thấy tín hiệu cần ưu tiên'}
      </p>
      <p className="text-sm text-slate-700">Điểm model cho nhãn cần chú ý: {(prediction.score * 100).toFixed(1)}%. Đây không phải độ chính xác.</p>
      {data.outdated && <p role="alert" className="font-semibold text-amber-900">Transcript đã thay đổi sau lần dự đoán này. Cần chạy lại.</p>}
      {prediction.truncated && <p className="text-sm text-amber-900">Cuộc gọi dài hơn giới hạn token; model chỉ đọc một phần transcript. Không dùng để kết luận toàn cuộc gọi.</p>}
      <p className="break-all text-xs text-slate-500">Model: {prediction.model} · {prediction.createdAt}</p>
    </div>}
    {!loading && !prediction && !error && <p className="mt-3 text-sm text-slate-600">Chưa chạy QA classifier cho cuộc gọi này.</p>}
    <p className="mt-3 text-sm leading-6 text-slate-600">Giới hạn: model được train trên OneVoice — dữ liệu tổng đài tiếng Việt tổng hợp, nhãn nghiệp vụ mô phỏng. Chưa kiểm chứng trên recording tổng đài thật. QA vẫn phải nghe, xác nhận và xử lý theo quy trình.</p>
  </section>
}
