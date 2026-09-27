'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Clock, ListChecks, PlayCircle, SignalHigh } from 'lucide-react'
import { useState } from 'react'

import { attemptStateByTest } from '@/components/catalogue/query'
import {
  difficultyLabel,
  examHref,
  formatBand,
  formatDuration,
} from '@/components/dashboard/format'
import { ErrorState, LinkButton } from '@/components/dashboard/primitives'
import { Alert, Badge, Button, Card, Skeleton } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { skillLabel } from '@/lib/utils'
import type { AttemptHistoryItem, AttemptSession, Page, Skill, TestSummary } from '@/types/api'

/** What a student is walking into. Written per skill, because the rules differ. */
const RULES: Record<Skill, string[]> = {
  listening: [
    'The audio plays once, straight through. You cannot rewind — the real exam does not let you either.',
    'Two extra minutes at the end to check your transfers.',
    'Spelling counts. "Recieve" scores nothing.',
  ],
  reading: [
    'Three passages, split-screen with the questions. You can highlight as you read.',
    'No extra transfer time — the 60 minutes includes writing your answers.',
    'Watch the word limit on completion questions: one word over is a lost mark.',
  ],
  writing: [
    'Task 1 then Task 2, with a live word counter and the official minimums.',
    'Your draft saves every few seconds, so a dropped connection costs you nothing.',
    'The AI examiner scores all four criteria and marks up your text line by line.',
  ],
  speaking: [
    'Parts 1, 2 and 3 with a one-minute preparation timer on the cue card.',
    'Your recording stays in this browser — nothing is uploaded.',
  ],
}

export default function TestDetailPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug
  const router = useRouter()
  const queryClient = useQueryClient()
  const [startError, setStartError] = useState<string | null>(null)

  const testQuery = useQuery({
    queryKey: ['test', slug],
    queryFn: () => api.get<TestSummary>(`/tests/${slug}`),
    enabled: Boolean(slug),
  })

  const attemptsQuery = useQuery({
    queryKey: ['my-attempts', 'catalogue'],
    queryFn: () => api.get<Page<AttemptHistoryItem>>('/users/me/attempts?page=1&page_size=100'),
  })

  const start = useMutation({
    mutationFn: (test: TestSummary) => api.post<AttemptSession>('/attempts', { test_id: test.id }),
    onSuccess: (session) => router.push(examHref(session.test.skill, session.attempt.id)),
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 409) {
        setStartError('You already have this test open. Resume it rather than starting again.')
        void queryClient.invalidateQueries({ queryKey: ['my-attempts'] })
        return
      }
      setStartError(
        error instanceof Error ? error.message : 'We could not start that test. Try again.',
      )
    },
  })

  if (testQuery.isError) {
    return (
      <ErrorState
        title="We could not load this test"
        message={testQuery.error instanceof Error ? testQuery.error.message : undefined}
        onRetry={() => void testQuery.refetch()}
      />
    )
  }

  if (testQuery.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading test">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const test = testQuery.data
  const state = attemptStateByTest(attemptsQuery.data?.items ?? []).get(test.id)
  const resumeId = state?.inProgressAttemptId

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/tests?skill=${test.skill}`}
        className="no-print inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All {skillLabel(test.skill)} tests
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{skillLabel(test.skill)}</Badge>
          <Badge tone="neutral">
            {test.variant === 'general' ? 'General Training' : 'Academic'}
          </Badge>
          {state?.bestBand != null && (
            <Badge tone="success">Your best {formatBand(state.bestBand)}</Badge>
          )}
        </div>
        <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          {test.title}
        </h1>
        {test.description && <p className="mt-2 max-w-prose text-muted">{test.description}</p>}
      </header>

      {startError && (
        <Alert tone="warning" title="Already in progress">
          {startError}
        </Alert>
      )}

      <Card className="p-5">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              Time
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {formatDuration(test.duration_seconds)}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted">
              <ListChecks className="h-3.5 w-3.5" aria-hidden />
              Questions
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{test.question_count}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted">
              <SignalHigh className="h-3.5 w-3.5" aria-hidden />
              Difficulty
            </dt>
            <dd className="mt-1 text-lg font-semibold">{difficultyLabel(test.difficulty)}</dd>
          </div>
        </dl>

        <ul className="mt-5 space-y-2 border-t border-border pt-4 text-sm text-muted">
          {RULES[test.skill].map((rule) => (
            <li key={rule} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
              {rule}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {resumeId ? (
            <>
              <LinkButton href={examHref(test.skill, resumeId)} size="md">
                <PlayCircle className="h-4 w-4" aria-hidden />
                Resume your attempt
              </LinkButton>
              <span className="text-sm text-muted">Your clock has been running since you left.</span>
            </>
          ) : (
            <>
              <Button size="lg" loading={start.isPending} onClick={() => start.mutate(test)}>
                <PlayCircle className="h-4 w-4" aria-hidden />
                {state?.bestBand != null ? 'Retake this test' : 'Start the test'}
              </Button>
              <span className="text-sm text-muted">
                The timer starts immediately and runs on the server.
              </span>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
