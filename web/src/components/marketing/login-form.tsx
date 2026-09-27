'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { AuthShell } from '@/components/marketing/auth-shell'
import { PasswordField, TextField } from '@/components/marketing/form-field'
import { useCopy } from '@/components/marketing/locale'
import { Button } from '@/components/ui'
import { useAuth } from '@/hooks/use-auth'
import { authErrorMessage, fieldErrors, loginSchema } from '@/lib/auth'

/** Only ever follow a same-site path, never an absolute URL from the query string. */
export function safeNext(raw: string | null, fallback = '/dashboard'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return fallback
  return raw
}

export function LoginForm() {
  const copy = useCopy()
  const router = useRouter()
  const { login } = useAuth()
  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [next, setNext] = useState('/dashboard')

  useEffect(() => {
    setNext(safeNext(new URLSearchParams(window.location.search).get('next')))
  }, [])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const parsed = loginSchema(copy.auth.errors).safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      await login(parsed.data.email, parsed.data.password)
      router.replace(next)
    } catch (error) {
      setFormError(authErrorMessage(error, copy.auth.errors))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title={copy.auth.login.title}
      subtitle={copy.auth.login.subtitle}
      error={formError}
      footer={
        <>
          {copy.auth.login.noAccount}{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            {copy.auth.login.registerLink}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          label={copy.auth.emailLabel}
          placeholder={copy.auth.emailPlaceholder}
          value={values.email}
          error={errors.email}
          onChange={(event) => setValues((v) => ({ ...v, email: event.target.value }))}
        />

        <div>
          <PasswordField
            id="login-password"
            name="password"
            autoComplete="current-password"
            label={copy.auth.passwordLabel}
            value={values.password}
            error={errors.password}
            onChange={(event) => setValues((v) => ({ ...v, password: event.target.value }))}
          />
          <div className="mt-2 text-right">
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary hover:underline"
            >
              {copy.auth.login.forgot}
            </Link>
          </div>
        </div>

        <Button type="submit" size="lg" loading={submitting} className="mt-1 w-full">
          {submitting ? copy.auth.login.submitting : copy.auth.login.submit}
        </Button>
      </form>
    </AuthShell>
  )
}
