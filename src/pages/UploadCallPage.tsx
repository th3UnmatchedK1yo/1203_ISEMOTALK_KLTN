import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileAudio, FileText, Upload, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  getSystemStatus, uploadRecording, importAnalysis,
  type SystemStatus,
} from '@/api/isemotalk'

type Mode = 'recording' | 'results'
const MB = 1024 * 1024
const MAX_BYTES = 300 * MB

export function UploadCallPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('recording')
  const [audio, setAudio] = useState<File | null>(null)
  const [transcript, setTranscript] = useState<File | null>(null)
  const [results, setResults] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [agentName, setAgentName] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [agentChannel, setAgentChannel] = useState('0')
  const [health, setHealth] = useState<SystemStatus | null>(null)
  const [healthError, setHealthError] = useState('')
  const [checking, setChecking] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [healthRefresh, setHealthRefresh] = useState(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const refreshHealth = () => setHealthRefresh(value => value + 1)

  const changeMode = (next: Mode) => {
    if (uploading || next === mode) return
    setMode(next)
    setAudio(null)
    setTranscript(null)
    setResults(null)
    setError('')
  }

  useEffect(() => {
    const controller = new AbortController()
    setChecking(true)
    setHealthError('')
    getSystemStatus(controller.signal)
      .then(value => { if (!controller.signal.aborted) setHealth(value) })
      .catch((e: Error) => { if (!controller.signal.aborted) { setHealth(null); setHealthError(e.message) } })
      .finally(() => { if (!controller.signal.aborted) setChecking(false) })
    return () => controller.abort()
  }, [healthRefresh])

  const inference = health?.inference
  const reachable = inference?.reachable === true
  const asr = inference?.components?.asr
  const ser = inference?.components?.ser
  const realAsr = reachable && asr?.ready && !asr.mock
  const realSer = reachable && ser?.ready && !ser.mock
  const inputClass = 'mt-2 h-12 w-full rounded-lg border border-[#b5c9d2] bg-white px-3 text-sm focus:border-slate-600 focus:outline-none'

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (uploading) return
    setError('')
    if (mode === 'recording' && !audio) {
      setError('Hãy chọn một file ghi âm thật trước khi tiếp tục.')
      return
    }
    if (mode === 'results' && !results) {
      setError('Hãy chọn file JSON/CSV chứa kết quả phân tích.')
      return
    }
    const files = (mode === 'recording' ? [audio, transcript] : [results, audio]).filter((f): f is File => !!f)
    if (files.some(f => f.size > MAX_BYTES)) {
      setError('Có file vượt quá 300 MB. Hãy dùng bản ghi ngắn hơn hoặc kiểm tra cấu hình giới hạn upload.')
      return
    }
    const needsInferenceService = mode === 'recording' || !!audio
    if (needsInferenceService && !reachable) {
      setError('Dịch vụ xử lý âm thanh chưa kết nối. Hãy khởi động dịch vụ rồi bấm Kiểm tra lại. Bạn vẫn có thể nhập JSON/CSV mà không kèm audio.')
      return
    }
    if (needsInferenceService && !inference?.ffmpeg) {
      setError('Dịch vụ chưa sẵn sàng đọc âm thanh. Kiểm tra công cụ ffmpeg/ffprobe trong cấu hình máy rồi thử lại.')
      return
    }
    if (mode === 'recording' && (!asr?.ready && !transcript)) {
      setError('Chuyển giọng nói thành văn bản chưa sẵn sàng. Bạn có thể đính kèm transcript có mốc thời gian hoặc kiểm tra cấu hình ASR.')
      return
    }
    if (mode === 'recording' && !ser?.ready) {
      setError('SER chưa sẵn sàng. Hãy cấu hình checkpoint đã được xác minh hoặc chọn chế độ mock có ghi nhãn để kiểm tra workflow.')
      return
    }

    const data = new FormData()
    if (title.trim()) data.append('title', title.trim())
    if (agentName.trim()) data.append('agentName', agentName.trim())
    if (customerName.trim()) data.append('customerName', customerName.trim())
    if (mode === 'recording') {
      data.append('audio', audio!)
      data.append('agentChannel', agentChannel)
      if (transcript) data.append('transcript', transcript)
    } else {
      data.append('results', results!)
      if (audio) data.append('audio', audio)
    }
    setUploading(true)
    try {
      const created = mode === 'recording' ? await uploadRecording(data) : await importAnalysis(data)
      if (mounted.current) navigate('/calls/' + encodeURIComponent(created.id))
    } catch (e) {
      if (mounted.current) setError((e as Error).message)
    } finally {
      if (mounted.current) setUploading(false)
    }
  }

  return <div className="mx-auto max-w-5xl space-y-6">
    <div>
      <Link to="/calls" className="inline-flex items-center gap-1 text-sm text-slate-700 hover:text-teal-800"><ArrowLeft size={16}/> Danh sách cuộc gọi</Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#12394d]">Thêm cuộc gọi</h1>
      <p className="mt-2 text-base text-slate-700">Tải bản ghi âm để xử lý, hoặc nhập kết quả phân tích đã có. Nguồn mô phỏng, inference và dữ liệu nhập được ghi riêng.</p>
    </div>

    <section className="rounded-xl border border-[#c4d4dc] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#12394d]">Khả năng xử lý hiện tại</h2>
        <button type="button" onClick={refreshHealth} disabled={checking} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-teal-50/70 disabled:opacity-50"><RefreshCw size={13}/> {checking?'Đang kiểm tra…':'Kiểm tra lại'}</button>
      </div>
      {healthError && <p role="alert" className="mt-3 text-sm text-red-700">{healthError}</p>}
      {!health && !healthError && <p className="mt-3 text-sm text-slate-700">Đang kiểm tra dịch vụ xử lý…</p>}
      {health && <div className="mt-3 space-y-2">
        <p className={'flex items-center gap-2 text-sm '+(reachable?'text-green-700':'text-amber-700')}>
          {reachable?<CheckCircle2 size={16}/>:<AlertTriangle size={16}/>}
          {reachable?'Dịch vụ xử lý đã kết nối':'Dịch vụ xử lý chưa kết nối'}
          {reachable && inference?.device ? ' · '+inference.device : ''}
        </p>
        {reachable ? <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <strong className="block text-slate-900">Giọng nói → văn bản (ASR)</strong>
            <p className="mt-2 font-medium">{realAsr ? asr?.loaded ? 'Đã nạp mô hình' : 'Đã cấu hình · sẽ nạp khi xử lý' : asr?.mock ? 'Đang mô phỏng' : 'Chưa sẵn sàng'}</p>
            <details className="mt-2 text-slate-700"><summary className="cursor-pointer">Chi tiết cấu hình</summary><p className="mt-2 break-words leading-6">{asr?.detail ?? 'Không có thông tin'}</p></details>
          </div>
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <strong className="block text-slate-900">Dự đoán cảm xúc (SER)</strong>
            <p className="mt-2 font-medium">{ser?.mock ? 'Đang mô phỏng' : realSer ? ser.verified ? 'Gói mô hình đã xác minh' : 'Chưa xác minh gói mô hình' : 'Chưa sẵn sàng'}</p>
            <details className="mt-2 text-slate-700"><summary className="cursor-pointer">Chi tiết cấu hình</summary><p className="mt-2 break-words leading-6">{ser?.detail ?? 'Không có thông tin'}</p></details>
          </div>
        </div> : <p className="text-sm text-slate-700">{inference?.error || 'Khởi động dịch vụ xử lý để phân tích bản ghi âm.'}</p>}
        {reachable && (!realAsr || !realSer) && <p className="text-sm leading-6 text-amber-900">Chưa có đủ cả hai bước ASR + SER bằng mô hình thật. Bước mô phỏng được ghi rõ trong kết quả.</p>}
        {realSer && <p className="text-sm leading-6 text-slate-600">Xác minh gói mô hình không phải đánh giá độ chính xác trên cuộc gọi thực tế.</p>}
      </div>}
    </section>

    <section className="rounded-xl border border-[#c4d4dc] bg-white p-6 shadow-sm">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Cách thêm cuộc gọi">
        <button type="button" disabled={uploading} aria-pressed={mode==='recording'} onClick={()=>changeMode('recording')} className={'flex items-start gap-2 rounded-md border p-4 text-left disabled:opacity-50 '+(mode==='recording'?'border-teal-700 bg-teal-50':'hover:bg-teal-50/70')}>
          <FileAudio className="mt-0.5 shrink-0" size={19}/>
          <span><strong className="block text-sm">Tải bản ghi âm</strong><span className="mt-1 block text-sm text-slate-700">Audio + ASR + SER, hoặc audio kèm transcript</span></span>
        </button>
        <button type="button" disabled={uploading} aria-pressed={mode==='results'} onClick={()=>changeMode('results')} className={'flex items-start gap-2 rounded-md border p-4 text-left disabled:opacity-50 '+(mode==='results'?'border-teal-700 bg-teal-50':'hover:bg-teal-50/70')}>
          <FileText className="mt-0.5 shrink-0" size={19}/>
          <span><strong className="block text-sm">Nhập kết quả có sẵn</strong><span className="mt-1 block text-sm text-slate-700">JSON/CSV dự đoán + audio tùy chọn</span></span>
        </button>
      </div>

      <form onSubmit={e=>void submit(e)} className="mt-5 space-y-4">
        <fieldset disabled={uploading} className="min-w-0 space-y-4 disabled:opacity-70">
        <legend className="sr-only">Thông tin và tệp của cuộc gọi</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Tiêu đề cuộc gọi<input className={inputClass} value={title} onChange={e=>setTitle(e.target.value)} maxLength={200} placeholder="Ví dụ: Khiếu nại đơn hàng"/></label>
          <div className="hidden sm:block"/>
          <label className="block text-sm font-medium">Tên nhân viên (nếu biết)<input className={inputClass} value={agentName} onChange={e=>setAgentName(e.target.value)} maxLength={120}/></label>
          <label className="block text-sm font-medium">Tên khách hàng (nếu biết)<input className={inputClass} value={customerName} onChange={e=>setCustomerName(e.target.value)} maxLength={120}/></label>
        </div>
        <div key={mode} className="space-y-4">{mode === 'recording' ? <>
          <label className="block text-sm font-medium">File ghi âm thật (bắt buộc)
            <input type="file" accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4" onChange={e=>setAudio(e.target.files?.[0]??null)} required className="mt-2 block w-full rounded-md border p-2 text-sm"/>
          </label>
          <label className="block text-sm font-medium">Transcript có timestamp (tùy chọn)
            <input type="file" accept=".csv,.json" onChange={e=>setTranscript(e.target.files?.[0]??null)} className="mt-2 block w-full rounded-md border p-2 text-sm"/>
            <span className="mt-2 block text-sm font-normal leading-6 text-slate-700">Có transcript thì bỏ qua bước ASR. Tệp cần start, end (giây), text và speaker (nếu biết). Người nói chưa rõ được giữ là unknown.</span>
          </label>
          <label className="block text-sm font-medium">Nếu file stereo tách hai người nói, nhân viên nằm ở kênh
            <select className={inputClass} value={agentChannel} onChange={e=>setAgentChannel(e.target.value)}><option value="0">Kênh trái (0)</option><option value="1">Kênh phải (1)</option></select>
          </label>
        </> : <>
          <label className="block text-sm font-medium">File kết quả JSON/CSV (bắt buộc)
            <input type="file" accept=".json,.csv" required onChange={e=>setResults(e.target.files?.[0]??null)} className="mt-2 block w-full rounded-md border p-2 text-sm"/>
            <span className="mt-1 block text-sm font-normal text-slate-700">Mỗi câu: start, end, text, speaker, fused_emotion và fused_confidence (hoặc đối tượng fused). Chỉ nhập dự đoán đã được tạo trước đó; không tự suy luận.</span>
          </label>
          <label className="block text-sm font-medium">File audio đi kèm (tùy chọn)
            <input type="file" accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4" onChange={e=>setAudio(e.target.files?.[0]??null)} className="mt-2 block w-full rounded-md border p-2 text-sm"/>
          </label>
        </>}</div>
        </fieldset>
        {error && <p role="alert" className="whitespace-pre-line rounded-md border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-slate-700">Giới hạn mặc định: 300 MB/file. Đừng upload ghi âm riêng tư khi chưa có quyền sử dụng dữ liệu.</p>
          <button type="submit" disabled={uploading} className="inline-flex items-center gap-2 rounded-md bg-[#0E5665] px-4 py-2 text-sm font-medium text-white hover:bg-[#0B4554] disabled:opacity-50">
            <Upload size={15}/>{uploading?'Đang gửi lên máy…':mode==='recording'?'Tải lên và xử lý':'Nhập kết quả'}
          </button>
        </div>
      </form>
    </section>
  </div>
}
