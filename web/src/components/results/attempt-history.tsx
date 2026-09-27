'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ChevronRight, PlayCircle } from 'lucide-react'
import { useState } from 'react'

import { useChartTheme, seriesColorFor } from '@/components/dashboard/chart-theme'
import { examHref, formatBand, formatDate, SKILL_ORDER } from '@/components/dashboard/format'
import {
  ErrorState,
  FilterChip,
  FilterRow,
  LinkButton,
  PageHeader,
  Pagination,
} from '@/components/dashboard/primitives'
import { Badge, Card, Skeleton } from '@/components/ui'
import { api } from '@/lib/api'
import { bandColor, cn, skillLabel } from '@/lib/utils'
import type { AttemptHistoryItem, AttemptStatus, Page, Skill } from '@/types/api'

const PAGE_SIZE = 20

const STATUS_LABEL: Record<AttemptStatus, string> = {
  in_progress: 'In progress',
  submitted: 'Marking',
  scored: 'Scored',
  abandoned: 'Abandoned',
  expired: 'Ran out of time',
}

export function buildAttemptsPath(skill: Skill | 'all', page: number): string {
  const search = new URLSearchParams()
  if (skill !== 'all') search.set('skill', skill)
  search.set('page', String(page))
  search.set('page_size', String(PAGE_SIZE))
  return `/users/me/attempts?${search.toString()}`
}

function AttemptRow({ attempt }: { attempt: AttemptHistoryItem }) {
  const theme = useChartTheme()
  const colour = seriesColorFor(attempt.skill, theme)
  const band = attempt.status === 'scored' ? attempt.band : null
  const scored = band != null

  const body = (
    <>
      <span
        aria-hidden
        className="h-8 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: colour }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{attempt.test_title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          <span>{skillLabel(attempt.skill)}</span>
          <span aria-hidden>·</span>
          <span>{formatDate(attempt.submitted_at)}</span>
          {!scored && (
            <>
              <span aria-hidden>·</span>
              <span>{STATUS_LABEL[attempt.status]}</span>
            </>
          )}
        </span>
      </span>
      {band != null ? (
        <span className="shrink-0 text-right">
          <span className={cn('block text-xl font-semibold leading-none', bandColor(band))}>
            {formatBand(band)}
          </span>
          {attempt.raw_score != null && (
            <span className="mt-0.5 block text-xs tabular-nums text-muted">
              {attempt.raw_score} correct
            </span>
          )}
        </span>
      ) : (
        <Badge tone={attempt.status === 'in_progress' ? 'accent' : 'neutral'}>
          {STATUS_LABEL[attempt.status]}
        </Badge>
      )}
    </>
  )

  if (attempt.status === 'in_progress') {
    return (
      <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
        {body}
        <LinkButton href={examHref(attempt.skill, attempt.id)} size="sm" className="shrink-0">
          <PlayCircle className="h-4 w-4" aria-hidden />
          Resume
        </LinkButton>
      </li>
    )
  }

  if (!scored) {
    return (
      <li className="flex items-center gap-3 px-4 py-3 text-muted sm:px-5">{body}</li>
    )
  }

  return (
    <li>
      <Link
        href={`/results/${attempt.id}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5"
      >
        {body}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  )
}

export function AttemptHistory({ initialSkill = 'all' }: { initialSkill?: Skill | 'all' }) {
  const [skill, setSkill] = useState<Skill | 'all'>(initialSkill)
  const [page, setPage] = useState(1)
  const path = buildAttemptsPath(skill, page)

  const query = useQuery({
    queryKey: ['my-attempts', path],
    queryFn: () => api.get<Page<AttemptHistoryItem>>(path),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Your attempts"
        description="Every sitting you have started, newest first. Open one to read the full review."
      />

      <FilterRow label="Filter attempts by skill">
        <FilterChip
          active={skill === 'all'}
          onClick={() => {
            setSkill('all')
            setPage(1)
          }}
        >
          All skills
        </FilterChip>
        {SKILL_ORDER.map((s) => (
          <FilterChip
            key={s}
            active={skill === s}
            onClick={() => {
              setSkill(s)
              setPage(1)
            }}
          >
            {skillLabel(s)}
          </FilterChip>
        ))}
      </FilterRow>

      {query.isError ? (
        <ErrorState
          title="We could not load your attempts"
          message={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
        />
      ) : query.isPending ? (
        <div className="grid gap-2" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : query.data && query.data.items.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="font-medium">
            {skill === 'all'
              ? 'You have not sat a test yet'
              : `No ${skillLabel(skill)} attempts yet`}
          </p>
          <p className="mt-1 text-sm text-muted">
            Your band, your raw score and a full review appear here the moment you submit one.
          </p>
          <LinkButton
            href={skill === 'all' ? '/tests' : `/tests?skill=${skill}`}
            size="sm"
            className="mt-4"
          >
            Browse tests
          </LinkButton>
        </Card>
      ) : (
        <>
          <Card
            className={cn(
              'overflow-hidden transition-opacity',
              query.isFetching && 'opacity-60',
            )}
          >
            <ul className="divide-y divide-border">
              {query.data?.items.map((attempt) => (
                <AttemptRow key={attempt.id} attempt={attempt} />
              ))}
            </ul>
          </Card>
          <Pagination
            page={query.data?.page ?? page}
            pageSize={query.data?.page_size ?? PAGE_SIZE}
            total={query.data?.total ?? 0}
            onPage={setPage}
            unit="attempts"
          />
        </>
      )}
    </div>
  )
}
