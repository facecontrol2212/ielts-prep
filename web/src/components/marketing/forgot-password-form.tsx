'use client'

import Link from 'next/link'
import { useState } from 'react'

import { AuthShell } from '@/components/marketing/auth-shell'
import { TextField } from '@/components/marketing/form-field'
import { useCopy } from '@/components/marketing/locale'
import { Alert, Button } from '@/components/ui'
import { authErrorMessage, fieldErrors, forgotPasswordRequest, forgotPasswordSchema } from '@/lib/auth'

export function ForgotPasswordForm() {
  const copy = useCopy()
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const parsed = forgotPasswordSchema(copy.auth.errors).safeParse({ email })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      const result = await forgotPasswordRequest(parsed.data.email)
      setSent(result.detail)
    } catch (error) {
      setFormError(authErrorMessage(error, copy.auth.errors))
    } finally {
      setSubmitting(false)
    }
  }

  const backToLogin = (
    <Link href="/login" className="font-medium text-primary hover:underline">
      {copy.auth.forgot.backToLogin}
    </Link>
  )

  if (sent !== null) {
    return (
      <AuthShell title={copy.auth.forgot.sentTitle} footer={backToLogin}>
        <Alert tone="success">{sent}</Alert>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={copy.auth.forgot.title}
      subtitle={copy.auth.forgot.subtitle}
      error={formError}
      footer={backToLogin}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          label={copy.auth.emailLabel}
          placeholder={copy.auth.emailPlaceholder}
          value={email}
          error={errors.email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button type="submit" size="lg" loading={submitting} className="w-full">
          {submitting ? copy.auth.forgot.submitting : copy.auth.forgot.submit}
        </Button>
      </form>
    </AuthShell>
  )
}
