'use client'

import Link from 'next/link'
import { AlertCircle, RotateCw } from 'lucide-react'

import { Button, Card, Skeleton } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * A link that looks like a button. The Button primitive renders a real `<button>` and has
 * no `asChild`, and a `<button>` wrapping an `<a>` is invalid markup — so navigation gets
 * its own component rather than a nested control.
 */
const LINK_BUTTON_VARIANTS = {
  primary: 'bg-primary text-primary-fg hover:bg-primary/90 shadow-sm',
  outline: 'border border-border bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
} as const

const LINK_BUTTON_SIZES = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
} as const

export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Link>, 'href'> & {
  href: string
  variant?: keyof typeof LINK_BUTTON_VARIANTS
  size?: keyof typeof LINK_BUTTON_SIZES
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        LINK_BUTTON_VARIANTS[variant],
        LINK_BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  )
}

/**
 * Small pieces shared by the dashboard, the catalogue, the attempt history and the
 * results screen. They would sit better in `src/components/common/`; this agent may
 * only write under dashboard/ results/ catalogue/, so they live here.
 */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="no-print shrink-0">{action}</div>}
    </header>
  )
}

/** Every fetch in this area fails the same way: say what broke, offer the retry. */
export function ErrorState({
  title = 'We could not load this',
  message,
  onRetry,
}: {
  title?: string
  message?: string
  onRetry: () => void
}) {
  return (
    <Card className="flex flex-col items-start gap-3 p-6">
      <div className="flex items-center gap-2 text-danger">
        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
        <p className="font-semibold">{title}</p>
      </div>
      <p className="text-sm text-muted">
        {message ?? 'The connection dropped or the server is busy. Nothing was lost.'}
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCw className="h-4 w-4" aria-hidden />
        Try again
      </Button>
    </Card>
  )
}

export function CardsSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4', className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  )
}

/**
 * A stat tile: label, value, optional footnote. The value uses proportional figures —
 * `tabular-nums` makes a large standalone number look loose.
 */
export function StatTile({
  label,
  value,
  footnote,
  tone = 'default',
  icon,
}: {
  label: string
  value: string
  footnote?: string
  tone?: 'default' | 'urgent'
  icon?: React.ReactNode
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <p
        className={cn(
          'mt-1.5 text-2xl font-semibold leading-none',
          tone === 'urgent' ? 'text-accent' : 'text-fg',
        )}
      >
        {value}
      </p>
      {footnote && <p className="mt-1.5 text-xs text-muted">{footnote}</p>}
    </Card>
  )
}

/**
 * A meter: one bar against its own track.
 *
 * Data-viz marks: the fill is <= 24px thick with a 4px rounded data-end and a square
 * baseline edge; the track is the same hue, lightened, so state reads across the whole bar.
 * `color` is a chart-palette hue, so the caller must also render the value as text.
 */
export function Meter({
  value,
  max = 100,
  color,
  label,
  className,
  markerValue,
  markerLabel,
}: {
  value: number
  max?: number
  color: string
  label: string
  className?: string
  /** Optional threshold tick (a target band), drawn in ink — never in a series colour. */
  markerValue?: number
  markerLabel?: string
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100))
  const markerPct =
    markerValue == null || max <= 0 ? null : Math.min(100, Math.max(0, (markerValue / max) * 100))

  return (
    <div
      role="meter"
      aria-valuenow={Math.round(value * 10) / 10}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn('relative h-2 w-full overflow-hidden rounded-sm bg-surface-2', className)}
      // the track is the fill's own hue, lightened, so state reads across the whole bar
      style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, rgb(var(--surface)))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-r-[4px]"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
      {markerPct != null && (
        <span
          aria-hidden
          title={markerLabel}
          className="absolute inset-y-0 w-0.5 bg-fg"
          style={{ left: `calc(${markerPct}% - 1px)` }}
        />
      )}
    </div>
  )
}

/** One filter row, above the content it scopes. Never inside a chart card. */
export function FilterRow({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="no-print flex flex-wrap items-center gap-x-2 gap-y-2"
    >
      {children}
    </div>
  )
}

export function FilterChip({
  active,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...props}
      className={cn(
        'inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-fg'
          : 'border-border bg-surface text-muted hover:bg-surface-2 hover:text-fg',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  unit,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
  unit: string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <nav
      className="no-print flex items-center justify-between gap-3 pt-2"
      aria-label={`${unit} pagination`}
    >
      <p className="text-sm text-muted tabular-nums">
        {first}–{last} of {total} {unit}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  )
}
