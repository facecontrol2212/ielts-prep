'use client'

import { QuestionShell } from '@/components/exam/questions/question-shell'
import { useTextAnswer } from '@/components/exam/questions/use-answer'
import { useExamStore } from '@/lib/exam-store'
import { cn } from '@/lib/utils'
import type { Option, Question, QuestionGroup } from '@/types/api'

export function optionsFor(group: QuestionGroup, question: Question): Option[] {
  return question.options ?? group.options ?? []
}

/** Multiple choice, one answer: a radio group per question number. */
export function MultipleChoice({ group }: { group: QuestionGroup }) {
  return (
    <div className="divide-y divide-border">
      {group.questions.map((question) => (
        <ChoiceRow key={question.id} group={group} question={question} />
      ))}
    </div>
  )
}

function ChoiceRow({ group, question }: { group: QuestionGroup; question: Question }) {
  const [value, setValue] = useTextAnswer(question.id)
  const goToQuestion = useExamStore((s) => s.goToQuestion)
  const options = optionsFor(group, question)

  return (
    <QuestionShell number={question.number}>
      <fieldset>
        <legend className="mb-2 text-sm leading-relaxed text-fg">{question.prompt}</legend>
        <div className="space-y-1">
          {options.map((option, index) => {
            const id = `q${question.number}-${option.label}`
            const selected = value === option.label
            return (
              <label
                key={option.label}
                htmlFor={id}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors',
                  selected
                    ? 'border-primary bg-primary-soft/60'
                    : 'border-transparent hover:bg-surface-2',
                )}
              >
                <input
                  type="radio"
                  id={id}
                  name={`question-${question.number}`}
                  value={option.label}
                  checked={selected}
                  data-question-focus={index === 0 ? question.number : undefined}
                  onFocus={() => goToQuestion(question.number)}
                  onChange={() => setValue(option.label)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--primary))]"
                />
                <span className="font-semibold tabular-nums text-muted">{option.label}</span>
                <span className="min-w-0 flex-1 text-fg">{option.text}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
    </QuestionShell>
  )
}
