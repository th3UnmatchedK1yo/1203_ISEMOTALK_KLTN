import { useEffect, useState } from 'react'
import { ArrowRight, CircleAlert, CircleCheck, Info } from 'lucide-react'
import { apiJson, getSystemStatus } from '@/api/isemotalk'

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
export function CallQaTriage({ callId, version, autoEligible = true }: { callId: string; version: number; autoEligible?: boolean }) {
  const [data, setData] = useState<QaTriageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [modelAvailable, setModelAvailable] = useState<boolean | null>(null)
  const [automatic, setAutomatic] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setInterval> | null = null
    setLoading(true)
    setData(null)
    setError('')
    const refresh = async () => {
      try {
        const next = await apiJson<QaTriageResponse>('/api/calls/' + encodeURIComponent(callId) + '/qa-triage', {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setData(next)
        setLoading(false)
        if (next.result && !next.outdated && timer) {
          clearInterval(timer)
          timer = null
        }
      } catch (err) {
        if (!controller.signal.aborted) { setError((err as Error).message); setLoading(false) }
      }
    }
    void refresh()
    // Score becomes visible automatically after background XLM-R inference.
    // Never require a second button just to see the result of an imported call.
    timer = setInterval(() => void refresh(), 5000)
    return () => { controller.abort(); if (timer) clearInterval(timer) }
  }, [callId, version])

  useEffect(() => {
    const controller = new AbortController()
    setModelAvailable(null)
    setAutomatic(false)
    void getSystemStatus(controller.signal)
      .then(status => {
        if (!controller.signal.aborted) {
          const loaded = status.inference.reachable && status.inference.qa?.ready === true && status.inference.qa.loaded === true
          setModelAvailable(!!loaded)
          setAutomatic(!!loaded && status.automation?.qa === true)
        }
      })
      .catch(() => { if (!controller.signal.aborted) setModelAvailable(false) })
    return () => controller.abort()
  }, [callId])

  const run = async () => {
    if (busy || modelAvailable !== true) return
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
  const windowed = prediction?.model.includes('/window-max-v2') === true
  const stale = !!data?.outdated || !!prediction?.truncated
  const alert = !!prediction && (prediction.label === 'needs_attention' || stale)
  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="qa-model-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-teal-700">BƯỚC 2 · GỢI Ý AI</p>
        <h2 id="qa-model-title" className="mt-1 text-lg font-bold text-[#12394d]">Cuộc gọi có cần xem kỹ?</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">XLM-R sàng lọc theo transcript. QA quyết định sau khi nghe.</p>
      </div>
      {modelAvailable === true && (data?.outdated || !automatic) &&
        <button type="button" onClick={() => void run()} disabled={busy || loading}
          className="inline-flex min-h-10 items-center rounded-lg border border-teal-700 bg-white px-3 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50 disabled:opacity-50">
          {busy ? 'Đang phân tích…' : 'Chạy lại AI'}
        </button>}
    </div>
    {modelAvailable !== true && <p role="status" className="mt-3 text-sm text-amber-900">
      {modelAvailable === null ? 'Đang kiểm tra kết nối XLM-R…' : 'XLM-R chưa sẵn sàng. Kết quả đã lưu vẫn có thể xem nhưng không thể chạy lại.'}
    </p>}
    {loading && <p role="status" className="mt-4 text-sm text-slate-600">Đang tải kết quả AI…</p>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {prediction && <div className={'mt-4 border-l-4 px-4 py-3 ' + (alert ? 'border-amber-500 bg-amber-50/60' : 'border-teal-600 bg-teal-50/60')}>
      <div className="flex items-start gap-2">
        {alert ? <CircleAlert size={20} className="mt-0.5 shrink-0 text-amber-800" aria-hidden="true"/> :
          <CircleCheck size={20} className="mt-0.5 shrink-0 text-teal-800" aria-hidden="true"/>}
        <div>
          <p className="font-bold leading-6 text-slate-900">
            {data?.outdated ? 'Kết quả cũ · cần phân tích lại'
              : prediction.truncated ? 'Chưa bao phủ toàn transcript · cần QA kiểm tra'
              : prediction.label === 'needs_attention' ? 'Gợi ý: ưu tiên QA kiểm tra' : 'Chưa có cảnh báo mạnh từ XLM-R'}
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            Điểm cảnh báo{windowed ? ' cao nhất theo đoạn' : ''}: <strong>{(prediction.score * 100).toFixed(1)}%</strong>.
            Đây là điểm sàng lọc của model, không phải độ chính xác hay kết luận lỗi nhân viên.
          </p>
        </div>
      </div>
    </div>}
    {prediction && (data?.outdated || prediction.truncated) && <p role="alert" className="mt-3 text-sm leading-6 font-medium text-amber-900">
      {data?.outdated ? 'Transcript đã đổi hoặc kết quả phiên cũ chỉ đọc phần đầu. Không sử dụng điểm này để kết luận; cần phân tích lại.'
        : windowed ? 'Vượt giới hạn 48 cửa sổ: có đoạn chưa được quét. QA cần nghe toàn bộ.'
        : 'Kết quả phiên cũ chỉ đọc phần đầu transcript. Hãy chạy lại model.'}
    </p>}
    {!loading && !prediction && !error && <p role="status" className="mt-4 text-sm leading-6 text-slate-700">
      {!autoEligible ? 'Đây không phải dữ liệu CSKH thuộc phạm vi chấm QA tự động.'
        : automatic ? 'AI đang tự phân tích transcript. Kết quả sẽ xuất hiện ở đây.'
        : modelAvailable === true ? 'Model đã sẵn sàng nhưng xử lý tự động chưa bật. Có thể chạy thủ công.'
        : 'Chưa có kết quả AI; QA vẫn có thể nghe và ghi nhận thủ công.'}
    </p>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
      <a href="#call-review" className="inline-flex min-h-9 items-center gap-2 text-sm font-bold text-teal-800 hover:underline">
        Ghi nhận kết luận QA <ArrowRight size={16} aria-hidden="true"/>
      </a>
      <details className="group text-xs text-slate-600">
        <summary className="inline-flex cursor-pointer items-center gap-1.5 font-medium hover:text-slate-900"><Info size={14} aria-hidden="true"/> Phương pháp & giới hạn</summary>
        <div className="mt-2 max-w-md space-y-2 text-xs leading-5">
          <p>Model học từ OneVoice TTS tổng hợp, chưa được kiểm chứng trên cuộc gọi CSKH người thật.</p>
          {windowed && <p>Transcript dài được quét theo nhiều cửa sổ token. Điểm cao nhất là heuristic chưa hiệu chuẩn thành xác suất cho toàn cuộc gọi.</p>}
          {prediction && <p className="break-all">Model: {prediction.model} · {prediction.createdAt}</p>}
        </div>
      </details>
    </div>
  </section>
}
