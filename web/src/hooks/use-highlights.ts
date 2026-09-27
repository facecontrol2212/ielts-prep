'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface Highlight {
  /** Character offset into the container's text content. */
  start: number
  end: number
}

const PREFIX = 'ielts.highlights'

function storageKey(attemptId: string, scope: string): string {
  return `${PREFIX}.${attemptId}.${scope}`
}

function read(key: string): Highlight[] {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (h): h is Highlight =>
        typeof h === 'object' &&
        h !== null &&
        typeof (h as Highlight).start === 'number' &&
        typeof (h as Highlight).end === 'number',
    )
  } catch {
    return []
  }
}

function write(key: string, value: Highlight[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private browsing, quota, blocked storage — highlighting is a nicety, never a blocker.
  }
}

export function mergeHighlights(input: Highlight[]): Highlight[] {
  const sorted = [...input].filter((h) => h.end > h.start).sort((a, b) => a.start - b.start)
  const out: Highlight[] = []
  for (const h of sorted) {
    const last = out[out.length - 1]
    if (last && h.start <= last.end) last.end = Math.max(last.end, h.end)
    else out.push({ ...h })
  }
  return out
}

function textOffset(container: Node, node: Node, offset: number): number {
  const walker = container.ownerDocument?.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  if (!walker) return 0
  let total = 0
  let current = walker.nextNode()
  while (current) {
    if (current === node) return total + offset
    total += current.nodeValue?.length ?? 0
    current = walker.nextNode()
  }
  return total
}

/** Undo every mark we painted, leaving the authored markup exactly as it was. */
export function unpaint(container: HTMLElement): void {
  container.querySelectorAll('mark.hl').forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
  })
  container.normalize()
}

function wrap(container: HTMLElement, h: Highlight, index: number): void {
  const walker = container.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const targets: { node: Text; from: number; to: number }[] = []
  let pos = 0
  let current = walker.nextNode() as Text | null
  while (current) {
    const len = current.nodeValue?.length ?? 0
    const nodeStart = pos
    pos += len
    if (pos > h.start && nodeStart < h.end) {
      targets.push({
        node: current,
        from: Math.max(0, h.start - nodeStart),
        to: Math.min(len, h.end - nodeStart),
      })
    }
    current = walker.nextNode() as Text | null
  }

  for (const target of targets) {
    let node = target.node
    const length = node.nodeValue?.length ?? 0
    if (target.to < length) node.splitText(target.to)
    if (target.from > 0) node = node.splitText(target.from)
    const mark = container.ownerDocument.createElement('mark')
    mark.className = 'hl'
    mark.setAttribute('data-hl-index', String(index))
    mark.setAttribute('title', 'Click to remove this highlight')
    node.parentNode?.insertBefore(mark, node)
    mark.appendChild(node)
  }
}

export function paint(container: HTMLElement, highlights: Highlight[]): void {
  unpaint(container)
  highlights.forEach((h, i) => wrap(container, h, i))
}

/**
 * Text-selection highlighting over a reading passage, persisted per attempt.
 *
 * Offsets are stored against the passage's plain text, not against DOM nodes, so a reload
 * (or a re-render of the passage) puts every mark back exactly where the student left it.
 * Storage failures are swallowed: a blocked localStorage must never cost a student the test.
 */
export function useHighlights(attemptId: string | null, scope: string) {
  const containerRef = useRef<HTMLElement | null>(null)
  const pending = useRef<Highlight | null>(null)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const key = attemptId ? storageKey(attemptId, scope) : null

  // Clicking the toolbar button collapses the selection in every browser, so the last
  // usable range is remembered as the student makes it, not read back afterwards.
  useEffect(() => {
    const onSelectionChange = () => {
      const container = containerRef.current
      if (!container) return
      const selection = container.ownerDocument.defaultView?.getSelection()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
      const range = selection.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) return
      const start = textOffset(container, range.startContainer, range.startOffset)
      const end = textOffset(container, range.endContainer, range.endOffset)
      if (end > start) pending.current = { start, end }
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [])

  useEffect(() => {
    setHighlights(key ? read(key) : [])
  }, [key])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    paint(container, highlights)
    return () => {
      // Hand the DOM back clean so React never sees nodes it did not create.
      unpaint(container)
    }
  }, [highlights, scope])

  const persist = useCallback(
    (next: Highlight[]) => {
      setHighlights(next)
      if (key) write(key, next)
    },
    [key],
  )

  /** Highlight whatever is selected inside the container. Returns false if nothing was. */
  const highlightSelection = useCallback((): boolean => {
    const container = containerRef.current
    if (!container) return false
    const selection = container.ownerDocument.defaultView?.getSelection()

    let range: Highlight | null = null
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
      const live = selection.getRangeAt(0)
      if (container.contains(live.commonAncestorContainer)) {
        const start = textOffset(container, live.startContainer, live.startOffset)
        const end = textOffset(container, live.endContainer, live.endOffset)
        if (end > start) range = { start, end }
      }
    }
    range ??= pending.current
    if (!range) return false

    persist(mergeHighlights([...highlights, range]))
    pending.current = null
    selection?.removeAllRanges()
    return true
  }, [highlights, persist])

  const removeAt = useCallback(
    (index: number) => {
      persist(highlights.filter((_, i) => i !== index))
    },
    [highlights, persist],
  )

  const clearAll = useCallback(() => persist([]), [persist])

  return { containerRef, highlights, highlightSelection, removeAt, clearAll }
}
