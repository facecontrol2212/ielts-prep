'use client'

import { Check, Flag, Quote, Volume2, X } from 'lucide-react'

import { answerText, formatTimestamp } from '@/components/dashboard/format'
import { ReasonNoteBox, reasonNoteFor } from '@/components/results/reason-note'
import { cn, humanizeType } from '@/lib/utils'
import type { QuestionReview } from '@/types/api'

/** Correct / wrong is carried by an icon and a word as well as a colour. */
function Verdict({ correct }: { correct: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        correct ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
      )}
    >
      {correct ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <X className="h-3.5 w-3.5" aria-hidden />
      )}
      {correct ? 'Correct' : 'Wrong'}
    </span>
  )
}

export function ReviewItem({ item, flagged }: { item: QuestionReview; flagged: boolean }) {
  const note = reasonNoteFor(item)
  const yours = answerText(item.your_answer)

  return (
    <li
      data-testid="review-item"
      data-correct={item.is_correct ? 'true' : 'false'}
      className="break-inside-avoid px-4 py-5 sm:px-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'grid h-7 min-w-7 shrink-0 place-items-center rounded-lg px-1.5 text-sm font-semibold tabular-nums',
            item.is_correct ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
          )}
        >
          {item.number}
        </span>
        <Verdict correct={item.is_correct} />
        <span className="text-xs text-muted">{humanizeType(item.type)}</span>
        {flagged && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
            <Flag className="h-3 w-3" aria-hidden />
            You flagged this
          </span>
        )}
        {item.audio_timestamp != null && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium tabular-nums text-muted">
            <Volume2 className="h-3 w-3" aria-hidden />
            {formatTimestamp(item.audio_timestamp)}
          </span>
        )}
      </div>

      <p className="mt-2.5 text-pretty text-sm font-medium sm:text-base">{item.prompt}</p>

      <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[9rem_1fr]">
        <dt className="text-muted">Your answer</dt>
        <dd
          className={cn(
            'font-medium',
            yours ? (item.is_correct ? 'text-success' : 'text-danger') : 'italic text-muted',
          )}
        >
          {yours || 'Left blank'}
        </dd>
        <dt className="text-muted">
          {item.correct_answers.length > 1 ? 'Accepted answers' : 'Correct answer'}
        </dt>
        <dd className="font-medium text-fg">
          {item.correct_answers.length ? item.correct_answers.join(' · ') : '—'}
        </dd>
      </dl>

      {note && (
        <div className="mt-3">
          <ReasonNoteBox note={note} />
        </div>
      )}

      {item.explanation && <p className="mt-3 text-sm text-muted">{item.explanation}</p>}

      {item.evidence && (
        <figure className="mt-3 border-l-2 border-accent/60 bg-surface-2/60 py-2 pl-3 pr-2">
          <Quote className="mb-1 h-3.5 w-3.5 text-muted" aria-hidden />
          <blockquote className="font-serif text-sm leading-relaxed text-fg">
            {item.evidence}
          </blockquote>
          <figcaption className="mt-1 text-xs text-muted">
            {item.audio_timestamp != null
              ? `From the transcript at ${formatTimestamp(item.audio_timestamp)}`
              : 'From the passage'}
          </figcaption>
        </figure>
      )}
    </li>
  )
}
