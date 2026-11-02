import type { EmotionType } from '@/types'

export function getEmotionColor(emotion: EmotionType): string {
  const colors: Record<EmotionType, string> = {
    neutral: 'bg-slate-100 text-slate-700',
    happy: 'bg-emerald-100 text-emerald-700',
    sad: 'bg-blue-100 text-blue-700',
    angry: 'bg-red-100 text-red-700',
  }
  return colors[emotion]
}

export function getEmotionIcon(emotion: EmotionType): string {
  const icons: Record<EmotionType, string> = {
    neutral: '○',
    happy: '◉',
    sad: '◠',
    angry: '◉',
  }
  return icons[emotion]
}
