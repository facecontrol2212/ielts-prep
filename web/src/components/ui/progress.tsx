import { cn } from '@/lib/utils'

export function Progress({
  value,
  max = 100,
  className,
  tone = 'primary',
  label,
}: {
  value: number
  max?: number
  className?: string
  tone?: 'primary' | 'success' | 'warning' | 'danger'
  label?: string
}) {
  const pct = max === 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100))
  const bar = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[tone]
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}
    >
      <div className={cn('h-full rounded-full transition-all', bar)} style={{ width: `${pct}%` }} />
    </div>
  )
}
