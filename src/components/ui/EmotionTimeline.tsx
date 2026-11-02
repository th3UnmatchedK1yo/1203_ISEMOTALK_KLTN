import { cn } from '@/lib/utils'
import type { Utterance, CriticalMoment, EmotionType } from '@/types'
import { formatTimestamp,  getCriticalMomentColor, getCriticalMomentLabel } from '@/lib/utils'
import { useMemo } from 'react'

interface EmotionTimelineProps {
  utterances: Utterance[]
  criticalMoments: CriticalMoment[]
  currentTime: number
  onTimeClick: (time: number) => void
  onCriticalMomentClick: (moment: CriticalMoment) => void
  className?: string
}

const EMOTION_COLORS: Record<EmotionType, string> = {
  neutral: '#94a3b8', // slate-400
  happy: '#22c55e',   // emerald-500
  sad: '#3b82f6',     // blue-500
  angry: '#ef4444',   // red-500
}

export function EmotionTimeline({
  utterances,
  criticalMoments,
  currentTime,
  onTimeClick,
  onCriticalMomentClick,
  className,
}: EmotionTimelineProps) {
  const totalDuration = useMemo(() => {
    if (utterances.length === 0) return 100
    return Math.max(...utterances.map(u => u.endTime))
  }, [utterances])

  const segments = useMemo(() => {
    return utterances.map(u => ({
      id: u.id,
      startPercent: (u.startTime / totalDuration) * 100,
      widthPercent: ((u.endTime - u.startTime) / totalDuration) * 100,
      emotion: u.modalityPrediction.fused.emotion,
      confidence: u.modalityPrediction.fused.confidence,
      hasDisagreement: u.modalityPrediction.agreement === 'conflict',
    }))
  }, [utterances, totalDuration])

  const markers = useMemo(() => {
    return criticalMoments.map(m => ({
      id: m.id,
      positionPercent: (m.timestamp / totalDuration) * 100,
      type: m.type,
      endPositionPercent: m.endTimestamp ? (m.endTimestamp / totalDuration) * 100 : undefined,
    }))
  }, [criticalMoments, totalDuration])

  const playheadPosition = (currentTime / totalDuration) * 100

  return (
    <div className={cn('bg-slate-50 rounded-lg p-4 border', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-700">Biểu đồ cảm xúc</span>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: EMOTION_COLORS.neutral }}></span>
              Bình thường
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: EMOTION_COLORS.happy }}></span>
              Vui
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: EMOTION_COLORS.sad }}></span>
              Buồn
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: EMOTION_COLORS.angry }}></span>
              Tức giận
            </span>
          </div>
        </div>
        <div className="text-sm font-mono text-slate-500">
          {formatTimestamp(currentTime * 1000)} / {formatTimestamp(totalDuration * 1000)}
        </div>
      </div>

      {/* Timeline track */}
      <div className="relative h-12 bg-white rounded border overflow-hidden">
        {/* Emotion segments */}
        <div className="absolute inset-0 flex">
          {segments.map((seg) => (
            <div
              key={seg.id}
              className={cn(
                'relative cursor-pointer transition-all hover:brightness-95',
                seg.hasDisagreement && 'ring-2 ring-purple-400 ring-inset'
              )}
              style={{
                left: `${seg.startPercent}%`,
                width: `${seg.widthPercent}%`,
                backgroundColor: EMOTION_COLORS[seg.emotion],
                opacity: 0.7 + (seg.confidence / 100) * 0.3,
              }}
              onClick={() => onTimeClick(utterances.find(u => u.id === seg.id)?.startTime || 0)}
              title={`${seg.emotion} - ${Math.round(seg.confidence)}%`}
            />
          ))}
        </div>

        {/* Critical moment markers */}
        {markers.map((marker) => (
          <div
            key={marker.id}
            className="absolute top-0 bottom-0 z-10 cursor-pointer"
            style={{
              left: `${marker.positionPercent}%`,
              width: marker.endPositionPercent 
                ? `${marker.endPositionPercent - marker.positionPercent}%`
                : '2px',
            }}
            onClick={() => {
              const moment = criticalMoments.find(m => m.id === marker.id)
              if (moment) onCriticalMomentClick(moment)
            }}
          >
            {/* Marker indicator */}
            <div className={cn(
              'absolute top-0 h-3 w-3 rounded-full -translate-x-1/2',
              getCriticalMomentColor(marker.type).split(' ')[0],
              getCriticalMomentColor(marker.type).split(' ')[1]
            )} style={{ left: marker.endPositionPercent ? '0' : '50%' }}>
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-6 border-l-transparent border-r-transparent"
                style={{ 
                  borderTopColor: marker.type === 'escalation' ? '#ef4444' : 
                                 marker.type === 'recovery' ? '#22c55e' : 
                                 marker.type === 'sustained_negative' ? '#f97316' : 
                                 marker.type === 'modality_disagreement' ? '#a855f7' : '#3b82f6'
                }}
              />
            </div>
            
            {/* Range indicator for sustained segments */}
            {marker.endPositionPercent && (
              <div 
                className={cn(
                  'absolute top-3 bottom-0 opacity-30',
                  marker.type === 'sustained_negative' ? 'bg-orange-400' :
                  marker.type === 'escalation' ? 'bg-red-400' :
                  marker.type === 'recovery' ? 'bg-green-400' : 'bg-blue-400'
                )}
              />
            )}
          </div>
        ))}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary z-20"
          style={{ left: `${playheadPosition}%` }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary rounded-full" />
        </div>
      </div>

      {/* Legend for critical moments */}
      <div className="flex flex-wrap gap-2 mt-3">
        {criticalMoments.slice(0, 4).map((moment) => (
          <button
            key={moment.id}
            className={cn(
              'text-xs px-2 py-1 rounded border transition-colors hover:brightness-95',
              getCriticalMomentColor(moment.type)
            )}
            onClick={() => onCriticalMomentClick(moment)}
          >
            <span className="font-medium">{formatTimestamp(moment.timestamp * 1000)}</span>
            <span className="ml-1">{getCriticalMomentLabel(moment.type)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
