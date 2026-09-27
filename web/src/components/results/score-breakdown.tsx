'use client'

import { useChartTheme, seriesColorFor } from '@/components/dashboard/chart-theme'
import { accuracyPct } from '@/components/dashboard/format'
import { Meter } from '@/components/dashboard/primitives'
import { Card } from '@/components/ui'
import type { SectionScore, Skill } from '@/types/api'

/**
 * Score per section.
 *
 * Form: comparing magnitude across a handful of named parts → bars, ONE hue (the skill's own,
 * so this card and the dashboard's band line agree about what "Reading" looks like). Every bar
 * prints its own numbers, so the colour is never load-bearing.
 */
export function SectionBreakdown({
  sections,
  skill,
}: {
  sections: SectionScore[]
  skill: Skill
}) {
  const theme = useChartTheme()
  const colour = seriesColorFor(skill, theme)
  if (sections.length === 0) return null

  const weakest = sections.reduce((worst, s) =>
    accuracyPct(s.correct, s.total) < accuracyPct(worst.correct, worst.total) ? s : worst,
  )

  return (
    <Card>
      <div className="p-5 pb-3">
        <h2 className="text-base font-semibold tracking-tight">Section by section</h2>
        <p className="text-sm text-muted">
          {sections.length > 1
            ? `Your weakest part of this paper was ${weakest.title}.`
            : 'How the marks fell across the paper.'}
        </p>
      </div>
      <ul className="divide-y divide-border border-t border-border">
        {sections
          .slice()
          .sort((a, b) => a.section_order - b.section_order)
          .map((section) => {
            const pct = accuracyPct(section.correct, section.total)
            return (
              <li key={section.section_order} className="flex flex-col gap-1.5 px-5 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-medium">{section.title}</span>
                  <span className="text-sm tabular-nums text-muted">
                    <span className="font-semibold text-fg">
                      {section.correct} of {section.total}
                    </span>
                    {' · '}
                    {pct}%
                  </span>
                </div>
                <Meter
                  value={section.correct}
                  max={section.total}
                  color={colour}
                  label={`${section.title}: ${section.correct} of ${section.total} correct`}
                />
              </li>
            )
          })}
      </ul>
    </Card>
  )
}
