import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Save, AlertTriangle, RefreshCw, Download, ChevronRight, Headphones, Sparkles, ClipboardCheck, BriefcaseBusiness, FileAudio } from 'lucide-react'
import {
  ApiError, apiJson, clock, emotionLabels, getCall, getSystemStatus, percent, provenanceLabel, resolveApiUrl, saveReview,
  retryProcessing, speakerLabels, stageLabels, type CallDetail, type Emotion, type Moment, type ReviewPatch,
} from '@/api/isemotalk'
import { startPolling } from '@/lib/polling'
import {
  buildReviewPayload, createReviewForm, hasReviewChanges, restoreReviewDraft, reviewDraftKey,
  serializeReviewDraft, getMomentTarget, type ReviewForm,
} from '@/lib/reviewSession'
import { CallRecording, type SeekRequest } from '@/components/review/CallRecording'
import { TranscriptList } from '@/components/review/TranscriptList'
import { CallWorkflowPanel } from '@/components/review/CallWorkflowPanel'
import { CallCaseLink } from '@/components/review/CallCaseLink'
import { CallQaTriage } from '@/components/review/CallQaTriage'
import { sourceDialogueTurns } from '@/lib/source-dialogue'

const allEmotions: Emotion[] = ['neutral', 'happy', 'sad', 'angry']
const momentLabels: Record<string, string> = {
  escalation: 'Chuyển sang tiêu cực', recovery: 'Chuyển biến tích cực', sustained_negative: 'Tiêu cực kéo dài',
  modality_disagreement: 'Âm thanh và văn bản bất đồng', high_confidence_change: 'Thay đổi cảm xúc rõ',
}
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
const primaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0E5665] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0B4554] disabled:cursor-not-allowed disabled:opacity-50'
const input = 'mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-base text-slate-900 disabled:bg-slate-50'

export function CallReviewPage() {
  const { callId } = useParams<{ callId: string }>()
  // A new route owns a new review session, including selections and audio state.
  return callId ? <CallReviewSession key={callId} callId={callId}/> : <p role="alert">Không tìm thấy cuộc gọi.</p>
}

function CallReviewSession({ callId }: { callId: string }) {
  const navigate = useNavigate()
  const [realAsrAvailable, setRealAsrAvailable] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [call, setCall] = useState<CallDetail | null>(null)
  const [form, setForm] = useState<ReviewForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [versionConflict, setVersionConflict] = useState(false)
  const [draftBackup, setDraftBackup] = useState<string | null>(null)
  const [storageError, setStorageError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [seekRequest, setSeekRequest] = useState<SeekRequest | null>(null)
  const seekSequence = useRef(0)
  const mounted = useRef(true)
  const savingRef = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    setLoading(true)
    setCall(null)
    setForm(null)
    setError('')
    setMessage('')
    setDraftBackup(null)
    setVersionConflict(false)
    return startPolling({
      load: signal => getCall(callId, signal),
      onData: detail => {
        setCall(detail)
        setError('')
        setLoading(false)
        if (detail.status !== 'ready') return
        let raw: string | null = null
        try { raw = sessionStorage.getItem(reviewDraftKey(callId)) } catch {
          setStorageError('Trình duyệt chưa cho phép giữ bản nháp. Hãy lưu đánh giá trước khi rời trang.')
        }
        const recovery = restoreReviewDraft(detail, raw)
        setForm(recovery.kind === 'restored' ? recovery.form : createReviewForm(detail))
        if (recovery.kind === 'restored') setMessage('Đã khôi phục bản nháp trong phiên này. Các thay đổi chưa được lưu vào cuộc gọi.')
        if (recovery.kind === 'conflict' || recovery.kind === 'invalid') setDraftBackup(raw)
        setSelectedId(previous => detail.utterances.some(u => u.id === previous) ? previous : detail.utterances[0]?.id ?? null)
        setSelectedMomentId(null)
      },
      onError: failure => { setError(failure.message); setLoading(false) },
      shouldContinue: detail => detail.status === 'queued' || detail.status === 'processing',
      intervalMs: 2500,
    })
  }, [callId, reload])

  useEffect(() => {
    const controller = new AbortController()
    setRealAsrAvailable(false)
    void getSystemStatus(controller.signal)
      .then(status => {
        if (!controller.signal.aborted)
          setRealAsrAvailable(status.inference.reachable === true &&
            status.inference.components?.asr?.ready === true &&
            status.inference.components.asr.mock === false)
      })
      .catch(() => { if (!controller.signal.aborted) setRealAsrAvailable(false) })
    return () => controller.abort()
  }, [callId])

  const analyzeSourceAudio = async () => {
    if (!call || reanalyzing || !realAsrAvailable || call.provenance !== 'imported' || !call.hasAudio) return
    setReanalyzing(true)
    setError('')
    try {
      const next = await apiJson<{id: string}>('/api/calls/' + encodeURIComponent(call.id) + '/reprocess', {
        method: 'POST',
      })
      navigate('/calls/' + encodeURIComponent(next.id))
    } catch (e) {
      setError((e as Error).message)
      setReanalyzing(false)
    }
  }

  const payload = useMemo(() => call && form ? buildReviewPayload(call, form) : null, [call, form])
  const dirty = !!payload && hasReviewChanges(payload)

  const persistDraft = useCallback(() => {
    if (!call || !form || call.status !== 'ready' || draftBackup) return
    try {
      if (dirty) sessionStorage.setItem(reviewDraftKey(call.id), serializeReviewDraft(call, form))
      else sessionStorage.removeItem(reviewDraftKey(call.id))
      setStorageError('')
    } catch {
      setStorageError('Không giữ được bản nháp trong trình duyệt. Hãy lưu đánh giá hoặc tải bản nháp trước khi rời trang.')
    }
  }, [call, form, dirty, draftBackup])

  useEffect(() => { persistDraft() }, [persistDraft])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || draftBackup) { persistDraft(); event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, draftBackup, persistDraft])

  // If browser storage is unavailable, navigation must not silently lose work.
  useEffect(() => {
    if (!storageError || !dirty) return
    const guard = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (link && !window.confirm('Bản nháp chưa được giữ trong trình duyệt. Rời trang và bỏ các thay đổi chưa lưu?')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener('click', guard, true)
    return () => document.removeEventListener('click', guard, true)
  }, [storageError, dirty])

  const updateForm = (change: (previous: ReviewForm) => ReviewForm) => {
    if (savingRef.current || draftBackup) return
    setForm(previous => previous ? change(previous) : previous)
    setMessage('')
  }
  const edit = (id: string, change: ReviewPatch) => updateForm(previous => ({
    ...previous, utterances: { ...previous.utterances, [id]: { ...previous.utterances[id], ...change } },
  }))
  const selectUtterance = useCallback((id: string, time: number) => {
    setSelectedId(id)
    setSelectedMomentId(null)
    setSeekRequest({ time, sequence: ++seekSequence.current })
  }, [])
  const selectMoment = (moment: Moment) => {
    const target = getMomentTarget(moment, call?.utterances ?? [])
    setSelectedMomentId(moment.id)
    setSelectedId(target.utteranceId)
    setSeekRequest({ time: target.time, sequence: ++seekSequence.current })
  }

  const downloadDraft = () => {
    const raw = draftBackup ?? (call && form ? serializeReviewDraft(call, form) : null)
    if (!raw) return
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${callId}-review-draft.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const save = async () => {
    if (!call || !form || !payload || !dirty || savingRef.current || draftBackup || versionConflict || call.status !== 'ready') return
    savingRef.current = true
    setSaving(true)
    setError('')
    setMessage('')
    let savedSnapshot: string | null = null
    try { savedSnapshot = sessionStorage.getItem(reviewDraftKey(call.id)) } catch { /* The visible storage warning already explains this. */ }
    try {
      const next = await saveReview(call.id, payload)
      // Clear this save's snapshot only; a newer session may have another draft.
      try {
        if (sessionStorage.getItem(reviewDraftKey(call.id)) === savedSnapshot) sessionStorage.removeItem(reviewDraftKey(call.id))
      } catch { /* Server save succeeded; storage availability is reported separately. */ }
      if (!mounted.current) return
      setCall(next)
      setForm(createReviewForm(next))
      setVersionConflict(false)
      setMessage('Đã lưu đánh giá. Bạn có thể tải lại trang hoặc xuất kết quả.')
    } catch (failure) {
      if (!mounted.current) return
      const err = failure as ApiError
      setVersionConflict(err.code === 'version_conflict')
      setError(err.code === 'version_conflict'
        ? 'Cuộc gọi đã được lưu ở nơi khác. Bản nháp của bạn vẫn được giữ. Tải bản nháp trước khi mở phiên bản mới để đối chiếu.'
        : err.message)
    } finally {
      savingRef.current = false
      if (mounted.current) setSaving(false)
    }
  }

  const retry = async () => {
    if (retrying) return
    setRetrying(true)
    setError('')
    try {
      await retryProcessing(callId)
      if (mounted.current) setReload(value => value + 1)
    } catch (failure) { if (mounted.current) setError((failure as Error).message) }
    finally { if (mounted.current) setRetrying(false) }
  }

  if (loading) return <p role="status" className="p-6 text-slate-700">Đang tải cuộc gọi…</p>
  if (!call) return <div className="space-y-4">
    <Link to="/calls" className="inline-flex items-center gap-2 text-teal-800"><ArrowLeft size={18}/> Danh sách cuộc gọi</Link>
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">{error || 'Không tìm thấy cuộc gọi.'}</p>
    <button type="button" className={button} onClick={() => setReload(value => value + 1)}><RefreshCw size={17}/> Thử tải lại</button>
  </div>

  const sourceDialogue = call.provenance === 'imported' && call.title.startsWith('TTS TỔNG HỢP · OneVoice') && call.utterances.length === 1
  const displayedTurns = sourceDialogue ? sourceDialogueTurns(form?.utterances[call.utterances[0].id]?.text ?? call.utterances[0].text).length : call.utterances.length
  const noteIsImportedProvenance = call.provenance === 'imported' && call.reviewStatus !== 'reviewed' &&
    (form?.overallNote ?? '').startsWith('NGUỒN: ')
  const selected = call.utterances.find(u => u.id === selectedId) ?? null
  const selectedPatch = selected ? form?.utterances[selected.id] : undefined
  const selectedMoment = call.moments.find(moment => moment.id === selectedMomentId)
  const momentPatch = selectedMoment ? form?.moments[selectedMoment.id] : undefined
  const unknownCount = call.utterances.filter(u => u.speaker === 'unknown').length
  const reviewStatus = call.reviewStatus === 'reviewed' ? 'Đã xem xét' : call.reviewStatus === 'in_progress' ? 'Đang xem xét' : 'Chưa xem xét'
  const inputsChanged = selected && (selected.fused || selected.lexical || selected.acoustic) && (
    selected.predictionInputChanged || selected.textEdited || selected.speakerEdited
    || (selectedPatch?.text !== undefined && selectedPatch.text !== selected.text)
    || (selectedPatch?.speaker !== undefined && selectedPatch.speaker !== selected.speaker))
  const editDisabled = saving || !!draftBackup || call.status !== 'ready'
  const canSave = dirty && !saving && !draftBackup && !versionConflict && call.status === 'ready'

  return <div className="space-y-5">
    <header className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
      <Link to="/calls" className="inline-flex items-center gap-2 text-sm font-medium text-teal-800 hover:underline"><ArrowLeft size={16}/> Trở lại danh sách</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{call.id} · HỒ SƠ CUỘC GỌI</p>
          <h1 className="mt-1 break-words text-2xl font-bold tracking-tight text-[#12394d] sm:text-[1.75rem]">{call.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-700">
            <span className="inline-flex items-center gap-1.5"><FileAudio size={16} className="text-slate-500" aria-hidden="true"/>{clock(call.duration)} audio</span>
            <span>{sourceDialogue ? displayedTurns + ' lượt lời kịch bản' : call.utterances.length + ' câu/đoạn'}</span>
            <span className={'rounded-full border px-2.5 py-1 font-semibold ' + (call.reviewStatus === 'reviewed'
              ? 'border-teal-200 bg-teal-50 text-teal-900'
              : 'border-slate-200 bg-slate-100 text-slate-700')}>{reviewStatus}</span>
          </div>
          {(call.agentName || call.customerName) && <p className="mt-2 text-sm text-slate-600">
            {call.agentName || 'Nhân viên chưa xác định'} / {call.customerName || 'Khách hàng chưa xác định'}
          </p>}
        </div>
        <a href="#call-review" className={button + ' shrink-0'}><ClipboardCheck size={17}/> Đi tới phần đánh giá</a>
      </div>
    </header>
    <nav aria-label="Các bước xem xét cuộc gọi" className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">HƯỚNG DẪN THEO QUY TRÌNH</p>
      <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {([
          {href:'#call-audio', label:'Nghe & đọc', icon:Headphones, sub:'Kiểm tra bằng chứng'},
          {href:'#call-ai', label:'Gợi ý AI', icon:Sparkles, sub:'Sàng lọc, không kết luận'},
          {href:'#call-review', label:'Kết luận QA', icon:ClipboardCheck, sub:'Người đánh giá xác nhận'},
          {href:'#call-case', label:'Xử lý tiếp', icon:BriefcaseBusiness, sub:'Chỉ tạo việc khi cần'},
        ] as const).map((step, index) => <li key={step.href}>
          <a href={step.href} className="group flex min-h-16 items-start gap-3 rounded-lg border border-transparent bg-slate-50 px-3 py-3 hover:border-teal-200 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
            <span className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ' +
              (index === 0 ? 'bg-[#0e5665] text-white' : 'border border-slate-300 bg-white text-slate-700')}>{index + 1}</span>
            <span className="min-w-0"><span className="block text-sm font-semibold text-slate-900">{step.label}</span>
              <span className="mt-0.5 hidden text-xs leading-4 text-slate-600 sm:block">{step.sub}</span></span>
            <ChevronRight size={15} className="ml-auto mt-1 hidden shrink-0 text-slate-400 group-hover:text-teal-700 xl:block" aria-hidden="true"/>
          </a>
        </li>)}
      </ol>
    </nav>
    {call.provenance === 'imported' &&
      (call.title.startsWith('TTS TỔNG HỢP') || call.title.startsWith('GIỌNG THẬT') || call.title.startsWith('HỘI THOẠI ĐIỆN THOẠI THẬT')) &&
      <details className="group rounded-xl border border-slate-200 bg-white text-sm leading-6 text-slate-700" role="note">
        <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 marker:hidden">
          <span className="inline-flex items-center gap-2 font-semibold text-slate-800"><FileAudio size={17} className="text-teal-700" aria-hidden="true"/>Nguồn: {call.title.startsWith('TTS TỔNG HỢP') ? 'OneVoice · hội thoại TTS' : call.title.startsWith('HỘI THOẠI ĐIỆN THOẠI THẬT') ? 'DataHive · hội thoại tự nhiên' : 'Bản ghi tiếng nói nguồn'}</span>
          <span className="text-xs font-medium text-teal-800">Giấy phép & giới hạn <ChevronRight size={15} className="inline transition-transform group-open:rotate-90" aria-hidden="true"/></span>
        </summary>
        <div className="border-t border-slate-100 px-4 pb-4 pt-2">
          <strong className="sr-only">Đây là âm thanh WAV từ bộ dữ liệu công bố, không phải âm thanh do web tạo.</strong>
        <p className="mt-1">{call.title.startsWith('TTS TỔNG HỢP')
          ? 'OneVoice là kịch bản tổng đài đọc bằng giọng TTS tổng hợp; không phải cuộc gọi CSKH ngoài đời.'
          : call.title.startsWith('HỘI THOẠI ĐIỆN THOẠI THẬT')
            ? 'DataHive là cuộc trò chuyện qua điện thoại có hai giọng người thật. Đây là đoạn trích từ bản ghi có sự đồng ý của người tham gia, không phải cuộc gọi CSKH; dataset không có transcript nên trang này không tự dựng lời thoại.'
            : 'FOSD/FLEURS có tiếng nói của người thật nhưng chỉ là đoạn phát biểu, không phải hội thoại tổng đài.'}
          {' '}{call.title.startsWith('HỘI THOẠI ĐIỆN THOẠI THẬT')
            ? 'Chưa chạy ASR hoặc SER nên chưa có transcript và nhãn cảm xúc.'
            : 'Transcript lấy từ nguồn và gắn toàn bộ thời lượng, không có căn chỉnh thời gian từng lượt. Chưa chạy ASR hoặc SER để dự đoán.'}</p>
        <details className="mt-2"><summary className="cursor-pointer font-semibold">Nguồn, giấy phép và SHA256 của bản ghi</summary>
          <p className="mt-2 break-all text-xs">{call.stageLog.find(step => step.stage === 'validate')?.detail}</p>
          <a href={call.title.startsWith('TTS TỔNG HỢP')
            ? 'https://huggingface.co/datasets/nhatminh/OneVoice'
            : call.title.startsWith('HỘI THOẠI ĐIỆN THOẠI THẬT')
              ? 'https://huggingface.co/datasets/datahiveai/multilingual-conversations-sample'
              : call.title.includes('FLEURS')
                ? 'https://huggingface.co/datasets/google/fleurs'
                : 'https://huggingface.co/datasets/doof-ferb/fpt_fosd'}
            target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold underline underline-offset-2">Xem dữ liệu và giấy phép của nhà phát hành</a>
        </details>
        </div>
      </details>}
    {call.provenance === 'mock' && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
      {call.source === 'results_import'
        ? 'Dữ liệu minh họa: âm thanh tổng hợp, transcript và nhãn cảm xúc mô phỏng. Dùng để trình bày luồng đánh giá, không phải kết quả nghiên cứu.'
        : 'Bản ghi âm được tải lên, nhưng có bước ASR hoặc SER đang mô phỏng. Các dự đoán này dùng để kiểm tra luồng xử lý, không phải kết quả mô hình nghiên cứu.'}
    </p>}
    {call.status !== 'ready' && <section className="rounded-xl border border-amber-200 bg-amber-50 p-5" aria-labelledby="processing-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="processing-title" className="text-lg font-semibold text-amber-950">{call.status === 'failed' ? 'Xử lý chưa thành công' : call.status === 'queued' ? 'Cuộc gọi đang chờ xử lý' : 'Đang xử lý bản ghi âm'} · {call.progress}%</h2>
        {call.status === 'failed' && <button type="button" disabled={retrying} onClick={() => void retry()} className={button}><RefreshCw size={17}/>{retrying ? 'Đang gửi yêu cầu…' : 'Thử xử lý lại'}</button>}
      </div>
      {call.error && <p role="alert" className="mt-3 text-sm text-red-900">{call.error}</p>}
      <progress value={Math.max(0, Math.min(100, call.progress))} max={100} aria-label="Tiến độ xử lý" className="mt-4 h-2 w-full accent-teal-700"/>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{call.stageLog.map(step => <li key={step.stage} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
        <strong className="block">{stageLabels[step.stage]}</strong>
        <p className="mt-1 text-slate-700">{step.state === 'done' ? 'Hoàn thành' : step.state === 'skipped' ? 'Bỏ qua' : step.state === 'running' ? 'Đang thực hiện' : step.state === 'failed' ? 'Lỗi' : 'Đang chờ'}</p>
        {step.detail && <p className="mt-2 break-words text-slate-600">{step.detail}</p>}
      </li>)}</ol>
      {call.status !== 'failed' && <p className="mt-3 text-sm text-amber-900">Trạng thái tự cập nhật. Bạn có thể chuyển trang rồi quay lại cuộc gọi này.</p>}
    </section>}
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900">
      <p>{error}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {(dirty || draftBackup) && <button type="button" onClick={downloadDraft} className={button}><Download size={17}/> Tải bản nháp</button>}
        <button type="button" disabled={saving} className={button} onClick={() => { persistDraft(); setReload(value => value + 1) }}><RefreshCw size={17}/>{versionConflict ? 'Mở phiên bản đã lưu' : 'Tải lại dữ liệu'}</button>
      </div>
    </div>}
    {draftBackup && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
      <p className="font-semibold">Có bản nháp chưa thể khôi phục vào phiên bản hiện tại.</p>
      <p className="mt-1">Cuộc gọi có thể đã được cập nhật ở tab khác. Bản nháp vẫn được giữ riêng; tải về để đối chiếu trước khi tiếp tục.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={downloadDraft} className={button}><Download size={17}/> Tải bản nháp đang giữ</button>
        <button type="button" className={button} onClick={() => {
          try { sessionStorage.removeItem(reviewDraftKey(callId)); setDraftBackup(null); setMessage('Đang sử dụng phiên bản đã lưu của cuộc gọi.') }
          catch { setStorageError('Không xóa được bản nháp. Hãy tải bản nháp về trước khi đóng tab.') }
        }}>Bỏ bản nháp cũ, dùng bản đã lưu</button>
      </div>
    </div>}
    {storageError && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{storageError}</p>}
    {message && <p role="status" className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-950">{message}</p>}
    {dirty && <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-amber-900">
      <span>Có thay đổi chưa lưu{!storageError && ' · Bản nháp được giữ trong phiên trình duyệt này'}</span>
      <button type="button" onClick={downloadDraft} className="font-semibold underline underline-offset-4">Tải bản nháp</button>
    </div>}
    {unknownCount > 0 && !sourceDialogue && <p className="rounded-lg border border-slate-300 bg-white p-4 text-sm leading-6 text-slate-800">
      <strong>{unknownCount} câu chưa xác định người nói.</strong> Những câu này không được tính vào cảm xúc khách hàng. Hãy nghe lại và gán vai trò nếu có căn cứ.
      {call.dominantEmotion === null && ' Chưa đủ dữ liệu để nhận định cảm xúc hoặc mức ưu tiên theo khách hàng.'}
    </p>}
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,1fr)]">
      <div className="min-w-0 space-y-5">
        <div id="call-audio" className="scroll-mt-28">
          <CallRecording callId={call.id} audioUrl={call.audioUrl} duration={call.duration} utterances={call.utterances}
            seekRequest={seekRequest} onActiveChange={setActiveId} onSelect={selectUtterance}/>
        </div>
        <TranscriptList utterances={call.utterances} patches={form?.utterances ?? {}} selectedId={selectedId} activeId={activeId} onSelect={selectUtterance} sourceDialogue={sourceDialogue}/>
      </div>
      <div className="min-w-0 space-y-5">
        <div id="call-ai" className="scroll-mt-28">
          {call.status === 'ready' && (call.utterances.length > 0
            ? <CallQaTriage callId={call.id} version={call.version}
                autoEligible={call.provenance === 'real' || (call.provenance === 'imported' && call.title.startsWith('TTS TỔNG HỢP · OneVoice'))}/>
            : <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">Chưa có transcript để sàng lọc QA. Cần ASR thật hoặc transcript có căn cứ trước khi chạy phân loại.</p>)}
        </div>
        <section className="rounded-xl border border-[#c4d4dc] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[#12394d]">{sourceDialogue ? 'Đánh giá nghiệp vụ cuộc gọi' : 'Đánh giá từng câu'}</h2>
          {sourceDialogue ? <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
            <p className="font-medium text-slate-800">Khi nghe, hãy kiểm tra:</p>
            <ul className="list-inside list-disc space-y-1 text-slate-700">
              <li>Khách đang yêu cầu giải quyết vấn đề gì?</li>
              <li>Nhân viên đã đưa ra hướng xử lý cụ thể chưa?</li>
              <li>Có cam kết hoặc bước tiếp theo nào cần theo dõi?</li>
            </ul>
            <p className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-600">Vai trò người nói do kịch bản OneVoice cung cấp, chưa có mốc thời gian từng lượt; không suy diễn nhãn cảm xúc.</p>
            <a href="#call-review" className="inline-flex min-h-10 items-center gap-1.5 font-semibold text-teal-800 hover:underline">
              Ghi nhận kết luận QA <ChevronRight size={16} aria-hidden="true"/>
            </a>
          </div> : !selected ? <p className="mt-3 text-slate-700">Chọn một câu từ transcript.</p> : <>
            <p className="mt-2 text-sm text-slate-600">Câu {selected.idx + 1} · {clock(selected.start)} · {speakerLabels[selectedPatch?.speaker ?? selected.speaker]}</p>
            <div className="mt-4 space-y-3 rounded-lg bg-slate-50 p-4 text-sm">
              {([['Âm thanh', selected.acoustic], ['Văn bản', selected.lexical], ['Kết hợp', selected.fused]] as const).map(([label, prediction]) =>
                <div key={label} className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-slate-700">{label}</span><strong className="text-slate-900">{prediction ? emotionLabels[prediction.emotion] + ' · ' + percent(prediction.confidence) : 'Chưa có đầu ra'}</strong></div>)}
              <p className="border-t border-slate-200 pt-3 leading-6 text-slate-600">Phần trăm là điểm của mô hình cho câu này, không phải độ chính xác đã được kiểm chứng. Nhánh chưa có đầu ra được để trống.</p>
            </div>
            {inputsChanged && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
              Transcript hoặc người nói đã được chỉnh sửa. Dự đoán vẫn dựa trên đầu vào ban đầu; mô hình chưa được chạy lại.
              {(selected.originalText !== undefined || selected.originalSpeaker !== undefined) && <details className="mt-2">
                <summary className="cursor-pointer font-semibold">Xem đầu vào ban đầu</summary>
                <p className="mt-2">{selected.originalSpeaker ? speakerLabels[selected.originalSpeaker] : 'Chưa có thông tin người nói'}</p>
                {selected.originalText !== undefined && <p className="mt-1 whitespace-pre-wrap">{selected.originalText}</p>}
              </details>}
            </div>}
            <fieldset disabled={editDisabled} className="mt-4 min-w-0 disabled:opacity-70">
              <legend className="sr-only">Quyết định của người đánh giá</legend>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!selected.fused} aria-pressed={selectedPatch?.decision === 'confirmed'}
                  onClick={() => edit(selected.id, { decision: 'confirmed', emotion: null })} className={button + (selectedPatch?.decision === 'confirmed' ? ' border-teal-700 bg-teal-50 text-teal-900' : '')}><Check size={17}/> Xác nhận dự đoán</button>
                <button type="button" onClick={() => edit(selected.id, { decision: null, emotion: null })} className={button}>Bỏ đánh giá</button>
              </div>
              <label className="mt-4 block text-sm font-semibold" htmlFor="emotion-select">Sửa nhãn cảm xúc</label>
              <select id="emotion-select" className={input} value={selectedPatch?.decision === 'corrected' ? selectedPatch.emotion ?? '' : ''}
                onChange={e => { if (e.target.value) edit(selected.id, { decision: 'corrected', emotion: e.target.value as Emotion }) }}>
                <option value="" disabled>Chọn nhãn khác dự đoán…</option>
                {allEmotions.filter(emotion => emotion !== selected.fused?.emotion).map(emotion => <option key={emotion} value={emotion}>{emotionLabels[emotion]}</option>)}
              </select>
              <label className="mt-4 block text-sm font-semibold" htmlFor="speaker-select">Người nói</label>
              <select id="speaker-select" className={input} value={selectedPatch?.speaker ?? selected.speaker} onChange={e => edit(selected.id, { speaker: e.target.value as 'agent' | 'customer' | 'unknown' })}>
                <option value="unknown">Chưa xác định</option><option value="agent">Nhân viên</option><option value="customer">Khách hàng</option>
              </select>
              <label className="mt-4 block text-sm font-semibold" htmlFor="transcript-edit">Transcript sau khi nghe lại</label>
              <textarea id="transcript-edit" rows={3} maxLength={4000} value={selectedPatch?.text ?? selected.text} onChange={e => edit(selected.id, { text: e.target.value })} className={input}/>
              <label className="mt-4 block text-sm font-semibold" htmlFor="utterance-note">Ghi chú câu nói</label>
              <textarea id="utterance-note" rows={2} maxLength={2000} value={selectedPatch?.note ?? ''} onChange={e => edit(selected.id, { note: e.target.value })} className={input} placeholder="Điều cần giải thích hoặc kiểm tra thêm…"/>
            </fieldset>
          </>}
        </section>
        {call.moments.length > 0 && <section className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[#12394d]">Đoạn SER gợi ý nghe lại <span className="font-normal text-slate-600">· {call.moments.length}</span></h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Các quy tắc từ nhãn cảm xúc gợi ý đoạn nên nghe lại. Người đánh giá quyết định mức liên quan.</p>
          <div className="custom-scrollbar mt-4 max-h-72 space-y-2 overflow-y-auto">
            {call.moments.map(moment => <button type="button" key={moment.id} onClick={() => selectMoment(moment)} aria-pressed={selectedMomentId === moment.id}
              className={'block w-full rounded-lg border p-3 text-left text-sm hover:bg-teal-50 ' + (selectedMomentId === moment.id ? 'border-teal-600 bg-teal-50' : 'border-slate-200')}>
              <span className="font-semibold text-slate-900">{clock(moment.start)} · {momentLabels[moment.type] ?? 'Đoạn cần kiểm tra'}</span>
              <span className="mt-1 block leading-6 text-slate-700">{moment.description}</span>
              {moment.reviewOutdated && <span className="mt-2 block font-medium text-amber-900">Nhận định cũ cần xem lại vì vai trò người nói đã thay đổi.</span>}
            </button>)}
            {!call.moments.length && <p className="text-sm text-slate-700">Chưa có đoạn nào thỏa các quy tắc gợi ý.</p>}
          </div>
          {selectedMoment && <fieldset disabled={editDisabled} className="mt-4 min-w-0 border-t border-slate-200 pt-4">
            <legend className="sr-only">Đánh giá điểm cần xem xét</legend>
            <div className="flex flex-wrap gap-2">
              {([{ value: true, label: 'Có liên quan' }, { value: false, label: 'Không liên quan' }, { value: null, label: 'Bỏ đánh giá' }] as const).map(choice => {
                const current = momentPatch ? momentPatch.relevance : selectedMoment.relevance
                return <button type="button" key={choice.label} aria-pressed={current === choice.value} className={button + (current === choice.value ? ' border-teal-700 bg-teal-50 text-teal-900' : '')}
                  onClick={() => updateForm(previous => ({ ...previous, moments: { ...previous.moments, [selectedMoment.id]: { relevance: choice.value, note: previous.moments[selectedMoment.id]?.note ?? selectedMoment.note } } }))}>{choice.label}</button>
              })}
            </div>
            <label className="mt-4 block text-sm font-semibold" htmlFor="moment-note">Ghi chú điểm cần xem xét</label>
            <textarea id="moment-note" rows={2} maxLength={2000} className={input} value={momentPatch?.note ?? selectedMoment.note}
              onChange={e => { const note = e.target.value; updateForm(previous => ({ ...previous, moments: { ...previous.moments, [selectedMoment.id]: { relevance: previous.moments[selectedMoment.id] ? previous.moments[selectedMoment.id].relevance : selectedMoment.relevance, note } } })) }}/>
          </fieldset>}
        </section>}
        <section id="call-review" className="scroll-mt-28 rounded-xl border-2 border-teal-700 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">3</span>
            <h2 className="text-lg font-bold text-[#12394d]">Kết luận của người QA</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">Sau khi nghe và đối chiếu gợi ý AI, ghi nhận phát hiện của bạn. Chỉ chọn hoàn tất khi đã xem xét đủ bằng chứng.</p>
          <fieldset disabled={editDisabled} className="min-w-0">
            <legend className="sr-only">Ghi chú và trạng thái đánh giá</legend>
            <label className="mt-4 block text-sm font-semibold text-slate-800" htmlFor="overall-note">Nhận xét của QA</label>
            <textarea id="overall-note"
              placeholder="Ví dụ: Khách chưa được hỗ trợ đăng nhập thành công; nhân viên cần xác minh lại hướng xử lý và lịch liên hệ tiếp."
              value={noteIsImportedProvenance ? '' : (form?.overallNote ?? '')}
              onChange={e => { const note = e.target.value; updateForm(previous => ({ ...previous, overallNote: note })) }}
              maxLength={5000} rows={4} className={input}/>
            {noteIsImportedProvenance && <p className="mt-2 text-xs leading-5 text-slate-600">
              Thông tin nguồn dataset đang được giữ trong lịch sử xử lý và mục giấy phép ở phía trên.
              Ô này dành cho đánh giá nghiệp vụ, không cần chép lại metadata.
            </p>}
            <label className="mt-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6">
              <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-teal-700" checked={form?.complete ?? false}
                onChange={e => { const complete = e.target.checked; updateForm(previous => ({
                  ...previous, complete,
                  overallNote: noteIsImportedProvenance ? '' : previous.overallNote,
                })) }}/>
              <span><strong className="block text-slate-900">Đã kiểm tra và hoàn tất đánh giá QA</strong>
                <span className="block text-slate-600">Chỉ đánh dấu sau khi nghe, đối chiếu. Hoàn tất QA không có nghĩa vụ việc đã được giải quyết.</span>
              </span>
            </label>
          </fieldset>
          <button type="button" onClick={() => void save()} disabled={!canSave} className={primaryButton + ' mt-5 w-full'}><Save size={18}/>{saving ? 'Đang lưu…' : 'Lưu đánh giá QA'}</button>
          {!dirty && call.status === 'ready' && <p className="mt-2 text-center text-xs text-slate-500">Nhập nhận xét hoặc thay đổi trạng thái để bật nút lưu.</p>}
          {call.status === 'ready' && <a className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-800 underline-offset-4 hover:underline" href={resolveApiUrl('/api/calls/' + encodeURIComponent(call.id) + '/export.csv')}><Download size={17}/> Xuất kết quả CSV đã lưu</a>}
          {call.status === 'ready' && <a className="mt-3 block text-sm font-semibold text-teal-800 underline-offset-4 hover:underline" href={resolveApiUrl('/api/calls/' + encodeURIComponent(call.id) + '/export.json')}>Tải bằng chứng và đầu vào gốc (JSON)</a>}
          {dirty && <p className="mt-2 text-sm text-slate-600">Tệp xuất chỉ gồm dữ liệu đã lưu; bản nháp chưa được đưa vào.</p>}
        </section>
      </div>
    </div>
    <div id="call-case" className="scroll-mt-28 space-y-4">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-sm font-bold text-white">4</span>
        <h2 className="text-lg font-bold text-[#12394d]">Xử lý tiếp nếu cần</h2>
        <span className="text-sm text-slate-600">Chỉ tạo vụ việc sau khi QA xác nhận có vấn đề cần theo dõi.</span>
      </div>
      <CallCaseLink callId={call.id} callDate={call.callDate}/>
      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">Thông tin ticket, lý do gọi và lịch sử xử lý (nếu sử dụng)</summary>
        <div className="mt-4"><CallWorkflowPanel callId={call.id}/></div>
      </details>
    </div>
    {call.provenance === 'imported' && call.hasAudio && !call.title.startsWith('HỘI THOẠI ĐIỆN THOẠI THẬT · DataHive') &&
      <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
        <summary className="cursor-pointer font-semibold text-[#12394d]">Tùy chọn nghiên cứu: đối chiếu transcript nguồn với ASR thật</summary>
        <p className="mt-1">Tạo một hồ sơ mới từ chính file WAV này. ASR sẽ nghe và tạo transcript mới; transcript nguồn và bản ghi gốc vẫn giữ nguyên để đối chiếu. QA XLM-R được chạy riêng sau khi ASR hoàn tất. Nếu F4 chưa được xác minh, bước SER sẽ ghi rõ là bỏ qua.</p>
        <button type="button" className={primaryButton + ' mt-3'}
          disabled={!realAsrAvailable || reanalyzing || saving || dirty}
          onClick={() => void analyzeSourceAudio()}>
          <RefreshCw size={16}/>{reanalyzing ? 'Đang tạo tác vụ ASR…' : 'Phân tích WAV bằng ASR thật'}
        </button>
        {!realAsrAvailable && <p className="mt-2 text-amber-900">ASR hiện chưa sẵn sàng. Hệ thống vẫn tự chạy QA trên transcript nguồn khi model XLM-R được kết nối.</p>}
        {dirty && <p className="mt-2 text-amber-900">Hãy lưu hoặc bỏ bản nháp review trước khi tạo hồ sơ phân tích mới.</p>}
      </details>}

    {call.stageLog.length > 0 && call.status === 'ready' && <details className="rounded-xl border border-slate-300 bg-white p-5 text-sm">
      <summary className="cursor-pointer font-semibold text-slate-800">Nguồn xử lý và thời gian từng bước</summary>
      <ul className="mt-4 space-y-3">{call.stageLog.map(step => <li key={step.stage} className="border-t border-slate-200 pt-3 first:border-0 first:pt-0">
        <strong>{stageLabels[step.stage]}</strong>{step.durationMs !== undefined && ` · ${(step.durationMs / 1000).toFixed(1)} giây`}
        {step.evidence && <span> · {step.evidence.adapter}{step.evidence.model ? ' / ' + step.evidence.model : ''} · {step.evidence.mock ? 'Mô phỏng' : step.evidence.verified ? 'Đã xác minh gói mô hình' : 'Chưa xác minh gói mô hình'}</span>}
        {step.detail && <p className="mt-1 break-words text-slate-600">{step.detail}</p>}
      </li>)}</ul>
    </details>}
    <p className="flex items-start gap-2 text-sm leading-6 text-slate-600"><AlertTriangle size={17} className="mt-1 shrink-0"/> Nhãn dự đoán gốc và quyết định của người đánh giá được giữ riêng. Hoàn tất đánh giá không đồng nghĩa vấn đề của khách hàng đã được giải quyết.</p>
  </div>
}
