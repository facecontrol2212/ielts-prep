'use client'

import Link from 'next/link'
import { ArrowRight, BookOpen, Headphones, PenLine } from 'lucide-react'

import { Card } from '@/components/ui'

/**
 * A brand-new account has nothing to chart, so this screen does not pretend otherwise.
 * Its whole job is to make the next action obvious and to say what it costs in minutes.
 */
const FIRST_TESTS = [
  {
    skill: 'reading',
    Icon: BookOpen,
    cta: 'Take your first Reading test — 60 minutes',
    detail: '3 passages · 40 questions · scored the moment you submit',
    primary: true,
  },
  {
    skill: 'listening',
    Icon: Headphones,
    cta: 'Take a Listening test — 30 minutes',
    detail: '4 sections · 40 questions · the audio plays once, like the real exam',
    primary: false,
  },
  {
    skill: 'writing',
    Icon: PenLine,
    cta: 'Write Task 1 and Task 2 — 60 minutes',
    detail: 'Band per criterion and line-by-line feedback from the AI examiner',
    primary: false,
  },
] as const

export function DashboardEmpty({ name }: { name?: string | null }) {
  return (
    <section className="flex flex-col gap-6" data-testid="dashboard-empty">
      <div>
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          {name ? `Let's find your starting band, ${name}.` : "Let's find your starting band."}
        </h1>
        <p className="mt-2 max-w-prose text-muted">
          You have not sat a test yet, so there is nothing to chart. One full sitting fills this
          page: a band score, a question-by-question review, and the first point on your progress
          line.
        </p>
      </div>

      <ul className="grid gap-3">
        {FIRST_TESTS.map(({ skill, Icon, cta, detail, primary }) => (
          <li key={skill}>
            <Card
              className={
                primary
                  ? 'border-primary/40 bg-primary-soft/40 transition-colors hover:border-primary'
                  : 'transition-colors hover:border-primary/40'
              }
            >
              <Link
                href={`/tests?skill=${skill}`}
                className="flex items-center gap-4 rounded-2xl p-5"
              >
                <span
                  aria-hidden
                  className={
                    primary
                      ? 'grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-fg'
                      : 'grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted'
                  }
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-balance font-semibold">{cta}</span>
                  <span className="mt-0.5 block text-sm text-muted">{detail}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              </Link>
            </Card>
          </li>
        ))}
      </ul>

      <Card className="p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          What happens after you submit
        </h2>
        <ol className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <li>
            <span className="font-medium">Scored immediately.</span>
            <span className="block text-muted">
              Raw score out of 40, converted to a band on the official table.
            </span>
          </li>
          <li>
            <span className="font-medium">Every question explained.</span>
            <span className="block text-muted">
              The correct answer, where it came from in the passage or audio, and why yours missed.
            </span>
          </li>
          <li>
            <span className="font-medium">Your weak spots ranked.</span>
            <span className="block text-muted">
              Accuracy per question type, so the next hour of study is not a guess.
            </span>
          </li>
        </ol>
      </Card>
    </section>
  )
}
