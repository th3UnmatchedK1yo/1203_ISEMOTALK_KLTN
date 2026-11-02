import { cn } from '@/lib/utils'
import type { CriticalMoment } from '@/types'
import { formatTimestamp, getCriticalMomentColor, getCriticalMomentLabel, getEmotionTextColor } from '@/lib/utils'
import { AlertTriangle, ArrowUp, ArrowDown, MessageSquare, Zap } from 'lucide-react'

interface CriticalMomentListProps {
  moments: CriticalMoment[]
  onMomentClick: (moment: CriticalMoment) => void
  selectedMomentId?: string
  className?: string
}

const MOMENT_ICONS = {
  escalation: ArrowUp,
  recovery: ArrowDown,
  sustained_negative: AlertTriangle,
  modality_disagreement: MessageSquare,
  high_confidence_change: Zap,
}

export function CriticalMomentList({
  moments,
  onMomentClick,
  selectedMomentId,
  className,
}: CriticalMomentListProps) {
  if (moments.length === 0) {
    return (
      <div className="text-center py-6 text-slate-500 text-sm">
        Không có khoảnh khắc quan trọng
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      {moments.map((moment) => {
        const Icon = MOMENT_ICONS[moment.type]
        const isSelected = moment.id === selectedMomentId

        return (
          <button
            key={moment.id}
            className={cn(
              'w-full text-left p-3 rounded-lg border transition-all',
              isSelected ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            )}
            onClick={() => onMomentClick(moment)}
          >
            <div className="flex items-start gap-2">
              <div className={cn(
                'p-1.5 rounded',
                getCriticalMomentColor(moment.type).split(' ')[0],
                getCriticalMomentColor(moment.type).split(' ')[1]
              )}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-500">
                    {formatTimestamp(moment.timestamp * 1000)}
                  </span>
                  {moment.endTimestamp && (
                    <span className="text-xs text-slate-400">
                      –{formatTimestamp(moment.endTimestamp * 1000)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn(
                    'text-sm font-medium px-1.5 py-0.5 rounded',
                    getCriticalMomentColor(moment.type)
                  )}>
                    {getCriticalMomentLabel(moment.type)}
                  </span>
                  {moment.primaryEmotion && (
                    <span className={cn('text-sm font-medium', getEmotionTextColor(moment.primaryEmotion))}>
                      {moment.primaryEmotion === 'neutral' ? 'Bình thường' :
                       moment.primaryEmotion === 'happy' ? 'Vui' :
                       moment.primaryEmotion === 'sad' ? 'Buồn' : 'Tức giận'}
                      {moment.secondaryEmotion && (
                        <span className="text-slate-400">
                          {' → '}
                          {moment.secondaryEmotion === 'neutral' ? 'Bình thường' :
                           moment.secondaryEmotion === 'happy' ? 'Vui' :
                           moment.secondaryEmotion === 'sad' ? 'Buồn' : 'Tức giận'}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                {moment.description && (
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{moment.description}</p>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
