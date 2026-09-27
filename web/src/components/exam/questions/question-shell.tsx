'use client'

import { Flag } from 'lucide-react'

import { useExamStore } from '@/lib/exam-store'
import { cn } from '@/lib/utils'

/**
 * One numbered row. The number gutter, the flag and the current-question rule are
 * identical for every block question type, so they live here and nowhere else.
 */
export function QuestionShell({
  number,
  prompt,
  children,
  className,
}: {
  number: number
  prompt?: string | null
  children: React.ReactNode
  className?: string
}) {
  const current = useExamStore((s) => s.currentQuestion)
  const isCurrent = current === number

  return (
    <div
      data-question={number}
      className={cn(
        'flex gap-3 border-l-2 py-3 pl-3 transition-colors',
        isCurrent ? 'border-exam-current bg-surface-2/60' : 'border-transparent',
        className,
      )}
    >
      <QuestionNumber number={number} />
      <div className="min-w-0 flex-1 space-y-2">
        {prompt && <p className="text-sm leading-relaxed text-fg">{prompt}</p>}
        {children}
      </div>
      <FlagToggle number={number} />
    </div>
  )
}

export function QuestionNumber({ number }: { number: number }) {
  const goToQuestion = useExamStore((s) => s.goToQuestion)
  return (
    <button
      type="button"
      onClick={() => goToQuestion(number)}
      aria-label={`Go to question ${number}`}
      className="h-6 w-6 shrink-0 rounded bg-surface-2 text-xs font-bold tabular-nums text-fg"
    >
      {number}
    </button>
  )
}

export function FlagToggle({ number }: { number: number }) {
  const session = useExamStore((s) => s.session)
  const toggleFlag = useExamStore((s) => s.toggleFlag)
  const questionId = useExamStore(
    (s) =>
      s.session?.test.sections
        .flatMap((sec) => sec.groups)
        .flatMap((g) => g.questions)
        .find((q) => q.number === number)?.id ?? null,
  )
  const flagged = useExamStore((s) => (questionId ? Boolean(s.flags[questionId]) : false))
  if (!session || !questionId) return null

  return (
    <button
      type="button"
      onClick={() => toggleFlag(questionId)}
      aria-pressed={flagged}
      aria-label={`Flag question ${number} for review`}
      title="Flag for review (f)"
      className={cn(
        'h-7 w-7 shrink-0 self-start rounded-md border transition-colors',
        flagged
          ? 'border-exam-flagged bg-exam-flagged/15 text-exam-flagged'
          : 'border-transparent text-muted hover:border-border',
      )}
    >
      <Flag className={cn('mx-auto h-3.5 w-3.5', flagged && 'fill-current')} aria-hidden />
    </button>
  )
}
