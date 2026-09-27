'use client'

import { useState } from 'react'

import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Section } from '@/types/api'

/**
 * The question paper half of the split pane: instructions, the prompt itself, and — for
 * Academic Task 1 — the chart the student has to describe. On a phone the prompt collapses
 * so the editor is not pushed off screen, but it starts open: nobody writes before reading.
 */
export function PromptPanel({
  section,
  taskNumber,
  suggestedMinutes,
  className,
}: {
  section: Section
  taskNumber: number
  suggestedMinutes: number
  className?: string
}) {
  const [open, setOpen] = useState(true)
  const headingId = `task-${taskNumber}-prompt`

  return (
    <section
      aria-labelledby={headingId}
      className={cn('flex min-h-0 flex-col border-border bg-exam-paper', className)}
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-sm font-semibold tracking-tight">
            {section.title || `Writing Task ${taskNumber}`}
          </h2>
          <p className="text-xs text-muted">
            Spend about {suggestedMinutes} minutes · at least {section.min_words ?? 250} words
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden"
          aria-expanded={open}
          aria-controls={`${headingId}-body`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide' : 'Show'} question
        </Button>
      </div>

      <div
        id={`${headingId}-body`}
        className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-4', open ? 'block' : 'hidden lg:block')}
      >
        {section.instructions && (
          <p className="mb-4 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-fg">
            {section.instructions}
          </p>
        )}

        {section.prompt_html ? (
          <div
            className="passage"
            // Prompt HTML is authored by us through the admin importer, the same trust boundary
            // as reading passages. It never contains student input.
            dangerouslySetInnerHTML={{ __html: section.prompt_html }}
          />
        ) : (
          <p className="text-sm text-muted">This task has no prompt text.</p>
        )}

        {section.image_url && (
          <figure className="mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={section.image_url}
              alt={`Chart for Writing Task ${taskNumber}. Describe what it shows in your answer.`}
              className="w-full rounded-xl border border-border bg-surface"
            />
            <figcaption className="mt-2 text-xs text-muted">
              Summarise the main features and make comparisons where relevant.
            </figcaption>
          </figure>
        )}
      </div>
    </section>
  )
}
