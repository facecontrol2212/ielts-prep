'use client'

import { ArrowRight, Check } from 'lucide-react'
import Link from 'next/link'

import { useCopy } from '@/components/marketing/locale'
import { Button } from '@/components/ui'
import { useAuth } from '@/hooks/use-auth'

/**
 * The example answer grid: 40 cells, one per question, the way the exam
 * runner's palette shows them. It is the most recognisable object in the
 * product, so it is what the hero shows instead of a stock illustration.
 */
function AnswerGrid({ correct, total }: { correct: number; total: number }) {
  return (
    <div className="grid grid-cols-10 gap-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={
            i < correct
              ? 'h-3.5 rounded-[3px] bg-primary'
              : 'h-3.5 rounded-[3px] bg-surface-2 ring-1 ring-inset ring-border'
          }
        />
      ))}
    </div>
  )
}

export function Hero() {
  const copy = useCopy()
  const { user } = useAuth()

  return (
    <section className="border-b border-border bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_minmax(0,1fr)]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted">
              {copy.hero.eyebrow}
            </p>

            <h1 className="mt-5 text-balance font-serif text-4xl font-semibold leading-[1.1] tracking-tight text-fg sm:text-5xl lg:text-[3.4rem]">
              {copy.hero.title}
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              {copy.hero.subtitle}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href={user ? '/dashboard' : '/register'} className="sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto">
                  {user ? copy.hero.ctaPrimarySignedIn : copy.hero.ctaPrimary}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </Link>
              <Link href="/calculator" className="sm:w-auto">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  {copy.hero.ctaSecondary}
                </Button>
              </Link>
            </div>

            <p className="mt-4 max-w-md text-sm text-muted">{copy.hero.note}</p>

            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2">
              {copy.hero.points.map((point) => (
                <li key={point} className="flex items-center gap-2 text-sm text-fg">
                  <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-border bg-bg p-5 shadow-card sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider text-accent">
                  {copy.hero.sample.label}
                </span>
                <span className="truncate text-xs text-muted">{copy.hero.sample.test}</span>
              </div>

              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    {copy.hero.sample.rawLabel}
                  </p>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-fg">
                    {copy.hero.sample.raw}
                  </p>
                </div>
                <ArrowRight className="mb-2 h-5 w-5 shrink-0 text-muted" aria-hidden />
                <div className="text-right">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    {copy.hero.sample.bandLabel}
                  </p>
                  <p className="mt-1 font-mono text-4xl font-bold leading-none tabular-nums text-success">
                    {copy.hero.sample.band}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <AnswerGrid correct={32} total={40} />
              </div>

              <p className="mt-4 text-xs leading-relaxed text-muted">
                {copy.hero.sample.footnote}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
