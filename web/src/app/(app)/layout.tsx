'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { AppNav } from '@/components/layout/app-nav'
import { Skeleton } from '@/components/ui'
import { tokenStore } from '@/lib/api'

/**
 * The signed-in shell.
 *
 * The gate is deliberately client-side: tokens live in localStorage so the exam runner can
 * survive a hard refresh mid-sitting, and the server cannot read them. Nothing sensitive is
 * rendered before the check — the API rejects an unauthenticated request anyway; this only
 * saves the student from staring at a broken page.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [authorised, setAuthorised] = useState(false)

  useEffect(() => {
    if (tokenStore.access) setAuthorised(true)
    else router.replace('/login')
  }, [router])

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <AppNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-10">
        {authorised ? (
          children
        ) : (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Checking your session">
            <Skeleton className="h-10 w-56" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
      </main>
    </div>
  )
}
