'use client'

import { useQuery } from '@tanstack/react-query'

import { DashboardView } from '@/components/dashboard/dashboard-view'
import { ErrorState } from '@/components/dashboard/primitives'
import { Skeleton } from '@/components/ui'
import { api } from '@/lib/api'
import type { DashboardStats, User } from '@/types/api'

/**
 * `DashboardStats` carries no target band and no exam date, so the profile is fetched
 * alongside it. See the report — those two fields belong on the stats payload.
 */
export default function DashboardPage() {
  const statsQuery = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get<DashboardStats>('/users/me/stats'),
  })

  const userQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<User>('/users/me'),
  })

  if (statsQuery.isError) {
    return (
      <ErrorState
        title="We could not load your progress"
        message={statsQuery.error instanceof Error ? statsQuery.error.message : undefined}
        onRetry={() => void statsQuery.refetch()}
      />
    )
  }

  if (statsQuery.isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading your progress">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="grid gap-4 lg:grid-cols-5">
          <Skeleton className="h-72 w-full lg:col-span-3" />
          <Skeleton className="h-72 w-full lg:col-span-2" />
        </div>
      </div>
    )
  }

  return <DashboardView stats={statsQuery.data} user={userQuery.data} />
}
