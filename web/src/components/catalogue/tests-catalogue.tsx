'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'

import {
  attemptStateByTest,
  buildTestsPath,
  CATALOGUE_PAGE_SIZE,
  catalogueHref,
  DEFAULT_FILTERS,
  type TestFilters,
} from '@/components/catalogue/query'
import { TestCard } from '@/components/catalogue/test-card'
import { examHref, SKILL_ORDER } from '@/components/dashboard/format'
import {
  ErrorState,
  FilterChip,
  FilterRow,
  PageHeader,
  Pagination,
} from '@/components/dashboard/primitives'
import { Alert, Card, Skeleton } from '@/components/ui'
import { ApiError, api } from '@/lib/api'
import { cn, skillLabel } from '@/lib/utils'
import type { AttemptHistoryItem, AttemptSession, Page, Skill, TestSummary } from '@/types/api'

const SELECT_CLASS =
  'h-8 rounded-lg border border-border bg-surface px-2 text-sm text-fg disabled:opacity-50'

export function TestsCatalogue({
  initialFilters = DEFAULT_FILTERS,
  initialPage = 1,
}: {
  initialFilters?: TestFilters
  initialPage?: number
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<TestFilters>(initialFilters)
  const [page, setPage] = useState(initialPage)
  const [startError, setStartError] = useState<string | null>(null)

  const path = buildTestsPath(filters, page)

  const testsQuery = useQuery({
    queryKey: ['tests', path],
    queryFn: () => api.get<Page<TestSummary>>(path),
    placeholderData: keepPreviousData,
  })

  const attemptsQuery = useQuery({
    queryKey: ['my-attempts', 'catalogue'],
    queryFn: () => api.get<Page<AttemptHistoryItem>>('/users/me/attempts?page=1&page_size=100'),
  })

  const states = useMemo(
    () => attemptStateByTest(attemptsQuery.data?.items ?? []),
    [attemptsQuery.data],
  )

  const startAttempt = useMutation({
    mutationFn: (test: TestSummary) => api.post<AttemptSession>('/attempts', { test_id: test.id }),
    onSuccess: (session) => {
      setStartError(null)
      router.push(examHref(session.test.skill, session.attempt.id))
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 409) {
        setStartError(
          'You already have this test open. Resume it from the card — starting again would lose the answers you have saved.',
        )
        void queryClient.invalidateQueries({ queryKey: ['my-attempts'] })
        return
      }
      setStartError(
        error instanceof Error ? error.message : 'We could not start that test. Try again.',
      )
    },
  })

  const apply = useCallback(
    (next: Partial<TestFilters>) => {
      const merged = { ...filters, ...next }
      setFilters(merged)
      setPage(1)
      router.replace(catalogueHref(merged, 1), { scroll: false })
    },
    [filters, router],
  )

  const goToPage = useCallback(
    (next: number) => {
      setPage(next)
      router.replace(catalogueHref(filters, next), { scroll: false })
    },
    [filters, router],
  )

  const data = testsQuery.data

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Tests"
        description="Full-length papers under exam conditions. The clock starts when you press start."
      />

      {/* One filter row, above everything it scopes. */}
      <div className="flex flex-col gap-2">
        <FilterRow label="Filter tests by skill">
          <FilterChip active={filters.skill === 'all'} onClick={() => apply({ skill: 'all' })}>
            All skills
          </FilterChip>
          {SKILL_ORDER.map((skill: Skill) => (
            <FilterChip
              key={skill}
              active={filters.skill === skill}
              onClick={() => apply({ skill })}
            >
              {skillLabel(skill)}
            </FilterChip>
          ))}
        </FilterRow>
        <FilterRow label="Filter tests by variant and difficulty">
          <label className="inline-flex items-center gap-2 text-sm text-muted">
            Variant
            <select
              className={SELECT_CLASS}
              aria-label="Variant"
              value={filters.variant}
              onChange={(e) =>
                apply({ variant: e.target.value as TestFilters['variant'] })
              }
            >
              <option value="all">Any</option>
              <option value="academic">Academic</option>
              <option value="general">General Training</option>
            </select>
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-muted">
            Difficulty
            <select
              className={SELECT_CLASS}
              aria-label="Difficulty"
              value={String(filters.difficulty)}
              onChange={(e) =>
                apply({
                  difficulty: e.target.value === 'all' ? 'all' : Number(e.target.value),
                })
              }
            >
              <option value="all">Any</option>
              <option value="1">Foundation</option>
              <option value="2">Easy</option>
              <option value="3">Standard</option>
              <option value="4">Hard</option>
              <option value="5">Exam-hard</option>
            </select>
          </label>
        </FilterRow>
      </div>

      {startError && (
        <Alert tone="warning" title="That test is already open">
          {startError}
        </Alert>
      )}

      {testsQuery.isError ? (
        <ErrorState
          title="We could not load the test list"
          message={
            testsQuery.error instanceof Error ? testsQuery.error.message : undefined
          }
          onRetry={() => void testsQuery.refetch()}
        />
      ) : testsQuery.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="font-medium">No test matches those filters</p>
          <p className="mt-1 text-sm text-muted">
            Clear a filter, or browse every skill — new papers are added regularly.
          </p>
          <button
            type="button"
            className="mt-3 text-sm font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => apply(DEFAULT_FILTERS)}
          >
            Clear all filters
          </button>
        </Card>
      ) : (
        <>
          {/* Refetching holds the previous render at reduced opacity — no skeleton flash. */}
          <div
            className={cn(
              'grid gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-3',
              testsQuery.isFetching && 'opacity-60',
            )}
          >
            {data?.items.map((test) => (
              <TestCard
                key={test.id}
                test={test}
                state={states.get(test.id)}
                starting={startAttempt.isPending && startAttempt.variables?.id === test.id}
                onStart={(t) => startAttempt.mutate(t)}
              />
            ))}
          </div>
          <Pagination
            page={data?.page ?? page}
            pageSize={data?.page_size ?? CATALOGUE_PAGE_SIZE}
            total={data?.total ?? 0}
            onPage={goToPage}
            unit="tests"
          />
        </>
      )}
    </div>
  )
}
