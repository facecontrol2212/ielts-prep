'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { AuthShell } from '@/components/marketing/auth-shell'
import { PasswordField } from '@/components/marketing/form-field'
import { useCopy } from '@/components/marketing/locale'
import { Alert, Button } from '@/components/ui'
import { authErrorMessage, fieldErrors, resetPasswordRequest, resetPasswordSchema } from '@/lib/auth'

export function ResetPasswordForm() {
  const copy = useCopy()
  const [token, setToken] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [values, setValues] = useState({ password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token'))
    setReady(true)
  }, [])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const parsed = resetPasswordSchema(copy.auth.errors).safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      await resetPasswordRequest(token ?? '', parsed.data.password)
      setDone(true)
    } catch (error) {
      setFormError(authErrorMessage(error, copy.auth.errors))
    } finally {
      setSubmitting(false)
    }
  }

  const loginLink = (
    <Link href="/login" className="font-medium text-primary hover:underline">
      {copy.auth.reset.goToLogin}
    </Link>
  )

  if (done) {
    return (
      <AuthShell title={copy.auth.reset.doneTitle} footer={loginLink}>
        <Alert tone="success">{copy.auth.reset.doneBody}</Alert>
      </AuthShell>
    )
  }

  if (ready && !token) {
    return (
      <AuthShell title={copy.auth.reset.title} footer={loginLink}>
        <div role="alert">
          <Alert tone="warning">{copy.auth.reset.missingToken}</Alert>
        </div>
        <Link href="/forgot-password" className="mt-4 block">
          <Button variant="outline" className="w-full">
            {copy.auth.reset.requestNew}
          </Button>
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={copy.auth.reset.title}
      subtitle={copy.auth.reset.subtitle}
      error={formError}
      footer={loginLink}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <PasswordField
          id="reset-password"
          name="password"
          autoComplete="new-password"
          label={copy.auth.newPasswordLabel}
          value={values.password}
          error={errors.password}
          showStrength
          onChange={(event) => setValues((v) => ({ ...v, password: event.target.value }))}
        />
        <PasswordField
          id="reset-confirm"
          name="confirm"
          autoComplete="new-password"
          label={copy.auth.confirmLabel}
          value={values.confirm}
          error={errors.confirm}
          onChange={(event) => setValues((v) => ({ ...v, confirm: event.target.value }))}
        />
        <Button type="submit" size="lg" loading={submitting} className="w-full">
          {submitting ? copy.auth.reset.submitting : copy.auth.reset.submit}
        </Button>
      </form>
    </AuthShell>
  )
}
