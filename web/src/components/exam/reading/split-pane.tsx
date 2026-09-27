'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

const MIN = 25
const MAX = 75

function readRatio(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key)
    const value = raw === null ? NaN : Number(raw)
    return Number.isFinite(value) ? Math.min(MAX, Math.max(MIN, value)) : fallback
  } catch {
    return fallback
  }
}

function writeRatio(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(Math.round(value)))
  } catch {
    // Storage can be blocked; the divider still works, it just forgets.
  }
}

/**
 * Passage left, questions right, with a divider the student can drag.
 *
 * The ratio is remembered because it is a personal preference students settle on once and
 * then want on every test — and because re-dragging it at the start of each passage costs
 * exam minutes.
 */
export function SplitPane({
  storageKey,
  left,
  right,
  leftLabel,
  rightLabel,
  defaultRatio = 52,
}: {
  storageKey: string
  left: React.ReactNode
  right: React.ReactNode
  leftLabel: string
  rightLabel: string
  defaultRatio?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState(defaultRatio)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    setRatio(readRatio(storageKey, defaultRatio))
  }, [storageKey, defaultRatio])

  const apply = useCallback(
    (next: number) => {
      const clamped = Math.min(MAX, Math.max(MIN, next))
      setRatio(clamped)
      writeRatio(storageKey, clamped)
    },
    [storageKey],
  )

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const box = containerRef.current?.getBoundingClientRect()
      if (!box || box.width === 0) return
      apply(((event.clientX - box.left) / box.width) * 100)
    },
    [apply],
  )

  useEffect(() => {
    if (!dragging) return
    const stop = () => setDragging(false)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      document.body.style.userSelect = ''
    }
  }, [dragging, onPointerMove])

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full">
      <section
        aria-label={leftLabel}
        className="min-w-0 overflow-y-auto"
        style={{ width: `${ratio}%` }}
      >
        {left}
      </section>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the passage and question panes"
        aria-valuenow={Math.round(ratio)}
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            e.stopPropagation()
            apply(ratio - 2)
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            e.stopPropagation()
            apply(ratio + 2)
          }
        }}
        className={cn(
          'group relative w-1.5 shrink-0 cursor-col-resize bg-border transition-colors',
          dragging ? 'bg-primary' : 'hover:bg-primary/60',
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface"
        />
      </div>

      <section aria-label={rightLabel} className="min-w-0 flex-1 overflow-y-auto">
        {right}
      </section>
    </div>
  )
}
