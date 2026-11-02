import { cn } from '@/lib/utils'
import type { AgreementLevel } from '@/types'
import { getAgreementColor, getAgreementLabel } from '@/lib/utils'
import { AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react'

interface ReliabilityBadgeProps {
  agreement: AgreementLevel
  showLabel?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function ReliabilityBadge({ 
  agreement, 
  showLabel = true,
  size = 'md',
  className 
}: ReliabilityBadgeProps) {
  const Icon = agreement === 'high' ? CheckCircle : agreement === 'partial' ? AlertCircle : AlertTriangle
  
  const sizeClasses = {
    sm: 'text-xs gap-1',
    md: 'text-sm gap-1.5',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded',
        getAgreementColor(agreement),
        sizeClasses[size],
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {showLabel && <span>{getAgreementLabel(agreement)}</span>}
    </span>
  )
}
