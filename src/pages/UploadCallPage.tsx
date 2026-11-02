import { useEffect, useState, type FormEvent } from 'react'
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

  const refreshHealth = () => {
    setChecking(true)
    setHealthError('')
    getSystemStatus()
      .then(setHealth)
      .catch((e: Error) => { setHealth(null); setHealthError(e.message) })
      .finally(() => setChecking(false))
  }

  useEffect(() => {
    const controller = new AbortController()
    getSystemStatus(controller.signal)
      .then(setHealth)
      .catch((e: Error) => { if (!controller.signal.aborted) setHealthError(e.message) })
    return () => controller.abort()
  }, [])

  const inference = health?.inference
  const reachable = inference?.reachable === true
  const asr = inference?.components?.asr
  const ser = inference?.components?.ser
  const realAsr = reachable && asr?.ready && !asr.mock
  const realSer = reachable && ser?.ready && !ser.mock
  const inputClass = 'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus:border-slate-600 focus:outline-none'

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
    const files = [audio, transcript, results].filter((f): f is File => !!f)
    if (files.some(f => f.size > MAX_BYTES)) {
      setError('Có file vượt quá 300 MB. Hãy dùng bản ghi ngắn hơn hoặc kiểm tra cấu hình giới hạn upload.')
      return
    }
    const needsInferenceService = mode === 'recording' || !!audio
    if (needsInferenceService && !reachable) {
      setError('FastAPI chưa kết nối. Để xử lý audio cần khởi động inference service tại cổng 8001. Bạn vẫn có thể nhập kết quả JSON/CSV mà không cần audio.')
      return
    }
    if (mode === 'recording' && (!asr?.ready && !transcript)) {
      setError('ASR chưa sẵn sàng. Hãy thêm transcript có timestamp hoặc cấu hình mô hình ASR trong inference/.env.')
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
      navigate('/calls/' + encodeURIComponent(created.id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return <div className="mx-auto max-w-4xl space-y-5">
    <div>
      <Link to="/calls" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-blue-700"><ArrowLeft size={16}/> Danh sách cuộc gọi</Link>
      <h1 className="mt-2 text-2xl font-semibold">Thêm cuộc gọi</h1>
      <p className="mt-1 text-sm text-slate-500">Tải bản ghi âm thật để xử lý, hoặc nhập kết quả phân tích đã có. Hệ thống luôn phân biệt kết quả thật và mô phỏng.</p>
    </div>

    <section className="rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Trạng thái AI service</h2>
        <button type="button" onClick={refreshHealth} disabled={checking} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={13}/> {checking?'Đang kiểm tra…':'Kiểm tra lại'}</button>
      </div>
      {healthError && <p role="alert" className="mt-3 text-sm text-red-700">{healthError}</p>}
      {!health && !healthError && <p className="mt-3 text-sm text-slate-500">Đang kiểm tra backend và inference…</p>}
      {health && <div className="mt-3 space-y-2">
        <p className={'flex items-center gap-2 text-sm '+(reachable?'text-green-700':'text-amber-700')}>
          {reachable?<CheckCircle2 size={16}/>:<AlertTriangle size={16}/>}
          {reachable?'FastAPI đã kết nối':'FastAPI chưa hoạt động'}
          {reachable && inference?.device ? ' · '+inference.device : ''}
        </p>
        {reachable ? <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md bg-slate-50 p-3 text-xs">
            <strong>ASR (giọng nói → văn bản): </strong>{realAsr ? 'Mô hình thật đã cấu hình' : asr?.mock ? 'Đang mô phỏng' : 'Chưa sẵn sàng'}
            <p className="mt-1 text-slate-600">{asr?.detail ?? 'Không có thông tin'}</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3 text-xs">
            <strong>SER (dự đoán cảm xúc): </strong>{realSer ? 'Checkpoint đã cấu hình' : ser?.mock ? 'Đang mô phỏng' : 'Chưa sẵn sàng'}
            <p className="mt-1 text-slate-600">{ser?.detail ?? 'Không có thông tin'}</p>
          </div>
        </div> : <p className="text-xs text-slate-600">{inference?.error || 'Bắt đầu dịch vụ FastAPI để chạy pipeline xử lý audio.'}</p>}
        {reachable && (!realAsr || !realSer) && <p className="text-xs text-amber-800">Hiện chưa phải pipeline ASR + SER thật hoàn chỉnh. Nếu chạy với adapter mock, transcript/dự đoán mô phỏng sẽ được đánh dấu rõ trong kết quả.</p>}
      </div>}
    </section>

    <section className="rounded-lg border bg-white p-5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Cách thêm cuộc gọi">
        <button type="button" aria-pressed={mode==='recording'} onClick={()=>{setMode('recording');setError('')}} className={'flex items-start gap-2 rounded-md border p-4 text-left '+(mode==='recording'?'border-blue-500 bg-blue-50':'hover:bg-slate-50')}>
          <FileAudio className="mt-0.5 shrink-0" size={19}/>
          <span><strong className="block text-sm">Tải bản ghi âm</strong><span className="mt-1 block text-xs text-slate-600">Audio + ASR + SER, hoặc audio kèm transcript</span></span>
        </button>
        <button type="button" aria-pressed={mode==='results'} onClick={()=>{setMode('results');setError('')}} className={'flex items-start gap-2 rounded-md border p-4 text-left '+(mode==='results'?'border-blue-500 bg-blue-50':'hover:bg-slate-50')}>
          <FileText className="mt-0.5 shrink-0" size={19}/>
          <span><strong className="block text-sm">Nhập kết quả có sẵn</strong><span className="mt-1 block text-xs text-slate-600">JSON/CSV dự đoán + audio tùy chọn</span></span>
        </button>
      </div>

      <form onSubmit={e=>void submit(e)} className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Tiêu đề cuộc gọi<input className={inputClass} value={title} onChange={e=>setTitle(e.target.value)} maxLength={200} placeholder="Ví dụ: Khiếu nại đơn hàng"/></label>
          <div className="hidden sm:block"/>
          <label className="block text-sm font-medium">Tên nhân viên (nếu biết)<input className={inputClass} value={agentName} onChange={e=>setAgentName(e.target.value)} maxLength={120}/></label>
          <label className="block text-sm font-medium">Tên khách hàng (nếu biết)<input className={inputClass} value={customerName} onChange={e=>setCustomerName(e.target.value)} maxLength={120}/></label>
        </div>
        {mode === 'recording' ? <>
          <label className="block text-sm font-medium">File ghi âm thật (bắt buộc)
            <input type="file" accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4" onChange={e=>setAudio(e.target.files?.[0]??null)} required className="mt-2 block w-full rounded-md border p-2 text-sm"/>
          </label>
          <label className="block text-sm font-medium">Transcript có timestamp (tùy chọn)
            <input type="file" accept=".csv,.json" onChange={e=>setTranscript(e.target.files?.[0]??null)} className="mt-2 block w-full rounded-md border p-2 text-sm"/>
            <span className="mt-1 block text-xs font-normal text-slate-500">Có transcript thì bỏ qua bước ASR. Nếu không, FastAPI phải có ASR sẵn sàng. File cần start, end, text và speaker (nếu có).</span>
          </label>
          <label className="block text-sm font-medium">Nếu file stereo tách hai người nói, nhân viên nằm ở kênh
            <select className={inputClass} value={agentChannel} onChange={e=>setAgentChannel(e.target.value)}><option value="0">Kênh trái (0)</option><option value="1">Kênh phải (1)</option></select>
          </label>
        </> : <>
          <label className="block text-sm font-medium">File kết quả JSON/CSV (bắt buộc)
            <input type="file" accept=".json,.csv" required onChange={e=>setResults(e.target.files?.[0]??null)} className="mt-2 block w-full rounded-md border p-2 text-sm"/>
            <span className="mt-1 block text-xs font-normal text-slate-500">Mỗi câu: start, end, text, speaker, fused_emotion và fused_confidence (hoặc đối tượng fused). Chỉ nhập dự đoán đã được tạo trước đó; không tự suy luận.</span>
          </label>
          <label className="block text-sm font-medium">File audio đi kèm (tùy chọn)
            <input type="file" accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4" onChange={e=>setAudio(e.target.files?.[0]??null)} className="mt-2 block w-full rounded-md border p-2 text-sm"/>
          </label>
        </>}
        {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-slate-500">Giới hạn mặc định: 300 MB/file. Đừng upload ghi âm riêng tư khi chưa có quyền sử dụng dữ liệu.</p>
          <button type="submit" disabled={uploading} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
            <Upload size={15}/>{uploading?'Đang gửi lên máy…':mode==='recording'?'Tải lên và xử lý':'Nhập kết quả'}
          </button>
        </div>
      </form>
    </section>
  </div>
}
