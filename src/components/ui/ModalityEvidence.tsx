import { cn } from '@/lib/utils'
import type { EmotionType, AgreementLevel } from '@/types'
import { EMOTION_LABELS } from '@/types'
import { EmotionBadge } from './EmotionBadge'
import { ReliabilityBadge } from './ReliabilityBadge'

interface ModalityEvidenceProps {
  acousticEmotion: EmotionType
  acousticConfidence: number
  lexicalEmotion: EmotionType
  lexicalConfidence: number
  fusedEmotion: EmotionType
  fusedConfidence: number
  agreement: AgreementLevel
  expanded?: boolean
  onToggle?: () => void
  className?: string
}

export function ModalityEvidence({
  acousticEmotion,
  acousticConfidence,
  lexicalEmotion,
  lexicalConfidence,
  fusedEmotion,
  fusedConfidence,
  agreement,
  expanded = false,
  onToggle,
  className,
}: ModalityEvidenceProps) {
  const hasConflict = agreement === 'conflict'
  // margin

  return (
    <div className={cn('space-y-2', className)}>
      {/* Collapsed view */}
      <div 
        className={cn(
          'flex items-center gap-2 cursor-pointer select-none',
          hasConflict && 'text-red-700'
        )}
        onClick={onToggle}
      >
        <EmotionBadge emotion={fusedEmotion} confidence={fusedConfidence} showConfidence size="sm" />
        {hasConflict && (
          <span className="text-xs text-red-600 flex items-center gap-0.5">
            <span>âš </span>
            <span>Báº¥t Ä‘á»“ng</span>
          </span>
        )}
        {expanded && <span className="text-xs text-muted-foreground ml-auto">â–²</span>}
        {!expanded && <span className="text-xs text-muted-foreground ml-auto">â–¼</span>}
      </div>

      {/* Expanded view */}
      {expanded && (
        <div className="bg-slate-50 rounded-lg p-3 space-y-2 text-sm">
          {/* Evidence breakdown */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                Ã‚m thanh
              </span>
              <div className="flex items-center gap-2">
                <span className={cn(
                  hasConflict && acousticEmotion !== lexicalEmotion ? 'font-semibold' : ''
                )}>
                  {EMOTION_LABELS[acousticEmotion]}
                </span>
                <span className="text-slate-500">{Math.round(acousticConfidence)}%</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                VÄƒn báº£n
              </span>
              <div className="flex items-center gap-2">
                <span className={cn(
                  hasConflict && acousticEmotion !== lexicalEmotion ? 'font-semibold' : ''
                )}>
                  {EMOTION_LABELS[lexicalEmotion]}
                </span>
                <span className="text-slate-500">{Math.round(lexicalConfidence)}%</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-200 my-2"></div>

          {/* Agreement indicator */}
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Äá»™ Ä‘á»“ng thuáº­n</span>
            <ReliabilityBadge agreement={agreement} size="sm" />
          </div>

          {/* Additional info */}
          {hasConflict && (
            <div className="text-xs text-slate-500 mt-2 p-2 bg-amber-50 rounded">
              MÃ´ hÃ¬nh Ã¢m thanh vÃ  vÄƒn báº£n Ä‘Æ°a ra dá»± Ä‘oÃ¡n khÃ¡c nhau. Cáº§n ngÆ°á»i Ä‘Ã¡nh giÃ¡ xÃ¡c nháº­n.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
