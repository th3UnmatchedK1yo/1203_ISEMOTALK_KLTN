import { cn } from '@/lib/utils'
import type { ReviewPriority } from '@/types'
import { PRIORITY_LABELS } from '@/types'
import { getPriorityColor } from '@/lib/utils'
import { AlertCircle, AlertTriangle, MinusCircle } from 'lucide-react'

interface PriorityBadgeProps {
  priority: ReviewPriority
  showIcon?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function PriorityBadge({ 
  priority, 
  showIcon = false,
  size = 'md',
  className 
}: PriorityBadgeProps) {
  const Icon = priority === 'high' ? AlertCircle : priority === 'medium' ? AlertTriangle : MinusCircle
  
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs gap-1',
    md: 'px-2 py-1 text-sm gap-1.5',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded border',
        getPriorityColor(priority),
        sizeClasses[size],
        className
      )}
    >
      {showIcon && <Icon className="h-3.5 w-3.5" />}
      <span>Mức {PRIORITY_LABELS[priority]}</span>
    </span>
  )
}
