'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import {
  ACADEMIC_READING_TABLE,
  type BandRow,
  LISTENING_TABLE,
  MAX_RAW_SCORE,
  formatBand,
  rowForRaw,
} from '@/components/marketing/band'
import { useCopy } from '@/components/marketing/locale'
import { Button } from '@/components/ui'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type DemoSkill = 'listening' | 'reading'

const SEED: Record<DemoSkill, readonly BandRow[]> = {
  listening: LISTENING_TABLE,
  reading: ACADEMIC_READING_TABLE,
}

/**
 * The credibility moment: a raw score out of 40 turning into a band on the
 * published table. Answers instantly from the seeded copy of the table, then
 * swaps in the live table from GET /score/table when the API is reachable.
 */
export function ScoringExplainer() {
  const copy = useCopy()
  const [skill, setSkill] = useState<DemoSkill>('listening')
  const [raw, setRaw] = useState(32)
  const [live, setLive] = useState<Partial<Record<DemoSkill, BandRow[]>>>({})

  useEffect(() => {
    let cancelled = false
    if (live[skill]) return
    api
      .get<BandRow[]>(`/score/table?skill=${skill}&variant=academic`, { anonymous: true })
      .then((rows) => {
        if (!cancelled && Array.isArray(rows) && rows.length > 0) {
          setLive((prev) => ({ ...prev, [skill]: rows }))
        }
      })
      .catch(() => {
        // The table ships with the page; a missing API just means no live check.
      })
    return () => {
      cancelled = true
    }
  }, [skill, live])

  const rows = live[skill] ?? SEED[skill]
  const active = useMemo(() => rowForRaw(rows, raw), [rows, raw])
  const visible = useMemo(() => rows.filter((row) => row.band >= 4), [rows])

  return (
    <section id="scoring" className="scroll-mt-20 border-b border-border bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="text-balance font-serif text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            {copy.scoring.title}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted">{copy.scoring.subtitle}</p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-border bg-bg p-5 sm:p-6">
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wider text-muted">
                {copy.scoring.skillLabel}
              </legend>
              <div className="mt-2 inline-flex rounded-lg border border-border bg-surface p-0.5">
                {(['listening', 'reading'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSkill(value)}
                    aria-pressed={skill === value}
                    className={cn(
                      'rounded-[0.4rem] px-3 py-1.5 text-sm font-medium transition-colors',
                      skill === value
                        ? 'bg-primary text-primary-fg'
                        : 'text-muted hover:text-fg',
                    )}
                  >
                    {value === 'listening' ? copy.scoring.listening : copy.scoring.reading}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-6">
              <label
                htmlFor="scoring-raw"
                className="text-xs font-semibold uppercase tracking-wider text-muted"
              >
                {copy.scoring.rawLabel}
              </label>
              <div className="mt-2 flex items-center gap-4">
                <input
                  id="scoring-raw"
                  type="range"
                  min={0}
                  max={MAX_RAW_SCORE}
                  step={1}
                  value={raw}
                  onChange={(event) => setRaw(Number(event.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-primary"
                />
                <output
                  htmlFor="scoring-raw"
                  className="w-16 shrink-0 text-right font-mono text-xl font-semibold tabular-nums text-fg"
                >
                  {raw}
                  <span className="text-sm text-muted">/40</span>
                </output>
              </div>
            </div>

            <div className="mt-6 flex items-end justify-between gap-4 rounded-xl border border-border bg-surface p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {copy.scoring.bandLabel}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {active
                    ? copy.scoring.rangeNote(active.raw_min, active.raw_max, formatBand(active.band))
                    : null}
                </p>
              </div>
              <p
                aria-live="polite"
                className="font-mono text-4xl font-bold leading-none tabular-nums text-primary"
              >
                {formatBand(active?.band ?? 0)}
              </p>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-muted">
              {copy.scoring.tableNote}
              {live[skill] ? ` ${copy.scoring.liveNote}` : ''}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-bg p-5 sm:p-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              {skill === 'listening' ? copy.scoring.listening : copy.scoring.reading}
            </h3>
            <ul className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {visible.map((row) => {
                const isActive = active?.band === row.band
                return (
                  <li
                    key={`${row.raw_min}-${row.raw_max}`}
                    className={cn(
                      'flex items-baseline justify-between gap-2 rounded-lg border px-2.5 py-2 font-mono text-xs tabular-nums transition-colors',
                      isActive
                        ? 'border-primary bg-primary-soft text-primary'
                        : 'border-border bg-surface text-muted',
                    )}
                  >
                    <span className="font-semibold">{formatBand(row.band)}</span>
                    <span>
                      {row.raw_min}–{row.raw_max}
                    </span>
                  </li>
                )
              })}
            </ul>

            <div className="mt-6 border-t border-border pt-5">
              <h3 className="text-base font-semibold tracking-tight text-fg">
                {copy.scoring.overallTitle}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{copy.scoring.overallBody}</p>
              <p className="mt-3 rounded-lg bg-surface px-3 py-2 font-mono text-xs leading-relaxed tabular-nums text-fg">
                {copy.scoring.overallExample}
              </p>
              <Link href="/calculator" className="mt-4 inline-flex">
                <Button variant="outline" size="sm">
                  {copy.scoring.overallCta}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
