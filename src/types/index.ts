// Emotion types - standardized internal values
export type EmotionType = 'neutral' | 'happy' | 'sad' | 'angry'

// Vietnamese labels for emotions
export const EMOTION_LABELS: Record<EmotionType, string> = {
  neutral: 'Bình thường',
  happy: 'Vui',
  sad: 'Buồn',
  angry: 'Tức giận',
}

// Review priority for triage
export type ReviewPriority = 'low' | 'medium' | 'high'

export const PRIORITY_LABELS: Record<ReviewPriority, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
}

// Review status
export type ReviewStatus = 'unreviewed' | 'needs_review' | 'reviewed'

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  unreviewed: 'Chưa xem',
  needs_review: 'Cần xem xét',
  reviewed: 'Đã xem xét',
}

// Processing status
export type ProcessingStatus = 'ready' | 'processing' | 'failed'

export const PROCESSING_STATUS_LABELS: Record<ProcessingStatus, string> = {
  ready: 'Sẵn sàng',
  processing: 'Đang xử lý',
  failed: 'Lỗi',
}

// Agreement level for modality disagreement
export type AgreementLevel = 'high' | 'partial' | 'conflict'

export const AGREEMENT_LABELS: Record<AgreementLevel, string> = {
  high: 'Cao',
  partial: 'Một phần',
  conflict: 'Xung đột',
}

// Critical moment event types
export type CriticalMomentType =
  | 'escalation'
  | 'recovery'
  | 'sustained_negative'
  | 'modality_disagreement'
  | 'high_confidence_change'

export const CRITICAL_MOMENT_LABELS: Record<CriticalMomentType, string> = {
  escalation: 'Leo thang',
  recovery: 'Hồi phục',
  sustained_negative: 'Kéo dài tiêu cực',
  modality_disagreement: 'Bất đồng âm/thanh',
  high_confidence_change: 'Thay đổi cao',
}

// Emotion prediction with modality breakdown
export interface EmotionPrediction {
  emotion: EmotionType
  confidence: number
}

export interface ModalityPrediction {
  acoustic: EmotionPrediction
  lexical: EmotionPrediction
  fused: EmotionPrediction
  agreement: AgreementLevel
}

export interface Utterance {
  id: string
  speaker: 'agent' | 'customer'
  text: string
  startTime: number
  endTime: number
  modalityPrediction: ModalityPrediction
}

// Critical moment
export interface CriticalMoment {
  id: string
  type: CriticalMomentType
  timestamp: number
  endTimestamp?: number
  primaryEmotion?: EmotionType
  secondaryEmotion?: EmotionType
  description: string
  utteranceIds: string[]
  isRelevant: boolean | null
  reviewerNote?: string
}

// Agent
export interface Agent {
  id: string
  name: string
  avatar: string
}

// Customer
export interface Customer {
  id: string
  name: string
  phone: string
  segment: string
}

// Call summary stats
export interface CallSummary {
  dominantEmotion: EmotionType
  negativeEmotionRatio: number
  escalationCount: number
  recoveryCount: number
  criticalMomentCount: number
  modalityDisagreementCount: number
  avgConfidence: number
}

// Call - main data structure
export interface Call {
  id: string
  agent: Agent
  customer: Customer
  startTime: Date
  duration: number
  utterances: Utterance[]
  criticalMoments: CriticalMoment[]
  summary: CallSummary
  reviewPriority: ReviewPriority
  reviewStatus: ReviewStatus
  processingStatus: ProcessingStatus
}

// Reviewer action for an utterance
export interface UtteranceReview {
  utteranceId: string
  confirmedEmotion?: EmotionType
  isEmotionCorrect: boolean | null
  reviewerNote?: string
}

// Call review state
export interface CallReview {
  callId: string
  utteranceReviews: Map<string, UtteranceReview>
  criticalMomentReviews: Map<string, { isRelevant: boolean | null; note?: string }>
  callReviewed: boolean
  overallNote?: string
}

// Analytics types
export interface AnalyticsStats {
  totalCalls: number
  callsNeedingReview: number
  criticalMomentsTotal: number
  modalityDisagreementRate: number
}

export interface EmotionDistribution {
  neutral: number
  happy: number
  sad: number
  angry: number
}

export interface PriorityDistribution {
  low: number
  medium: number
  high: number
}

export interface ConfidenceDistribution {
  high: number  // > 80%
  medium: number // 50-80%
  low: number    // < 50%
}

export interface CriticalMomentTypeDistribution {
  escalation: number
  recovery: number
  sustained_negative: number
  modality_disagreement: number
  high_confidence_change: number
}

// Filter options for calls list
export interface CallsFilter {
  search: string
  agentId: string | null
  priority: ReviewPriority | null
  reviewStatus: ReviewStatus | null
  processingStatus: ProcessingStatus | null
  dateRange: { start: Date | null; end: Date | null }
}
