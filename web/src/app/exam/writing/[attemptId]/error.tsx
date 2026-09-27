'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import { Button } from '@/components/ui'

export default function WritingExamError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('writing exam crashed', error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-lg font-semibold tracking-tight">Something broke in the test screen</h1>
      <p className="text-sm text-muted">
        Your answer is saved on the server — every draft is stored as you type, so nothing you
        wrote is gone. Reload to carry on from where you were.
      </p>
      {error.digest && <p className="font-mono text-xs text-muted">Reference: {error.digest}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}>Reload the test</Button>
        <Link href="/dashboard">
          <Button variant="outline">Back to dashboard</Button>
        </Link>
      </div>
    </main>
  )
}
