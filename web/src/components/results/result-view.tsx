'use client'

import { Printer } from 'lucide-react'

import { useChartTheme, seriesColorFor } from '@/components/dashboard/chart-theme'
import {
  accuracyPct,
  formatBand,
  formatDate,
  formatDuration,
} from '@/components/dashboard/format'
import { LinkButton, Meter } from '@/components/dashboard/primitives'
import { TypeAccuracyList } from '@/components/dashboard/type-accuracy'
import { ReviewList } from '@/components/results/review-list'
import { SectionBreakdown } from '@/components/results/score-breakdown'
import { Badge, Button, Card } from '@/components/ui'
import { bandColor, cn, skillLabel } from '@/lib/utils'
import type { AttemptResult } from '@/types/api'

/** The one number this page exists for. Proportional figures — it is not in a column. */
function BandHero({ result }: { result: AttemptResult }) {
  const theme = useChartTheme()
  const colour = seriesColorFor(result.skill, theme)
  const pct = accuracyPct(result.raw_score, result.total_questions)

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Your band</p>
          <p
            className={cn(
              'mt-1 text-7xl font-semibold leading-[0.9] tracking-tight',
              bandColor(result.band),
            )}
          >
            {formatBand(result.band)}
          </p>
          <p className="mt-3 text-lg font-medium" data-testid="band-headline">
            Band {formatBand(result.band)} —{' '}
            <span className="tabular-nums">
              {result.raw_score} of {result.total_questions}
            </span>{' '}
            correct
          </p>
        </div>

        <div className="w-full sm:max-w-xs">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted">Raw score</span>
            <span className="font-semibold tabular-nums">{pct}%</span>
          </div>
          <Meter
            value={result.raw_score}
            max={result.total_questions}
            color={colour}
            label={`${result.raw_score} of ${result.total_questions} correct`}
            className="mt-2 h-3"
          />
          <p className="mt-2 text-xs text-muted">
            {result.total_questions} questions · converted on the official{' '}
            {skillLabel(result.skill)} table.
          </p>
        </div>
      </div>
    </Card>
  )
}

export function ResultView({
  result,
  flaggedIds,
}: {
  result: AttemptResult
  flaggedIds?: ReadonlySet<string>
}) {
  const wrongCount = result.review.filter((q) => !q.is_correct).length

  return (
    <div className="flex flex-col gap-4" data-testid="result-view">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{skillLabel(result.skill)}</Badge>
            <span className="text-xs text-muted">
              {formatDate(result.submitted_at)}
              {result.duration_seconds != null &&
                ` · took ${formatDuration(result.duration_seconds)}`}
            </span>
          </div>
          <h1 className="mt-1.5 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            {result.test_title}
          </h1>
        </div>
        <div className="no-print flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden />
            Print
          </Button>
          <LinkButton href={`/tests?skill=${result.skill}`} size="sm">
            Take another
          </LinkButton>
        </div>
      </header>

      <BandHero result={result} />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionBreakdown sections={result.sections} skill={result.skill} />
        <Card>
          <div className="p-5 pb-3">
            <h2 className="text-base font-semibold tracking-tight">Accuracy by question type</h2>
            <p className="text-sm text-muted">
              Weakest first. These are the types to drill before your next sitting.
            </p>
          </div>
          <div className="border-t border-border">
            <TypeAccuracyList
              items={result.by_type}
              emptyMessage="This paper did not record question types."
            />
          </div>
        </Card>
      </div>

      {wrongCount > 0 && (
        <p className="text-sm text-muted">
          You lost {wrongCount} mark{wrongCount === 1 ? '' : 's'}. Each one below says exactly why —
          including the ones where the answer was right but the form was not.
        </p>
      )}

      <ReviewList review={result.review} flaggedIds={flaggedIds} />
    </div>
  )
}
