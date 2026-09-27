'use client'

import { useId } from 'react'

import { focusQuestion, stepQuestion } from '@/components/exam/questions/navigation'
import { useTextAnswer } from '@/components/exam/questions/use-answer'
import { wordLimitWarning } from '@/components/exam/questions/word-limit'
import { useExamStore } from '@/lib/exam-store'
import { cn } from '@/lib/utils'

export interface AnswerInputProps {
  questionId: string
  number: number
  wordLimit: number | null
  allowNumber: boolean
  /** `inline` sits in the middle of a sentence; `block` is a field on its own row. */
  variant?: 'inline' | 'block'
  className?: string
  disabled?: boolean
}

/**
 * The one text field every completion / short-answer question uses.
 *
 * It never blocks an over-long answer — IELTS accepts the typing and marks it wrong,
 * so the student sees the same warning here that costs them the mark on exam day.
 */
export function AnswerInput({
  questionId,
  number,
  wordLimit,
  allowNumber,
  variant = 'block',
  className,
  disabled,
}: AnswerInputProps) {
  const [value, setValue] = useTextAnswer(questionId)
  const goToQuestion = useExamStore((s) => s.goToQuestion)
  const current = useExamStore((s) => s.currentQuestion)
  const warning = wordLimitWarning(value, wordLimit, allowNumber)
  const warningId = useId()

  return (
    <span className={cn('inline-flex flex-col align-baseline', className)}>
      <span className="inline-flex items-baseline gap-1.5">
        <span
          aria-hidden
          className={cn(
            'inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded px-1 text-[11px] font-bold tabular-nums',
            current === number
              ? 'bg-exam-current text-white'
              : 'bg-surface-2 text-muted',
          )}
        >
          {number}
        </span>
        <input
          type="text"
          id={`answer-${number}`}
          data-question-focus={number}
          value={value}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={`Question ${number} answer`}
          aria-invalid={warning ? true : undefined}
          aria-describedby={warning ? warningId : undefined}
          onFocus={() => goToQuestion(number)}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            const next = stepQuestion(useExamStore.getState().session, number, 1)
            if (next === number) return
            goToQuestion(next)
            focusQuestion(next)
          }}
          className={cn(
            'h-9 rounded-md border bg-surface px-2 text-sm text-fg',
            'focus:border-primary',
            warning ? 'border-warning' : 'border-border',
            variant === 'inline' ? 'w-40 max-w-[55vw]' : 'w-full max-w-sm',
          )}
        />
      </span>
      {warning && (
        <span
          id={warningId}
          role="status"
          className="mt-1 text-xs font-medium text-warning"
        >
          {warning}
        </span>
      )}
    </span>
  )
}
