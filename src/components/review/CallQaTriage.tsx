import { useEffect, useState } from 'react'
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
    void getSystemStatus(controller.signal)
      .then(status => {
        if (!controller.signal.aborted) setModelAvailable(status.inference.reachable && status.inference.qa?.ready === true)
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
  return <section className="rounded-xl border border-[#c4d4dc] bg-white p-5 shadow-sm" aria-labelledby="qa-model-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="qa-model-title" className="text-lg font-semibold text-[#12394d]">Sàng lọc QA tự động</h2>
        <p className="mt-1 text-sm text-slate-600">Hệ thống tự chạy XLM-R khi có transcript và checkpoint thật. Kết quả giúp QA chọn hồ sơ cần nghe, không phải kết luận nhân viên sai.</p>
      </div>
      {modelAvailable === true && (data?.outdated || !autoEligible) && <button type="button" onClick={() => void run()} disabled={busy || loading}
        className="inline-flex min-h-11 items-center rounded-lg border border-teal-800 bg-white px-4 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50 disabled:opacity-50">
        {busy ? 'Đang chạy trên GPU…' : 'Chạy lại khi cần'}
      </button>}
    </div>
    {modelAvailable !== true && <p role="status" className="mt-3 text-sm text-amber-900">{modelAvailable === null ? 'Đang kiểm tra model QA…' : 'Model QA chưa sẵn sàng trên GPU. Có thể xem kết quả đã lưu, nhưng chưa thể chạy lại model trong chế độ preview.'}</p>}
    {loading && <p role="status" className="mt-3 text-sm text-slate-600">Đang đọc kết quả QA đã lưu…</p>}
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {prediction && <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">
        {prediction.truncated ? 'Kết quả chưa bao phủ toàn transcript · cần nghe lại' : prediction.label === 'needs_attention' ? 'Gợi ý: cần QA xem xét' : 'Gợi ý: chưa thấy tín hiệu cần ưu tiên'}
      </p>
      <p className="text-sm text-slate-700">{windowed ? 'Điểm cảnh báo cao nhất trên các đoạn transcript' : 'Điểm model cho nhãn cần chú ý'}: {(prediction.score * 100).toFixed(1)}%. Đây không phải độ chính xác.</p>
      {windowed && <p className="text-sm text-slate-700">Đã quét transcript bằng nhiều cửa sổ token, sử dụng checkpoint XLM-R thật. Quy tắc lấy điểm cao nhất là heuristic chưa được hiệu chuẩn như xác suất cho toàn cuộc gọi.</p>}
      {data.outdated && <p role="alert" className="font-semibold text-amber-900">Transcript đã thay đổi sau lần dự đoán này. Cần chạy lại.</p>}
      {prediction.truncated && <p className="text-sm text-amber-900">{windowed
        ? 'Transcript vượt giới hạn 48 cửa sổ an toàn, một số vùng chưa được quét. Không dùng điểm này để kết luận toàn cuộc gọi.'
        : 'Kết quả phiên cũ chỉ đọc phần đầu transcript. Hệ thống sẽ tự chạy lại phiên bản quét theo cửa sổ.'}</p>}
      <p className="break-all text-xs text-slate-500">Model: {prediction.model} · {prediction.createdAt}</p>
    </div>}
    {!loading && !prediction && !error && <p role="status" className="mt-3 text-sm text-slate-700">
      {modelAvailable === true && autoEligible
        ? 'Đang tự động sàng lọc bằng XLM-R trên GPU. Kết quả sẽ hiện tại đây mà không cần bấm thêm.'
        : autoEligible ? 'QA model chưa kết nối nên chưa có dự đoán. Không hiển thị điểm giả.'
        : 'Đây không phải dữ liệu hội thoại CSKH trong phạm vi tự động chấm; không tự suy diễn nghiệp vụ từ bản ghi này.'}
    </p>}
    <p className="mt-3 text-sm leading-6 text-slate-600">Giới hạn: model được train trên OneVoice — dữ liệu tổng đài tiếng Việt tổng hợp, nhãn nghiệp vụ mô phỏng. Chưa kiểm chứng trên recording tổng đài thật. QA vẫn phải nghe, xác nhận và xử lý theo quy trình.</p>
  </section>
}
