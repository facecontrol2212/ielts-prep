'use client'

import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { Button } from '@/components/ui'
import { BandPanel, bandDescriptor } from '@/components/writing/band-panel'
import { CorrectedText } from '@/components/writing/corrected-text'
import {
  ImprovedParagraph,
  ScoreCapFlags,
  StrengthsAndImprovements,
} from '@/components/writing/feedback-sections'
import { findOriginalParagraph } from '@/components/writing/paragraph-match'
import { minimumWords } from '@/components/writing/word-count'
import { cn } from '@/lib/utils'
import type { WritingSubmission } from '@/types/api'

/** IELTS weights Task 2 twice as heavily as Task 1, then rounds to the nearest half band. */
export function combinedWritingBand(submissions: readonly WritingSubmission[]): number | null {
  const t1 = submissions.find((s) => s.task_number === 1)?.band_overall ?? null
  const t2 = submissions.find((s) => s.task_number === 2)?.band_overall ?? null
  if (t1 == null && t2 == null) return null
  if (t1 == null) return t2
  if (t2 == null) return t1
  return Math.round(((t1 + 2 * t2) / 3) * 2) / 2
}

export function WritingFeedbackView({
  testTitle,
  submissions,
  onRetryGrade,
  retrying,
}: {
  testTitle: string
  submissions: WritingSubmission[]
  onRetryGrade?: () => void
  retrying?: boolean
}) {
  const ordered = [...submissions].sort((a, b) => a.task_number - b.task_number)
  const [activeTask, setActiveTask] = useState(ordered[0]?.task_number ?? 1)
  const active = ordered.find((s) => s.task_number === activeTask) ?? ordered[0]
  const combined = combinedWritingBand(ordered)

  if (!active) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <p className="text-sm text-muted">There is nothing to show for this attempt.</p>
      </main>
    )
  }

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-fg"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Dashboard
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fg">{testTitle}</p>
            <p className="text-xs text-muted">
              Examiner&rsquo;s report · marked against the public IELTS band descriptors
            </p>
          </div>
          {combined != null && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-muted">Writing band</p>
              <p className="text-2xl font-semibold tabular-nums text-fg">{combined.toFixed(1)}</p>
              <p className="text-xs text-muted">{bandDescriptor(combined)}</p>
            </div>
          )}
        </div>

        {ordered.length > 1 && (
          <div
            role="tablist"
            aria-label="Marked tasks"
            className="mx-auto flex max-w-5xl gap-1 px-4"
          >
            {ordered.map((submission) => {
              const selected = submission.task_number === activeTask
              return (
                <button
                  key={submission.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTask(submission.task_number)}
                  className={cn(
                    '-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                    selected
                      ? 'border-b-primary text-fg'
                      : 'border-b-transparent text-muted hover:text-fg',
                  )}
                >
                  Task {submission.task_number}
                  {submission.band_overall != null && (
                    <span className="ml-2 tabular-nums text-muted">
                      {submission.band_overall.toFixed(1)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <TaskReport submission={active} onRetryGrade={onRetryGrade} retrying={retrying} />
      </main>
    </div>
  )
}

function TaskReport({
  submission,
  onRetryGrade,
  retrying,
}: {
  submission: WritingSubmission
  onRetryGrade?: () => void
  retrying?: boolean
}) {
  const feedback = submission.feedback
  const min = minimumWords(submission.task_number)

  if (!feedback) {
    return (
      <>
        <div
          role="alert"
          className="flex flex-wrap items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">
              Task {submission.task_number} was not marked
            </p>
            <p className="mt-1 text-sm text-muted">
              {submission.grading_error
                ? `The marker reported: ${submission.grading_error}`
                : 'The marker did not return a result for this task.'}{' '}
              Your answer is saved in full and is shown below — nothing has been lost.
            </p>
          </div>
          {onRetryGrade && (
            <Button variant="outline" size="sm" onClick={onRetryGrade} loading={retrying}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Try marking again
            </Button>
          )}
        </div>
        <YourAnswer submission={submission} />
      </>
    )
  }

  return (
    <>
      <ScoreCapFlags feedback={feedback} wordCount={submission.word_count} minWords={min} />
      <BandPanel feedback={feedback} taskNumber={submission.task_number} />
      <StrengthsAndImprovements feedback={feedback} />
      <CorrectedText text={submission.text} corrections={feedback.corrections} />
      <ImprovedParagraph
        original={findOriginalParagraph(submission.text, feedback.improved_paragraph)}
        improved={feedback.improved_paragraph}
      />
      <p className="pb-4 text-xs text-muted">
        Marked by AI against the public band descriptors. It is a close guide, not an official
        result — a human examiner can differ by half a band.
      </p>
    </>
  )
}

/** Fallback view when there is no report: the essay itself, never hidden behind an error. */
export function YourAnswer({ submission }: { submission: WritingSubmission }) {
  return (
    <section className="rounded-2xl border border-border bg-surface shadow-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold tracking-tight">
          Your answer · Task {submission.task_number}
        </h2>
        <p className="text-sm text-muted">{submission.word_count} words</p>
      </div>
      <p className="whitespace-pre-wrap px-5 py-5 font-serif text-passage text-fg">
        {submission.text}
      </p>
    </section>
  )
}
