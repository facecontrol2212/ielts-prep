'use client'

import { Flag } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface PaletteItem {
  number: number
  questionId: string
  answered: boolean
  flagged: boolean
}

export interface PaletteSection {
  order: number
  title: string
  items: PaletteItem[]
}

/**
 * The numbered navigator along the bottom of the real IELTS client.
 * A square is filled when answered, ringed when flagged for review, and outlined when current.
 */
export function QuestionPalette({
  sections,
  current,
  onSelect,
  className,
}: {
  sections: PaletteSection[]
  current: number
  onSelect: (n: number) => void
  className?: string
}) {
  const answered = sections.reduce((n, s) => n + s.items.filter((i) => i.answered).length, 0)
  const total = sections.reduce((n, s) => n + s.items.length, 0)

  return (
    <nav
      aria-label="Question navigator"
      className={cn('border-t border-border bg-surface px-3 py-2', className)}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {sections.map((section) => (
          <div key={section.order} className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              {section.title}
            </span>
            <ul className="flex flex-wrap gap-1">
              {section.items.map((item) => (
                <li key={item.questionId}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.number)}
                    aria-current={current === item.number ? 'true' : undefined}
                    aria-label={[
                      `Question ${item.number}`,
                      item.answered ? 'answered' : 'not answered',
                      item.flagged ? 'flagged for review' : '',
                    ]
                      .filter(Boolean)
                      .join(', ')}
                    className={cn(
                      'relative flex h-8 w-8 items-center justify-center rounded-md border text-xs font-semibold transition-colors',
                      item.answered
                        ? 'border-exam-answered bg-exam-answered text-white'
                        : 'border-border bg-surface text-muted hover:border-muted',
                      current === item.number &&
                        'ring-2 ring-exam-current ring-offset-1 ring-offset-surface',
                    )}
                  >
                    {item.number}
                    {item.flagged && (
                      <Flag
                        className="absolute -right-1 -top-1 h-3 w-3 fill-exam-flagged text-exam-flagged"
                        aria-hidden
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <p className="ml-auto text-xs text-muted" aria-live="polite">
          <span className="font-semibold text-fg">{answered}</span> of {total} answered
        </p>
      </div>
    </nav>
  )
}
