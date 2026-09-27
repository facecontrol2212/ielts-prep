'use client'

import { useMemo, useState } from 'react'

import { FilterChip, FilterRow } from '@/components/dashboard/primitives'
import { ReviewItem } from '@/components/results/review-item'
import { Card } from '@/components/ui'
import type { QuestionReview } from '@/types/api'

export type ReviewFilter = 'all' | 'wrong' | 'flagged'

const FILTER_LABELS: Record<ReviewFilter, string> = {
  all: 'All questions',
  wrong: 'Only wrong',
  flagged: 'Only flagged',
}

export function ReviewList({
  review,
  flaggedIds,
}: {
  review: QuestionReview[]
  /** Question ids the student flagged during the sitting. */
  flaggedIds?: ReadonlySet<string>
}) {
  const [filter, setFilter] = useState<ReviewFilter>('all')

  const counts = useMemo(
    () => ({
      all: review.length,
      wrong: review.filter((q) => !q.is_correct).length,
      flagged: flaggedIds ? review.filter((q) => flaggedIds.has(q.question_id)).length : 0,
    }),
    [review, flaggedIds],
  )

  const visible = useMemo(() => {
    if (filter === 'wrong') return review.filter((q) => !q.is_correct)
    if (filter === 'flagged')
      return flaggedIds ? review.filter((q) => flaggedIds.has(q.question_id)) : []
    return review
  }, [review, filter, flaggedIds])

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 p-5 pb-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Question by question</h2>
          <p className="text-sm text-muted">
            What you wrote, what the mark scheme wanted, and where the answer came from.
          </p>
        </div>
        <FilterRow label="Filter the review">
          {(['all', 'wrong', 'flagged'] as const).map((key) => (
            <FilterChip
              key={key}
              active={filter === key}
              disabled={key === 'flagged' && counts.flagged === 0}
              title={
                key === 'flagged' && counts.flagged === 0
                  ? 'You did not flag any questions in this sitting'
                  : undefined
              }
              onClick={() => setFilter(key)}
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              {FILTER_LABELS[key]}
              <span className="ml-1.5 tabular-nums opacity-70">{counts[key]}</span>
            </FilterChip>
          ))}
        </FilterRow>
        <p className="text-xs text-muted" data-testid="review-count">
          Showing {visible.length} of {review.length} questions
          {filter !== 'all' && ` · ${FILTER_LABELS[filter].toLowerCase()}`}
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="border-t border-border px-5 py-8 text-center text-sm text-muted">
          {filter === 'wrong'
            ? 'Nothing wrong in this sitting. That is a clean paper.'
            : 'No questions match this filter.'}
        </p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {visible.map((item) => (
            <ReviewItem
              key={item.question_id}
              item={item}
              flagged={flaggedIds?.has(item.question_id) ?? false}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}
