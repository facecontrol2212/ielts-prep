'use client'

import { AnswerInput } from '@/components/exam/questions/answer-input'
import { useTextAnswer } from '@/components/exam/questions/use-answer'
import { FlagToggle } from '@/components/exam/questions/question-shell'
import { useExamStore } from '@/lib/exam-store'
import { cn } from '@/lib/utils'
import type { Option, Question, QuestionGroup } from '@/types/api'

/**
 * Plan / map / diagram labelling.
 *
 * The numbers are printed on the artwork itself, so the field sits beside the image behind
 * a matching numbered marker rather than floating on top of it — a box pinned over a diagram
 * covers the very detail the student is trying to read, and there are no label coordinates
 * in the payload to pin it to anyway.
 */
export function Labelling({ group }: { group: QuestionGroup }) {
  const image = group.image_url
  const options = group.options ?? []

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
      {image ? (
        <figure className="rounded-lg border border-border bg-exam-paper p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt={group.instructions || 'Diagram to label'}
            className="mx-auto h-auto w-full max-w-full"
          />
          <figcaption className="pt-2 text-xs text-muted">
            The numbers on the diagram match the fields beside it.
          </figcaption>
        </figure>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
          The diagram for these questions could not be loaded.
        </p>
      )}

      <ol className="space-y-2">
        {group.questions.map((question) => (
          <li key={question.id}>
            <LabelRow group={group} question={question} options={question.options ?? options} />
          </li>
        ))}
      </ol>
    </div>
  )
}

function LabelRow({
  group,
  question,
  options,
}: {
  group: QuestionGroup
  question: Question
  options: Option[]
}) {
  const current = useExamStore((s) => s.currentQuestion)
  const isCurrent = current === question.number

  return (
    <div
      data-question={question.number}
      className={cn(
        'flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors',
        isCurrent ? 'border-exam-current bg-surface-2/60' : 'border-border',
      )}
    >
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-fg text-xs font-bold tabular-nums text-fg"
      >
        {question.number}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        {question.prompt && <p className="text-xs text-muted">{question.prompt}</p>}
        {options.length > 0 ? (
          <LabelSelect question={question} options={options} />
        ) : (
          <AnswerInput
            questionId={question.id}
            number={question.number}
            wordLimit={question.word_limit ?? group.word_limit}
            allowNumber={Boolean(question.allow_number) || group.allow_number}
          />
        )}
      </div>
      <FlagToggle number={question.number} />
    </div>
  )
}

function LabelSelect({ question, options }: { question: Question; options: Option[] }) {
  const [value, setValue] = useTextAnswer(question.id)
  const goToQuestion = useExamStore((s) => s.goToQuestion)
  return (
    <select
      id={`answer-${question.number}`}
      data-question-focus={question.number}
      aria-label={`Question ${question.number} answer`}
      value={value}
      onFocus={() => goToQuestion(question.number)}
      onChange={(e) => setValue(e.target.value)}
      className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-fg"
    >
      <option value="">— choose —</option>
      {options.map((option) => (
        <option key={option.label} value={option.label}>
          {option.label}
          {option.text ? ` · ${option.text}` : ''}
        </option>
      ))}
    </select>
  )
}
