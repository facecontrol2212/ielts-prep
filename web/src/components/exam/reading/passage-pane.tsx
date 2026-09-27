'use client'

import { Highlighter, Eraser } from 'lucide-react'
import { useCallback, useMemo } from 'react'

import { Button } from '@/components/ui'
import { useHighlights } from '@/hooks/use-highlights'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Put A/B/C in front of each paragraph, the way a printed passage does, when the questions
 * need them (matching headings, matching information). Done to the HTML *before* React
 * renders it, so the labels are part of the text the highlight offsets are measured against
 * and a reload puts every mark back in the same place.
 */
export function withParagraphLetters(html: string): string {
  if (typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(`<body><div>${html}</div></body>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return html
  if (root.querySelector('.para-label')) return html

  let index = 0
  root.querySelectorAll(':scope > p').forEach((p) => {
    if (!p.textContent?.trim()) return
    const label = doc.createElement('span')
    label.className = 'para-label'
    label.textContent = LETTERS[index] ?? String(index + 1)
    p.insertBefore(label, p.firstChild)
    index += 1
  })
  return root.innerHTML
}

export function PassagePane({
  attemptId,
  sectionId,
  title,
  instructions,
  passageHtml,
  paragraphLetters,
}: {
  attemptId: string | null
  sectionId: string
  title: string
  instructions: string | null
  passageHtml: string | null
  paragraphLetters: boolean
}) {
  const { containerRef, highlights, highlightSelection, removeAt, clearAll } = useHighlights(
    attemptId,
    sectionId,
  )

  const html = useMemo(
    () => (passageHtml ? (paragraphLetters ? withParagraphLetters(passageHtml) : passageHtml) : ''),
    [passageHtml, paragraphLetters],
  )

  const onClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const mark = target.closest('mark.hl')
      const index = mark?.getAttribute('data-hl-index')
      if (index !== null && index !== undefined) removeAt(Number(index))
    },
    [removeAt],
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-exam-paper">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-exam-paper px-4 py-2">
        <h2 className="mr-auto min-w-0 truncate text-sm font-bold uppercase tracking-wide text-fg">
          {title}
        </h2>
        <Button
          size="sm"
          variant="outline"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => highlightSelection()}
          title="Select text in the passage, then highlight it"
        >
          <Highlighter className="h-3.5 w-3.5" aria-hidden />
          Highlight
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={clearAll}
          disabled={highlights.length === 0}
          aria-label={`Clear ${highlights.length} highlights`}
        >
          <Eraser className="h-3.5 w-3.5" aria-hidden />
          Clear
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {instructions && (
          <p className="mb-4 border-l-2 border-primary pl-3 text-sm text-muted">{instructions}</p>
        )}
        {html ? (
          <article
            ref={(node) => {
              containerRef.current = node
            }}
            onClick={onClick}
            className="passage max-w-[68ch]"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="text-sm text-muted">This section has no passage.</p>
        )}
        <p className="mt-8 border-t border-border pt-3 text-xs text-muted">
          Select any text and choose Highlight to mark it. Click a highlight to remove it.
          Highlights are saved on this device for this attempt only — they are not sent to the
          examiner and they are not marked.
        </p>
      </div>
    </div>
  )
}
