'use client'

import Link from 'next/link'
import { CheckCircle2, CircleDashed, TrendingUp } from 'lucide-react'

import { useChartTheme, seriesColorFor } from '@/components/dashboard/chart-theme'
import { formatBand, SKILL_ORDER } from '@/components/dashboard/format'
import { Meter } from '@/components/dashboard/primitives'
import { Card } from '@/components/ui'
import { cn, skillLabel } from '@/lib/utils'
import type { DashboardStats, Skill } from '@/types/api'

/** The gap is the point of this block, so it is spelled out in words, not left to a colour. */
function gapCopy(latest: number, target: number): { text: string; tone: string; Icon: typeof CheckCircle2 } {
  const gap = Math.round((target - latest) * 10) / 10
  if (gap <= 0) {
    return {
      text: gap === 0 ? 'At your target' : `${formatBand(Math.abs(gap))} above target`,
      tone: 'text-success',
      Icon: CheckCircle2,
    }
  }
  return {
    text: `${formatBand(gap)} below target`,
    tone: gap <= 0.5 ? 'text-warning' : 'text-danger',
    Icon: TrendingUp,
  }
}

export function SkillReadiness({
  latest,
  best,
  target,
}: {
  latest: DashboardStats['latest_band']
  best: DashboardStats['best_band']
  target: number | null
}) {
  const theme = useChartTheme()
  const tested = SKILL_ORDER.filter((s) => latest[s] != null)
  const untested = SKILL_ORDER.filter((s) => latest[s] == null && s !== 'speaking')

  return (
    <Card>
      <div className="p-5 pb-3">
        <h2 className="text-base font-semibold tracking-tight">Where each skill stands</h2>
        <p className="text-sm text-muted">
          {target == null
            ? 'Set a target band in your profile and this will show the gap.'
            : `Your most recent band per skill against your target of ${formatBand(target)}.`}
        </p>
      </div>

      <ul className="divide-y divide-border border-t border-border">
        {tested.map((skill) => {
          const band = latest[skill] as number
          const colour = seriesColorFor(skill, theme)
          const gap = target == null ? null : gapCopy(band, target)
          const bestBand = best[skill]
          return (
            <li key={skill} className="flex flex-col gap-2 px-5 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 font-medium">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colour }}
                  />
                  {skillLabel(skill)}
                </span>
                <span className="text-xl font-semibold leading-none">{formatBand(band)}</span>
              </div>
              <Meter
                value={band}
                max={9}
                color={colour}
                label={`${skillLabel(skill)} band ${formatBand(band)} of 9`}
                markerValue={target ?? undefined}
                markerLabel={target == null ? undefined : `Target ${formatBand(target)}`}
              />
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                <span className="text-muted">
                  {bestBand != null && bestBand > band
                    ? `Best so far ${formatBand(bestBand)}`
                    : 'This is your best so far'}
                </span>
                {gap && (
                  <span className={cn('inline-flex items-center gap-1 font-medium', gap.tone)}>
                    <gap.Icon className="h-3.5 w-3.5" aria-hidden />
                    {gap.text}
                  </span>
                )}
              </div>
            </li>
          )
        })}

        {untested.map((skill) => (
          <li
            key={skill}
            className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-sm"
          >
            <span className="flex items-center gap-2 text-muted">
              <CircleDashed className="h-4 w-4" aria-hidden />
              {skillLabel(skill)} — not tested yet
            </span>
            <Link
              href={`/tests?skill=${skill}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Take a {skillLabel(skill)} test
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
