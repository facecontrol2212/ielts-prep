'use client'

import { LANGS, LANG_NAMES } from '@/components/marketing/copy'
import { useLang } from '@/components/marketing/locale'
import { cn } from '@/lib/utils'

/** A two-segment switch. Uzbek students read both, so both stay visible. */
export function LangToggle({ className }: { className?: string }) {
  const { lang, setLang } = useLang()

  return (
    <div
      className={cn(
        'inline-flex h-9 items-center rounded-lg border border-border bg-surface p-0.5',
        className,
      )}
    >
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          title={LANG_NAMES[code]}
          className={cn(
            'h-8 rounded-[0.4rem] px-2.5 text-xs font-semibold uppercase tracking-wide transition-colors',
            lang === code ? 'bg-primary text-primary-fg' : 'text-muted hover:text-fg',
          )}
        >
          {code}
          <span className="sr-only"> — {LANG_NAMES[code]}</span>
        </button>
      ))}
    </div>
  )
}
