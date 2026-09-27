'use client'

import { useEffect, useState } from 'react'

/**
 * Reactive media query. The reading pane needs a real branch, not a CSS one: rendering
 * both the split view and the tabbed view would duplicate every input in the accessibility
 * tree and give two elements the same id.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(query)
    const update = () => setMatches(list.matches)
    update()
    list.addEventListener?.('change', update)
    return () => list.removeEventListener?.('change', update)
  }, [query])

  return matches
}

export const DESKTOP = '(min-width: 1024px)'
