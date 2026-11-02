import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { EmotionType, ReviewStatus } from '@/types'
import { EMOTION_LABELS, REVIEW_STATUS_LABELS } from '@/types'
import { Button } from './button'
import { Input } from './input'
import { Check, X, AlertTriangle, MessageSquare } from 'lucide-react'

interface ReviewerPanelProps {
  reviewStatus: ReviewStatus
  onStatusChange: (status: ReviewStatus) => void
  onConfirmPrediction: () => void
  onMarkIncorrect: (correctedEmotion: EmotionType) => void
  onMarkCriticalRelevant: (isRelevant: boolean) => void
  onAddNote: (note: string) => void
  className?: string
}

export function ReviewerPanel({
  reviewStatus,
  onStatusChange,
  onConfirmPrediction,
  onMarkIncorrect,
  onMarkCriticalRelevant,
  onAddNote,
  className,
}: ReviewerPanelProps) {
  const [showEmotionSelector, setShowEmotionSelector] = useState(false)
  const [note, setNote] = useState('')

  const handleAddNote = () => {
    if (note.trim()) {
      onAddNote(note.trim())
      setNote('')
    }
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Review actions */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">Hành động xem xét</h3>
        
        {/* Confirm prediction */}
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={onConfirmPrediction}
        >
          <Check className="h-4 w-4 mr-2 text-emerald-600" />
          Xác nhận dự đoán
        </Button>

        {/* Mark incorrect */}
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={() => setShowEmotionSelector(!showEmotionSelector)}
        >
          <X className="h-4 w-4 mr-2 text-red-600" />
          Đánh dấu sai
        </Button>

        {/* Emotion selector */}
        {showEmotionSelector && (
          <div className="pl-8 space-y-1">
            {(Object.keys(EMOTION_LABELS) as EmotionType[]).map((emotion) => (
              <Button
                key={emotion}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm"
                onClick={() => {
                  onMarkIncorrect(emotion)
                  setShowEmotionSelector(false)
                }}
              >
                {EMOTION_LABELS[emotion]}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-slate-200"></div>

      {/* Mark critical moment */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">Khoảnh khắc quan trọng</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onMarkCriticalRelevant(true)}
          >
            <AlertTriangle className="h-4 w-4 mr-1" />
            Liên quan
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onMarkCriticalRelevant(false)}
          >
            <X className="h-4 w-4 mr-1" />
            Không
          </Button>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-200"></div>

      {/* Add note */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">Ghi chú</h3>
        <div className="flex gap-2">
          <Input
            placeholder="Thêm ghi chú..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
            className="text-sm"
          />
          <Button size="sm" variant="ghost" onClick={handleAddNote}>
            <MessageSquare className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-200"></div>

      {/* Mark as reviewed */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">Trạng thái xem xét</h3>
        <div className="space-y-1">
          {(['needs_review', 'reviewed'] as ReviewStatus[]).map((status) => (
            <Button
              key={status}
              variant={reviewStatus === status ? 'default' : 'outline'}
              size="sm"
              className="w-full justify-start"
              onClick={() => onStatusChange(status)}
            >
              {REVIEW_STATUS_LABELS[status]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
