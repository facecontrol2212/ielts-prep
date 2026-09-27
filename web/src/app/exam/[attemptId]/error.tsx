'use client'

import { useEffect } from 'react'

import { Alert, Button } from '@/components/ui'

/**
 * Last line of defence. Anything the runner itself did not catch lands here, and the
 * message has to say the one thing a student in a timed test needs to hear first:
 * their answers are on the server.
 */
export default function ExamError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('exam runner crashed', error)
  }, [error])

  return (
    <div className="flex h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md space-y-4">
        <Alert tone="danger" title="Something went wrong with the test screen">
          Your saved answers are safe on the server. Reload the test to carry on from where
          you were — the clock is kept server-side, so nothing has been lost or gained.
        </Alert>
        <div className="flex gap-2">
          <Button onClick={reset}>Reload the test</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Hard refresh
          </Button>
        </div>
      </div>
    </div>
  )
}
