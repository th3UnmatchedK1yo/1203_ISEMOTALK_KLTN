import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { request, json, callPath, uploadFile, time, pct, emotions, statuses, priorities, provenanceLabel, stages, reviewLabels, speakers } from '@/lib/workspaceApi'
import type { Analytics, CallDetail, CallItem, CallList, Emotion, Prediction, SystemStatus, Utterance } from '@/lib/workspaceApi'

const panel = 'rounded-xl border border-stone-200 bg-white p-4 md:p-5'
const button = 'inline-flex items-center justify-center rounded-lg bg-[#76543c] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#64462f] disabled:cursor-not-allowed disabled:opacity-50'
const secondary = 'inline-flex items-center justify-center rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50'
const field = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm'
const emotionStyle: Record<Emotion, string> = { neutral: 'bg-stone-100 text-stone-700', happy: 'bg-emerald-50 text-emerald-800', sad: 'bg-blue-50 text-blue-800', angry: 'bg-red-50 text-red-800' }
const momentNames: Record<string, string> = { escalation: 'Thay đổi sang nhãn tiêu cực', recovery: 'Thay đổi sang nhãn không tiêu cực', sustained_negative: 'Chuỗi nhãn tiêu cực', modality_disagreement: 'Hai mô hình bất nhất', high_confidence_change: 'Thay đổi nhãn', uncertain_prediction: 'Điểm dự đoán thấp' }
const errText = (e: unknown) => e instanceof Error ? e.message : String(e)
function usePoll<T>(url: string, interval = 3000) {
  const [state, setState] = useState<{ url: string; data?: T; error?: string }>({ url })
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined
    const abort = new AbortController()
    const run = async () => {
      try { const data = await request<T>(url, { signal: abort.signal }); if (active) setState({ url, data }) }
      catch (e) { if (active) setState(old => ({ url, data: old.url === url ? old.data : undefined, error: errText(e) })) }
      if (active && interval > 0) timer = setTimeout(run, interval)
    }
    void run()
    return () => { active = false; abort.abort(); if (timer) clearTimeout(timer) }
  }, [url, interval, refresh])
  return { data: state.url === url ? state.data : undefined, error: state.url === url ? state.error : undefined, reload: () => setRefresh(n => n + 1) }
}
function Heading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1><p className="mt-1 text-sm text-stone-600">{description}</p></div>{action}</header>
}
function ErrorBox({ message }: { message?: string | null }) {
  return message ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</div> : null
}
function Empty({ children }: { children: ReactNode }) { return <div className={panel + ' text-center text-sm text-stone-500'}>{children}</div> }
function Stat({ label, value }: { label: string; value: number | string }) { return <div className={panel}><p className="text-sm text-stone-500">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p></div> }
function Source({ source }: { source: CallItem['provenance'] }) { return <span className={'rounded px-2 py-1 text-xs font-medium ' + (source === 'mock' ? 'bg-amber-100 text-amber-900' : source === 'real' ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-600')}>{provenanceLabel(source)}</span> }
function StatusPanel({ status }: { status?: SystemStatus }) {
  if (!status) return <div className={panel + ' text-sm text-stone-500'}>Đang kiểm tra dịch vụ inference…</div>
  const inf = status.inference
  const verified = inf.components?.ser.verified === true
  return <section className={panel}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Trạng thái mô hình</h2><span className="text-xs text-stone-600">{inf.reachable ? (inf.mode === 'real' && verified && inf.status === 'ok' ? 'Sẵn sàng (SER đã qua bước kiểm tra)' : 'Chưa sẵn sàng cho demo inference thật') : 'Không kết nối inference'}</span></div>
    <ErrorBox message={inf.error}/><div className="mt-3 grid gap-2 md:grid-cols-3">{inf.components && Object.entries(inf.components).map(([name, c]) => <div key={name} className="rounded-lg bg-stone-50 p-3"><p className="text-xs font-medium uppercase text-stone-500">{name}</p><p className="my-1 text-sm font-semibold">{c.adapter} · {c.mock ? 'Mock' : c.ready ? 'Có cấu hình' : 'Chưa sẵn sàng'}</p><p className="break-words text-xs text-stone-600">{c.detail}</p>{name === 'ser' && <p className="mt-1 text-xs">{c.verified ? 'Đã qua bước verification' : 'Chưa xác minh checkpoint'}</p>}</div>)}</div>
    <p className="mt-3 text-xs text-stone-500">{inf.device || 'Thiết bị chưa xác định'}{inf.ffmpeg === false ? ' · Thiếu FFmpeg' : ''}. Trạng thái sẵn sàng không thay thế thực nghiệm trên dữ liệu tổng đài.</p>
  </section>
}
function CallRows({ items }: { items: CallItem[] }) {
  if (!items.length) return <Empty>Chưa có cuộc gọi phù hợp. <Link className="underline" to="/import">Thêm bản ghi</Link>.</Empty>
  return <section className="overflow-x-auto rounded-xl border border-stone-200 bg-white"><table className="w-full min-w-[780px] text-left text-sm"><thead className="border-b bg-stone-50 text-xs text-stone-600"><tr>{['Cuộc gọi / nguồn','Xử lý','Ưu tiên kiểm tra','Tín hiệu cần xem','QA',''].map((x,i) => <th key={i} className="p-3 font-medium">{x}</th>)}</tr></thead><tbody className="divide-y divide-stone-100">
  {items.map(c => <tr key={c.id} className="align-top hover:bg-stone-50"><td className="p-3"><Link to={'/calls/' + c.id} className="font-semibold text-[#76543c] hover:underline">{c.title || c.id}</Link><p className="my-1 text-xs text-stone-500">{c.id} · {time(c.duration)}</p><Source source={c.provenance}/></td><td className="p-3">{statuses[c.status]}{c.status === 'processing' && <div className="mt-1 text-xs text-stone-500">{stages[c.stage || ''] || c.stage} · {c.progress}%</div>}{c.error && <p className="max-w-[220px] break-words text-xs text-red-700">{c.error}</p>}</td><td className="p-3">{c.status === 'ready' && c.dominantEmotion ? <span className={c.priority === 'high' ? 'font-semibold text-red-700' : 'text-stone-700'}>{priorities[c.priority]}</span> : '—'}</td><td className="p-3">{c.status === 'ready' ? <><p>{c.momentCount} đoạn đánh dấu</p><p className="text-xs text-stone-500">{c.disagreementCount} câu bất nhất</p></> : '—'}</td><td className="p-3">{c.status === 'ready' ? reviewLabels[c.reviewStatus] : '—'}</td><td className="p-3"><Link className={secondary} to={'/calls/' + c.id}>{c.status === 'ready' ? 'Kiểm tra' : 'Chi tiết'}</Link></td></tr>)}
  </tbody></table></section>
}
export function Dashboard() {
  const calls = usePoll<CallList>('/api/calls?pageSize=1')
  const ready = usePoll<CallList>('/api/calls?status=ready&review=unreviewed&sort=priority&dir=desc&pageSize=5&provenance=real')
  const health = usePoll<SystemStatus>('/api/system/status', 6000)
  const analytics = usePoll<Analytics>('/api/analytics?provenance=real', 6000)
  return <div className="space-y-5"><Heading title="Tổng quan sàng lọc hội thoại" description="Tải bản ghi, theo dõi phân tích và ưu tiên những đoạn cần con người xác minh." action={<Link className={button} to="/import">Thêm bản ghi âm</Link>}/>
    <ErrorBox message={calls.error || ready.error || analytics.error || health.error}/>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Bản ghi (mọi nguồn)" value={calls.data?.counts.total ?? '—'}/><Stat label="Đang xử lý (mọi nguồn)" value={calls.data?.counts.processing ?? '—'}/><Stat label="Inference thật đã xử lý" value={analytics.data?.status.ready ?? '—'}/><Stat label="Inference thật đã xác minh" value={analytics.data?.review.reviewed ?? '—'}/></div>
    <StatusPanel status={health.data}/>
    <div className="flex items-center justify-between"><div><h2 className="font-semibold">Cuộc gọi thật chưa kiểm tra</h2><p className="text-xs text-stone-500">Sắp theo mức ưu tiên do quy tắc sàng lọc đề xuất.</p></div><Link className={secondary} to="/calls">Mở hàng đợi</Link></div>
    {ready.data ? <CallRows items={ready.data.items}/> : <Empty>Đang tải danh sách…</Empty>}
  </div>
}
type UploadResult = { name: string; id?: string; error?: string }
export function ImportPage() {
  const health = usePoll<SystemStatus>('/api/system/status', 5000)
  const [files, setFiles] = useState<File[]>([])
  const [agentChannel, setChannel] = useState('0')
  const [consent, setConsent] = useState(false)
  const [demo, setDemo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const inf = health.data?.inference
  const ready = !!inf?.reachable && inf.status === 'ok'
  const genuine = inf?.mode === 'real' && inf.components?.ser.verified === true
  const canUpload = ready && (genuine || demo) && !health.error
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy || !files.length || !canUpload || !consent) return
    setBusy(true); setResults([])
    const failures: File[] = []
    try {
      for (const file of files) {
        try { const result = await uploadFile(file, agentChannel); setResults(old => [...old, { name: file.name, id: result.id }]) }
        catch (e) { failures.push(file); setResults(old => [...old, { name: file.name, error: errText(e) }]) }
      }
      setFiles(failures)
    } finally { setBusy(false) }
  }
  return <div className="space-y-5"><Heading title="Thêm bản ghi âm" description="Chọn một hoặc nhiều bản ghi có quyền sử dụng. Hệ thống tự chạy ASR, SER và tổng hợp cảnh báo."/>
    <ErrorBox message={health.error}/><StatusPanel status={health.data}/>
    <form className={panel + ' space-y-4'} onSubmit={submit}>
      <label className="block text-sm font-medium">Tệp WAV, MP3, M4A<input className={field + ' mt-2'} type="file" accept=".wav,.mp3,.m4a" multiple disabled={busy} onChange={e => {setFiles(Array.from(e.currentTarget.files || [])); setResults([]); e.currentTarget.value = ''}}/></label>
      <div className="space-y-1">{files.map((f,i) => <div key={i} className="flex items-center justify-between gap-3 rounded bg-stone-50 px-3 py-2 text-sm"><span className="break-all">{f.name} · {(f.size/1024/1024).toFixed(1)} MB</span><button type="button" className="text-stone-600 underline" disabled={busy} onClick={() => setFiles(old => old.filter((_,n) => n !== i))}>Bỏ</button></div>)}</div>
      <label className="block text-sm font-medium">Nếu ghi âm stereo tách riêng hai bên, kênh của nhân viên<select className={field + ' mt-1'} value={agentChannel} onChange={e => setChannel(e.target.value)} disabled={busy}><option value="0">Kênh 1 (trái)</option><option value="1">Kênh 2 (phải)</option></select><span className="text-xs font-normal text-stone-500">Mono hoặc chưa phân biệt được người nói sẽ không tự gán danh tính.</span></label>
      {!genuine && <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)} disabled={busy}/> Tôi chỉ thử nghiệm pipeline; kết quả mock/mixed hoặc chưa xác minh không được dùng làm bằng chứng hiệu năng SER.</label>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={busy}/> Tôi có quyền xử lý bản ghi này và hiểu dữ liệu sẽ được lưu trên máy chủ đang chạy ứng dụng.</label>
      <button disabled={!canUpload || !consent || !files.length || busy} className={button}>{busy ? 'Đang gửi từng tệp…' : 'Tải lên & phân tích (' + files.length + ')'}</button>
      {!ready && <p className="text-sm text-stone-600">Cần khởi động API và dịch vụ inference, kiểm tra FFmpeg và adapter.</p>}
    </form>
    {!!results.length && <section className={panel + ' space-y-3'}><h2 className="font-semibold">Kết quả gửi tệp</h2>{results.map((r,i) => <div key={i} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm"><span className="break-all">{r.name}</span>{r.id ? <Link className="text-[#76543c] underline" to={'/calls/' + r.id}>{r.id} · Xem tiến độ</Link> : <span className="text-red-700">{r.error}</span>}</div>)}<Link className={secondary} to="/calls">Xem hàng đợi xử lý</Link></section>}
  </div>
}
export function QueuePage() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [source, setSource] = useState('')
  const [page, setPage] = useState(1)
  const params = new URLSearchParams({ search, sort: 'priority', dir: 'desc', page: String(page), pageSize: '15' })
  if (source) params.set('provenance', source)
  if (filter === 'attention') params.set('attention','1')
  else if (filter === 'reviewed') params.set('review','reviewed')
  else if (filter !== 'all') params.set('status',filter)
  const list = usePoll<CallList>('/api/calls?' + params.toString())
  return <div className="space-y-5"><Heading title="Hàng đợi cuộc gọi" description="Theo dõi tiến độ và chọn các cuộc gọi cần nghe lại trước." action={<Link to="/import" className={button}>Thêm bản ghi</Link>}/>
    <div className={panel + ' grid gap-3 md:grid-cols-3'}><label className="text-xs text-stone-600">Tìm theo mã hoặc tên<input className={field + ' mt-1'} value={search} onChange={e => {setSearch(e.target.value);setPage(1)}} placeholder="Tìm cuộc gọi…"/></label><label className="text-xs text-stone-600">Trạng thái<select className={field + ' mt-1'} value={filter} onChange={e => {setFilter(e.target.value);setPage(1)}}>{[['all','Tất cả'],['attention','Ưu tiên cao chưa xác minh'],['queued','Chờ xử lý'],['processing','Đang phân tích'],['failed','Bị lỗi'],['ready','Đã phân tích'],['reviewed','Đã xác minh']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label><label className="text-xs text-stone-600">Nguồn kết quả<select className={field + ' mt-1'} value={source} onChange={e => {setSource(e.target.value);setPage(1)}}><option value="">Mọi nguồn (có nhãn)</option><option value="real">Inference thật</option><option value="mock">Mô phỏng</option><option value="imported">Nhập ngoài</option></select></label></div>
    <ErrorBox message={list.error}/>{list.data ? <><CallRows items={list.data.items}/><div className="flex items-center justify-between text-sm"><span>{list.data.total} cuộc gọi · Trang {page}</span><div className="flex gap-2"><button className={secondary} disabled={page===1} onClick={() => setPage(p=>p-1)}>Trước</button><button className={secondary} disabled={page * list.data.pageSize >= list.data.total} onClick={() => setPage(p=>p+1)}>Sau</button></div></div></> : <Empty>Đang tải dữ liệu API…</Empty>}
  </div>
}
function PredictionCard({ label, value }: { label: string; value: Prediction | null }) {
  return <div className="rounded-lg border border-stone-200 p-3"><p className="text-xs text-stone-500">{label}</p>{value ? <><p className={'my-2 inline-block rounded px-2 py-1 text-sm font-semibold ' + emotionStyle[value.emotion]}>{emotions[value.emotion]}</p><div className="h-1.5 overflow-hidden rounded bg-stone-100"><div className="h-full bg-[#9e8064]" style={{width: pct(value.confidence)}}/></div><p className="mt-1 text-xs text-stone-600">Điểm top-1: {pct(value.confidence)}</p></> : <p className="mt-2 text-sm text-stone-500">Không có đầu ra</p>}</div>
}
type Draft = { decision: 'confirmed' | 'corrected' | null; emotion: Emotion | null; note: string; speaker: Utterance['speaker']; flagged: boolean }
function CallInspection({ call, onSaved }: { call: CallDetail; onSaved: (c: CallDetail) => void }) {
  const [selectedId,setSelected] = useState(call.moments[0]?.utteranceIds.slice(-1)[0] || call.utterances[0]?.id || '')
  const audio = useRef<HTMLAudioElement>(null)
  const [position,setPosition] = useState(0)
  const [audioError,setAudioError] = useState('')
  const [drafts,setDrafts] = useState<Record<string,Draft>>({})
  const [momentDrafts,setMomentDrafts] = useState<Record<string,{relevance:boolean|null;note?:string}>>({})
  const [overall,setOverall] = useState(call.overallNote)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [saved,setSaved] = useState('')
  const selected = call.utterances.find(u => u.id === selectedId)
  const seek = useCallback((at: number) => { if (audio.current) { try { audio.current.currentTime=at } catch { setAudioError('Không thể tua tới vị trí này. Hãy chờ audio tải xong.') } } setPosition(at) },[])
  const choose = (u: Utterance) => {setSelected(u.id);seek(u.start)}
  const draft = (u:Utterance) => drafts[u.id] || { decision:u.review.decision, emotion:u.review.emotion, note:u.review.note, speaker:u.speaker, flagged:u.flagged }
  const patch = (u:Utterance, update: Partial<Draft>) => {setSaved('');setDrafts(old=>({...old,[u.id]:{...(old[u.id] || draft(u)),...update}}))}
  const pending = Object.keys(drafts).length > 0 || Object.keys(momentDrafts).length > 0 || overall !== call.overallNote
  useEffect(() => { if (!pending) return; const fn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',fn);return()=>window.removeEventListener('beforeunload',fn) },[pending])
  async function save(complete?: boolean) {
    if (busy) return
    setBusy(true);setError('');setSaved('')
    try {
      const updated = await request<CallDetail>(callPath(call.id)+'/review',json({baseVersion:call.version,utterances:drafts,moments:momentDrafts,overallNote:overall,complete}))
      onSaved(updated);setDrafts({});setMomentDrafts({});setSaved('Đã lưu vào cơ sở dữ liệu.')
    } catch(e){setError(errText(e))} finally{setBusy(false)}
  }
  const modelWarning = call.provenance !== 'real'
  return <div className="space-y-4">
    <section className={panel + ' space-y-3'}><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Nghe lại bản ghi</h2><p className="text-xs text-stone-500">{call.audioName || 'Không có audio'} · {time(call.duration)} · {time(position)}</p></div><Source source={call.provenance}/></div>
      {call.audioUrl ? <audio ref={audio} controls preload="metadata" className="w-full" src={call.audioUrl} onError={()=>setAudioError('Không tải được bản ghi âm từ API.')} onTimeUpdate={()=>setPosition(audio.current?.currentTime || 0)}/> : <p className="text-sm text-stone-500">Kết quả không có bản ghi âm. Không thể xác minh bằng cách nghe.</p>}
      <ErrorBox message={audioError}/>
      <div className="relative h-10 rounded-md border bg-stone-50" aria-label="Dòng thời gian cảm xúc">{call.duration > 0 && call.utterances.filter(u=>u.fused).map(u=><button key={u.id} type="button" aria-label={time(u.start)+' '+emotions[u.fused!.emotion]} title={time(u.start)+' '+emotions[u.fused!.emotion]} onClick={()=>choose(u)} className={'absolute h-full border-r border-white opacity-80 hover:opacity-100 '+({neutral:'bg-stone-400',happy:'bg-emerald-500',sad:'bg-blue-400',angry:'bg-red-500'}[u.fused!.emotion])} style={{left:Math.min(100,u.start/call.duration*100)+'%',width:Math.max(0,Math.min(100-u.start/call.duration*100,(u.end-u.start)/call.duration*100))+'%'}}/>)}{call.duration>0&&<div className="pointer-events-none absolute top-0 h-full w-0.5 bg-black" style={{left:Math.min(100,position/call.duration*100)+'%'}}/>}</div>
      <p className="text-xs text-stone-500">Trung tính · Vui · Buồn · Giận. Bấm đoạn màu hoặc câu transcript để tua. Hai kênh có thể chồng thời gian; timeline không phải cảm xúc liên tục.</p>
      {modelWarning && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">Nguồn kết quả là mô phỏng hoặc nhập ngoài. Không dùng để chứng minh độ chính xác.</p>}
      {call.speakerSource !== 'channel' && call.speakerSource !== 'provided' && <p className="text-xs text-stone-600">Vai trò người nói chưa được xác nhận từ metadata/kênh riêng. Kiểm tra và gán thủ công nếu cần.</p>}
    </section>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <section className={panel + ' min-w-0'}><h2 className="mb-3 font-semibold">Transcript · {call.utterances.length} đoạn</h2><div className="max-h-[580px] space-y-2 overflow-y-auto">{call.utterances.map(u=><button type="button" key={u.id} onClick={()=>choose(u)} className={'block w-full rounded-lg border p-3 text-left '+(selectedId===u.id?'border-[#a98a6e] bg-[#f7f0e8]':'border-stone-200 hover:bg-stone-50')}><div className="flex flex-wrap items-center gap-2 text-xs text-stone-500"><span>{time(u.start)} – {time(u.end)}</span><span>{speakers[draft(u).speaker]}</span>{u.fused&&<span className={'rounded px-2 py-0.5 '+emotionStyle[u.fused.emotion]}>{emotions[u.fused.emotion]}</span>}{u.agreement==='conflict'&&<span className="text-amber-800">Bất nhất</span>}{draft(u).decision&&<span className="text-emerald-800">Đã đánh giá</span>}</div><p className="mt-2 break-words text-sm">{u.text}</p></button>)}</div>{!call.utterances.length&&<p className="text-sm text-stone-500">Không có đoạn lời nói.</p>}</section>
      <section className={panel + ' min-w-0 space-y-3'}><h2 className="font-semibold">Bằng chứng & xác minh {selected&&<span className="text-sm font-normal text-stone-500">· {time(selected.start)}</span>}</h2>
        {selected ? <><div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3"><PredictionCard label="Âm học" value={selected.acoustic}/><PredictionCard label="Văn bản" value={selected.lexical}/><PredictionCard label="Fusion" value={selected.fused}/></div>
        <p className="text-xs text-stone-500">Điểm top-1 chưa được hiệu chuẩn; không phải xác suất dự đoán đúng. Bất nhất giữa mô hình không chứng minh cảm xúc thật.</p>
        {selected.agreement==='conflict'&&<p className="rounded bg-amber-50 p-2 text-sm text-amber-900">Hai mô hình đơn kênh chọn nhãn khác nhau. Nên nghe lại đoạn này.</p>}
        {selected.fused && selected.fused.confidence < 0.55 && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">Điểm top-1 thấp theo ngưỡng thử nghiệm 0,55; cần xác minh.</p>}
        <fieldset disabled={busy} className="space-y-3 border-t pt-3"><legend className="pr-2 text-sm font-medium">Quyết định QA</legend>
          <label className="block text-xs">Người nói<select className={field} value={draft(selected).speaker} onChange={e=>patch(selected,{speaker:e.target.value as Utterance['speaker']})}>{Object.entries(speakers).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          <label className="block text-xs">Đánh giá dự đoán<select className={field} value={draft(selected).decision||''} onChange={e=>patch(selected,{decision:(e.target.value||null) as Draft['decision'],emotion:null})}><option value="">Chưa đánh giá</option><option value="confirmed" disabled={!selected.fused}>Xác nhận nhãn fusion</option><option value="corrected">Sửa nhãn</option></select></label>
          {draft(selected).decision==='corrected'&&<label className="block text-xs">Nhãn do QA xác định<select className={field} value={draft(selected).emotion||''} onChange={e=>patch(selected,{emotion:(e.target.value||null) as Emotion|null})}><option value="">Chọn nhãn</option>{Object.entries(emotions).filter(([v])=>v!==selected.fused?.emotion).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft(selected).flagged} onChange={e=>patch(selected,{flagged:e.target.checked})}/> Đánh dấu để theo dõi</label>
          <label className="block text-xs">Ghi chú đoạn<textarea className={field} rows={2} maxLength={2000} value={draft(selected).note} onChange={e=>patch(selected,{note:e.target.value})}/></label>
        </fieldset></>:<p className="text-sm text-stone-500">Chọn một đoạn ở transcript.</p>}
      </section>
    </div>
    <section className={panel + ' space-y-3'}><h2 className="font-semibold">Đoạn gợi ý kiểm tra · {call.moments.length}</h2><p className="text-xs text-stone-500">Cảnh báo do quy tắc sàng lọc, không phải kết luận chất lượng dịch vụ.</p>
      {!call.moments.length&&<p className="text-sm text-stone-500">Chưa có cảnh báo theo quy tắc hiện tại.</p>}
      {call.moments.map(m=><div key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3"><button className="min-w-0 flex-1 text-left" type="button" onClick={()=>{const u=call.utterances.find(u=>u.id===m.utteranceIds.slice(-1)[0]);if(u)setSelected(u.id);seek(m.start)}}><p className="text-sm font-semibold">{time(m.start)} · {momentNames[m.type]||m.type}</p><p className="mt-1 text-xs text-stone-600">{m.description}</p></button><select aria-label={'Đánh giá cảnh báo '+m.id} className="rounded-lg border p-2 text-sm" value={(momentDrafts[m.id]||m).relevance===null?'':(momentDrafts[m.id]||m).relevance?'yes':'no'} disabled={busy} onChange={e=>{setSaved('');setMomentDrafts(old=>({...old,[m.id]:{relevance:e.target.value===''?null:e.target.value==='yes',note:m.note}}))}}><option value="">Chưa xác minh</option><option value="yes">Đáng kiểm tra</option><option value="no">Không liên quan</option></select></div>)}
    </section>
    <section className={panel + ' space-y-3'}><h2 className="font-semibold">Lưu kết quả kiểm tra</h2><label className="block text-sm">Ghi chú tổng thể<textarea className={field+' mt-1'} rows={3} maxLength={5000} value={overall} disabled={busy} onChange={e=>{setOverall(e.target.value);setSaved('')}}/></label><ErrorBox message={error}/>{saved&&<p role="status" className="text-sm text-emerald-800">{saved}</p>}
      <div className="flex flex-wrap gap-2"><button className={secondary} disabled={busy||!pending} onClick={()=>void save()}>Lưu bản đánh giá</button><button className={button} disabled={busy} onClick={()=>void save(true)}>Hoàn tất kiểm tra</button>{call.reviewStatus==='reviewed'&&<button className={secondary} disabled={busy} onClick={()=>void save(false)}>Mở lại</button>}<a className={secondary} href={callPath(call.id)+'/export.csv'}>CSV đã lưu</a></div><p className="text-xs text-stone-500">{pending?'Có thay đổi chưa lưu.':'Trạng thái: '+reviewLabels[call.reviewStatus]}. Hoàn tất không có nghĩa là mọi dự đoán đã được xác nhận.</p></section>
  </div>
}
export function ReviewPage() {
  const {callId} = useParams()
  const id = callId || ''
  return <ReviewRoute key={id} id={id}/>
}
function ReviewRoute({id}:{id:string}) {
  const [call,setCall] = useState<CallDetail>()
  const [error,setError] = useState('')
  const [retrying,setRetrying] = useState(false)
  const [revision,setRevision] = useState(0)
  const done = call?.status==='ready'||call?.status==='failed'
  useEffect(()=>{
    const ac=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let active=true
    const run=async()=>{try{const data=await request<CallDetail>(callPath(id),{signal:ac.signal});if(!active)return;setCall(data);setError('');if(data.status==='queued'||data.status==='processing')timer=setTimeout(run,1500)}
      catch(e){if(active){setError(errText(e));if(!done)timer=setTimeout(run,4000)}}}
    void run();return()=>{active=false;ac.abort();if(timer)clearTimeout(timer)}
  },[id,revision,done])
  async function retry(){setRetrying(true);setError('');try{await request(callPath(id)+'/retry',{method:'POST'});setCall(undefined);setRevision(n=>n+1)}catch(e){setError(errText(e))}finally{setRetrying(false)}}
  return <div className="space-y-4"><Link className="text-sm font-medium text-[#76543c] underline" to="/calls">← Hàng đợi cuộc gọi</Link><Heading title={call?.title||id} description={call?call.id+' · '+statuses[call.status]:'Đang lấy dữ liệu từ API'}/><ErrorBox message={error}/>
    {!call ? <Empty>Chưa tải được dữ liệu cuộc gọi.</Empty> : call.status==='ready' ? <CallInspection key={call.id} call={call} onSaved={setCall}/> : <section className={panel+' space-y-3'}><div className="flex justify-between"><h2 className="font-semibold">Tiến độ xử lý</h2><span>{call.progress}%</span></div><progress className="w-full accent-[#76543c]" max={100} value={call.progress}/><Source source={call.provenance}/>{call.stageLog.map(s=><div key={s.stage} className="flex justify-between gap-2 border-b pb-2 text-sm"><span>{stages[s.stage]||s.stage}<span className="block text-xs text-stone-500">{s.detail}</span></span><span>{({pending:'Chờ',running:'Đang chạy',done:'Xong',skipped:'Bỏ qua',failed:'Lỗi'} as Record<string,string>)[s.state]||s.state}</span></div>)}<ErrorBox message={call.error}/>{call.status==='failed'&&<button className={button} disabled={retrying} onClick={()=>void retry()}>Thử lại sau khi sửa lỗi</button>}</section>}
  </div>
}
export function ReportingPage() {
  const [source,setSource]=useState('real')
  const query='?provenance='+source
  const analytics=usePoll<Analytics>('/api/analytics'+query,6000)
  const a=analytics.data
  return <div className="space-y-5"><Heading title="Báo cáo vận hành & SER" description="Thống kê dữ liệu đã xử lý và kết quả QA, tách riêng từng nguồn." action={<a className={secondary} href={'/api/export/analytics.csv'+query}>Xuất CSV</a>}/>
    <label className="block max-w-sm text-sm">Nguồn kết quả<select className={field+' mt-1'} value={source} onChange={e=>setSource(e.target.value)}><option value="real">Inference thật</option><option value="imported">Kết quả nhập ngoài</option><option value="mock">Mô phỏng — chỉ thử pipeline</option></select></label>
    <ErrorBox message={analytics.error}/>{a ? <><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Đã phân tích" value={a.status.ready}/><Stat label="Đã xác minh cuộc gọi" value={a.review.reviewed}/><Stat label="Câu có đánh giá" value={a.modelQuality.reviewed}/><Stat label="Tỷ lệ bất nhất (có đủ 2 kênh)" value={pct(a.modality.conflictRate)}/></div>
    <div className="grid gap-4 md:grid-cols-2"><section className={panel}><h2 className="font-semibold">Nhãn cảm xúc phía khách hàng</h2><p className="my-2 text-xs text-stone-500">Chỉ đoạn gán vai trò khách hàng; dùng nhãn đã sửa khi có. Không đo sự hài lòng.</p>{Object.entries(a.customerEmotion).map(([e,n])=><div key={e} className="flex justify-between border-b py-2 text-sm"><span>{emotions[e as Emotion]}</span><span>{n}</span></div>)}</section><section className={panel}><h2 className="font-semibold">Đánh giá người kiểm tra</h2><p className="mt-2 text-sm">Xác nhận: {a.modelQuality.confirmed} · Sửa nhãn: {a.modelQuality.corrected}</p><p className="mt-2 text-sm">Tỷ lệ xác nhận trong các câu đã đánh giá: {pct(a.modelQuality.agreementRate)}</p><p className="mt-2 text-xs text-stone-500">Không phải accuracy hay UAR trên tập kiểm thử độc lập; dữ liệu QA có thiên lệch chọn mẫu.</p><p className="mt-4 text-sm">Cảnh báo đáng kiểm tra: {a.moments.relevance.relevant} · Không liên quan: {a.moments.relevance.notRelevant}</p></section></div></>:<Empty>Đang tải thống kê từ API…</Empty>}
    <section className={panel}><h2 className="font-semibold">Đánh giá khoa học</h2><p className="mt-2 text-sm text-stone-600">UAR, Macro-F1, calibration và Recall@K cần được đo trên tập kiểm thử có nhãn độc lập. Trang này không tự biến số liệu vận hành hoặc dữ liệu mô phỏng thành benchmark nghiên cứu.</p></section>
  </div>
}
