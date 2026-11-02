import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { generateMockCalls, createShowcaseCall } from '@/data/mockData'
import { formatDateTime, formatTime, getReviewStatusColor } from '@/lib/utils'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { AudioPlayer } from '@/components/ui/AudioPlayer'
import { EmotionTimeline } from '@/components/ui/EmotionTimeline'
import { TranscriptUtterance } from '@/components/ui/TranscriptUtterance'
import { CriticalMomentList } from '@/components/ui/CriticalMomentList'
import { ConversationSummary } from '@/components/ui/ConversationSummary'
import { ReviewerPanel } from '@/components/ui/ReviewerPanel'
import type { Utterance, CriticalMoment, ReviewStatus, EmotionType } from '@/types'
import { REVIEW_STATUS_LABELS, EMOTION_LABELS } from '@/types'

export function CallReviewPage() {
  const { callId } = useParams<{ callId: string }>()
  const navigate = useNavigate()
  
  // Always use showcase call for demo
  const showcaseCall = useMemo(() => createShowcaseCall(), [])
  const allCalls = useMemo(() => generateMockCalls(), [])
  const call = useMemo(() => {
    // First try to find by ID, otherwise use showcase
    return allCalls.find((c) => c.id === callId) || showcaseCall
  }, [callId, allCalls, showcaseCall])

  // Audio state
  const [currentTime, setCurrentTime] = useState(0)
  const [activeUtteranceId, setActiveUtteranceId] = useState<string | null>(null)
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null)
  
  // Review state
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>(call.reviewStatus)
  const [reviewNotes, setReviewNotes] = useState<string[]>([])
  
  // Transcript state
  const [highlightedUtteranceId, setHighlightedUtteranceId] = useState<string | null>(null)
  const utteranceRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Find active utterance based on current time
  useEffect(() => {
    const utterance = call.utterances.find(
      (u) => currentTime >= u.startTime && currentTime <= u.endTime
    )
    if (utterance) {
      setActiveUtteranceId(utterance.id)
    }
  }, [currentTime, call.utterances])

  // Handle time change from audio player
  const handleTimeChange = useCallback((time: number) => {
    setCurrentTime(time)
  }, [])

  // Handle utterance click - seek audio
  const handleUtteranceClick = useCallback((utterance: Utterance) => {
    setCurrentTime(utterance.startTime)
    setActiveUtteranceId(utterance.id)
    setHighlightedUtteranceId(utterance.id)
  }, [])

  // Handle critical moment click
  const handleCriticalMomentClick = useCallback((moment: CriticalMoment) => {
    setSelectedMomentId(moment.id)
    setCurrentTime(moment.timestamp / 1000)
    
    // Highlight related utterances
    if (moment.utteranceIds.length > 0) {
      setHighlightedUtteranceId(moment.utteranceIds[0])
    }
  }, [])

  // Handle timeline time click
  const handleTimelineTimeClick = useCallback((time: number) => {
    setCurrentTime(time)
  }, [])

  // Reviewer actions
  const handleConfirmPrediction = () => {
    setReviewNotes(prev => [...prev, `[${new Date().toLocaleTimeString()}] Đã xác nhận dự đoán`])
  }

  const handleMarkIncorrect = (correctedEmotion: EmotionType) => {
    setReviewNotes(prev => [...prev, `[${new Date().toLocaleTimeString()}] Đánh dấu sai: ${EMOTION_LABELS[correctedEmotion]}`])
  }

  const handleMarkCriticalRelevant = (isRelevant: boolean) => {
    setReviewNotes(prev => [...prev, `[${new Date().toLocaleTimeString()}] Khoảnh khắc quan trọng: ${isRelevant ? 'Liên quan' : 'Không liên quan'}`])
  }

  const handleAddNote = (note: string) => {
    setReviewNotes(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${note}`])
  }

  if (!call) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold">Không tìm thấy cuộc gọi</h2>
        <p className="text-muted-foreground mb-4">ID: {callId}</p>
        <Button onClick={() => navigate('/calls')}>Quay lại danh sách</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/calls')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">{call.id}</h1>
            <PriorityBadge priority={call.reviewPriority} showIcon />
            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getReviewStatusColor(reviewStatus)}`}>
              {REVIEW_STATUS_LABELS[reviewStatus]}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{formatDateTime(call.startTime)}</p>
        </div>
        
        {/* Info pills */}
        <div className="hidden lg:flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {call.agent.avatar}
              </AvatarFallback>
            </Avatar>
            <span>{call.agent.name}</span>
          </div>
          <span className="text-slate-300">•</span>
          <span>{call.customer.name}</span>
          <span className="text-slate-300">•</span>
          <span>{formatTime(call.duration)}</span>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column - Audio, Timeline, Transcript (70%) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Audio Player */}
          <AudioPlayer
            duration={call.duration}
            currentTime={currentTime}
            onTimeChange={handleTimeChange}
          />

          {/* Emotion Timeline */}
          <EmotionTimeline
            utterances={call.utterances}
            criticalMoments={call.criticalMoments}
            currentTime={currentTime}
            onTimeClick={handleTimelineTimeClick}
            onCriticalMomentClick={handleCriticalMomentClick}
          />

          {/* Transcript Panel */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Bản ghi cuộc gọi
                <span className="text-sm font-normal text-muted-foreground">
                  ({call.utterances.length} câu)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[500px] overflow-y-auto custom-scrollbar">
              <div className="space-y-3">
                {call.utterances.map((utterance) => (
                  <div
                    key={utterance.id}
                    ref={(el) => {
                      if (el) utteranceRefs.current.set(utterance.id, el)
                    }}
                  >
                    <TranscriptUtterance
                      utterance={utterance}
                      isActive={utterance.id === activeUtteranceId}
                      isHighlighted={utterance.id === highlightedUtteranceId}
                      onClick={() => handleUtteranceClick(utterance)}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Review Sidebar (30%) */}
        <div className="space-y-4">
          {/* Conversation Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Tóm tắt cuộc gọi</CardTitle>
            </CardHeader>
            <CardContent>
              <ConversationSummary
                summary={call.summary}
                duration={call.duration}
              />
            </CardContent>
          </Card>

          {/* Critical Moments */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Khoảnh khắc quan trọng
                <span className="text-sm font-normal text-muted-foreground">
                  ({call.criticalMoments.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[300px] overflow-y-auto custom-scrollbar">
              <CriticalMomentList
                moments={call.criticalMoments}
                onMomentClick={handleCriticalMomentClick}
                selectedMomentId={selectedMomentId || undefined}
              />
            </CardContent>
          </Card>

          {/* Reviewer Panel */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Hành động xem xét</CardTitle>
            </CardHeader>
            <CardContent>
              <ReviewerPanel
                reviewStatus={reviewStatus}
                onStatusChange={setReviewStatus}
                onConfirmPrediction={handleConfirmPrediction}
                onMarkIncorrect={handleMarkIncorrect}
                onMarkCriticalRelevant={handleMarkCriticalRelevant}
                onAddNote={handleAddNote}
              />
            </CardContent>
          </Card>

          {/* Review Notes */}
          {reviewNotes.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Ghi chú xem xét</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                  {reviewNotes.map((note, idx) => (
                    <div key={idx} className="text-sm text-slate-600 p-2 bg-slate-50 rounded">
                      {note}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}