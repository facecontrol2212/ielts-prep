'use client'

import Link from 'next/link'

import { useChartTheme } from '@/components/dashboard/chart-theme'
import { accuracyPct } from '@/components/dashboard/format'
import { Meter } from '@/components/dashboard/primitives'
import { humanizeType } from '@/lib/utils'
import type { Skill, TypeScore } from '@/types/api'

/**
 * Which skill a question type belongs to, so "practise this" can point somewhere useful.
 * Only the unambiguous ones are mapped; the rest fall back to the whole catalogue.
 * (TypeScore really ought to carry `skill` — see the report.)
 */
const TYPE_SKILL: Record<string, Skill> = {
  matching_headings: 'reading',
  matching_information: 'reading',
  true_false_not_given: 'reading',
  yes_no_not_given: 'reading',
  summary_completion: 'reading',
  form_completion: 'listening',
  map_labelling: 'listening',
}

export function practiceHref(type: string): string {
  const skill = TYPE_SKILL[type]
  return skill ? `/tests?skill=${skill}` : '/tests'
}

/**
 * Accuracy per question type, weakest first.
 *
 * Form: magnitude across nominal categories → bars in ONE hue (a value-ramp here would
 * double-encode length as colour). The ranking carries "what to practise"; the numbers
 * are printed beside every bar, so nothing depends on the colour at all.
 */
export function TypeAccuracyList({
  items,
  showPractice = false,
  limit,
  emptyMessage = 'No question-type data yet.',
}: {
  items: TypeScore[]
  showPractice?: boolean
  limit?: number
  emptyMessage?: string
}) {
  const theme = useChartTheme()
  const hue = theme.series[0]

  const ranked = [...items]
    .filter((item) => item.total > 0)
    .sort((a, b) => accuracyPct(a.correct, a.total) - accuracyPct(b.correct, b.total))
    .slice(0, limit ?? items.length)

  if (ranked.length === 0) {
    return <p className="px-5 py-4 text-sm text-muted">{emptyMessage}</p>
  }

  return (
    <ol className="divide-y divide-border">
      {ranked.map((item) => {
        const pct = accuracyPct(item.correct, item.total)
        return (
          <li key={item.type} className="flex flex-col gap-1.5 px-5 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-sm font-medium">{humanizeType(item.type)}</span>
              <span className="text-sm tabular-nums text-muted">
                <span className="font-semibold text-fg">{pct}%</span>
                {' · '}
                {item.correct} of {item.total}
              </span>
            </div>
            <Meter
              value={pct}
              color={hue}
              label={`${humanizeType(item.type)} accuracy ${pct} per cent`}
            />
            {showPractice && (
              <Link
                href={practiceHref(item.type)}
                className="no-print self-start text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                Practise {humanizeType(item.type).toLowerCase()}
              </Link>
            )}
          </li>
        )
      })}
    </ol>
  )
}
