'use client'

import { useCallback, useRef } from 'react'

import { cn, formatClock } from '@/lib/utils'

export interface TaskTab {
  taskNumber: number
  label: string
  words: number
  min: number
}

/**
 * Task 1 and Task 2 are one sitting on one clock, so they are tabs rather than pages —
 * switching must never feel like leaving the exam.
 */
export function TaskTabs({
  tabs,
  active,
  onSelect,
  className,
}: {
  tabs: TaskTab[]
  active: number
  onSelect: (taskNumber: number) => void
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      e.preventDefault()
      const index = tabs.findIndex((t) => t.taskNumber === active)
      const next = e.key === 'ArrowRight' ? index + 1 : index - 1
      const target = tabs[(next + tabs.length) % tabs.length]
      if (!target) return
      onSelect(target.taskNumber)
      ref.current
        ?.querySelector<HTMLButtonElement>(`[data-task="${target.taskNumber}"]`)
        ?.focus()
    },
    [active, onSelect, tabs],
  )

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label="Writing tasks"
      onKeyDown={onKeyDown}
      className={cn('flex items-stretch gap-1 border-b border-border bg-surface px-2', className)}
    >
      {tabs.map((tab) => {
        const selected = tab.taskNumber === active
        const reached = tab.words >= tab.min
        return (
          <button
            key={tab.taskNumber}
            type="button"
            role="tab"
            data-task={tab.taskNumber}
            id={`task-tab-${tab.taskNumber}`}
            aria-selected={selected}
            aria-controls={`task-panel-${tab.taskNumber}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab.taskNumber)}
            className={cn(
              'relative -mb-px flex min-w-0 flex-1 items-center justify-center gap-2 rounded-t-lg px-3 py-2.5 text-sm font-medium transition-colors sm:flex-none sm:px-5',
              selected
                ? 'border-x border-t border-border bg-exam-paper text-fg'
                : 'text-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            <span className="truncate">{tab.label}</span>
            <span
              aria-hidden
              className={cn(
                'h-1.5 w-1.5 shrink-0 rounded-full',
                tab.words === 0 ? 'bg-border' : reached ? 'bg-success' : 'bg-warning',
              )}
            />
            <span className="sr-only">
              {tab.words} words, {reached ? 'minimum reached' : `minimum ${tab.min} not reached`}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Suggested split for the 60-minute paper: a third on Task 1, two thirds on Task 2. */
export function suggestedSplit(totalSeconds: number): { task1: number; task2: number } {
  const task1 = Math.round(totalSeconds / 3)
  return { task1, task2: totalSeconds - task1 }
}

/**
 * Guidance, never a rule. The real test lets you spend all 60 minutes on Task 1 and fail —
 * we say so once, quietly, instead of locking the tab.
 */
export function TimingGuidance({
  totalSeconds,
  secondsRemaining,
  activeTask,
}: {
  totalSeconds: number
  secondsRemaining: number
  activeTask: number
}) {
  const { task1, task2 } = suggestedSplit(totalSeconds)
  const elapsed = Math.max(0, totalSeconds - secondsRemaining)
  const overrunTask1 = elapsed > task1
  const pct = totalSeconds > 0 ? Math.min(100, (elapsed / totalSeconds) * 100) : 0
  const splitPct = totalSeconds > 0 ? (task1 / totalSeconds) * 100 : 33

  const message =
    activeTask === 1
      ? overrunTask1
        ? 'Past the suggested Task 1 time. Task 2 carries twice the marks — it is worth moving on.'
        : `Suggested: start Task 2 in ${formatClock(task1 - elapsed)}.`
      : `Suggested for Task 2: ${Math.round(task2 / 60)} minutes. ${formatClock(secondsRemaining)} left on the clock.`

  return (
    <div className="border-b border-border bg-surface px-4 py-2">
      <div className="flex items-center gap-3">
        <p
          className={cn(
            'min-w-0 flex-1 truncate text-xs',
            overrunTask1 && activeTask === 1 ? 'text-warning' : 'text-muted',
          )}
        >
          {message}
        </p>
        <p className="shrink-0 text-xs text-muted">
          <span className="hidden sm:inline">Suggested split </span>
          {Math.round(task1 / 60)}/{Math.round(task2 / 60)} min
        </p>
      </div>
      <div className="relative mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
        <span
          aria-hidden
          className="absolute top-0 h-full w-px bg-accent"
          style={{ left: `${splitPct}%` }}
        />
      </div>
    </div>
  )
}
