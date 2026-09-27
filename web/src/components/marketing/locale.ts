'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'

import { type Copy, type Lang, LANGS, dictionary } from '@/components/marketing/copy'

/**
 * Language selection as a module-level store rather than a context provider.
 *
 * The signed-in shell (owned by another agent) renders <AppNav /> without
 * wrapping it in anything of ours, so the language toggle has to work with no
 * provider above it. A store also keeps the first client render identical to
 * the server render: it always starts at 'en' and only picks up the stored
 * preference in an effect, after hydration.
 */

const STORAGE_KEY = 'ielts.lang'
const DEFAULT_LANG: Lang = 'en'

let current: Lang = DEFAULT_LANG
let hydrated = false
const listeners = new Set<() => void>()

function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value)
}

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): Lang {
  return current
}

function getServerSnapshot(): Lang {
  return DEFAULT_LANG
}

export function setLang(lang: Lang) {
  if (current === lang) return
  current = lang
  try {
    window.localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // Private mode or blocked storage: the choice still applies to this tab.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang
  emit()
}

/** Read the stored preference once, after hydration. */
function hydrate() {
  if (hydrated) return
  hydrated = true
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    stored = null
  }
  if (isLang(stored) && stored !== current) {
    current = stored
    document.documentElement.lang = stored
    emit()
  }
}

/** Test-only: forget the hydration guard and go back to English. */
export function resetLangForTests() {
  current = DEFAULT_LANG
  hydrated = false
  emit()
}

export function useLang(): { lang: Lang; setLang: (lang: Lang) => void } {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  useEffect(hydrate, [])
  return { lang, setLang: useCallback((next: Lang) => setLang(next), []) }
}

/** The dictionary for the active language. */
export function useCopy(): Copy {
  const { lang } = useLang()
  return dictionary[lang]
}
