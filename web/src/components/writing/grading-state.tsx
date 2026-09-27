'use client'

import { CalendarClock, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui'
import { YourAnswer } from '@/components/writing/feedback-view'
import { cn } from '@/lib/utils'
import type { WritingSubmission } from '@/types/api'

const STEPS = [
  'Reading your answer against the question',
  'Checking paragraphing and progression',
  'Marking vocabulary and grammar',
  'Writing your corrections',
]

/**
 * ~30 seconds is a long time to stare at a spinner after an hour of writing. We say how long it
 * takes, show which criterion is being marked, and promise the thing the student actually fears:
 * that the essay is safe.
 */
export function GradingWait() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 7000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
          <h1 className="text-lg font-semibold tracking-tight">Your examiner is reading</h1>
        </div>
        <p className="mt-2 text-sm text-muted">
          This takes about 30 seconds. Keep this page open — the report appears here when it is
          ready.
        </p>

        <ol className="mt-5 space-y-2.5" aria-live="polite">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={cn(
                'flex items-center gap-2.5 text-sm transition-colors',
                i < step ? 'text-muted' : i === step ? 'text-fg' : 'text-muted/60',
              )}
            >
              {i < step ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
              ) : i === step ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
              ) : (
                <span aria-hidden className="h-4 w-4 shrink-0 rounded-full border border-border" />
              )}
              {label}
            </li>
          ))}
        </ol>

        <p className="mt-5 flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-xs text-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
          Your answers are already saved. If this page closes, open the attempt again from your
          dashboard — nothing is lost.
        </p>
      </div>
    </main>
  )
}

/** 429 from POST /writing/attempts/{id}/grade. */
export function DailyLimitReached({
  submissions,
  detail,
}: {
  submissions: WritingSubmission[]
  detail?: string | null
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <div className="rounded-2xl border border-warning/40 bg-warning/10 p-5">
        <div className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              You have used today&rsquo;s AI marking
            </h1>
            <p className="mt-2 text-sm text-muted">
              {detail
                ? detail
                : 'There is a daily limit on AI-marked essays so the service stays free for everyone.'}{' '}
              <strong className="font-semibold text-fg">Your answer is submitted and saved.</strong>{' '}
              Come back tomorrow and open this attempt from your dashboard to have it marked — you
              do not need to write it again.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              Back to dashboard
            </Button>
          </Link>
        </div>
      </div>

      <p className="text-sm text-muted">
        While you wait, re-read your answer below against the four criteria: did you answer every
        part of the question, is each paragraph one idea, is your vocabulary precise, and how many
        sentences would survive a proofread?
      </p>

      {submissions.map((submission) => (
        <YourAnswer key={submission.id} submission={submission} />
      ))}
    </main>
  )
}

/** Any non-429 grading failure: network, 5xx, or a marker that came back empty. */
export function GradingFailed({
  message,
  submissions,
  onRetry,
  retrying,
}: {
  message: string
  submissions: WritingSubmission[]
  onRetry: () => void
  retrying?: boolean
}) {
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <div className="rounded-2xl border border-danger/40 bg-danger/5 p-5">
        <h1 className="text-lg font-semibold tracking-tight">We could not mark your answer</h1>
        <p className="mt-2 text-sm text-muted">
          {message} <strong className="font-semibold text-fg">Your answer is saved in full</strong>{' '}
          — it is shown below and will still be here tomorrow.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={onRetry} loading={retrying}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try again
          </Button>
          <Link href="/dashboard">
            <Button variant="outline">Back to dashboard</Button>
          </Link>
        </div>
      </div>

      {submissions.map((submission) => (
        <YourAnswer key={submission.id} submission={submission} />
      ))}
    </main>
  )
}
