'use client'

import { ArrowRight, Check, Copy as CopyIcon, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  bandAverage,
  explainOverall,
  formatAverage,
  formatBand,
  overallBand,
} from '@/components/marketing/band'
import { useCopy } from '@/components/marketing/locale'
import { Button } from '@/components/ui'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export interface SkillBands {
  listening: number
  reading: number
  writing: number
  speaking: number
}

/** Mirrors api/app/schemas/score.py::BandCalculatorResponse. */
interface OverallResponse {
  overall: number
  average: number
  explanation: string
}

const SKILL_KEYS = ['listening', 'reading', 'writing', 'speaking'] as const
type SkillKey = (typeof SKILL_KEYS)[number]

const PARAM: Record<SkillKey, string> = {
  listening: 'l',
  reading: 'r',
  writing: 'w',
  speaking: 's',
}

const DEFAULT_BANDS: SkillBands = { listening: 6, reading: 6, writing: 6, speaking: 6 }

function clampBand(value: number): number {
  if (!Number.isFinite(value)) return 6
  return Math.min(9, Math.max(0, Math.round(value * 2) / 2))
}

export function bandsFromQuery(search: string, fallback: SkillBands = DEFAULT_BANDS): SkillBands {
  const params = new URLSearchParams(search)
  const next = { ...fallback }
  for (const key of SKILL_KEYS) {
    const raw = params.get(PARAM[key])
    if (raw !== null && raw.trim() !== '') next[key] = clampBand(Number(raw))
  }
  return next
}

export function queryFromBands(bands: SkillBands): string {
  const params = new URLSearchParams()
  for (const key of SKILL_KEYS) params.set(PARAM[key], String(bands[key]))
  return params.toString()
}

type CheckState =
  | { kind: 'local' }
  | { kind: 'checked'; explanation: string }
  | { kind: 'offline' }
  | { kind: 'mismatch'; server: number }

export function BandCalculator() {
  const copy = useCopy()
  const [bands, setBands] = useState<SkillBands>(DEFAULT_BANDS)
  const [check, setCheck] = useState<CheckState>({ kind: 'local' })
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')

  // Read a shared result out of the URL after hydration, so the prerendered
  // HTML and the first client render stay identical.
  useEffect(() => {
    setBands(bandsFromQuery(window.location.search))
  }, [])

  const overall = overallBand(bands.listening, bands.reading, bands.writing, bands.speaking)
  const average = bandAverage(bands.listening, bands.reading, bands.writing, bands.speaking)
  const explanation = useMemo(() => explainOverall(bands), [bands])

  // Keep the address bar in step: the URL is itself the shareable result.
  useEffect(() => {
    const query = queryFromBands(bands)
    window.history.replaceState(null, '', `${window.location.pathname}?${query}`)
    setCopied('idle')
  }, [bands])

  // Cross-check against the scoring service. The local answer is already on
  // screen, so this only ever adds confirmation or a warning.
  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      api
        .post<OverallResponse>('/score/overall', bands, { anonymous: true })
        .then((result) => {
          if (cancelled) return
          setCheck(
            result.overall === overall
              ? { kind: 'checked', explanation: result.explanation }
              : { kind: 'mismatch', server: result.overall },
          )
        })
        .catch(() => {
          if (!cancelled) setCheck({ kind: 'offline' })
        })
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [bands, overall])

  const share = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}?${queryFromBands(bands)}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied('done')
    } catch {
      setCopied('failed')
    }
  }, [bands])

  const labels: Record<SkillKey, string> = {
    listening: copy.calculator.listening,
    reading: copy.calculator.reading,
    writing: copy.calculator.writing,
    speaking: copy.calculator.speaking,
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="max-w-2xl">
        <h1 className="text-balance font-serif text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          {copy.calculator.title}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">{copy.calculator.intro}</p>
      </header>

      <div className="mt-9 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <div className="flex flex-col gap-6">
            {SKILL_KEYS.map((key) => {
              const id = `band-${key}`
              return (
                <div key={key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <label htmlFor={id} className="text-sm font-semibold text-fg">
                      {labels[key]}
                    </label>
                    <output
                      htmlFor={id}
                      className="font-mono text-lg font-semibold tabular-nums text-primary"
                    >
                      {formatBand(bands[key])}
                    </output>
                  </div>
                  <input
                    id={id}
                    name={key}
                    type="range"
                    min={0}
                    max={9}
                    step={0.5}
                    value={bands[key]}
                    aria-valuetext={formatBand(bands[key])}
                    onChange={(event) =>
                      setBands((prev) => ({ ...prev, [key]: Number(event.target.value) }))
                    }
                    className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-primary"
                  />
                </div>
              )
            })}
          </div>

          <div className="mt-7 flex flex-wrap gap-2 border-t border-border pt-5">
            <Button variant="outline" size="sm" onClick={share}>
              {copied === 'done' ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <CopyIcon className="h-4 w-4" aria-hidden />
              )}
              {copied === 'done' ? copy.calculator.shared : copy.calculator.share}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setBands(DEFAULT_BANDS)}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              {copy.calculator.reset}
            </Button>
          </div>
          {copied === 'failed' && (
            <p role="alert" className="mt-3 text-sm text-warning">
              {copy.calculator.shareFailed}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-primary p-6 text-primary-fg">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-fg/75">
              {copy.calculator.overall}
            </p>
            <p
              aria-live="polite"
              data-testid="overall-band"
              className="mt-1 font-mono text-6xl font-bold leading-none tabular-nums"
            >
              {formatBand(overall)}
            </p>
            <p className="mt-4 text-sm text-primary-fg/80">
              {copy.calculator.averageLabel}:{' '}
              <span className="font-mono tabular-nums">{formatAverage(average)}</span>
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
              {copy.calculator.explanationTitle}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-fg">
              {check.kind === 'checked' ? check.explanation : explanation}
            </p>
            <p
              className={cn(
                'mt-3 text-xs leading-relaxed',
                check.kind === 'mismatch' ? 'text-danger' : 'text-muted',
              )}
              role={check.kind === 'mismatch' ? 'alert' : undefined}
            >
              {check.kind === 'checked' && copy.calculator.serverChecked}
              {check.kind === 'offline' && copy.calculator.serverOffline}
              {check.kind === 'mismatch' &&
                `${copy.calculator.serverMismatch} (${formatBand(check.server)})`}
            </p>
          </div>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight text-fg">
          {copy.calculator.rulesTitle}
        </h2>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {copy.calculator.rules.map((rule, index) => (
            <li key={rule} className="flex gap-3 text-sm leading-relaxed text-muted">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[0.7rem] font-semibold tabular-nums text-fg">
                {index + 1}
              </span>
              {rule}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6 flex flex-col gap-4 rounded-2xl border border-border bg-surface-2 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <h2 className="text-lg font-semibold tracking-tight text-fg">
            {copy.calculator.ctaTitle}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{copy.calculator.ctaBody}</p>
        </div>
        <Link href="/register" className="shrink-0">
          <Button size="lg" className="w-full sm:w-auto">
            {copy.calculator.ctaButton}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </Link>
      </section>
    </div>
  )
}
