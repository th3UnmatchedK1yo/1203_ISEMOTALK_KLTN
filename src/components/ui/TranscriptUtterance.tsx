import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Utterance } from '@/types'
import { formatTime } from '@/lib/utils'
import { ModalityEvidence } from './ModalityEvidence'

interface TranscriptUtteranceProps {
  utterance: Utterance
  isActive?: boolean
  isHighlighted?: boolean
  onClick?: () => void
  className?: string
}

export function TranscriptUtterance({
  utterance,
  isActive = false,
  isHighlighted = false,
  onClick,
  className,
}: TranscriptUtteranceProps) {
  const [expanded, setExpanded] = useState(false)
  const { modalityPrediction } = utterance

  const emotionLabel = (emotion: string) => {
    const labels: Record<string, string> = {
      neutral: 'Bình thường',
      happy: 'Vui',
      sad: 'Buồn',
      angry: 'Tức giận'
    }
    return labels[emotion] || emotion
  }

  return (
    <div
      className={cn(
        'border rounded-lg p-3 transition-all cursor-pointer',
        isActive && 'border-primary bg-primary/5',
        isHighlighted && 'border-amber-400 bg-amber-50',
        !isActive && !isHighlighted && 'border-slate-200 hover:border-slate-300',
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
            {formatTime(utterance.startTime)}–{formatTime(utterance.endTime)}
          </span>
          <span className={cn(
            'text-xs font-semibold uppercase px-1.5 py-0.5 rounded',
            utterance.speaker === 'agent' ? 'bg-primary/10 text-primary' : 'bg-emerald-100 text-emerald-700'
          )}>
            {utterance.speaker === 'agent' ? 'Agent' : 'Khách hàng'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ModalityEvidence
            acousticEmotion={modalityPrediction.acoustic.emotion}
            acousticConfidence={modalityPrediction.acoustic.confidence}
            lexicalEmotion={modalityPrediction.lexical.emotion}
            lexicalConfidence={modalityPrediction.lexical.confidence}
            fusedEmotion={modalityPrediction.fused.emotion}
            fusedConfidence={modalityPrediction.fused.confidence}
            agreement={modalityPrediction.agreement}
            expanded={expanded}
            onToggle={() => setExpanded(!expanded)}
          />
        </div>
      </div>

      <p className="mt-2 text-sm text-slate-800 leading-relaxed">
        "{utterance.text}"
      </p>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
          <div className="bg-slate-50 rounded-lg p-3 space-y-2">
            <div className="text-xs font-medium text-slate-600 mb-2">Chi tiết dự đoán</div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span>Âm thanh</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{emotionLabel(modalityPrediction.acoustic.emotion)}</span>
                <span className="text-slate-500">{Math.round(modalityPrediction.acoustic.confidence)}%</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span>Văn bản</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{emotionLabel(modalityPrediction.lexical.emotion)}</span>
                <span className="text-slate-500">{Math.round(modalityPrediction.lexical.confidence)}%</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-200">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                <span className="font-medium">Fused</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{emotionLabel(modalityPrediction.fused.emotion)}</span>
                <span className="font-medium text-slate-700">{Math.round(modalityPrediction.fused.confidence)}%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
