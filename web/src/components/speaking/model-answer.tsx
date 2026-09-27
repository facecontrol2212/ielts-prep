'use client'

import { ChevronDown, Eye } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'
import type { SpeakingQuestion } from '@/types/api'

/**
 * Hidden until asked for, deliberately. Reading a band-8 answer before you try one feels like
 * learning and isn't: the useful work is noticing the gap between your take and the model.
 */
export function ModelAnswer({ question }: { question: SpeakingQuestion }) {
  const [open, setOpen] = useState(false)
  const phrases = question.useful_phrases ?? []
  const hasContent = Boolean(question.model_answer) || phrases.length > 0

  // Re-hide when the question changes, or the next question arrives pre-spoiled.
  useEffect(() => setOpen(false), [question.id])

  if (!hasContent) return null

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-card">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="model-answer-body"
          className="flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left hover:bg-surface-2"
        >
          <Eye className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-fg">
              {open ? 'Model answer' : 'Show model answer'}
            </span>
            {!open && (
              <span className="block text-xs text-muted">Record your own attempt first.</span>
            )}
          </span>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </button>
      </h2>

      <div id="model-answer-body" hidden={!open} className="space-y-4 px-5 pb-5">
        {question.model_answer && (
          <p className="whitespace-pre-wrap font-serif text-[1.0625rem] leading-relaxed text-fg">
            {question.model_answer}
          </p>
        )}

        {phrases.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Useful phrases
            </h3>
            <dl className="mt-2 divide-y divide-border rounded-xl border border-border">
              {phrases.map((phrase, i) => (
                <div key={i} className="px-3 py-2">
                  <dt className="text-sm font-medium text-fg">&ldquo;{phrase.phrase}&rdquo;</dt>
                  <dd className="text-xs text-muted">{phrase.use}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </section>
  )
}
