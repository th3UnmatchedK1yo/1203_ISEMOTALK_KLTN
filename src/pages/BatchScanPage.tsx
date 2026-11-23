import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, FileAudio, LoaderCircle, RefreshCw, UploadCloud } from 'lucide-react'
import { getCall, getSystemStatus, uploadRecording, type ProcessingStatus, type SystemStatus } from '@/api/isemotalk'
import { batchProgress, validateBatchFiles } from '@/lib/batch-scan'

type Job = {
  key: string
  name: string
  id?: string
  status: ProcessingStatus | 'upload_error' | 'uploading'
  stage?: string | null
  progress?: number
  qaLabel?: 'routine' | 'needs_attention' | null
  qaScore?: number
  qaOutdated?: boolean
  error?: string
}

const SESSION_KEY = 'isemotalk.batch-scan.v1'
const stageNames: Record<string, string> = {
  validate: 'Kiểm tra âm thanh', transcribe: 'ASR: tạo transcript',
  diarize: 'Phân biệt người nói', emotion: 'SER: cảm xúc', finalize: 'Lưu kết quả',
}

function readPrevious(): Job[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]')
    if (!Array.isArray(value)) return []
    return value.filter((x): x is Job => !!x && typeof x === 'object' &&
      typeof x.id === 'string' && /^CALL-[A-Za-z0-9-]+$/.test(x.id) &&
      typeof x.name === 'string' && x.name.length <= 255 &&
      ['queued', 'processing', 'ready', 'failed'].includes(x.status)).slice(0, 20)
  } catch { return [] }
}

export function BatchScanPage() {
  const [files, setFiles] = useState<File[]>([])
  const [jobs, setJobs] = useState<Job[]>(readPrevious)
  const [health, setHealth] = useState<SystemStatus | null>(null)
  const [healthError, setHealthError] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    getSystemStatus(controller.signal)
      .then(status => { if (!controller.signal.aborted) { setHealth(status); setHealthError('') } })
      .catch((e: Error) => { if (!controller.signal.aborted) { setHealth(null); setHealthError(e.message) } })
    return () => controller.abort()
  }, [refreshKey])

  // Only IDs and names are kept in this browser tab; never store audio or transcripts.
  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(jobs.filter(j => j.id).slice(0, 20))) }
    catch { /* Browser storage may be disabled; live job status still works. */ }
  }, [jobs])

  useEffect(() => {
    const active = jobs.some(job => !!job.id && (job.status === 'queued' || job.status === 'processing' ||
      (job.status === 'ready' && !job.qaLabel && !job.error)))
    if (!active) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    const refresh = async () => {
      const snapshot = jobs.filter(job => !!job.id && (job.status !== 'failed' &&
        (job.status !== 'ready' || !job.qaLabel))).map(job => job.id!)
      try {
        const responses = await Promise.allSettled(snapshot.map(id => getCall(id, controller.signal)))
        if (cancelled) return
        const updates = new Map<string, Partial<Job>>()
        responses.forEach((item, idx) => {
          if (item.status !== 'fulfilled') return
          const call = item.value
          const triage = call.qaTriage && !call.qaTriage.outdated ? call.qaTriage : null
          updates.set(snapshot[idx], {
            status: call.status, stage: call.stage, progress: call.progress,
            qaLabel: triage?.label ?? null, qaScore: triage?.score,
            qaOutdated: call.qaTriage?.outdated ?? false,
            error: call.error ?? undefined,
          })
        })
        if (updates.size) setJobs(previous => previous.map(j => j.id && updates.has(j.id) ? { ...j, ...updates.get(j.id)! } : j))
      } finally {
        if (!cancelled) timer = setTimeout(() => void refresh(), 4000)
      }
    }
    void refresh()
    return () => { cancelled = true; controller.abort(); if (timer) clearTimeout(timer) }
    // Poll independent of per-file updates; restarting the effect every response would stall.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs.map(j => j.id + ':' + (j.status === 'failed' ? 'failed' : j.qaLabel ? 'scored' : 'pending')).join('|')])

  const asr = health?.inference.components?.asr
  const ser = health?.inference.components?.ser
  const qa = health?.inference.qa
  const asrReady = health?.inference.reachable === true && asr?.ready === true && asr.mock === false && health.automation?.asr === true
  const qaReady = health?.inference.reachable === true && qa?.ready === true && qa.loaded === true && health.automation?.qa === true
  const serSkipped = ser?.adapter === 'not_configured' && !ser.ready && !ser.mock
  const serReady = ser?.ready === true && ser.mock === false && ser.verified === true
  const canSubmit = !!asrReady && !!qaReady && (serSkipped || serReady) && !health?.previewOnly
  const summary = batchProgress(jobs)
  const validation = files.length ? validateBatchFiles(files) : null

  async function submit() {
    const problem = validateBatchFiles(files)
    if (problem) { setError(problem); return }
    if (!canSubmit) { setError('Chưa có đủ dịch vụ AI thật. Kiểm tra ASR, XLM-R và cấu hình SER trước khi tải.') ; return }
    setError('')
    setSubmitting(true)
    const pending: Job[] = files.map((file, i) => ({
      key: String(Date.now()) + '-' + i, name: file.name, status: 'uploading',
    }))
    setJobs(pending)
    try {
      // Uploads are sequential to avoid simultaneous GPU jobs or uncontrolled
      // memory/network pressure. The server owns inference and durable queueing.
      for (let i = 0; i < files.length; i++) {
        if (!alive.current) return
        const data = new FormData()
        data.append('audio', files[i])
        data.append('title', files[i].name.replace(/\.(wav|mp3|m4a)$/i, ''))
        try {
          const response = await uploadRecording(data)
          if (!alive.current) return
          setJobs(previous => previous.map(item =>
            item.key === pending[i].key ? { ...item, id: response.id, status: 'queued' } : item))
        } catch (e) {
          if (!alive.current) return
          setJobs(previous => previous.map(item =>
            item.key === pending[i].key ? { ...item, status: 'upload_error', error: (e as Error).message } : item))
        }
      }
    } finally {
      if (alive.current) { setSubmitting(false); setFiles([]) }
    }
  }

  const statusText = (job: Job) => {
    if (job.status === 'uploading') return 'Đang chuyển file lên server'
    if (job.status === 'upload_error') return 'Không gửi được'
    if (job.status === 'failed') return 'AI xử lý thất bại'
    if (job.status === 'queued') return 'Server đã nhận · đang chờ AI'
    if (job.status === 'processing') return stageNames[job.stage ?? ''] ?? 'AI đang xử lý'
    if (job.qaOutdated) return 'QA cần chạy lại'
    if (job.qaLabel === 'needs_attention') return 'AI gợi ý QA xem kỹ'
    if (job.qaLabel === 'routine') return 'Không có cảnh báo mạnh'
    return 'Audio đã xử lý · đang chờ XLM-R'
  }

  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="space-y-2">
      <p className="text-sm font-semibold text-teal-800">ISEmoTalk / Chạy AI</p>
      <h1 className="text-3xl font-bold tracking-tight text-[#12394d]">Tải ghi âm. AI tự phân tích.</h1>
      <p className="max-w-3xl text-base leading-7 text-slate-700">Chọn một hoặc nhiều file âm thanh. Server FTISU xử lý và lưu kết quả tự động; không cần nhập transcript hay nhận xét QA để AI bắt đầu.</p>
    </header>

    <div className="grid gap-3 sm:grid-cols-3">
      {[['1', 'Tải WAV / MP3 / M4A'], ['2', 'Server chạy ASR rồi QA'], ['3', 'Nhận kết quả và chọn cuộc cần xem']].map(([number, label]) =>
        <div key={number} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-800 text-sm font-bold text-white">{number}</span>
          <span className="text-sm font-semibold text-slate-800">{label}</span>
        </div>)}
    </div>

    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[#12394d]">Máy chủ AI</h2>
        <button type="button" onClick={() => setRefreshKey(x => x + 1)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"><RefreshCw size={15}/> Kiểm tra lại</button>
      </div>
      {healthError && <p role="alert" className="mt-3 text-sm text-red-800">{healthError}</p>}
      {!health && !healthError && <p role="status" className="mt-3 text-sm text-slate-600">Đang kết nối GPU…</p>}
      {health && <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {([
          {name:'ASR · tạo chữ từ audio', ready: asrReady, detail: asr?.detail},
          {name:'XLM-R · sàng lọc QA', ready: qaReady, detail: qa?.detail},
          {name:'SER · cảm xúc', ready: serReady, detail: serSkipped ? 'Chưa có mô hình được xác minh · sẽ bỏ qua, không tạo nhãn giả' : ser?.detail},
        ]).map(item => <div key={item.name} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-2">
            {item.ready ? <CheckCircle2 size={17} className="text-teal-800"/> : <AlertTriangle size={17} className="text-amber-700"/>}
            <strong className="text-sm text-slate-900">{item.name}</strong>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-700">{item.ready ? 'Sẵn sàng' : item.name.startsWith('SER') && serSkipped ? 'Chưa có · bỏ qua minh bạch' : 'Chưa sẵn sàng'}</p>
          <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer">Chi tiết model</summary><p className="mt-2 break-words">{item.detail ?? 'Chưa có trạng thái'}</p></details>
        </div>)}
      </div>}
      {!canSubmit && health && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-950">Chưa thể bắt đầu lô ghi âm mới: cần ASR thật, XLM-R đã nạp và worker tự động. Nếu FTISU chỉ đang chạy QA theo transcript nguồn, hãy kiểm tra model PhoWhisper. Trang này không giả lập đầu ra AI.</p>}
      {canSubmit && <p className="mt-4 text-sm text-teal-900">GPU và hàng đợi QA báo sẵn sàng. File chỉ được đánh dấu hoàn thành sau khi backend thực sự trả kết quả. SER có thể được bỏ qua có ghi nhận nếu chưa triển khai.</p>}
    </section>

    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-[#12394d]">Bắt đầu phân tích</h2>
      <p className="mt-2 text-sm text-slate-600">Tối đa 20 file, 300 MB mỗi file, 600 MB mỗi lượt. Mỗi file tạo một hồ sơ riêng; tải tuần tự để tránh quá tải server. Đừng tải lên ghi âm không có quyền sử dụng.</p>
      <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-teal-300 bg-teal-50/50 px-4 py-8 text-center hover:bg-teal-50">
        <UploadCloud size={28} className="text-teal-800"/>
        <strong className="text-slate-900">Chọn file ghi âm từ máy tính</strong>
        <span className="text-sm text-slate-600">Có thể chọn nhiều file trong một lần</span>
        <input aria-label="Chọn các file ghi âm" type="file" accept=".wav,.mp3,.m4a,audio/*" multiple disabled={submitting}
          onChange={event => { setFiles(Array.from(event.target.files || [])); setError(''); event.currentTarget.value = '' }}
          className="mt-2 max-w-full text-sm"/>
      </label>
      {files.length > 0 && <p className="mt-3 text-sm text-slate-800">Đã chọn <strong>{files.length}</strong> file: {files.slice(0,3).map(f => f.name).join(', ')}{files.length > 3 ? '…' : ''}</p>}
      {(validation || error) && <p role="alert" className="mt-3 text-sm text-red-800">{error || validation}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void submit()} disabled={!canSubmit || submitting || files.length === 0 || !!validation}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0E5665] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[#0B4554]">
          {submitting ? <LoaderCircle className="animate-spin" size={18}/> : <FileAudio size={18}/>}
          {submitting ? 'Đang chuyển file lên server…' : 'Chạy AI phân tích'}
        </button>
        <Link to="/calls/new" className="text-sm font-semibold text-teal-800 underline underline-offset-4">Nhập transcript hoặc kết quả đã có</Link>
      </div>
    </section>

    {jobs.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[#12394d]">Kết quả phân tích của lô</h2>
        <Link to="/calls" className="text-sm font-semibold text-teal-800 underline underline-offset-4">Xem hàng đợi QA</Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Server đã nhận', summary.received],
          ['XLM-R đã chấm', summary.analyzed],
          ['AI gợi ý xem kỹ', summary.flagged],
          ['Lỗi', summary.failed],
        ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3">
          <p className="text-2xl font-bold tabular-nums text-slate-900">{value}</p>
          <p className="mt-1 text-xs font-medium text-slate-600">{label}</p>
        </div>)}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">“Đã chấm” chỉ tính kết quả XLM-R hợp lệ, không tính file mới nhận hoặc transcript vừa tạo. Điểm QA không phải xác suất nhân viên sai. Mô hình XLM-R được huấn luyện trên OneVoice tổng hợp; dữ liệu cuộc gọi thực tế chưa được xác thực về độ chính xác.</p>
      <div className="mt-4 divide-y divide-slate-100">
        {jobs.map(job => <div key={job.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="break-all text-sm font-semibold text-slate-900">{job.name}</p>
            <p className="mt-1 text-xs text-slate-700">{job.id ? job.id + ' · ' : ''}{statusText(job)}{job.progress != null && job.status === 'processing' ? ' · ' + job.progress + '%' : ''}</p>
            {job.error && <p className="mt-1 text-xs text-red-800">{job.error}</p>}
            {job.qaLabel && !job.qaOutdated && <p className="mt-1 text-xs font-semibold text-teal-900">Điểm cảnh báo XLM-R: {((job.qaScore ?? 0)*100).toFixed(1)}%</p>}
          </div>
          {job.id && <Link to={'/calls/' + encodeURIComponent(job.id)} className="rounded-lg border border-teal-300 px-3 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50">Xem hồ sơ</Link>}
        </div>)}
      </div>
      <button type="button" disabled={submitting} onClick={() => { setJobs([]); try { sessionStorage.removeItem(SESSION_KEY) } catch { /* harmless */ } }}
        className="mt-4 text-sm font-semibold text-slate-600 underline underline-offset-4 disabled:opacity-50">Ẩn danh sách lô trên trình duyệt (không xóa hồ sơ trên server)</button>
    </section>}
  </div>
}
