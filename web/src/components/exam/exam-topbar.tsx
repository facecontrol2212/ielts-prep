'use client'

import { Clock, Eye, EyeOff, Menu, Type, WifiOff } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui'
import { cn, formatClock } from '@/lib/utils'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * The exam status bar, modelled on the computer-delivered IELTS client:
 * identity on the left, the clock dead centre, tools on the right.
 * Under five minutes the clock turns red and pulses — the real test warns you too.
 */
export function ExamTopbar({
  title,
  secondsRemaining,
  saveState,
  onOpenPalette,
  onTextSizeChange,
  textSize,
}: {
  title: string
  secondsRemaining: number
  saveState: SaveState
  onOpenPalette?: () => void
  onTextSizeChange?: (size: 'normal' | 'large' | 'xlarge') => void
  textSize?: 'normal' | 'large' | 'xlarge'
}) {
  const [clockHidden, setClockHidden] = useState(false)
  const urgent = secondsRemaining <= 300
  const critical = secondsRemaining <= 60

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-exam-bar text-white">
      <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open question navigator"
          onClick={onOpenPalette}
          className="text-white hover:bg-white/10 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white/80">{title}</p>

        <div
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-1.5 tabular-nums transition-colors',
            urgent ? 'bg-danger text-white' : 'bg-white/10 text-white',
            critical && 'animate-pulse-ring',
          )}
          role="timer"
          aria-live={urgent ? 'assertive' : 'off'}
          aria-label={`${Math.floor(secondsRemaining / 60)} minutes remaining`}
        >
          <Clock className="h-4 w-4" aria-hidden />
          <span className="font-mono text-base font-semibold">
            {clockHidden ? '--:--' : formatClock(secondsRemaining)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={clockHidden ? 'Show the timer' : 'Hide the timer'}
            aria-pressed={clockHidden}
            onClick={() => setClockHidden((v) => !v)}
            className="text-white hover:bg-white/10"
          >
            {clockHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Change text size"
            onClick={() =>
              onTextSizeChange?.(
                textSize === 'normal' ? 'large' : textSize === 'large' ? 'xlarge' : 'normal',
              )
            }
            className="text-white hover:bg-white/10"
          >
            <Type className="h-4 w-4" />
          </Button>

          <SaveIndicator state={saveState} />
        </div>
      </div>
    </header>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'error') {
    return (
      <span
        role="status"
        className="flex items-center gap-1.5 rounded-md bg-danger px-2 py-1 text-xs font-medium"
      >
        <WifiOff className="h-3.5 w-3.5" aria-hidden />
        Not saved
      </span>
    )
  }
  return (
    <span role="status" className="hidden px-2 text-xs text-white/60 sm:inline">
      {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}
    </span>
  )
}
