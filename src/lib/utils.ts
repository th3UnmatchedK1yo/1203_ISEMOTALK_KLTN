import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { EmotionType, AgreementLevel, ReviewPriority, ReviewStatus, ProcessingStatus, CriticalMomentType } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatDateTimeFull(date: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

// Emotion utilities
export function getEmotionColor(emotion: EmotionType): string {
  const colors: Record<EmotionType, string> = {
    neutral: 'bg-slate-100 text-slate-700',
    happy: 'bg-emerald-100 text-emerald-700',
    sad: 'bg-blue-100 text-blue-700',
    angry: 'bg-red-100 text-red-700',
  }
  return colors[emotion]
}

export function getEmotionBorderColor(emotion: EmotionType): string {
  const colors: Record<EmotionType, string> = {
    neutral: 'border-slate-300',
    happy: 'border-emerald-400',
    sad: 'border-blue-400',
    angry: 'border-red-400',
  }
  return colors[emotion]
}

export function getEmotionTextColor(emotion: EmotionType): string {
  const colors: Record<EmotionType, string> = {
    neutral: 'text-slate-600',
    happy: 'text-emerald-600',
    sad: 'text-blue-600',
    angry: 'text-red-600',
  }
  return colors[emotion]
}

// Priority utilities
export function getPriorityColor(priority: ReviewPriority): string {
  const colors: Record<ReviewPriority, string> = {
    low: 'bg-blue-100 text-blue-700 border-blue-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    high: 'bg-red-100 text-red-700 border-red-200',
  }
  return colors[priority]
}

// Review status utilities
export function getReviewStatusColor(status: ReviewStatus): string {
  const colors: Record<ReviewStatus, string> = {
    unreviewed: 'bg-slate-100 text-slate-600',
    needs_review: 'bg-amber-100 text-amber-700',
    reviewed: 'bg-green-100 text-green-700',
  }
  return colors[status]
}

// Processing status utilities
export function getProcessingStatusColor(status: ProcessingStatus): string {
  const colors: Record<ProcessingStatus, string> = {
    ready: 'bg-green-100 text-green-700',
    processing: 'bg-blue-100 text-blue-700',
    failed: 'bg-red-100 text-red-700',
  }
  return colors[status]
}

// Agreement level utilities
export function getAgreementColor(agreement: AgreementLevel): string {
  const colors: Record<AgreementLevel, string> = {
    high: 'text-emerald-600 bg-emerald-50',
    partial: 'text-amber-600 bg-amber-50',
    conflict: 'text-red-600 bg-red-50',
  }
  return colors[agreement]
}

export function getAgreementLabel(agreement: AgreementLevel): string {
  const labels: Record<AgreementLevel, string> = {
    high: 'Đồng thuận cao',
    partial: 'Đồng thuận một phần',
    conflict: 'Xung đột',
  }
  return labels[agreement]
}

// Critical moment type utilities
export function getCriticalMomentColor(type: CriticalMomentType): string {
  const colors: Record<CriticalMomentType, string> = {
    escalation: 'bg-red-100 text-red-700 border-red-300',
    recovery: 'bg-green-100 text-green-700 border-green-300',
    sustained_negative: 'bg-orange-100 text-orange-700 border-orange-300',
    modality_disagreement: 'bg-purple-100 text-purple-700 border-purple-300',
    high_confidence_change: 'bg-blue-100 text-blue-700 border-blue-300',
  }
  return colors[type]
}

export function getCriticalMomentLabel(type: CriticalMomentType): string {
  const labels: Record<CriticalMomentType, string> = {
    escalation: 'Leo thang',
    recovery: 'Hồi phục',
    sustained_negative: 'Tiêu cực kéo dài',
    modality_disagreement: 'Bất đồng âm/thanh',
    high_confidence_change: 'Thay đổi cao',
  }
  return labels[type]
}

// Confidence utilities
export function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 80) return 'high'
  if (confidence >= 50) return 'medium'
  return 'low'
}

export function getConfidenceColor(confidence: number): string {
  const level = getConfidenceLevel(confidence)
  const colors = {
    high: 'text-emerald-600',
    medium: 'text-amber-600',
    low: 'text-red-600',
  }
  return colors[level]
}

// Emotion icon
export function getEmotionIcon(emotion: EmotionType): string {
  const icons: Record<EmotionType, string> = {
    neutral: '○',
    happy: '◉',
    sad: '◠',
    angry: '◉',
  }
  return icons[emotion]
}
