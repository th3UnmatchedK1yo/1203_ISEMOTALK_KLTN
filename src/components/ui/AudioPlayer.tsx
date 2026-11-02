import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/utils'
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import { Button } from './button'

interface AudioPlayerProps {
  duration: number
  currentTime: number
  onTimeChange: (time: number) => void
  className?: string
}

export function AudioPlayer({ 
  duration, 
  currentTime, 
  onTimeChange,
  className 
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        onTimeChange(currentTime + 0.1)
        if (currentTime >= duration) {
          setIsPlaying(false)
          onTimeChange(0)
        }
      }, 100)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPlaying, currentTime, duration, onTimeChange])

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    onTimeChange(time)
  }

  const handleSkipBack = () => {
    const newTime = Math.max(0, currentTime - 10)
    onTimeChange(newTime)
  }

  const handleSkipForward = () => {
    const newTime = Math.min(duration, currentTime + 10)
    onTimeChange(newTime)
  }

  const cyclePlaybackRate = () => {
    const rates = [0.75, 1, 1.25, 1.5, 2]
    const currentIndex = rates.indexOf(playbackRate)
    const nextIndex = (currentIndex + 1) % rates.length
    setPlaybackRate(rates[nextIndex])
  }

  const progress = (currentTime / duration) * 100

  return (
    <div className={cn('bg-slate-50 rounded-lg p-4 border', className)}>
      <div className="flex items-center gap-4">
        {/* Play/Pause */}
        <Button
          variant="outline"
          size="icon"
          onClick={handlePlayPause}
          className="h-10 w-10 rounded-full"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </Button>

        {/* Skip Back */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSkipBack}
          className="h-9 w-9"
        >
          <SkipBack className="h-4 w-4" />
          <span className="sr-only">-10s</span>
        </Button>

        {/* Skip Forward */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSkipForward}
          className="h-9 w-9"
        >
          <SkipForward className="h-4 w-4" />
          <span className="sr-only">+10s</span>
        </Button>

        {/* Time */}
        <div className="text-sm font-mono tabular-nums min-w-[80px]">
          <span>{formatTime(Math.floor(currentTime))}</span>
          <span className="text-slate-400 mx-1">/</span>
          <span className="text-slate-500">{formatTime(Math.floor(duration))}</span>
        </div>

        {/* Progress bar */}
        <div className="flex-1 relative">
          {/* Waveform placeholder */}
          <div className="h-8 bg-slate-100 rounded flex items-center overflow-hidden">
            {Array.from({ length: 100 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'w-0.5 mx-px bg-slate-300 transition-colors',
                  (i / 100) * 100 <= progress ? 'bg-primary' : ''
                )}
                style={{ height: `${20 + Math.sin(i * 0.5) * 15}%` }}
              />
            ))}
          </div>
          {/* Hidden seek input */}
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 w-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Playback speed */}
        <Button
          variant="ghost"
          size="sm"
          onClick={cyclePlaybackRate}
          className="min-w-[48px] text-xs font-mono"
        >
          {playbackRate}x
        </Button>

        {/* Volume */}
        <div className="flex items-center gap-1 text-slate-400">
          <Volume2 className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
}
