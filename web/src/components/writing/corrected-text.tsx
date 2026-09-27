'use client'

import { X } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

import {
  countByIssue,
  issueStyle,
  layoutCorrections,
  type MarkSegment,
} from '@/components/writing/corrections'
import { cn } from '@/lib/utils'
import type { Correction } from '@/types/api'

/**
 * The student's own essay with the examiner's marks on it.
 *
 * Rendering happens over `layoutCorrections`, which has already thrown away anything whose
 * offsets do not match the text. Whatever survives is guaranteed to tile the essay exactly,
 * so the text between marks is always the original text, byte for byte.
 */
export function CorrectedText({
  text,
  corrections,
}: {
  text: string
  corrections: readonly Correction[] | null | undefined
}) {
  const { segments, applied, dropped } = layoutCorrections(text, corrections)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const counts = countByIssue(applied)

  const close = useCallback(() => setOpenKey(null), [])

  useEffect(() => {
    if (!openKey) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openKey, close])

  return (
    <section
      aria-labelledby="marked-essay-title"
      className="rounded-2xl border border-border bg-surface shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 id="marked-essay-title" className="text-base font-semibold tracking-tight">
            Your writing, marked up
          </h2>
          <p className="text-sm text-muted">
            {applied.length === 0
              ? 'No sentence-level corrections for this task.'
              : `${applied.length} ${applied.length === 1 ? 'correction' : 'corrections'} — select one to read the suggestion.`}
          </p>
        </div>
        {counts.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {counts.map(({ issue, count }) => (
              <li key={issue}>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                    issueStyle(issue).chip,
                  )}
                >
                  <span
                    aria-hidden
                    className={cn('h-1.5 w-1.5 rounded-full', issueStyle(issue).dot)}
                  />
                  {issueStyle(issue).label} {count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        className="whitespace-pre-wrap px-5 py-5 font-serif text-passage text-fg"
        data-testid="marked-essay"
        onClick={(e) => {
          if (e.target === e.currentTarget) close()
        }}
      >
        {segments.map((segment) =>
          segment.kind === 'text' ? (
            <span key={segment.key}>{segment.text}</span>
          ) : (
            <CorrectionMark
              key={segment.key}
              segment={segment}
              open={openKey === segment.key}
              onToggle={() => setOpenKey((k) => (k === segment.key ? null : segment.key))}
              onClose={close}
            />
          ),
        )}
      </div>

      {dropped.length > 0 && (
        <p className="border-t border-border px-5 py-3 text-xs text-muted">
          {dropped.length} further {dropped.length === 1 ? 'suggestion' : 'suggestions'} could not
          be matched to a place in your text and {dropped.length === 1 ? 'was' : 'were'} left out.
        </p>
      )}
    </section>
  )
}

function CorrectionMark({
  segment,
  open,
  onToggle,
  onClose,
}: {
  segment: MarkSegment
  open: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const id = useId()
  const popRef = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)
  const style = issueStyle(segment.correction.issue)

  // Keep the popover inside the viewport on a 360px phone without a positioning library.
  useLayoutEffect(() => {
    if (!open) {
      setShift(0)
      return
    }
    const el = popRef.current
    if (!el || typeof el.getBoundingClientRect !== 'function') return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return
    const gutter = 12
    const viewport = window.innerWidth || rect.right + gutter
    let next = 0
    if (rect.right > viewport - gutter) next = viewport - gutter - rect.right
    if (rect.left + next < gutter) next = gutter - rect.left
    if (next !== 0) setShift(next)
  }, [open])

  return (
    <span className="relative inline">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${style.label} correction ${segment.index}: ${segment.text}`}
        className={cn(
          'cursor-pointer rounded-[3px] px-0.5 underline decoration-2 underline-offset-4',
          'hover:brightness-95 focus-visible:ring-2 focus-visible:ring-primary',
          style.mark,
          open && 'ring-2 ring-primary',
        )}
      >
        {segment.text}
      </button>

      {open && (
        <span
          ref={popRef}
          id={id}
          role="dialog"
          aria-label={`${style.label} correction ${segment.index}`}
          style={{ transform: `translateX(${shift}px)` }}
          className={cn(
            'absolute left-0 top-full z-30 mt-2 block w-[min(20rem,calc(100vw-2rem))]',
            'animate-slide-up rounded-xl border border-border bg-surface p-4 text-left',
            'font-sans text-sm shadow-pop',
          )}
        >
          <span className="mb-2 flex items-center justify-between gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                style.chip,
              )}
            >
              {style.label}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close correction"
              className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>

          <span className="block text-[0.9375rem] leading-relaxed">
            <s className="text-muted">{segment.correction.original}</s>{' '}
            <span aria-hidden className="text-muted">
              →
            </span>{' '}
            <strong className="font-semibold text-success">{segment.correction.suggestion}</strong>
          </span>

          {segment.correction.explanation && (
            <span className="mt-2 block text-sm text-muted">{segment.correction.explanation}</span>
          )}
        </span>
      )}
    </span>
  )
}
