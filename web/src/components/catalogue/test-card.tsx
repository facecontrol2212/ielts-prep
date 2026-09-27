'use client'

import Link from 'next/link'
import { Clock, ListChecks, PlayCircle, RotateCw, SignalHigh } from 'lucide-react'

import type { TestUserState } from '@/components/catalogue/query'
import { difficultyLabel, formatBand, formatDuration } from '@/components/dashboard/format'
import { LinkButton } from '@/components/dashboard/primitives'
import { Badge, Button, Card } from '@/components/ui'
import { skillLabel } from '@/lib/utils'
import type { TestSummary } from '@/types/api'

function Fact({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span aria-hidden className="text-muted">
        {icon}
      </span>
      {children}
    </span>
  )
}

export function TestCard({
  test,
  state,
  onStart,
  starting,
}: {
  test: TestSummary
  state?: TestUserState
  onStart: (test: TestSummary) => void
  starting: boolean
}) {
  const resumeId = state?.inProgressAttemptId
  const best = state?.bestBand

  return (
    <Card
      className="flex h-full flex-col transition-colors hover:border-primary/40"
      data-testid={`test-card-${test.slug}`}
      data-slug={test.slug}
    >
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{skillLabel(test.skill)}</Badge>
          {test.variant === 'general' && <Badge tone="neutral">General Training</Badge>}
          {resumeId && (
            <Badge tone="accent" data-testid="resume-badge">
              In progress
            </Badge>
          )}
          {!resumeId && best != null && (
            <Badge tone="success" data-testid="best-band-badge">
              Best {formatBand(best)}
            </Badge>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-pretty font-semibold leading-snug">
            <Link href={`/tests/${test.slug}`} className="hover:underline">
              {test.title}
            </Link>
          </h3>
          {test.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted">{test.description}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Fact icon={<Clock className="h-3.5 w-3.5" />}>
            <span className="tabular-nums">{formatDuration(test.duration_seconds)}</span>
          </Fact>
          <Fact icon={<ListChecks className="h-3.5 w-3.5" />}>
            <span className="tabular-nums">{test.question_count}</span> questions
          </Fact>
          <Fact icon={<SignalHigh className="h-3.5 w-3.5" />}>
            {difficultyLabel(test.difficulty)}
          </Fact>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
        {resumeId ? (
          <>
            <LinkButton
              href={
                test.skill === 'writing' ? `/exam/writing/${resumeId}` : `/exam/${resumeId}`
              }
              size="sm"
            >
              <PlayCircle className="h-4 w-4" aria-hidden />
              Resume
            </LinkButton>
            <span className="text-xs text-muted">Your timer is still running</span>
          </>
        ) : (
          <>
            <Button size="sm" loading={starting} onClick={() => onStart(test)}>
              {best != null ? (
                <>
                  <RotateCw className="h-4 w-4" aria-hidden />
                  Retake
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4" aria-hidden />
                  Start test
                </>
              )}
            </Button>
            {best != null && state?.lastResultId && (
              <Link
                href={`/results/${state.lastResultId}`}
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                See your last result
              </Link>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
