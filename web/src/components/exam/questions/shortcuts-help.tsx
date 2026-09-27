'use client'

import { Keyboard } from 'lucide-react'

const SHORTCUTS: { keys: string[]; what: string }[] = [
  { keys: ['→'], what: 'Next question' },
  { keys: ['←'], what: 'Previous question' },
  { keys: ['Enter'], what: 'From a text box, jump to the next question' },
  { keys: ['F'], what: 'Flag the current question for review' },
  { keys: ['Tab'], what: 'Move through the answers on screen' },
]

/**
 * The shortcut list, parked out of the way. A `details` popover rather than a modal:
 * it must never steal focus from an answer the student is mid-way through typing.
 */
export function ShortcutsHelp() {
  return (
    <details className="group fixed bottom-20 right-3 z-20 lg:bottom-24">
      <summary
        aria-label="Keyboard shortcuts"
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full border border-border bg-surface text-muted shadow-card hover:text-fg [&::-webkit-details-marker]:hidden"
      >
        <Keyboard className="h-4 w-4" aria-hidden />
      </summary>
      <div className="absolute bottom-11 right-0 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-surface p-3 shadow-pop">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
          Keyboard shortcuts
        </h2>
        <dl className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <div key={s.what} className="flex items-baseline gap-3 text-sm">
              <dt className="flex shrink-0 gap-1">
                {s.keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-semibold text-fg"
                  >
                    {key}
                  </kbd>
                ))}
              </dt>
              <dd className="min-w-0 flex-1 text-muted">{s.what}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 border-t border-border pt-2 text-xs text-muted">
          Arrows and F work when you are not typing in an answer box.
        </p>
      </div>
    </details>
  )
}
