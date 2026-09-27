'use client'

import { QuestionShell } from '@/components/exam/questions/question-shell'
import { useTextAnswer } from '@/components/exam/questions/use-answer'
import { useExamStore } from '@/lib/exam-store'
import { cn } from '@/lib/utils'
import type { Question, QuestionGroup, QuestionType } from '@/types/api'

const CHOICES: Record<'true_false_not_given' | 'yes_no_not_given', string[]> = {
  true_false_not_given: ['TRUE', 'FALSE', 'NOT GIVEN'],
  yes_no_not_given: ['YES', 'NO', 'NOT GIVEN'],
}

function choicesFor(type: QuestionType): string[] {
  return type === 'yes_no_not_given' ? CHOICES.yes_no_not_given : CHOICES.true_false_not_given
}

/**
 * True / False / Not Given and Yes / No / Not Given.
 *
 * A three-way segmented control rather than a dropdown: the three labels have to be
 * readable at a glance because students change their mind on these constantly.
 */
export function StatementJudgement({ group }: { group: QuestionGroup }) {
  return (
    <div className="divide-y divide-border">
      {group.questions.map((question) => (
        <JudgementRow key={question.id} group={group} question={question} />
      ))}
    </div>
  )
}

function JudgementRow({ group, question }: { group: QuestionGroup; question: Question }) {
  const [value, setValue] = useTextAnswer(question.id)
  const goToQuestion = useExamStore((s) => s.goToQuestion)
  const choices =
    group.options && group.options.length > 0
      ? group.options.map((o) => o.label)
      : choicesFor(question.type ?? group.type)

  return (
    <QuestionShell number={question.number}>
      <fieldset>
        <legend className="mb-2 text-sm leading-relaxed text-fg">{question.prompt}</legend>
        <div
          role="none"
          className="inline-flex w-full max-w-md overflow-hidden rounded-lg border border-border"
        >
          {choices.map((choice, index) => {
            const id = `q${question.number}-${choice.replace(/\s+/g, '-')}`
            const selected = value === choice
            return (
              <label
                key={choice}
                htmlFor={id}
                className={cn(
                  'flex-1 cursor-pointer px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide transition-colors',
                  'focus-within:ring-2 focus-within:ring-inset focus-within:ring-primary',
                  index > 0 && 'border-l border-border',
                  selected
                    ? 'bg-primary text-primary-fg'
                    : 'bg-surface text-muted hover:bg-surface-2',
                )}
              >
                <input
                  type="radio"
                  id={id}
                  name={`question-${question.number}`}
                  value={choice}
                  checked={selected}
                  data-question-focus={index === 0 ? question.number : undefined}
                  onFocus={() => goToQuestion(question.number)}
                  onChange={() => setValue(choice)}
                  className="sr-only"
                />
                {choice}
              </label>
            )
          })}
        </div>
      </fieldset>
    </QuestionShell>
  )
}
