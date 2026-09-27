'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useMemo } from 'react'

import { ErrorState } from '@/components/dashboard/primitives'
import { ResultView } from '@/components/results/result-view'
import { Skeleton } from '@/components/ui'
import { api } from '@/lib/api'
import type { AttemptResult, AttemptSession } from '@/types/api'

export default function ResultPage() {
  const params = useParams<{ attemptId: string }>()
  const attemptId = params?.attemptId

  const resultQuery = useQuery({
    queryKey: ['attempt-result', attemptId],
    queryFn: () => api.get<AttemptResult>(`/attempts/${attemptId}/result`),
    enabled: Boolean(attemptId),
  })

  /**
   * `QuestionReview` does not carry `is_flagged`, so the flags the student set during the
   * sitting are read back off the attempt session. Best effort: if it fails, the review
   * still renders and only the "only flagged" filter is unavailable. (See the report —
   * this really belongs on QuestionReview.)
   */
  const sessionQuery = useQuery({
    queryKey: ['attempt-session', attemptId],
    queryFn: () => api.get<AttemptSession>(`/attempts/${attemptId}`),
    enabled: Boolean(attemptId) && resultQuery.isSuccess,
    retry: false,
    staleTime: Infinity,
  })

  const flaggedIds = useMemo(() => {
    const answers = sessionQuery.data?.answers
    if (!answers) return undefined
    return new Set(answers.filter((a) => a.is_flagged).map((a) => a.question_id))
  }, [sessionQuery.data])

  if (resultQuery.isError) {
    return (
      <ErrorState
        title="We could not load this result"
        message={
          resultQuery.error instanceof Error
            ? resultQuery.error.message
            : 'The attempt may still be being marked.'
        }
        onRetry={() => void resultQuery.refetch()}
      />
    )
  }

  if (resultQuery.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading your result">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-44 w-full" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return <ResultView result={resultQuery.data} flaggedIds={flaggedIds} />
}
