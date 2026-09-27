'use client'

import { AnswerInput } from '@/components/exam/questions/answer-input'
import { QuestionShell } from '@/components/exam/questions/question-shell'
import type { QuestionGroup } from '@/types/api'

/** Short answer: a question, a box, and the word limit hanging over both. */
export function ShortAnswer({ group }: { group: QuestionGroup }) {
  return (
    <div className="divide-y divide-border">
      {group.questions.map((question) => (
        <QuestionShell key={question.id} number={question.number} prompt={question.prompt}>
          <AnswerInput
            questionId={question.id}
            number={question.number}
            wordLimit={question.word_limit ?? group.word_limit}
            allowNumber={Boolean(question.allow_number) || group.allow_number}
          />
        </QuestionShell>
      ))}
    </div>
  )
}
