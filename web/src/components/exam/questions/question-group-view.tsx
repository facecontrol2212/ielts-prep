'use client'

import { Completion } from '@/components/exam/questions/completion'
import { Labelling } from '@/components/exam/questions/labelling'
import { Matching } from '@/components/exam/questions/matching'
import { MultipleChoice } from '@/components/exam/questions/multiple-choice'
import { MultipleChoiceMulti } from '@/components/exam/questions/multiple-choice-multi'
import { ShortAnswer } from '@/components/exam/questions/short-answer'
import { StatementJudgement } from '@/components/exam/questions/statement-judgement'
import { limitHint } from '@/components/exam/questions/word-limit'
import type { QuestionGroup, QuestionType } from '@/types/api'

const COMPLETION: QuestionType[] = [
  'sentence_completion',
  'summary_completion',
  'note_completion',
  'table_completion',
  'flow_chart_completion',
  'form_completion',
]

const MATCHING: QuestionType[] = [
  'matching_headings',
  'matching_information',
  'matching_features',
  'matching_sentence_endings',
]

/** One authored question group: its instructions, its word limit, and its renderer. */
export function QuestionGroupView({ group }: { group: QuestionGroup }) {
  const numbers = group.questions.map((q) => q.number)
  const range =
    numbers.length === 0
      ? ''
      : numbers.length === 1
        ? `Question ${numbers[0]}`
        : `Questions ${Math.min(...numbers)}–${Math.max(...numbers)}`
  const hint = limitHint(group.word_limit, group.allow_number)

  return (
    <section aria-label={range} className="space-y-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <header className="space-y-1.5">
        {range && (
          <h3 className="text-sm font-bold uppercase tracking-wide text-fg">{range}</h3>
        )}
        {group.instructions && (
          <p className="text-sm leading-relaxed text-muted">{group.instructions}</p>
        )}
        {hint && (
          <p className="inline-block rounded border border-border bg-surface-2 px-2 py-1 text-xs font-bold uppercase tracking-wide text-fg">
            {hint}
          </p>
        )}
      </header>
      <GroupBody group={group} />
    </section>
  )
}

function GroupBody({ group }: { group: QuestionGroup }) {
  if (group.type === 'multiple_choice_multi') return <MultipleChoiceMulti group={group} />
  if (group.type === 'multiple_choice') return <MultipleChoice group={group} />
  if (group.type === 'true_false_not_given' || group.type === 'yes_no_not_given') {
    return <StatementJudgement group={group} />
  }
  if (MATCHING.includes(group.type)) return <Matching group={group} />
  if (COMPLETION.includes(group.type)) return <Completion group={group} />
  if (group.type === 'diagram_labelling' || group.type === 'map_labelling') {
    return <Labelling group={group} />
  }
  return <ShortAnswer group={group} />
}
