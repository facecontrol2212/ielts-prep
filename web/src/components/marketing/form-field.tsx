'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useId, useState } from 'react'

import { useCopy } from '@/components/marketing/locale'
import { Input, Label } from '@/components/ui'
import { type PasswordStrength, passwordStrength } from '@/lib/auth'
import { cn } from '@/lib/utils'

export function TextField({
  id,
  label,
  hint,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string
  label: string
  hint?: string
  error?: string
}) {
  const errorId = `${id}-error`
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {hint && <span className="ml-1.5 font-normal text-muted">({hint})</span>}
      </Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

const BARS = [0, 1, 2, 3] as const

function StrengthMeter({ value, strength }: { value: string; strength: PasswordStrength }) {
  const copy = useCopy()
  const tone =
    strength.tone === 'success'
      ? 'bg-success'
      : strength.tone === 'warning'
        ? 'bg-warning'
        : 'bg-danger'

  return (
    <div className="mt-1">
      <div className="flex items-center gap-2">
        <div className="flex h-1.5 flex-1 gap-1" aria-hidden>
          {BARS.map((bar) => (
            <span
              key={bar}
              className={cn(
                'h-full flex-1 rounded-full',
                value && bar < strength.score ? tone : 'bg-surface-2',
              )}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-muted" aria-live="polite">
          {value ? `${copy.auth.strength}: ${copy.auth.strengthLevels[strength.score]}` : ''}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{copy.auth.strengthHint}</p>
    </div>
  )
}

export function PasswordField({
  id,
  label,
  error,
  showStrength,
  value,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & {
  id: string
  label: string
  error?: string
  showStrength?: boolean
  value: string
}) {
  const copy = useCopy()
  const [visible, setVisible] = useState(false)
  const errorId = useId()
  const strength = passwordStrength(value)

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          className="pr-11"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? copy.auth.hide : copy.auth.show}
          aria-pressed={visible}
          className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {showStrength && <StrengthMeter value={value} strength={strength} />}
    </div>
  )
}
