'use client'

import { QuestionShell } from '@/components/exam/questions/question-shell'
import { useTextAnswer } from '@/components/exam/questions/use-answer'
import { useExamStore } from '@/lib/exam-store'
import { cn } from '@/lib/utils'
import type { Option, Question, QuestionGroup } from '@/types/api'

/**
 * Matching headings / information / features / sentence endings.
 *
 * A dropdown per item, not drag-and-drop. Dragging is unusable on a phone, invisible to a
 * screen reader and impossible to undo with a keyboard; a select does all three and is what
 * the computer-delivered test falls back to anyway.
 *
 * `reusable` groups (matching information — a paragraph letter can answer twice) keep every
 * option available; the others grey out letters already spent elsewhere in the group.
 */
export function Matching({ group, reusable }: { group: QuestionGroup; reusable?: boolean }) {
  const options = group.options ?? []
  const allowRepeat = reusable ?? group.type === 'matching_information'

  return (
    <div className="space-y-4">
      {options.length > 0 && <OptionBank options={options} />}
      <div className="divide-y divide-border">
        {group.questions.map((question) => (
          <MatchRow
            key={question.id}
            group={group}
            question={question}
            options={question.options ?? options}
            allowRepeat={allowRepeat}
          />
        ))}
      </div>
    </div>
  )
}

function OptionBank({ options }: { options: Option[] }) {
  return (
    <dl className="rounded-lg border border-border bg-surface-2/60 p-3 text-sm">
      {options.map((option) => (
        <div key={option.label} className="flex gap-2 py-0.5">
          <dt className="w-6 shrink-0 font-bold tabular-nums text-muted">{option.label}</dt>
          <dd className="min-w-0 flex-1 text-fg">{option.text}</dd>
        </div>
      ))}
    </dl>
  )
}

function MatchRow({
  group,
  question,
  options,
  allowRepeat,
}: {
  group: QuestionGroup
  question: Question
  options: Option[]
  allowRepeat: boolean
}) {
  const [value, setValue] = useTextAnswer(question.id)
  const goToQuestion = useExamStore((s) => s.goToQuestion)
  const answers = useExamStore((s) => s.answers)

  const used = new Set<string>()
  if (!allowRepeat) {
    for (const sibling of group.questions) {
      if (sibling.id === question.id) continue
      const v = answers[sibling.id]
      if (typeof v === 'string' && v) used.add(v)
    }
  }

  return (
    <QuestionShell number={question.number}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-fg">{question.prompt}</p>
        <select
          id={`answer-${question.number}`}
          data-question-focus={question.number}
          aria-label={`Question ${question.number} answer`}
          value={value}
          onFocus={() => goToQuestion(question.number)}
          onChange={(e) => setValue(e.target.value)}
          className={cn(
            'h-9 w-full shrink-0 rounded-md border border-border bg-surface px-2 text-sm text-fg sm:w-56',
            !value && 'text-muted',
          )}
        >
          <option value="">— choose —</option>
          {options.map((option) => (
            <option key={option.label} value={option.label} disabled={used.has(option.label)}>
              {option.label}
              {option.text ? ` · ${truncate(option.text)}` : ''}
              {used.has(option.label) ? ' (used)' : ''}
            </option>
          ))}
        </select>
      </div>
    </QuestionShell>
  )
}

function truncate(text: string, max = 60): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}
