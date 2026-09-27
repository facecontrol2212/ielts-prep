'use client'

import { useId } from 'react'

import { UnderLengthWarning, WordCount } from '@/components/writing/word-count'
import { cn, countWords } from '@/lib/utils'

/**
 * A plain textarea, deliberately.
 *
 * The computer-delivered IELTS gives you no bold, no bullets and no spell-checker. Practising in
 * a rich editor teaches habits the real test punishes, so the only affordances here are the ones
 * the real client has: a word count and a cut/copy/paste-capable text box.
 */
export function EssayEditor({
  taskNumber,
  value,
  min,
  onChange,
  onBlur,
  disabled,
  className,
}: {
  taskNumber: number
  value: string
  min: number
  onChange: (text: string) => void
  onBlur?: () => void
  disabled?: boolean
  className?: string
}) {
  const id = useId()
  const count = countWords(value)

  return (
    <section
      aria-label={`Your answer for Task ${taskNumber}`}
      className={cn('flex min-h-0 flex-col bg-exam-paper', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <label htmlFor={id} className="text-sm font-semibold tracking-tight">
          Your answer · Task {taskNumber}
        </label>
        <WordCount count={count} min={min} />
      </div>

      <div className="min-h-0 flex-1 px-4 pt-3">
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="sentences"
          placeholder={`Write your Task ${taskNumber} answer here.`}
          aria-describedby={`${id}-help`}
          className={cn(
            'h-full min-h-[14rem] w-full resize-none rounded-lg border border-border bg-surface',
            'px-3 py-3 font-serif text-passage leading-relaxed text-fg',
            'placeholder:font-sans placeholder:text-sm placeholder:text-muted',
            'disabled:opacity-60',
          )}
        />
      </div>

      <div className="space-y-2 px-4 pb-3 pt-2">
        <UnderLengthWarning count={count} min={min} taskNumber={taskNumber} />
        <p id={`${id}-help`} className="text-xs text-muted">
          No spell-checker and no formatting — the real test has neither. Your draft saves
          automatically.
        </p>
      </div>
    </section>
  )
}
