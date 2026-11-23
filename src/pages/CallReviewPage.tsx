import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Save, AlertTriangle, RefreshCw, Download } from 'lucide-react'
import {
  ApiError, clock, emotionLabels, getCall, percent, provenanceLabel, resolveApiUrl, saveReview,
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
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-2">
        <Link to="/calls" className="inline-flex items-center gap-2 text-sm text-slate-700 hover:text-teal-800"><ArrowLeft size={17}/> Danh sách cuộc gọi</Link>
        <p className="text-sm font-semibold tracking-wide text-slate-600">{call.id}</p>
        <h1 className="break-words text-3xl font-semibold tracking-tight text-[#12394d]">{call.title}</h1>
        <p className="text-base text-slate-700">{call.agentName || 'Chưa có tên nhân viên'} / {call.customerName || 'Chưa có tên khách hàng'} · {clock(call.duration)} · {reviewStatus}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800">{provenanceLabel(call.provenance)}</span>
        <button type="button" disabled={!canSave} onClick={() => void save()} className={primaryButton}><Save size={18}/>{saving ? 'Đang lưu…' : 'Lưu đánh giá'}</button>
      </div>
    </header>
    {call.provenance === 'imported' &&
      (call.title.startsWith('TTS TỔNG HỢP') || call.title.startsWith('GIỌNG THẬT') || call.title.startsWith('HỘI THOẠI ĐIỆN THOẠI THẬT')) &&
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950" role="note">
        <strong>Đang nghe file WAV lấy từ bộ dữ liệu công bố, không phải âm thanh do web tạo.</strong>
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
      </div>}
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
    {unknownCount > 0 && <p className="rounded-lg border border-slate-300 bg-white p-4 text-sm leading-6 text-slate-800">
      <strong>{unknownCount} câu chưa xác định người nói.</strong> Những câu này không được tính vào cảm xúc khách hàng. Hãy nghe lại và gán vai trò nếu có căn cứ.
      {call.dominantEmotion === null && ' Chưa đủ dữ liệu để nhận định cảm xúc hoặc mức ưu tiên theo khách hàng.'}
    </p>}
    <CallRecording callId={call.id} audioUrl={call.audioUrl} duration={call.duration} utterances={call.utterances}
      seekRequest={seekRequest} onActiveChange={setActiveId} onSelect={selectUtterance}/>
    {call.status === 'ready' && (call.utterances.length > 0
      ? <CallQaTriage callId={call.id} version={call.version}/>
      : <p role="status" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">Bản ghi này chưa có transcript nên chưa thể chạy bộ phân loại QA từ văn bản. Audio vẫn phát bình thường; cần ASR thực hoặc transcript đã xác minh trước khi chấm QA.</p>)}
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,1fr)]">
      <TranscriptList utterances={call.utterances} patches={form?.utterances ?? {}} selectedId={selectedId} activeId={activeId} onSelect={selectUtterance}/>
      <div className="min-w-0 space-y-5">
        <section className="rounded-xl border border-[#c4d4dc] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[#12394d]">Đánh giá từng câu</h2>
          {!selected ? <p className="mt-3 text-slate-700">Chọn một câu từ transcript.</p> : <>
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
        <section className="rounded-xl border border-[#c4d4dc] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[#12394d]">Điểm cần xem xét <span className="font-normal text-slate-600">· {call.moments.length}</span></h2>
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
        </section>
        <section className="rounded-xl border border-[#c4d4dc] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[#12394d]">Hoàn tất đánh giá</h2>
          <fieldset disabled={editDisabled} className="min-w-0">
            <legend className="sr-only">Ghi chú và trạng thái đánh giá</legend>
            <label className="mt-4 block text-sm font-semibold" htmlFor="overall-note">Ghi chú tổng thể</label>
            <textarea id="overall-note" value={form?.overallNote ?? ''} onChange={e => { const note = e.target.value; updateForm(previous => ({ ...previous, overallNote: note })) }} maxLength={5000} rows={3} className={input}/>
            <label className="mt-4 flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={form?.complete ?? false} onChange={e => { const complete = e.target.checked; updateForm(previous => ({ ...previous, complete })) }}/> Đã hoàn tất việc xem xét cuộc gọi</label>
          </fieldset>
          <button type="button" onClick={() => void save()} disabled={!canSave} className={primaryButton + ' mt-5 w-full'}><Save size={18}/>{saving ? 'Đang lưu…' : 'Lưu đánh giá'}</button>
          {call.status === 'ready' && <a className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-800 underline-offset-4 hover:underline" href={resolveApiUrl('/api/calls/' + encodeURIComponent(call.id) + '/export.csv')}><Download size={17}/> Xuất kết quả CSV đã lưu</a>}
          {call.status === 'ready' && <a className="mt-3 block text-sm font-semibold text-teal-800 underline-offset-4 hover:underline" href={resolveApiUrl('/api/calls/' + encodeURIComponent(call.id) + '/export.json')}>Tải bằng chứng và đầu vào gốc (JSON)</a>}
          {dirty && <p className="mt-2 text-sm text-slate-600">Tệp xuất chỉ gồm dữ liệu đã lưu; bản nháp chưa được đưa vào.</p>}
        </section>
      </div>
    </div>
    <CallCaseLink callId={call.id} callDate={call.callDate}/>
    <CallWorkflowPanel callId={call.id}/>
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
