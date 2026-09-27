'use client'

import { cn } from '@/lib/utils'
import type { SpeakingQuestion } from '@/types/api'

/**
 * The Part 2 task card, laid out like the card the examiner slides across the desk: the topic,
 * "You should say" and its bullets, then the closing instruction. Kept short on purpose — on a
 * phone it has to sit above the timer and record button without scrolling.
 */
export function CueCard({
  question,
  className,
}: {
  question: SpeakingQuestion
  className?: string
}) {
  const points = question.cue_points ?? []

  return (
    <article
      aria-label="Part 2 cue card"
      className={cn(
        'rounded-2xl border-2 border-fg/15 bg-exam-paper p-5 shadow-card',
        'font-serif text-[1.0625rem] leading-relaxed text-fg',
        className,
      )}
    >
      <p className="mb-3 font-sans text-xs font-semibold uppercase tracking-wider text-muted">
        Part 2 · long turn
      </p>
      <p className="font-semibold">{question.question}</p>

      {points.length > 0 && (
        <>
          <p className="mt-3">You should say:</p>
          <ul className="mt-1.5 space-y-1 pl-5">
            {points.map((point, i) => (
              <li key={i} className="list-disc">
                {point}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-4 border-t border-border pt-3 font-sans text-sm text-muted">
        You have one minute to prepare. You can make notes. Then speak for one to two minutes.
      </p>
    </article>
  )
}

export function QuestionCard({
  question,
  index,
  total,
  className,
}: {
  question: SpeakingQuestion
  index: number
  total: number
  className?: string
}) {
  const partLabel = question.part.replace('part_', 'Part ')
  return (
    <article
      aria-label="Speaking question"
      className={cn('rounded-2xl border border-border bg-surface p-5 shadow-card', className)}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          {partLabel} · {question.topic}
        </p>
        <p className="shrink-0 text-xs tabular-nums text-muted">
          {index + 1} of {total}
        </p>
      </div>
      <p className="mt-2 font-serif text-xl leading-snug text-fg">{question.question}</p>
      <p className="mt-3 text-sm text-muted">
        {question.part === 'part_1'
          ? 'Answer in two or three sentences — give a reason or an example, not just yes or no.'
          : 'This is a discussion question. Give an opinion, justify it, then consider the other side.'}
      </p>
    </article>
  )
}
