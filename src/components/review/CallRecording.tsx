import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clock, emotionColors, emotionLabels, resolveApiUrl, speakerLabels, type Speaker, type Utterance } from '@/api/isemotalk'

export interface SeekRequest { time: number; sequence: number }
interface Props {
  callId: string
  audioUrl: string | null
  duration: number
  utterances: Utterance[]
  seekRequest: SeekRequest | null
  onActiveChange: (id: string | null) => void
  onSelect: (id: string, time: number) => void
}

const speakers: Speaker[] = ['agent', 'customer', 'unknown']
const emotions = ['neutral', 'happy', 'sad', 'angry'] as const

const EmotionSegments = memo(function EmotionSegments({ utterances, duration, onSelect }: {
  utterances: Utterance[]; duration: number; onSelect: Props['onSelect']
}) {
  return <>{utterances.map(u => u.fused && <button key={u.id}
    type="button" title={`${clock(u.start)} · ${emotionLabels[u.fused.emotion]}`}
    aria-label={`${speakerLabels[u.speaker]}, ${clock(u.start)}, ${emotionLabels[u.fused.emotion]}`}
    onClick={() => onSelect(u.id, u.start)}
    className="absolute inset-y-0 border-r border-white/60 hover:brightness-90 focus-visible:z-10"
    style={{ left: `${u.start / duration * 100}%`, width: `${Math.max(0.2, (u.end - u.start) / duration * 100)}%`, background: emotionColors[u.fused.emotion] }}
  />)}</>
})

/** Audio progress stays local: a tick must not rerender the reviewer form/transcript. */
export const CallRecording = memo(function CallRecording({ callId, audioUrl, duration, utterances, seekRequest, onActiveChange, onSelect }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pendingSeek = useRef<number | null>(null)
  const lastSeekSequence = useRef<number | null>(null)
  const activeId = useRef<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioError, setAudioError] = useState('')
  const totalTime = useMemo(() => utterances.reduce((end, u) => Math.max(end, u.end), Math.max(duration, 1)), [utterances, duration])
  const hasEmotion = utterances.some(u => u.fused !== null)
  const tracks = useMemo(() => speakers.map(speaker => ({ speaker, utterances: utterances.filter(u => u.speaker === speaker && !!u.fused) }))
    .filter(track => track.utterances.length > 0), [utterances])

  const updateTime = useCallback((time: number) => {
    setCurrentTime(time)
    const next = utterances.find(u => time >= u.start && time < u.end)?.id ?? null
    if (activeId.current !== next) {
      activeId.current = next
      onActiveChange(next)
    }
  }, [utterances, onActiveChange])

  const seek = useCallback((time: number) => {
    const audio = audioRef.current
    const limit = audio && Number.isFinite(audio.duration) ? audio.duration : totalTime
    const target = Math.min(Math.max(0, time), limit)
    if (!Number.isFinite(target)) return
    if (audio && audio.readyState > 0) {
      audio.currentTime = target
      pendingSeek.current = null
    } else if (audio) pendingSeek.current = target
    updateTime(target)
  }, [totalTime, updateTime])

  useEffect(() => {
    if (seekRequest && lastSeekSequence.current !== seekRequest.sequence) {
      lastSeekSequence.current = seekRequest.sequence
      seek(seekRequest.time)
    }
  }, [seekRequest, seek])

  return <section className="rounded-xl border border-[#c4d4dc] bg-white p-5 shadow-sm" aria-labelledby="recording-title">
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h2 id="recording-title" className="text-lg font-semibold text-[#12394d]">Âm thanh & dòng thời gian</h2>
      <span className="text-sm tabular-nums text-slate-700">{clock(currentTime)} / {clock(totalTime)}</span>
    </div>
    {audioUrl ? <audio key={callId} ref={audioRef} controls preload="metadata" src={resolveApiUrl(audioUrl)} className="w-full"
      aria-label="Bản ghi âm cuộc gọi"
      onTimeUpdate={e => updateTime(e.currentTarget.currentTime)}
      onSeeked={e => updateTime(e.currentTarget.currentTime)}
      onLoadedMetadata={() => { setAudioError(''); if (pendingSeek.current !== null) seek(pendingSeek.current) }}
      onError={() => setAudioError('Chưa phát được bản ghi âm. Kiểm tra kết nối hoặc thử tải lại âm thanh.')}
    /> : <p className="text-sm text-slate-700">Chưa có bản ghi âm đi kèm. Bạn vẫn có thể xem transcript và dự đoán đã nhập.</p>}
    {audioError && <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      {audioError} <button type="button" className="ml-2 font-semibold underline" onClick={() => { setAudioError(''); audioRef.current?.load() }}>Thử lại</button>
    </div>}
    {hasEmotion ? <>
      <div className="mt-4 space-y-2" aria-label="Dự đoán cảm xúc theo người nói">
        {tracks.map(track => <div key={track.speaker} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3">
          <span className="text-sm font-medium text-slate-700">{speakerLabels[track.speaker]}</span>
          <div className="relative h-9 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
            <EmotionSegments utterances={track.utterances} duration={totalTime} onSelect={onSelect}/>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 bg-slate-950" style={{ left: `${Math.min(99.9, currentTime / totalTime * 100)}%` }}/>
          </div>
        </div>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700">{emotions.map(emotion => <span key={emotion} className="inline-flex items-center gap-2">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: emotionColors[emotion] }}/>{emotionLabels[emotion]}
      </span>)}</div>
      <p className="mt-3 text-sm text-slate-600">Chọn đoạn màu để nghe lại thời điểm đã được căn chỉnh. Các màu là dự đoán của model, không phải kết luận QA.</p>
    </> : <p role="status" className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
      Chưa có dự đoán SER đã được xác minh cho bản ghi này. Hệ thống vẫn có thể dùng transcript để sàng lọc QA; không hiển thị biểu đồ cảm xúc giả.
    </p>}
  </section>
})
