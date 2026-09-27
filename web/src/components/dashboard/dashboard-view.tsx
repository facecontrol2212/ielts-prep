'use client'

import Link from 'next/link'
import { CalendarClock, CheckCircle2, Flame, LineChart, TrendingUp } from 'lucide-react'

import { BandHistoryChart } from '@/components/dashboard/band-history-chart'
import { DashboardEmpty } from '@/components/dashboard/dashboard-empty'
import {
  daysUntil,
  formatBand,
  formatDate,
  overallBand,
  SKILL_ORDER,
} from '@/components/dashboard/format'
import { LinkButton, PageHeader, StatTile } from '@/components/dashboard/primitives'
import { SkillReadiness } from '@/components/dashboard/skill-readiness'
import { TypeAccuracyList } from '@/components/dashboard/type-accuracy'
import { Card } from '@/components/ui'
import { bandColor, cn, skillLabel } from '@/lib/utils'
import type { DashboardStats, User } from '@/types/api'

function firstName(user: User | null | undefined): string | null {
  return user?.full_name?.trim().split(/\s+/)[0] ?? null
}

/** The three-second answer: one number, the target beside it, and the days left. */
function ReadinessHero({ stats, user }: { stats: DashboardStats; user: User | null | undefined }) {
  const testedSkills = SKILL_ORDER.filter((s) => stats.latest_band[s] != null)
  const estimate = overallBand(testedSkills.map((s) => stats.latest_band[s] as number))
  const target = user?.target_band ?? null
  const gap = estimate != null && target != null ? Math.round((target - estimate) * 10) / 10 : null

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Estimated overall band
          </p>
          <p
            className={cn(
              'mt-1 text-6xl font-semibold leading-none tracking-tight',
              estimate == null ? 'text-muted' : bandColor(estimate),
            )}
          >
            {estimate == null ? '—' : formatBand(estimate)}
          </p>
          <p className="mt-2 max-w-md text-sm text-muted">
            {testedSkills.length === 0
              ? 'No scored sitting yet.'
              : `Averaged from your latest ${testedSkills
                  .map(skillLabel)
                  .join(' and ')} band${testedSkills.length > 1 ? 's' : ''}, rounded the way IELTS rounds.`}
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          {target == null ? (
            <Link
              href="/profile"
              className="no-print text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Set a target band to see your gap
            </Link>
          ) : (
            <>
              <p className="text-sm text-muted">
                Target <span className="font-semibold text-fg">{formatBand(target)}</span>
              </p>
              {gap != null && (
                <p
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
                    gap <= 0
                      ? 'bg-success/10 text-success'
                      : gap <= 0.5
                        ? 'bg-warning/10 text-warning'
                        : 'bg-danger/10 text-danger',
                  )}
                >
                  {gap <= 0 ? (
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                  ) : (
                    <TrendingUp className="h-4 w-4" aria-hidden />
                  )}
                  {gap <= 0
                    ? 'You are at or above your target'
                    : `${formatBand(gap)} to go before you are ready`}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

export function DashboardView({
  stats,
  user,
}: {
  stats: DashboardStats
  user: User | null | undefined
}) {
  const isEmpty = stats.attempts_total === 0 && stats.band_history.length === 0
  if (isEmpty) return <DashboardEmpty name={firstName(user)} />

  const examDate = user?.exam_date ?? null
  const days = examDate ? daysUntil(examDate) : null
  const hasTrend = stats.band_history.length >= 2

  return (
    <div className="flex flex-col gap-6" data-testid="dashboard-view">
      <PageHeader
        title={firstName(user) ? `Your progress, ${firstName(user)}` : 'Your progress'}
        description="Where you stand today, and the fastest thing you can do about it."
        action={<LinkButton href="/tests">Take a test</LinkButton>}
      />

      <ReadinessHero stats={stats} user={user} />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Tests completed"
          value={String(stats.tests_completed)}
          footnote={
            stats.attempts_total === stats.tests_completed
              ? 'Every attempt finished'
              : `${stats.attempts_total} attempts started`
          }
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
        />
        <StatTile
          label="Current streak"
          value={
            stats.current_streak_days === 1 ? '1 day' : `${stats.current_streak_days} days`
          }
          footnote={
            stats.current_streak_days === 0
              ? 'Sit a test today to start one'
              : 'Keep it going — sit one today'
          }
          icon={<Flame className="h-4 w-4" aria-hidden />}
        />
        {days == null ? (
          <StatTile
            label="Exam date"
            value="Not set"
            footnote="Add it in your profile for a countdown"
            icon={<CalendarClock className="h-4 w-4" aria-hidden />}
          />
        ) : (
          <StatTile
            label="Until your exam"
            value={days < 0 ? 'Passed' : days === 1 ? '1 day' : `${days} days`}
            footnote={formatDate(examDate)}
            tone={days >= 0 && days <= 30 ? 'urgent' : 'default'}
            icon={<CalendarClock className="h-4 w-4" aria-hidden />}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {hasTrend ? (
            <BandHistoryChart
              history={stats.band_history}
              targetBand={user?.target_band ?? null}
            />
          ) : (
            <Card className="flex h-full flex-col items-start justify-center gap-2 p-6">
              <LineChart className="h-5 w-5 text-muted" aria-hidden />
              <h2 className="text-base font-semibold tracking-tight">
                One more result and your trend appears
              </h2>
              <p className="max-w-prose text-sm text-muted">
                A progress line needs at least two scored sittings. Sit another test and this space
                fills with your band over time, per skill.
              </p>
              <LinkButton href="/tests" variant="outline" size="sm" className="mt-1">
                Browse tests
              </LinkButton>
            </Card>
          )}
        </div>
        <div className="lg:col-span-2">
          <SkillReadiness
            latest={stats.latest_band}
            best={stats.best_band}
            target={user?.target_band ?? null}
          />
        </div>
      </div>

      <Card>
        <div className="p-5 pb-3">
          <h2 className="text-base font-semibold tracking-tight">Practise these first</h2>
          <p className="text-sm text-muted">
            Your weakest question types across every scored sitting, weakest at the top.
          </p>
        </div>
        <div className="border-t border-border">
          <TypeAccuracyList
            items={stats.weakest_types}
            showPractice
            limit={6}
            emptyMessage="Not enough answered questions yet to rank your weak spots."
          />
        </div>
      </Card>
    </div>
  )
}
