'use client'

import { useEffect, useRef } from 'react'

import { Button } from '@/components/ui'

/**
 * Submit confirmation. Native <dialog> so focus trapping and Escape come for free —
 * and so it can never be confused with a browser alert(), which would freeze the exam.
 */
export function SubmitDialog({
  open,
  answered,
  total,
  flagged,
  onCancel,
  onConfirm,
  submitting,
}: {
  open: boolean
  answered: number
  total: number
  flagged: number
  onCancel: () => void
  onConfirm: () => void
  submitting?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  const unanswered = total - answered

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      className="rounded-2xl border border-border bg-surface p-0 text-fg shadow-pop backdrop:bg-black/50"
      aria-labelledby="submit-title"
    >
      <div className="w-[min(28rem,90vw)] p-6">
        <h2 id="submit-title" className="text-lg font-semibold">
          Submit your test?
        </h2>
        <p className="mt-2 text-sm text-muted">
          You cannot change your answers after submitting.
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          <Stat label="Answered" value={answered} />
          <Stat label="Unanswered" value={unanswered} tone={unanswered > 0 ? 'danger' : undefined} />
          <Stat label="Flagged" value={flagged} tone={flagged > 0 ? 'warning' : undefined} />
        </dl>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Keep working
          </Button>
          <Button variant="accent" onClick={onConfirm} loading={submitting}>
            Submit
          </Button>
        </div>
      </div>
    </dialog>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'danger' | 'warning'
}) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-fg'
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <dd className={`text-xl font-semibold tabular-nums ${color}`}>{value}</dd>
      <dt className="text-xs text-muted">{label}</dt>
    </div>
  )
}
