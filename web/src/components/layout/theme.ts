'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'

/**
 * Light/dark preference.
 *
 * globals.css already handles the un-stamped "system" case through
 * prefers-color-scheme, so this only has to stamp `data-theme` on
 * documentElement when the student overrides the system, and remember it.
 */

export type ThemeChoice = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'ielts.theme'

let choice: ThemeChoice = 'system'
let systemDark = false
let hydrated = false
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * The snapshot has to carry the *resolved* theme, not just the stored choice:
 * when the OS is dark and the student has chosen nothing, `choice` never
 * changes and useSyncExternalStore would bail out of the re-render that swaps
 * the toggle's icon.
 */
type Snapshot = `${ThemeChoice}|${'light' | 'dark'}`

function getSnapshot(): Snapshot {
  return `${choice}|${systemDark ? 'dark' : 'light'}`
}

function getServerSnapshot(): Snapshot {
  return 'system|light'
}

function apply(next: ThemeChoice) {
  const root = document.documentElement
  if (next === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', next)
}

export function setTheme(next: ThemeChoice) {
  choice = next
  try {
    if (next === 'system') window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Blocked storage: the choice still applies for this visit.
  }
  apply(next)
  emit()
}

function readStored(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function hydrate(): () => void {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  const sync = () => {
    const next = media?.matches ?? false
    if (next !== systemDark) {
      systemDark = next
      emit()
    }
  }
  sync()
  media?.addEventListener?.('change', sync)

  if (!hydrated) {
    hydrated = true
    const stored = readStored()
    if (stored !== choice) {
      choice = stored
      apply(stored)
      emit()
    }
  }
  return () => media?.removeEventListener?.('change', sync)
}

/** Test-only: forget the stored choice. */
export function resetThemeForTests() {
  choice = 'system'
  hydrated = false
  emit()
}

export function useTheme(): {
  choice: ThemeChoice
  resolved: 'light' | 'dark'
  setTheme: (next: ThemeChoice) => void
  toggle: () => void
} {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  useEffect(hydrate, [])
  const [current, system] = snapshot.split('|') as [ThemeChoice, 'light' | 'dark']
  const resolved: 'light' | 'dark' = current === 'system' ? system : current
  return {
    choice: current,
    resolved,
    setTheme: useCallback((next: ThemeChoice) => setTheme(next), []),
    toggle: useCallback(() => setTheme(resolved === 'dark' ? 'light' : 'dark'), [resolved]),
  }
}
