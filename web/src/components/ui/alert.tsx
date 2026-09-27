import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

const tones = {
  info: { cls: 'border-primary/30 bg-primary-soft/50 text-fg', Icon: Info },
  success: { cls: 'border-success/30 bg-success/10 text-fg', Icon: CheckCircle2 },
  warning: { cls: 'border-warning/30 bg-warning/10 text-fg', Icon: AlertTriangle },
  danger: { cls: 'border-danger/30 bg-danger/10 text-fg', Icon: XCircle },
} as const

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof tones
  title?: string
  children?: React.ReactNode
  className?: string
}) {
  const { cls, Icon } = tones[tone]
  return (
    <div role="status" className={cn('flex gap-3 rounded-xl border p-4 text-sm', cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  )
}
