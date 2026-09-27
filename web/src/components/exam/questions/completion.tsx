'use client'

import { useMemo } from 'react'

import { AnswerInput } from '@/components/exam/questions/answer-input'
import {
  CONTENT_CLASS,
  placeholderNumbers,
  renderContentHtml,
} from '@/components/exam/questions/content-html'
import { QuestionShell } from '@/components/exam/questions/question-shell'
import { cn } from '@/lib/utils'
import type { Question, QuestionGroup } from '@/types/api'

/**
 * Sentence / summary / note / table / flow-chart / form completion.
 *
 * All six are the same interaction — type a few words into a gap — and differ only in the
 * shape of the surrounding text, which the authored `content_html` already carries. Blanks
 * are marked `[[14]]` and the input is rendered exactly where the marker sits, so a table
 * completion stays a table and a flow chart keeps its arrows.
 */
export function Completion({ group }: { group: QuestionGroup }) {
  const byNumber = useMemo(
    () => new Map(group.questions.map((q) => [q.number, q])),
    [group.questions],
  )

  const inContent = useMemo(() => placeholderNumbers(group.content_html), [group.content_html])
  const leftovers = group.questions.filter((q) => !inContent.includes(q.number))

  const body = useMemo(() => {
    if (!group.content_html) return null
    return renderContentHtml(group.content_html, (n) => {
      const question = byNumber.get(n)
      if (!question) return <UnknownBlank number={n} />
      return (
        <span data-question={n} className="inline-block align-baseline">
          <AnswerInput
            questionId={question.id}
            number={n}
            wordLimit={group.word_limit}
            allowNumber={group.allow_number}
            variant="inline"
          />
        </span>
      )
    })
  }, [group.content_html, group.word_limit, group.allow_number, byNumber])

  return (
    <div className="space-y-4">
      {body && <div className={cn(CONTENT_CLASS)}>{body}</div>}
      {leftovers.length > 0 && (
        <div className="divide-y divide-border">
          {leftovers.map((question) => (
            <BlockBlank key={question.id} group={group} question={question} />
          ))}
        </div>
      )}
    </div>
  )
}

function BlockBlank({ group, question }: { group: QuestionGroup; question: Question }) {
  return (
    <QuestionShell number={question.number} prompt={question.prompt}>
      <AnswerInput
        questionId={question.id}
        number={question.number}
        wordLimit={group.word_limit}
        allowNumber={group.allow_number}
      />
    </QuestionShell>
  )
}

/** A placeholder with no matching question — a content bug, shown rather than swallowed. */
function UnknownBlank({ number }: { number: number }) {
  return (
    <span className="rounded bg-danger/10 px-1 text-xs font-semibold text-danger">
      missing question {number}
    </span>
  )
}
