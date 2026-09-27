'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Countdown driven by the server's `seconds_remaining`.
 *
 * The browser clock is never trusted for the deadline — we anchor to the value the server
 * returned and measure elapsed time with performance.now(), so tab throttling or a system
 * clock change cannot gift the student extra minutes. Every successful autosave re-anchors it.
 */
export function useExamClock(serverSecondsRemaining: number | null, onExpire?: () => void) {
  const [remaining, setRemaining] = useState(serverSecondsRemaining ?? 0)
  const anchor = useRef<{ at: number; value: number } | null>(null)
  const fired = useRef(false)

  useEffect(() => {
    if (serverSecondsRemaining == null) return
    anchor.current = { at: performance.now(), value: serverSecondsRemaining }
    setRemaining(serverSecondsRemaining)
    if (serverSecondsRemaining > 0) fired.current = false
  }, [serverSecondsRemaining])

  useEffect(() => {
    if (serverSecondsRemaining == null) return
    const id = window.setInterval(() => {
      if (!anchor.current) return
      const elapsed = (performance.now() - anchor.current.at) / 1000
      const next = Math.max(0, Math.round(anchor.current.value - elapsed))
      setRemaining(next)
      if (next === 0 && !fired.current) {
        fired.current = true
        onExpire?.()
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [serverSecondsRemaining, onExpire])

  return remaining
}
