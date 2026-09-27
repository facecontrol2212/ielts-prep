'use client'

import { useMemo } from 'react'

import { FlagToggle } from '@/components/exam/questions/question-shell'
import { useGroupAnswer, useListAnswer } from '@/components/exam/questions/use-answer'
import { useExamStore } from '@/lib/exam-store'
import { cn } from '@/lib/utils'
import type { QuestionGroup } from '@/types/api'

/**
 * Multiple choice, several answers (“Choose TWO letters, A–E”).
 *
 * One IELTS item of this kind covers two or three question numbers that share a single
 * option list, so the control is shared too and the same set of letters is written to
 * every question id in the group — which is what set-comparison scoring expects.
 *
 * Over-selection is blocked rather than warned: the paper test gives you N boxes and no
 * way to tick an N+1st, and silently discarding a later tick would be worse.
 */
export function MultipleChoiceMulti({ group }: { group: QuestionGroup }) {
  const first = group.questions[0]
  const [selected] = useListAnswer(first?.id ?? '')
  const questionIds = useMemo(() => group.questions.map((q) => q.id), [group.questions])
  const writeAll = useGroupAnswer(questionIds)
  const goToQuestion = useExamStore((s) => s.goToQuestion)
  const current = useExamStore((s) => s.currentQuestion)

  if (!first) return null

  const limit = group.select_count ?? group.questions.length
  const numbers = group.questions.map((q) => q.number)
  const atLimit = selected.length >= limit
  const isCurrent = numbers.includes(current)
  const options = group.options ?? first.options ?? []

  const toggle = (label: string) => {
    const next = selected.includes(label)
      ? selected.filter((l) => l !== label)
      : selected.length >= limit
        ? selected
        : [...selected, label]
    if (next === selected) return
    // Keep every covered question number in step so the palette marks them all.
    writeAll(next.length ? next : null)
    goToQuestion(numbers[0])
  }

  const range = numbers.length > 1 ? `${numbers[0]}–${numbers[numbers.length - 1]}` : `${numbers[0]}`

  return (
    <div
      data-question={numbers[0]}
      className={cn(
        'border-l-2 py-3 pl-3',
        isCurrent ? 'border-exam-current bg-surface-2/60' : 'border-transparent',
      )}
    >
      {numbers.slice(1).map((n) => (
        <span key={n} data-question={n} />
      ))}
      <fieldset>
        <legend className="mb-2 flex w-full items-start gap-3">
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-bold tabular-nums text-fg">
            {range}
          </span>
          <span className="min-w-0 flex-1 text-sm leading-relaxed text-fg">{first.prompt}</span>
          <FlagToggle number={numbers[0]} />
        </legend>

        <p
          role="status"
          aria-live="polite"
          className={cn(
            'mb-2 text-xs font-medium',
            atLimit ? 'text-success' : 'text-muted',
          )}
        >
          Choose {limit} · {selected.length} of {limit} selected
          {atLimit && ' — clear one to change your mind'}
        </p>

        <div className="space-y-1">
          {options.map((option, index) => {
            const checked = selected.includes(option.label)
            const blocked = !checked && atLimit
            const id = `q${numbers[0]}-multi-${option.label}`
            return (
              <label
                key={option.label}
                htmlFor={id}
                className={cn(
                  'flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors',
                  checked
                    ? 'border-primary bg-primary-soft/60'
                    : 'border-transparent hover:bg-surface-2',
                  blocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                )}
              >
                <input
                  type="checkbox"
                  id={id}
                  checked={checked}
                  disabled={blocked}
                  data-question-focus={index === 0 ? numbers[0] : undefined}
                  aria-label={`Questions ${range}, option ${option.label}: ${option.text}`}
                  onChange={() => toggle(option.label)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--primary))]"
                />
                <span className="font-semibold tabular-nums text-muted">{option.label}</span>
                <span className="min-w-0 flex-1 text-fg">{option.text}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
    </div>
  )
}
