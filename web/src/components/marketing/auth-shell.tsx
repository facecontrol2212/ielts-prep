'use client'

import { Alert, Card, CardContent, CardHeader } from '@/components/ui'

/**
 * The frame every auth page shares: heading, an optional form-level error, the
 * fields, and a line of links underneath the card.
 */
export function AuthShell({
  title,
  subtitle,
  error,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  error?: string | null
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="w-full max-w-md">
      <Card>
        <CardHeader className="p-6 pb-2">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle && <p className="text-sm leading-relaxed text-muted">{subtitle}</p>}
        </CardHeader>
        <CardContent className="p-6 pt-4">
          {error && (
            <div role="alert" className="mb-4">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
          {children}
        </CardContent>
      </Card>
      {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
    </div>
  )
}
