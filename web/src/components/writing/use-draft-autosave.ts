'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { SaveState } from '@/components/exam'
import {
  hasUnsyncedLocalDraft,
  markLocalSynced,
  readLocalDraft,
  writeLocalDraft,
} from '@/components/writing/local-draft'
import { api } from '@/lib/api'

export const DRAFT_INTERVAL_MS = 10_000

export interface WritingDraftBody {
  task_number: number
  text: string
}

export interface DraftAutosave {
  texts: Record<number, string>
  /** Task numbers with unsaved keystrokes. */
  dirty: number[]
  saveState: SaveState
  setText: (taskNumber: number, text: string) => void
  /** Seed from the server, preferring any unsynced local copy. Returns the tasks it recovered. */
  hydrate: (serverTexts: Record<number, string>) => number[]
  flush: () => Promise<void>
}

/**
 * Writing has no per-question answers, so `useAutosave` (which speaks `PATCH /answers`) does not
 * apply. Same contract though: every 10 seconds, on blur, and on tab hide.
 */
export function useDraftAutosave(
  attemptId: string,
  enabled: boolean,
  intervalMs: number = DRAFT_INTERVAL_MS,
): DraftAutosave {
  const [texts, setTexts] = useState<Record<number, string>>({})
  const [dirty, setDirty] = useState<number[]>([])
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const textsRef = useRef(texts)
  textsRef.current = texts
  const dirtyRef = useRef<Set<number>>(new Set())
  const inFlight = useRef(false)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  const syncDirty = useCallback(() => {
    setDirty([...dirtyRef.current].sort((a, b) => a - b))
  }, [])

  const setText = useCallback(
    (taskNumber: number, text: string) => {
      setTexts((prev) => (prev[taskNumber] === text ? prev : { ...prev, [taskNumber]: text }))
      dirtyRef.current.add(taskNumber)
      syncDirty()
      setSaveState((s) => (s === 'error' ? 'error' : 'idle'))
      writeLocalDraft(attemptId, taskNumber, text)
    },
    [attemptId, syncDirty],
  )

  const hydrate = useCallback(
    (serverTexts: Record<number, string>) => {
      const next: Record<number, string> = {}
      const recovered: number[] = []
      for (const [raw, serverText] of Object.entries(serverTexts)) {
        const taskNumber = Number(raw)
        const local = readLocalDraft(attemptId, taskNumber)
        if (hasUnsyncedLocalDraft(local, serverText) && local) {
          next[taskNumber] = local.text
          dirtyRef.current.add(taskNumber)
          recovered.push(taskNumber)
        } else {
          next[taskNumber] = serverText
        }
      }
      setTexts(next)
      syncDirty()
      return recovered
    },
    [attemptId, syncDirty],
  )

  const flush = useCallback(async () => {
    if (!enabledRef.current || inFlight.current) return
    const pending = [...dirtyRef.current]
    if (pending.length === 0) return

    inFlight.current = true
    setSaveState('saving')
    try {
      for (const taskNumber of pending) {
        const text = textsRef.current[taskNumber] ?? ''
        const body: WritingDraftBody = { task_number: taskNumber, text }
        await api.put(`/writing/attempts/${attemptId}/draft`, body)
        // Only clear the flag if nothing was typed while the request was in flight.
        if ((textsRef.current[taskNumber] ?? '') === text) dirtyRef.current.delete(taskNumber)
        markLocalSynced(attemptId, taskNumber, text)
      }
      syncDirty()
      setSaveState(dirtyRef.current.size > 0 ? 'idle' : 'saved')
    } catch {
      syncDirty()
      setSaveState('error')
    } finally {
      inFlight.current = false
    }
  }, [attemptId, syncDirty])

  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => void flush(), intervalMs)
    return () => window.clearInterval(id)
  }, [enabled, flush, intervalMs])

  useEffect(() => {
    if (!enabled) return
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    const onPageHide = () => void flush()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [enabled, flush])

  return { texts, dirty, saveState, setText, hydrate, flush }
}
