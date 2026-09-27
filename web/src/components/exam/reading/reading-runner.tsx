'use client'

import { useEffect, useRef, useState } from 'react'

import { QuestionGroupView } from '@/components/exam/questions'
import { PassagePane } from '@/components/exam/reading/passage-pane'
import { SplitPane } from '@/components/exam/reading/split-pane'
import { DESKTOP, useMediaQuery } from '@/components/exam/reading/use-media-query'
import { useExamStore } from '@/lib/exam-store'
import { cn } from '@/lib/utils'
import type { AttemptSession, Section } from '@/types/api'

const LETTERED_TYPES = new Set(['matching_headings', 'matching_information'])

function needsParagraphLetters(section: Section): boolean {
  return section.groups.some((g) => LETTERED_TYPES.has(g.type))
}

export function ReadingRunner({ session }: { session: AttemptSession }) {
  const desktop = useMediaQuery(DESKTOP)
  const currentSection = useExamStore((s) => s.currentSection)
  const setSection = useExamStore((s) => s.setSection)
  const [mobileTab, setMobileTab] = useState<'passage' | 'questions'>('passage')
  const currentQuestion = useExamStore((s) => s.currentQuestion)

  // On a phone the two panes are tabs, so jumping to a question from the navigator has to
  // bring the questions tab with it — otherwise the tap looks like it did nothing. Moving
  // to another passage is the opposite intention and stays on the passage.
  const sectionSwitch = useRef(false)
  const firstPaint = useRef(true)
  useEffect(() => {
    if (firstPaint.current) {
      firstPaint.current = false
      return
    }
    if (sectionSwitch.current) {
      sectionSwitch.current = false
      setMobileTab('passage')
      return
    }
    setMobileTab('questions')
  }, [currentQuestion])

  const sections = session.test.sections
  const section = sections.find((s) => s.order === currentSection) ?? sections[0]
  if (!section) return null

  const passage = (
    <PassagePane
      attemptId={session.attempt.id}
      sectionId={section.id}
      title={section.title}
      instructions={section.instructions}
      passageHtml={section.passage_html}
      paragraphLetters={needsParagraphLetters(section)}
    />
  )

  const questions = <QuestionsPane section={section} />

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SectionTabs
        sections={sections}
        current={section.order}
        onSelect={(order) => {
          sectionSwitch.current = true
          setSection(order)
          const first = sections.find((s) => s.order === order)?.start_question
          if (first) useExamStore.getState().goToQuestion(first)
        }}
      />

      {!desktop && (
        <div
          role="tablist"
          aria-label="Passage or questions"
          className="grid shrink-0 grid-cols-2 border-b border-border bg-surface"
        >
          {(['passage', 'questions'] as const).map((tab) => (
            <button
              key={tab}
              role="tab"
              type="button"
              aria-selected={mobileTab === tab}
              onClick={() => setMobileTab(tab)}
              className={cn(
                'py-2.5 text-sm font-semibold capitalize transition-colors',
                mobileTab === tab
                  ? 'border-b-2 border-primary text-fg'
                  : 'border-b-2 border-transparent text-muted',
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {desktop ? (
          <SplitPane
            storageKey="ielts.exam.reading.split"
            leftLabel="Reading passage"
            rightLabel="Questions"
            left={passage}
            right={questions}
          />
        ) : mobileTab === 'passage' ? (
          <div className="h-full overflow-y-auto">{passage}</div>
        ) : (
          <div className="h-full overflow-y-auto">{questions}</div>
        )}
      </div>
    </div>
  )
}

function SectionTabs({
  sections,
  current,
  onSelect,
}: {
  sections: Section[]
  current: number
  onSelect: (order: number) => void
}) {
  if (sections.length < 2) return null
  return (
    <nav
      aria-label="Passages"
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-1.5"
    >
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={() => onSelect(section.order)}
          aria-current={section.order === current ? 'page' : undefined}
          className={cn(
            'shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
            section.order === current
              ? 'bg-primary text-primary-fg'
              : 'text-muted hover:bg-surface-2',
          )}
        >
          {section.title}
          {section.start_question && section.end_question ? (
            <span className="ml-1.5 font-normal tabular-nums opacity-80">
              {section.start_question}–{section.end_question}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  )
}

function QuestionsPane({ section }: { section: Section }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-4 text-xs text-muted">
          Scrolling here does not move the passage — scroll the passage pane separately.
        </p>
        <div className="space-y-6 pb-16">
          {section.groups.map((group) => (
            <QuestionGroupView key={group.id} group={group} />
          ))}
        </div>
      </div>
    </div>
  )
}
