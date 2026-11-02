import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Save, AlertTriangle, RefreshCw } from 'lucide-react'
import {
  ApiError, clock, emotionColors, emotionLabels, getCall, percent,
  provenanceLabel, resolveApiUrl, saveReview, retryProcessing, stageLabels, type CallDetail, type Emotion, type Moment, type ReviewPatch,
  type ReviewPayload,
} from '@/api/isemotalk'

const allEmotions: Emotion[] = ['neutral', 'happy', 'sad', 'angry']

function normalizedPatches(call: CallDetail): Record<string, ReviewPatch> {
  const patches: Record<string, ReviewPatch> = {}
  for (const u of call.utterances) {
    patches[u.id] = {
      decision: u.review.decision,
      emotion: u.review.emotion,
      note: u.review.note,
      flagged: u.flagged,
      text: u.text,
      speaker: u.speaker,
    }
  }
  return patches
}

export function CallReviewPage() {
  const { callId } = useParams<{ callId: string }>()
  const [call, setCall] = useState<CallDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null)
  const [patches, setPatches] = useState<Record<string, ReviewPatch>>({})
  const [momentChanges, setMomentChanges] = useState<ReviewPayload['moments']>({})
  const [overallNote, setOverallNote] = useState('')
  const [markReviewed, setMarkReviewed] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const load = useCallback(async () => {
    if (!callId) return
    setLoading(true)
    setError('')
    try {
      const detail = await getCall(callId)
      setCall(detail)
      setPatches(normalizedPatches(detail))
      setMomentChanges({})
      setOverallNote(detail.overallNote)
      setMarkReviewed(detail.reviewStatus === 'reviewed')
      setSelectedId(detail.utterances[0]?.id ?? null)
      setSelectedMomentId(null)
      setDirty(false)
      setSaveMessage('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [callId])

  useEffect(() => { void load() }, [load])

  // After upload, the Express backend processes the recording asynchronously.
  // Poll the persisted job status and enable review only when the call is ready.
  useEffect(() => {
    if (!callId || !call || (call.status !== 'queued' && call.status !== 'processing')) return
    let active = true
    const timer = window.setInterval(() => {
      void getCall(callId).then(next => {
        if (!active) return
        setCall(next)
        if (next.status === 'ready') {
          setPatches(normalizedPatches(next))
          setOverallNote(next.overallNote)
          setSelectedId(next.utterances[0]?.id ?? null)
          setDirty(false)
          setSaveMessage('Xử lý xong — có thể nghe và đánh giá.')
        }
      }).catch((e: Error) => { if (active) setError(e.message) })
    }, 2500)
    return () => { active = false; window.clearInterval(timer) }
  }, [callId, call?.status])

  const retry = async () => {
    if (!callId) return
    setError('')
    try {
      await retryProcessing(callId)
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const edit = (id: string, change: ReviewPatch) => {
    setPatches(prev => ({ ...prev, [id]: { ...prev[id], ...change } }))
    setDirty(true)
    setSaveMessage('')
  }

  const seek = (time: number) => {
    if (audioRef.current && Number.isFinite(time)) audioRef.current.currentTime = time
    setCurrentTime(time)
  }

  const selectMoment = (moment: Moment) => {
    setSelectedMomentId(moment.id)
    if (moment.utteranceIds[0]) setSelectedId(moment.utteranceIds[0])
    seek(moment.start)
  }

  const save = async () => {
    if (!call || saving) return
    setSaving(true)
    setError('')
    setSaveMessage('')
    const changed: Record<string, ReviewPatch> = {}
    for (const u of call.utterances) {
      const p = patches[u.id]
      const base = normalizedPatches(call)[u.id]
      if (JSON.stringify(p) !== JSON.stringify(base)) changed[u.id] = p
    }
    try {
      const next = await saveReview(call.id, {
        baseVersion: call.version,
        utterances: changed,
        moments: momentChanges,
        overallNote,
        complete: markReviewed,
      })
      setCall(next)
      setPatches(normalizedPatches(next))
      setMomentChanges({})
      setOverallNote(next.overallNote)
      setDirty(false)
      setSaveMessage('Đã lưu vào SQLite. Tải lại trang vẫn giữ thay đổi.')
    } catch (e) {
      const err = e as ApiError
      setError(err.code === 'version_conflict'
        ? 'Dữ liệu đã thay đổi ở tab khác. Sao chép ghi chú đang sửa nếu cần, rồi tải lại để tránh ghi đè.'
        : err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="p-6 text-slate-500">Đang tải cuộc gọi từ SQLite…</p>
  if (!call) return <div className="space-y-3"><Link to="/calls" className="text-blue-700">← Danh sách cuộc gọi</Link><p role="alert" className="text-red-700">{error || 'Không tìm thấy cuộc gọi.'}</p></div>
  const selected = call.utterances.find(u => u.id === selectedId) ?? null
  const current = call.utterances.find(u => currentTime >= u.start && currentTime < u.end)
  const selectedMoment = call.moments.find(m => m.id === selectedMomentId)
  const totalTime = Math.max(call.duration, ...call.utterances.map(u => u.end), 1)
  const reviewStatus = call.reviewStatus === 'reviewed' ? 'Đã xem xét' : call.reviewStatus === 'in_progress' ? 'Đang xem xét' : 'Chưa xem xét'

  return <div className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <Link to="/calls" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-blue-700"><ArrowLeft size={15}/> Danh sách cuộc gọi</Link>
        <h1 className="text-xl font-semibold">{call.id} · {call.title}</h1>
        <p className="text-sm text-slate-500">{call.agentName || 'Chưa có nhân viên'} / {call.customerName || 'Chưa có khách hàng'} · {clock(call.duration)} · {reviewStatus}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{provenanceLabel(call.provenance)}</span>
        <button disabled={!dirty || saving || call.status !== 'ready'} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"><Save size={15}/>{saving ? 'Đang lưu…' : 'Lưu đánh giá'}</button>
      </div>
    </header>
    {call.provenance === 'mock' && <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
      {call.source === 'results_import'
        ? 'Bản ghi demo seed: WAV tổng hợp không chứa lời nói thật, transcript và nhãn cảm xúc đều mô phỏng.'
        : 'Đây là file ghi âm được tải lên từ máy của bạn, nhưng ít nhất một bước ASR/SER hiện đang mô phỏng. Không xem dự đoán là kết quả mô hình nghiên cứu.'}
    </p>}
    {call.status !== 'ready' && <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{call.status === 'failed' ? 'Xử lý thất bại' : 'Đang xử lý file ghi âm'} · {call.progress}%</strong>
        {call.status === 'failed' && <button onClick={()=>void retry()} className="rounded-md border border-amber-400 px-3 py-1.5 text-xs hover:bg-amber-100">Thử xử lý lại</button>}
      </div>
      {call.error && <p role="alert" className="mt-2 text-red-700">{call.error}</p>}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-100"><div className="h-full bg-amber-500 transition-all" style={{width: Math.max(0, Math.min(100, call.progress))+'%'}}/></div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {call.stageLog.map(step => <li key={step.stage} className="rounded-md border border-amber-100 bg-white p-2 text-xs">
          <strong>{stageLabels[step.stage]}</strong>
          <p className="mt-1 text-slate-500">{step.state === 'done' ? 'Hoàn thành' : step.state === 'skipped' ? 'Bỏ qua' : step.state === 'running' ? 'Đang thực hiện' : step.state === 'failed' ? 'Lỗi' : 'Đang chờ'}</p>
          {step.detail && <p className="mt-1 text-slate-500">{step.detail}</p>}
        </li>)}
      </ol>
      {call.status !== 'failed' && <p className="mt-3 text-xs text-amber-800">Trạng thái được cập nhật tự động. Không đóng cửa sổ backend trong lúc xử lý.</p>}
    </section>}
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error} <button className="ml-2 underline" onClick={() => { if (window.confirm('Tải lại sẽ bỏ các thay đổi chưa lưu. Tiếp tục?')) void load() }}><RefreshCw size={13} className="inline"/> Tải lại</button></p>}
    {saveMessage && <p role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{saveMessage}</p>}
    {dirty && !saveMessage && <p className="text-xs font-medium text-amber-700">Có thay đổi chưa lưu</p>}

    <section className="rounded-lg border bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold">Âm thanh & dòng thời gian</h2>
      {call.audioUrl ? <audio key={call.id} ref={audioRef} controls preload="metadata" src={resolveApiUrl(call.audioUrl)} className="w-full"
        onTimeUpdate={e=>setCurrentTime(e.currentTarget.currentTime)}
        onSeeked={e=>setCurrentTime(e.currentTarget.currentTime)}
        onError={()=>setError('Không phát được file audio. Kiểm tra server/data/uploads và endpoint audio.')}
      /> : <p className="text-sm text-slate-500">Cuộc gọi chưa có file audio.</p>}
      <div className="mt-3 flex justify-between text-xs font-mono text-slate-500"><span>{clock(currentTime)}</span><span>{clock(totalTime)}</span></div>
      <div className="relative mt-1 h-9 overflow-hidden rounded bg-slate-100" role="group" aria-label="Dòng thời gian cảm xúc">
        {call.utterances.filter(u=>u.fused).map(u=><button key={u.id} title={clock(u.start)+' · '+emotionLabels[u.fused!.emotion]} aria-label={'Đến '+clock(u.start)}
          onClick={()=>{setSelectedId(u.id);seek(u.start)}} className="absolute top-0 h-full hover:brightness-90"
          style={{left:(u.start/totalTime*100)+'%',width:(Math.max(0.4,(u.end-u.start)/totalTime*100))+'%',background:emotionColors[u.fused!.emotion]}}/>)}
        <div className="pointer-events-none absolute top-0 h-full w-0.5 bg-slate-950" style={{left:(Math.min(100,currentTime/totalTime*100))+'%'}}/>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">{allEmotions.map(e=><span key={e} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded" style={{background:emotionColors[e]}}/>{emotionLabels[e]}</span>)}</div>
    </section>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(295px,1fr)]">
      <section className="rounded-lg border bg-white">
        <div className="border-b p-4"><h2 className="font-semibold">Bản ghi hội thoại</h2><p className="text-xs text-slate-500">Bấm vào câu để phát từ thời điểm tương ứng và chỉnh nhãn.</p></div>
        <div className="max-h-[550px] divide-y overflow-y-auto">
          {call.utterances.map(u=>{
            const active = current?.id === u.id
            const chosen = selectedId === u.id
            const p = patches[u.id]
            return <button key={u.id} onClick={()=>{setSelectedId(u.id);setSelectedMomentId(null);seek(u.start)}} className={'block w-full p-4 text-left hover:bg-slate-50 '+(chosen?'bg-blue-50 ':'')+(active?'border-l-4 border-blue-600':'border-l-4 border-transparent')}>
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-slate-500">{clock(u.start)}–{clock(u.end)}</span>
                <span className="font-semibold">{u.speaker==='agent'?'Nhân viên':u.speaker==='customer'?'Khách hàng':'Chưa rõ người nói'}</span>
                {u.fused && <span className="rounded bg-slate-100 px-2 py-0.5" style={{color:emotionColors[u.fused.emotion]}}>{emotionLabels[u.fused.emotion]} · {percent(u.fused.confidence)}</span>}
                {p?.decision==='corrected' && p.emotion && <span className="text-amber-700">Đã sửa → {emotionLabels[p.emotion]}</span>}
                {p?.decision==='confirmed' && <span className="text-green-700">Đã xác nhận</span>}
              </div>
              <p className="text-sm leading-6">{p?.text ?? u.text}</p>
            </button>
          })}
          {call.utterances.length===0 && <p className="p-6 text-sm text-slate-500">Chưa có transcript.</p>}
        </div>
      </section>

      <div className="space-y-4">
        <section className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Đánh giá từng câu</h2>
          {!selected ? <p className="mt-3 text-sm text-slate-500">Chọn một câu từ transcript.</p> : <>
            <p className="mt-2 text-xs text-slate-500">Câu #{selected.idx+1} · {clock(selected.start)} · {selected.speaker}</p>
            <p className="mt-2 text-sm">{patches[selected.id]?.text ?? selected.text}</p>
            <div className="mt-4 space-y-2 rounded-md bg-slate-50 p-3 text-sm">
              {([['Âm thanh',selected.acoustic],['Văn bản',selected.lexical],['Kết hợp',selected.fused]] as const).map(([label,p])=>
                <div key={label} className="flex justify-between gap-2"><span className="text-slate-500">{label}</span><strong>{p?emotionLabels[p.emotion]+' · '+percent(p.confidence):'Chưa có'}</strong></div>)}
            </div>
            <div className="mt-4 flex gap-2">
              <button disabled={!selected.fused} onClick={()=>edit(selected.id,{decision:'confirmed',emotion:null})} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm disabled:opacity-40"><Check size={15}/> Xác nhận</button>
              <button onClick={()=>edit(selected.id,{decision:null,emotion:null})} className="rounded-md border px-3 py-2 text-xs">Bỏ đánh giá</button>
            </div>
            <label className="mt-3 block text-sm font-medium">Sửa nhãn cảm xúc</label>
            <select className="mt-1 w-full rounded-md border p-2 text-sm" value={patches[selected.id]?.decision==='corrected' ? patches[selected.id].emotion??'' : ''}
              onChange={e=>edit(selected.id,{decision:'corrected', emotion:e.target.value as Emotion})}>
              <option value="">Chọn nhãn khác dự đoán…</option>
              {allEmotions.filter(e=>e!==selected.fused?.emotion).map(e=><option key={e} value={e}>{emotionLabels[e]}</option>)}
            </select>
            <label className="mt-3 block text-sm font-medium" htmlFor="speaker-select">Người nói (có thể sửa nếu tách giọng sai)</label>
            <select id="speaker-select" className="mt-1 w-full rounded-md border p-2 text-sm"
              value={patches[selected.id]?.speaker ?? selected.speaker}
              onChange={e=>edit(selected.id,{speaker:e.target.value as 'agent'|'customer'|'unknown'})}>
              <option value="unknown">Chưa xác định</option><option value="agent">Nhân viên</option><option value="customer">Khách hàng</option>
            </select>
            <label className="mt-3 block text-sm font-medium" htmlFor="transcript-edit">Sửa transcript nếu ASR nhận sai</label>
            <textarea id="transcript-edit" rows={3} maxLength={4000}
              value={patches[selected.id]?.text ?? selected.text}
              onChange={e=>edit(selected.id,{text:e.target.value})}
              className="mt-1 w-full rounded-md border p-2 text-sm"/>
            <label className="mt-3 block text-sm font-medium" htmlFor="utterance-note">Ghi chú câu nói</label>
            <textarea id="utterance-note" rows={3} maxLength={2000} value={patches[selected.id]?.note??''} onChange={e=>edit(selected.id,{note:e.target.value})} className="mt-1 w-full rounded-md border p-2 text-sm" placeholder="Nhận xét của người đánh giá…"/>
          </>}
        </section>
        <section className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Khoảnh khắc quan trọng ({call.moments.length})</h2>
          <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
            {call.moments.map(m=><button key={m.id} onClick={()=>selectMoment(m)} className={'block w-full rounded-md border p-2 text-left text-sm hover:bg-slate-50 '+(selectedMomentId===m.id?'border-blue-500 bg-blue-50':'')}>
              <strong>{clock(m.start)}</strong> · {m.description}
            </button>)}
            {call.moments.length===0 && <p className="text-sm text-slate-500">Chưa có khoảnh khắc được phát hiện.</p>}
          </div>
          {selectedMoment && <div className="mt-3 flex gap-2 text-xs">
            <button onClick={()=>{setMomentChanges(p=>({...p,[selectedMoment.id]:{relevance:true,note:p[selectedMoment.id]?.note??selectedMoment.note}}));setDirty(true)}} className="rounded border px-2 py-1.5">Có liên quan</button>
            <button onClick={()=>{setMomentChanges(p=>({...p,[selectedMoment.id]:{relevance:false,note:p[selectedMoment.id]?.note??selectedMoment.note}}));setDirty(true)}} className="rounded border px-2 py-1.5">Không liên quan</button>
            <span className="self-center text-slate-500">{momentChanges[selectedMoment.id]?.relevance===true?'Đã chọn: liên quan':momentChanges[selectedMoment.id]?.relevance===false?'Đã chọn: không':selectedMoment.relevance===null?'Chưa đánh giá':selectedMoment.relevance?'Liên quan':'Không liên quan'}</span>
          </div>}
        </section>
        <section className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Hoàn tất đánh giá</h2>
          <label className="mt-3 block text-sm" htmlFor="overall-note">Ghi chú tổng thể</label>
          <textarea id="overall-note" value={overallNote} onChange={e=>{setOverallNote(e.target.value);setDirty(true)}} maxLength={5000} rows={3} className="mt-1 w-full rounded border p-2 text-sm"/>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={markReviewed} onChange={e=>{setMarkReviewed(e.target.checked);setDirty(true)}}/> Đánh dấu đã hoàn tất xem xét</label>
          <button onClick={()=>void save()} disabled={!dirty||saving||call.status!=='ready'} className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40"><Save size={15}/>{saving?'Đang lưu…':'Lưu vào SQLite'}</button>
          <a className="mt-3 block text-sm text-blue-700 hover:underline" href={'/api/calls/'+encodeURIComponent(call.id)+'/export.csv'}>Xuất kết quả CSV</a>
        </section>
      </div>
    </div>
    <p className="flex items-center gap-2 text-xs text-slate-500"><AlertTriangle size={14}/> Nhãn gốc của mô hình vẫn được giữ riêng; chỉnh sửa của QA không ghi đè prediction.</p>
  </div>
}
