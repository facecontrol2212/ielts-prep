'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { AuthShell } from '@/components/marketing/auth-shell'
import { PasswordField, TextField } from '@/components/marketing/form-field'
import { useCopy } from '@/components/marketing/locale'
import { Button } from '@/components/ui'
import { useAuth } from '@/hooks/use-auth'
import { authErrorMessage, fieldErrors, registerSchema } from '@/lib/auth'

export function RegisterForm() {
  const copy = useCopy()
  const router = useRouter()
  const { register } = useAuth()
  const [values, setValues] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const parsed = registerSchema(copy.auth.errors).safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      await register({
        email: parsed.data.email,
        password: parsed.data.password,
        full_name: parsed.data.full_name || undefined,
      })
      router.replace('/dashboard')
    } catch (error) {
      setFormError(authErrorMessage(error, copy.auth.errors))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title={copy.auth.register.title}
      subtitle={copy.auth.register.subtitle}
      error={formError}
      footer={
        <>
          {copy.auth.register.haveAccount}{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            {copy.auth.register.loginLink}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          id="register-name"
          name="full_name"
          autoComplete="name"
          label={copy.auth.nameLabel}
          hint={copy.auth.nameOptional}
          placeholder={copy.auth.namePlaceholder}
          value={values.full_name}
          error={errors.full_name}
          onChange={(event) => setValues((v) => ({ ...v, full_name: event.target.value }))}
        />

        <TextField
          id="register-email"
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

        <PasswordField
          id="register-password"
          name="password"
          autoComplete="new-password"
          label={copy.auth.passwordLabel}
          value={values.password}
          error={errors.password}
          showStrength
          onChange={(event) => setValues((v) => ({ ...v, password: event.target.value }))}
        />

        <PasswordField
          id="register-confirm"
          name="confirm"
          autoComplete="new-password"
          label={copy.auth.confirmLabel}
          value={values.confirm}
          error={errors.confirm}
          onChange={(event) => setValues((v) => ({ ...v, confirm: event.target.value }))}
        />

        <p className="text-xs leading-relaxed text-muted">{copy.auth.register.verifyNote}</p>

        <Button type="submit" size="lg" loading={submitting} className="w-full">
          {submitting ? copy.auth.register.submitting : copy.auth.register.submit}
        </Button>
      </form>
    </AuthShell>
  )
}
