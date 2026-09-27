'use client'

import { useCallback, useEffect, useState } from 'react'

import { ExamTopbar, type SaveState } from '@/components/exam/exam-topbar'
import {
  QuestionPalette,
  type PaletteSection,
} from '@/components/exam/question-palette'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

type TextSize = 'normal' | 'large' | 'xlarge'

/**
 * Chrome shared by every timed exam surface (reading, listening, writing).
 *
 * Layout: fixed status bar, scrollable exam body, fixed navigator.
 * Nothing else is on screen — no site nav, no footer, no notifications.
 */
export function ExamShell({
  title,
  secondsRemaining,
  saveState,
  paletteSections,
  currentQuestion,
  onSelectQuestion,
  onSubmit,
  submitting,
  children,
  hidePalette,
}: {
  title: string
  secondsRemaining: number
  saveState: SaveState
  paletteSections: PaletteSection[]
  currentQuestion: number
  onSelectQuestion: (n: number) => void
  onSubmit: () => void
  submitting?: boolean
  children: React.ReactNode
  hidePalette?: boolean
}) {
  const [textSize, setTextSize] = useState<TextSize>('normal')
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    if (textSize === 'normal') root.removeAttribute('data-text')
    else root.setAttribute('data-text', textSize)
    return () => root.removeAttribute('data-text')
  }, [textSize])

  // Leaving mid-exam loses nothing (autosave), but the student should still be warned.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const select = useCallback(
    (n: number) => {
      onSelectQuestion(n)
      setPaletteOpen(false)
    },
    [onSelectQuestion],
  )

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <ExamTopbar
        title={title}
        secondsRemaining={secondsRemaining}
        saveState={saveState}
        onOpenPalette={() => setPaletteOpen((v) => !v)}
        onTextSizeChange={setTextSize}
        textSize={textSize}
      />

      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

      {!hidePalette && (
        <div
          className={cn(
            'shrink-0',
            paletteOpen ? 'block' : 'hidden lg:block',
          )}
        >
          <div className="flex items-stretch">
            <QuestionPalette
              sections={paletteSections}
              current={currentQuestion}
              onSelect={select}
              className="min-w-0 flex-1"
            />
            <div className="flex items-center border-l border-t border-border bg-surface px-3">
              <Button onClick={onSubmit} loading={submitting} variant="accent" size="sm">
                Submit test
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
