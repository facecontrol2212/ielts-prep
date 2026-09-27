'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AuthShell } from '@/components/marketing/auth-shell'
import { useCopy } from '@/components/marketing/locale'
import { Alert, Button } from '@/components/ui'
import { authErrorMessage, verifyEmailRequest } from '@/lib/auth'

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'done'; detail: string }
  | { kind: 'missing' }
  | { kind: 'failed'; detail: string }

export function VerifyEmailView() {
  const copy = useCopy()
  const [state, setState] = useState<State>({ kind: 'idle' })

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) {
      setState({ kind: 'missing' })
      return
    }
    let cancelled = false
    setState({ kind: 'checking' })
    verifyEmailRequest(token)
      .then((result) => {
        if (!cancelled) setState({ kind: 'done', detail: result.detail })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ kind: 'failed', detail: authErrorMessage(error, copy.auth.errors) })
        }
      })
    return () => {
      cancelled = true
    }
    // The token is read once on mount; a language change must not re-verify it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (state.kind === 'done') {
    return (
      <AuthShell title={copy.auth.verify.doneTitle}>
        <Alert tone="success">{copy.auth.verify.doneBody}</Alert>
        <Link href="/dashboard" className="mt-4 block">
          <Button className="w-full">{copy.auth.verify.goToDashboard}</Button>
        </Link>
      </AuthShell>
    )
  }

  if (state.kind === 'failed') {
    return (
      <AuthShell title={copy.auth.verify.failedTitle}>
        <div role="alert">
          <Alert tone="danger">{state.detail}</Alert>
        </div>
        <Link href="/login" className="mt-4 block">
          <Button variant="outline" className="w-full">
            {copy.auth.verify.goToLogin}
          </Button>
        </Link>
      </AuthShell>
    )
  }

  if (state.kind === 'missing') {
    return (
      <AuthShell title={copy.auth.verify.title}>
        <Alert tone="info">{copy.auth.verify.missingToken}</Alert>
        <Link href="/login" className="mt-4 block">
          <Button variant="outline" className="w-full">
            {copy.auth.verify.goToLogin}
          </Button>
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={copy.auth.verify.title}>
      <p className="text-sm text-muted" aria-live="polite">
        {copy.auth.verify.checking}
      </p>
    </AuthShell>
  )
}
