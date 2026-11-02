import { cn } from '@/lib/utils'
import type { CallSummary } from '@/types'
import { EMOTION_LABELS } from '@/types'
import { formatDuration } from '@/lib/utils'
import { 
  AlertTriangle, 
  ArrowDown, 
  ArrowUp, 
  MessageSquare, 
  Activity
} from 'lucide-react'

interface ConversationSummaryProps {
  summary: CallSummary
  duration: number
  className?: string
}

export function ConversationSummary({
  summary,
  duration,
  className,
}: ConversationSummaryProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {/* Dominant emotion */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">Cáº£m xÃºc chÃ­nh</span>
        <span className="text-sm font-medium">
          {EMOTION_LABELS[summary.dominantEmotion]}
        </span>
      </div>

      {/* Negative emotion ratio */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">Tá»· lá»‡ tiÃªu cá»±c</span>
        <span className={cn(
          'text-sm font-medium',
          summary.negativeEmotionRatio > 0.3 ? 'text-red-600' : 
          summary.negativeEmotionRatio > 0.15 ? 'text-amber-600' : 'text-emerald-600'
        )}>
          {(summary.negativeEmotionRatio * 100).toFixed(0)}%
        </span>
      </div>

      {/* Duration */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">Thá»i lÆ°á»£ng</span>
        <span className="text-sm font-medium">{formatDuration(duration)}</span>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-200"></div>

      {/* Escalations */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <ArrowUp className="h-4 w-4 text-red-500" />
          <span>Leo thang</span>
        </div>
        <span className="text-sm font-medium">{summary.escalationCount}</span>
      </div>

      {/* Recoveries */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <ArrowDown className="h-4 w-4 text-emerald-500" />
          <span>Há»“i phá»¥c</span>
        </div>
        <span className="text-sm font-medium">{summary.recoveryCount}</span>
      </div>

      {/* Critical moments */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span>Khoáº£nh kháº¯c quan trá»ng</span>
        </div>
        <span className={cn(
          'text-sm font-medium',
          summary.criticalMomentCount > 3 ? 'text-red-600' : 'text-slate-700'
        )}>
          {summary.criticalMomentCount}
        </span>
      </div>

      {/* Modality disagreements */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <MessageSquare className="h-4 w-4 text-purple-500" />
          <span>Báº¥t Ä‘á»“ng Ã¢m/thanh</span>
        </div>
        <span className="text-sm font-medium">{summary.modalityDisagreementCount}</span>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-200"></div>

      {/* Average confidence */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Activity className="h-4 w-4 text-blue-500" />
          <span>Äá»™ tin cáº­y TB</span>
        </div>
        <span className="text-sm font-medium">{summary.avgConfidence}%</span>
      </div>
    </div>
  )
}
