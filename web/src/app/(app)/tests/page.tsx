'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import { filtersFromParams } from '@/components/catalogue/query'
import { TestsCatalogue } from '@/components/catalogue/tests-catalogue'
import { Skeleton } from '@/components/ui'

function CatalogueFromUrl() {
  const params = useSearchParams()
  const page = Number(params.get('page'))
  return (
    <TestsCatalogue
      initialFilters={filtersFromParams(params)}
      initialPage={Number.isInteger(page) && page > 0 ? page : 1}
    />
  )
}

export default function TestsPage() {
  return (
    <Suspense
      fallback={
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      }
    >
      <CatalogueFromUrl />
    </Suspense>
  )
}
