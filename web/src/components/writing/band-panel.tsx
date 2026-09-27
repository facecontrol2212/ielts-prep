'use client'

import { cn } from '@/lib/utils'
import type { WritingFeedback } from '@/types/api'

/** The public IELTS band descriptors, one word each. */
export function bandDescriptor(band: number): string {
  if (band >= 9) return 'Expert user'
  if (band >= 8) return 'Very good user'
  if (band >= 7) return 'Good user'
  if (band >= 6) return 'Competent user'
  if (band >= 5) return 'Modest user'
  if (band >= 4) return 'Limited user'
  if (band >= 3) return 'Extremely limited'
  if (band >= 2) return 'Intermittent user'
  return 'Non-user'
}

export interface CriterionRow {
  key: string
  label: string
  band: number
  hint: string
}

/** Task 1 is marked on Task Achievement; Task 2 on Task Response. Same slot, different name. */
export function criterionRows(feedback: WritingFeedback, taskNumber: number): CriterionRow[] {
  return [
    {
      key: 'task',
      label: taskNumber === 1 ? 'Task Achievement' : 'Task Response',
      band: feedback.band_task,
      hint:
        taskNumber === 1
          ? 'Did you cover the key features and make the right comparisons?'
          : 'Did you answer every part of the question with developed ideas?',
    },
    {
      key: 'coherence',
      label: 'Coherence and Cohesion',
      band: feedback.band_coherence,
      hint: 'Paragraphing, progression and linking.',
    },
    {
      key: 'lexical',
      label: 'Lexical Resource',
      band: feedback.band_lexical,
      hint: 'Range, precision and collocation of your vocabulary.',
    },
    {
      key: 'grammar',
      label: 'Grammatical Range and Accuracy',
      band: feedback.band_grammar,
      hint: 'Sentence variety and error density.',
    },
  ]
}

const SCALE_MAX = 9

/**
 * The credibility surface. A student reads three things here, in this order: the overall band,
 * which criterion is dragging it down, and by how much. So the weakest row is called out by
 * name and colour, not left to be inferred from four similar bars.
 */
export function BandPanel({
  feedback,
  taskNumber,
}: {
  feedback: WritingFeedback
  taskNumber: number
}) {
  const rows = criterionRows(feedback, taskNumber)
  const lowest = Math.min(...rows.map((r) => r.band))

  return (
    <section
      aria-labelledby="band-panel-title"
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
    >
      <h2 id="band-panel-title" className="sr-only">
        Band scores for Task {taskNumber}
      </h2>

      <div className="grid gap-px bg-border sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        <div className="flex flex-col justify-center gap-1 bg-surface px-5 py-6 text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Overall band</p>
          <p
            className="font-serif text-6xl font-semibold leading-none tabular-nums text-fg"
            data-testid="overall-band"
          >
            {feedback.band_overall.toFixed(1)}
          </p>
          <p className="text-sm text-muted">{bandDescriptor(feedback.band_overall)}</p>
        </div>

        <ul className="divide-y divide-border bg-surface">
          {rows.map((row) => {
            const weakest = row.band === lowest
            return (
              <li key={row.key} className="px-5 py-3">
                <div className="flex items-baseline gap-2">
                  <p className="min-w-0 flex-1 text-sm font-medium text-fg">
                    {row.label}
                    {weakest && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-danger/10 px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-danger">
                        Weakest
                      </span>
                    )}
                  </p>
                  <p
                    className={cn(
                      'shrink-0 text-lg font-semibold tabular-nums',
                      weakest ? 'text-danger' : 'text-fg',
                    )}
                    data-testid={`band-${row.key}`}
                  >
                    {row.band.toFixed(1)}
                  </p>
                </div>

                <div
                  role="meter"
                  aria-valuenow={row.band}
                  aria-valuemin={0}
                  aria-valuemax={SCALE_MAX}
                  aria-label={`${row.label}: band ${row.band.toFixed(1)} of 9`}
                  className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
                >
                  <div
                    className={cn('h-full rounded-full', weakest ? 'bg-danger' : 'bg-primary')}
                    style={{ width: `${(row.band / SCALE_MAX) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted">{row.hint}</p>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
