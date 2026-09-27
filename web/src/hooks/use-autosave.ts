'use client'

import { useCallback, useEffect, useRef } from 'react'

import { api } from '@/lib/api'
import { useExamStore } from '@/lib/exam-store'

const INTERVAL_MS = 10_000

/**
 * Persists dirty answers every 10s, on every change (debounced), and on page hide.
 * Losing an hour of exam work to a closed laptop lid is the one failure we cannot ship.
 */
export function useAutosave(attemptId: string | null, enabled: boolean) {
  const inFlight = useRef(false)
  const debounce = useRef<number | null>(null)

  const flush = useCallback(async () => {
    if (!attemptId || !enabled || inFlight.current) return
    const { answers, flags, dirty, markSaved, setSaveState } = useExamStore.getState()
    const ids = [...dirty]
    if (ids.length === 0) return

    inFlight.current = true
    setSaveState('saving')
    try {
      await api.patch(`/attempts/${attemptId}/answers`, {
        answers: ids.map((id) => ({
          question_id: id,
          value: answers[id] ?? null,
          is_flagged: Boolean(flags[id]),
        })),
      })
      markSaved(ids)
    } catch {
      setSaveState('error')
    } finally {
      inFlight.current = false
    }
  }, [attemptId, enabled])

  // periodic
  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(flush, INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [flush, enabled])

  // debounced on change
  useEffect(() => {
    if (!enabled) return
    return useExamStore.subscribe((state, prev) => {
      if (state.dirty === prev.dirty) return
      if (debounce.current) window.clearTimeout(debounce.current)
      debounce.current = window.setTimeout(flush, 1200)
    })
  }, [flush, enabled])

  // on tab hide / unload
  useEffect(() => {
    if (!enabled) return
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    window.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [flush, enabled])

  return flush
}
