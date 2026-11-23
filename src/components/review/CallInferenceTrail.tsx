import { Link } from 'react-router-dom'
import { ArrowRight, FileAudio, FileText, BrainCircuit, AudioLines } from 'lucide-react'
import type { CallDetail } from '@/api/isemotalk'

/**
 * Evidence lineage, not model readiness. OneVoice source transcript is NOT
 * ASR output; XLM-R QA is an independent classifier, not SER/fusion.
 */
export function CallInferenceTrail({ call }: { call: CallDetail }) {
  const transcribe = call.stageLog.find(s => s.stage === 'transcribe')
  const emotion = call.stageLog.find(s => s.stage === 'emotion')
  const asrWasReal = transcribe?.state === 'done' && transcribe.evidence?.mock === false && call.provenance !== 'mock'
  const asrWasMock = transcribe?.state === 'done' && (transcribe.evidence?.mock === true || call.provenance === 'mock')
  const textKind = call.utterances.length === 0 ? 'Chưa có transcript'
    : asrWasReal ? 'ASR đã nhận dạng audio'
    : asrWasMock ? 'ASR mô phỏng'
    : 'Transcript có sẵn / nhập từ nguồn'
  const serPredictions = call.utterances.some(u => u.fused !== null)
  const serReal = emotion?.state === 'done' && emotion.evidence?.mock === false && call.provenance !== 'mock' && serPredictions
  const serKind = serReal ? 'Có dự đoán từ model'
    : serPredictions ? 'Có nhãn nhập / chưa chứng minh SER chạy'
    : emotion?.state === 'running' ? 'Đang suy luận'
    : 'Chưa có dự đoán cảm xúc'
  const stepClasses = 'min-w-0 border-l-2 border-slate-200 px-3 py-1'
  return <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5"
    aria-label="Nguồn của từng kết quả trong cuộc gọi" data-testid="inference-trail">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-bold text-[#12394d]">AI đã xử lý đến bước nào?</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">Tách rõ dữ liệu nguồn, nhận dạng tiếng nói, sàng lọc QA và nhận diện cảm xúc.</p>
      </div>
      <Link to="/research" className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:underline">
        Xem giới hạn model <ArrowRight size={14} aria-hidden="true"/>
      </Link>
    </div>
    <div className="mt-4 grid gap-x-4 gap-y-3 border-t border-slate-100 pt-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className={stepClasses}>
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600"><FileAudio size={15} aria-hidden="true"/> Âm thanh</span>
        <strong className="mt-1.5 block text-sm text-slate-900">{call.hasAudio ? 'Đã lưu file ghi âm' : 'Chưa có audio'}</strong>
      </div>
      <div className={stepClasses}>
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600"><FileText size={15} aria-hidden="true"/> ASR / văn bản</span>
        <strong className="mt-1.5 block text-sm text-slate-900">{textKind}</strong>
      </div>
      <div className={stepClasses}>
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600"><BrainCircuit size={15} aria-hidden="true"/> XLM-R QA</span>
        <strong className="mt-1.5 block text-sm text-slate-900">{call.utterances.length ? 'Xem kết quả ở bước 2' : 'Chờ transcript'}</strong>
      </div>
      <div className={stepClasses}>
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600"><AudioLines size={15} aria-hidden="true"/> SER cảm xúc</span>
        <strong className="mt-1.5 block text-sm text-slate-900">{serKind}</strong>
      </div>
    </div>
    {call.provenance === 'imported' && call.title.startsWith('TTS TỔNG HỢP · OneVoice') &&
      <p className="mt-3 text-xs leading-5 text-amber-900">
        OneVoice là giọng TTS và transcript kịch bản. <strong>Chữ trong khung chat không phải PhoWhisper vừa nhận dạng.</strong>
        Điểm XLM-R ở bên phải mới là bước suy luận QA riêng trên transcript.
      </p>}
  </section>
}
