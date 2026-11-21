import { memo } from 'react'
import { clock, emotionBadgeClasses, emotionLabels, percent, speakerLabels, type ReviewPatch, type Utterance } from '@/api/isemotalk'

interface Props {
  utterances: Utterance[]
  patches: Record<string, ReviewPatch>
  selectedId: string | null
  activeId: string | null
  onSelect: (id: string, time: number) => void
}

const TranscriptRow = memo(function TranscriptRow({ utterance: u, patch, selected, active, onSelect }: {
  utterance: Utterance; patch: ReviewPatch | undefined; selected: boolean; active: boolean; onSelect: Props['onSelect']
}) {
  return <button type="button" onClick={() => onSelect(u.id, u.start)} aria-pressed={selected}
    className={`block w-full border-l-4 px-5 py-4 text-left transition-colors hover:bg-teal-50/70 ${selected ? 'bg-teal-50/70' : 'bg-white'} ${active ? 'border-l-[#087985]' : 'border-l-transparent'}`}>
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="font-mono tabular-nums text-slate-600">{clock(u.start)}–{clock(u.end)}</span>
      <span className="font-semibold text-slate-800">{speakerLabels[patch?.speaker ?? u.speaker]}</span>
      {active && <span className="font-semibold text-teal-800">Vị trí phát</span>}
      {u.fused && <span className={`rounded-md border px-2 py-0.5 font-medium ${emotionBadgeClasses[u.fused.emotion]}`}>
        {emotionLabels[u.fused.emotion]} · {percent(u.fused.confidence)}
      </span>}
      {patch?.decision === 'corrected' && patch.emotion && <span className="font-medium text-amber-900">QA sửa → {emotionLabels[patch.emotion]}</span>}
      {patch?.decision === 'confirmed' && <span className="font-medium text-emerald-800">QA xác nhận</span>}
    </div>
    <p className="text-base leading-7 text-[#17364b]">{patch?.text ?? u.text}</p>
  </button>
})

export const TranscriptList = memo(function TranscriptList({ utterances, patches, selectedId, activeId, onSelect }: Props) {
  return <section className="min-w-0 overflow-hidden rounded-xl border border-[#c4d4dc] bg-white shadow-sm" aria-labelledby="transcript-title">
    <div className="border-b border-[#d6e2e8] px-5 py-4">
      <h2 id="transcript-title" className="text-lg font-semibold text-[#12394d]">Bản ghi hội thoại <span className="font-normal text-slate-600">· {utterances.length} câu</span></h2>
      <p className="mt-1 text-sm text-slate-700">Chọn câu để nghe lại, xem bằng chứng và ghi nhận đánh giá.</p>
    </div>
    <div className="custom-scrollbar max-h-[75vh] divide-y divide-[#e0e9ed] overflow-y-auto">
      {utterances.map(u => <TranscriptRow key={u.id} utterance={u} patch={patches[u.id]} selected={selectedId === u.id} active={activeId === u.id} onSelect={onSelect}/>)}
      {!utterances.length && <p className="p-6 text-sm text-slate-700">Transcript sẽ xuất hiện sau khi xử lý hoàn tất.</p>}
    </div>
  </section>
})
