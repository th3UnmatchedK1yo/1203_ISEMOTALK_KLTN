import { cn } from '@/lib/utils'
import type { EmotionType } from '@/types'
import { EMOTION_LABELS } from '@/types'
import { getEmotionColor } from '@/lib/utils'

interface EmotionBadgeProps {
  emotion: EmotionType
  confidence?: number
  showConfidence?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function EmotionBadge({ 
  emotion, 
  confidence, 
  showConfidence = false,
  size = 'md',
  className 
}: EmotionBadgeProps) {
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded font-medium',
        getEmotionColor(emotion),
        sizeClasses[size],
        className
      )}
    >
      {EMOTION_LABELS[emotion]}
      {showConfidence && confidence !== undefined && (
        <span className="opacity-75">{Math.round(confidence)}%</span>
      )}
    </span>
  )
}
