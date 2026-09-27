'use client'

import { useCallback, useState } from 'react'

import { AudioPlayer } from '@/components/exam/listening/audio-player'
import { TransferBanner } from '@/components/exam/listening/transfer-banner'
import { QuestionGroupView } from '@/components/exam/questions'
import { CONTENT_CLASS, renderContentHtml } from '@/components/exam/questions/content-html'
import { useExamStore } from '@/lib/exam-store'
import { cn } from '@/lib/utils'
import type { AttemptSession, Section } from '@/types/api'

/** The one continuous recording: the first section that carries a file owns the whole test. */
export function trackUrl(sections: Section[]): string | null {
  return sections.find((s) => s.audio_url)?.audio_url ?? null
}

export function ListeningRunner({
  session,
  onAudioTrouble,
}: {
  session: AttemptSession
  onAudioTrouble?: (trouble: boolean) => void
}) {
  const currentSection = useExamStore((s) => s.currentSection)
  const setSection = useExamStore((s) => s.setSection)
  const goToQuestion = useExamStore((s) => s.goToQuestion)
  const [audioEnded, setAudioEnded] = useState(false)

  const sections = session.test.sections
  const section = sections.find((s) => s.order === currentSection) ?? sections[0]
  const src = trackUrl(sections)
  const transferSeconds = session.test.transfer_seconds

  const onEnded = useCallback(() => setAudioEnded(true), [])

  if (!section) return null

  return (
    <div className="flex h-full min-h-0 flex-col">
      {src ? (
        <AudioPlayer
          src={src}
          sections={sections}
          currentSection={section.order}
          onEnded={onEnded}
          onTrouble={onAudioTrouble}
        />
      ) : (
        <div role="alert" className="border-b border-danger/30 bg-danger/10 px-4 py-3 text-sm">
          This test has no audio file. Tell us before the timer runs down — do not sit it.
        </div>
      )}

      {audioEnded && transferSeconds > 0 && <TransferBanner seconds={transferSeconds} />}

      <nav
        aria-label="Sections"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-1.5"
      >
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setSection(s.order)
              if (s.start_question) goToQuestion(s.start_question)
            }}
            aria-current={s.order === section.order ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              s.order === section.order
                ? 'bg-primary text-primary-fg'
                : 'text-muted hover:bg-surface-2',
            )}
          >
            {s.title}
            {s.start_question && s.end_question ? (
              <span className="ml-1.5 font-normal tabular-nums opacity-80">
                {s.start_question}–{s.end_question}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-4">
        <div className="mx-auto max-w-3xl space-y-6 pb-16">
          {section.instructions && (
            <p className="border-l-2 border-primary pl-3 text-sm text-muted">
              {section.instructions}
            </p>
          )}
          {section.passage_html && (
            <div
              className={cn(CONTENT_CLASS, 'rounded-lg border border-border bg-surface p-3')}
            >
              {renderContentHtml(section.passage_html, () => null)}
            </div>
          )}
          {section.groups.map((group) => (
            <QuestionGroupView key={group.id} group={group} />
          ))}
        </div>
      </div>
    </div>
  )
}
