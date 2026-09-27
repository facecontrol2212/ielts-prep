'use client'

import { AlertTriangle } from 'lucide-react'

import { cn } from '@/lib/utils'

export type WordCountTone = 'muted' | 'danger' | 'warning' | 'success'

/** IELTS minimums. Below them the examiner applies a penalty, whatever the essay says. */
export const TASK_MINIMUM_WORDS: Record<number, number> = { 1: 150, 2: 250 }

export function minimumWords(taskNumber: number, override?: number | null): number {
  return override ?? TASK_MINIMUM_WORDS[taskNumber] ?? 250
}

/**
 * Nothing written yet → neutral. Comfortably short → red. Closing in on the minimum (within
 * the last 10%) → amber. At or over the minimum → green, and it stays green: there is no upper
 * limit in IELTS, only a time cost.
 */
export function wordCountTone(count: number, min: number): WordCountTone {
  if (count === 0) return 'muted'
  if (count >= min) return 'success'
  if (count >= Math.floor(min * 0.9)) return 'warning'
  return 'danger'
}

const toneText: Record<WordCountTone, string> = {
  muted: 'text-muted',
  danger: 'text-danger',
  warning: 'text-warning',
  success: 'text-success',
}

export function WordCount({
  count,
  min,
  className,
}: {
  count: number
  min: number
  className?: string
}) {
  const tone = wordCountTone(count, min)
  const short = Math.max(0, min - count)
  return (
    <p
      className={cn('flex items-baseline gap-1.5 text-sm tabular-nums', className)}
      data-tone={tone}
      data-testid="word-count"
    >
      <span className={cn('text-base font-semibold', toneText[tone])}>{count}</span>
      <span className="text-muted">
        {count === 1 ? 'word' : 'words'} · minimum {min}
      </span>
      <span className="sr-only">
        {short > 0 ? `${short} words below the minimum` : 'minimum reached'}
      </span>
    </p>
  )
}

export function UnderLengthWarning({
  count,
  min,
  taskNumber,
}: {
  count: number
  min: number
  taskNumber: number
}) {
  if (count === 0 || count >= min) return null
  const short = min - count
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-fg"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
      <span>
        <strong className="font-semibold">{short} words short.</strong> Task {taskNumber} must reach{' '}
        {min} words — under that the examiner applies a length penalty before reading for quality.
      </span>
    </p>
  )
}
