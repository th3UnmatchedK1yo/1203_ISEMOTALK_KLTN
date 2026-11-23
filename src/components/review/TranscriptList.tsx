import { memo } from 'react'
import { sourceDialogueTurns } from '@/lib/source-dialogue'
import { clock, emotionBadgeClasses, emotionLabels, percent, speakerLabels, type ReviewPatch, type Utterance } from '@/api/isemotalk'

interface Props {
  utterances: Utterance[]
  patches: Record<string, ReviewPatch>
  selectedId: string | null
  activeId: string | null
  onSelect: (id: string, time: number) => void
  sourceDialogue?: boolean
  transcriptFromAudio?: boolean
  timingMode?: 'word_aligned' | 'audio_window'
}

const TranscriptRow = memo(function TranscriptRow({ utterance: u, patch, selected, active, onSelect }: {
  utterance: Utterance; patch: ReviewPatch | undefined; selected: boolean; active: boolean; onSelect: Props['onSelect']
}) {
  const speaker = patch?.speaker ?? u.speaker
  const isCustomer = speaker === 'customer'
  const isUnknown = speaker === 'unknown'
  // ASR chunks are NOT speaker turns. Unknown audio must appear as a neutral
  // time-coded transcript, not as misleading left/right chat bubbles.
  if (isUnknown) return <div className="border-b border-slate-100 px-4 py-1 last:border-b-0">
    <button type="button" onClick={() => onSelect(u.id, u.start)} aria-pressed={selected}
      className={'flex w-full items-start gap-4 rounded-md px-3 py-3 text-left transition-colors ' +
        (selected ? 'bg-[#e9f4f2] ring-1 ring-[#0e7580]' : active ? 'bg-slate-100' : 'hover:bg-slate-50')}>
      <span className="mt-0.5 shrink-0 font-mono text-xs tabular-nums text-slate-500">{clock(u.start)}–{clock(u.end)}</span>
      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium text-slate-500">Đoạn âm thanh · chưa xác định người nói{active ? ' · đang phát' : ''}</p>
        <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-900">{patch?.text ?? u.text}</p>
        {patch?.decision === 'corrected' && patch.emotion && <span className="mt-1 block text-xs font-medium text-amber-900">QA sửa nhãn cảm xúc: {emotionLabels[patch.emotion]}</span>}
      </div>
    </button>
  </div>
  return <div className={'flex px-4 py-2 ' + (isCustomer ? 'justify-end' : 'justify-start')}>
    <button type="button" onClick={() => onSelect(u.id, u.start)} aria-pressed={selected}
      className={'w-fit max-w-[94%] rounded-2xl border px-4 py-3 text-left shadow-sm transition-colors sm:max-w-[86%] ' +
        (selected ? 'ring-2 ring-teal-600 ring-offset-2 ' : '') +
        (isCustomer ? 'border-sky-200 bg-sky-50 hover:bg-sky-100/70 ' :
          isUnknown ? 'border-amber-200 bg-amber-50/70 hover:bg-amber-50 ' :
            'border-slate-200 bg-white hover:bg-slate-50 ')}>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold text-slate-800">{isUnknown ? 'Chưa xác định người nói' : speakerLabels[speaker]}</span>
        <span className="font-mono tabular-nums text-slate-600">{clock(u.start)}–{clock(u.end)}</span>
        {active && <span className="font-semibold text-teal-800">Đang phát</span>}
        {u.fused && <span className={'rounded-md border px-2 py-0.5 font-medium ' + emotionBadgeClasses[u.fused.emotion]}>
          {emotionLabels[u.fused.emotion]} · {percent(u.fused.confidence)}
        </span>}
        {patch?.decision === 'corrected' && patch.emotion && <span className="font-medium text-amber-900">QA sửa → {emotionLabels[patch.emotion]}</span>}
        {patch?.decision === 'confirmed' && <span className="font-medium text-emerald-800">QA xác nhận</span>}
      </div>
      <p className="whitespace-pre-wrap break-words text-base leading-7 text-[#17364b]">{patch?.text ?? u.text}</p>
    </button>
  </div>
})
export const TranscriptList = memo(function TranscriptList({ utterances, patches, selectedId, activeId, onSelect, sourceDialogue = false, transcriptFromAudio = false, timingMode }: Props) {
  const source = sourceDialogue && utterances.length === 1 ? utterances[0] : null
  const turns = source ? sourceDialogueTurns(patches[source.id]?.text ?? source.text) : []
  const hasAssignedRoles = utterances.some(u => (patches[u.id]?.speaker ?? u.speaker) !== 'unknown')
  return <section className="min-w-0 overflow-hidden rounded-xl border border-[#c4d4dc] bg-white shadow-sm" aria-labelledby="transcript-title">
    <div className="border-b border-[#e0e8ed] px-5 py-4">
      <h2 id="transcript-title" className="text-lg font-semibold text-[#12394d]">
        {source && turns.length > 1
          ? <>Hội thoại nguồn <span className="font-normal text-slate-600">· {turns.length} lượt lời</span></>
          : <>{transcriptFromAudio && !hasAssignedRoles ? 'Bản phiên âm theo thời gian' : transcriptFromAudio ? 'Transcript do ASR tạo' : 'Bản ghi hội thoại'} <span className="font-normal text-slate-600">· {utterances.length} đoạn</span></>}
      </h2>
      <p className="mt-1 text-sm text-slate-700">
        {source && turns.length > 1
          ? 'Lời thoại và vai trò agent/customer lấy từ kịch bản OneVoice, không phải diarization. Nguồn chỉ có transcript toàn clip, chưa có timestamp cho từng lượt.'
          : transcriptFromAudio ? (timingMode === 'audio_window' ? 'PhoWhisper gặp lỗi timestamp từng từ và đã tự chạy lại trên các khoảng âm thanh. Mốc thời gian dưới đây là KHOẢNG AUDIO, không phải thời điểm chính xác từng câu nói hay lượt người nói.' : 'Đây là các đoạn dựa trên timestamp ASR, không đồng nghĩa lượt nói. Nếu chưa tách được giọng, hệ thống để nhãn người nói là chưa xác định.') : 'Chọn đoạn để nghe lại, xem bằng chứng và ghi nhận đánh giá.'}
      </p>
    </div>
    {source && turns.length > 1 ? <div className="custom-scrollbar max-h-[75vh] space-y-3 overflow-y-auto bg-[#f8fbfb] p-4">
      {turns.map((turn, index) => <div key={index} className={turn.speaker === 'customer' ? 'flex justify-end' : 'flex justify-start'}>
        <div className={'w-fit max-w-[92%] rounded-xl border px-4 py-3 shadow-sm sm:max-w-[83%] ' +
          (turn.speaker === 'customer' ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-white')}>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            {turn.speaker === 'agent' ? 'Nhân viên (nhãn kịch bản)' : turn.speaker === 'customer' ? 'Khách hàng (nhãn kịch bản)' : 'Chưa rõ người nói'}
          </span>
          <p className="mt-1 whitespace-pre-wrap break-words text-base leading-7 text-[#17364b]">{turn.text}</p>
        </div>
      </div>)}
      <button type="button" onClick={() => onSelect(source.id, source.start)}
        className="rounded-lg border border-teal-200 bg-white px-4 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50">
        Chọn toàn bộ hội thoại để ghi chú QA
      </button>
      <p className="text-xs leading-5 text-slate-600">
        Không thể nhảy chính xác tới từng lượt vì dataset chưa cung cấp mốc thời gian.
        Để có transcript theo thời gian, cần ASR/alignment thật.
      </p>
    </div> : <div className="custom-scrollbar max-h-[75vh] overflow-y-auto bg-white py-2">
      {utterances.map(u => <TranscriptRow key={u.id} utterance={u} patch={patches[u.id]} selected={selectedId === u.id} active={activeId === u.id} onSelect={onSelect}/>)}
      {!utterances.length && <p className="p-6 text-sm text-slate-700">Transcript sẽ xuất hiện sau khi xử lý hoàn tất.</p>}
    </div>}
  </section>
})
