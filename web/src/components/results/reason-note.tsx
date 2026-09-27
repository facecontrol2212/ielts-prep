'use client'

import { AlertTriangle, CircleSlash, SpellCheck, XCircle } from 'lucide-react'

import { answerText } from '@/components/dashboard/format'
import { cn, countWords } from '@/lib/utils'
import type { QuestionReview } from '@/types/api'

type Tone = 'warning' | 'danger' | 'neutral'

export interface ReasonNote {
  title: string
  body: string
  tone: Tone
  Icon: typeof AlertTriangle
}

const TONE_CLASSES: Record<Tone, string> = {
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  neutral: 'border-border bg-surface-2 text-muted',
}

/**
 * The word limit the instructions imposed is not in `QuestionReview`, so we infer a floor
 * from the answer key: an accepted answer can never be longer than the limit. When the key
 * is empty or longer than what the student wrote, we say it without the numbers instead of
 * inventing them. (The API should send `word_limit` — see the report.)
 */
export function inferWordLimit(correctAnswers: string[]): number | null {
  const counts = correctAnswers.map((a) => countWords(a)).filter((n) => n > 0)
  return counts.length ? Math.max(...counts) : null
}

/**
 * The teaching moment. A student who only sees "wrong" learns nothing; a student who reads
 * "right words, one too many" learns a rule that is worth marks on every future paper.
 */
export function reasonNoteFor(item: QuestionReview): ReasonNote | null {
  if (item.is_correct || item.reason == null) return null
  const yours = answerText(item.your_answer)
  const firstCorrect = item.correct_answers[0] ?? ''

  switch (item.reason) {
    case 'over_word_limit': {
      const used = countWords(yours)
      const allowed = inferWordLimit(item.correct_answers)
      const counted =
        allowed != null && used > allowed
          ? `Your answer was correct but used ${used} word${used === 1 ? '' : 's'} where the instructions allowed ${allowed} — this is marked wrong in the real test.`
          : 'Your answer was correct but used more words than the instructions allowed — this is marked wrong in the real test.'
      return {
        title: 'Over the word limit',
        body: `${counted} Count the words in the instruction line before you write, and cut anything the sentence can do without.`,
        tone: 'warning',
        Icon: AlertTriangle,
      }
    }
    case 'spelling':
      return {
        title: 'The idea was right — the spelling cost the mark',
        body: firstCorrect
          ? `You had the right word. IELTS marks a misspelling wrong even when the meaning is obvious, so “${yours || '—'}” scores nothing where “${firstCorrect}” scores the mark. Add this one to your spelling list.`
          : 'You had the right word, but IELTS marks a misspelling wrong even when the meaning is obvious. Add this one to your spelling list.',
        tone: 'warning',
        Icon: SpellCheck,
      }
    case 'blank':
      return {
        title: 'You left this blank',
        body: 'A blank is always zero, and IELTS never penalises a wrong guess — so there is nothing to lose by writing your best attempt. In the last two minutes, fill every empty box.',
        tone: 'neutral',
        Icon: CircleSlash,
      }
    case 'wrong':
    default:
      return {
        title: 'Not the answer this question wanted',
        body: firstCorrect
          ? `The passage supports “${firstCorrect}”. Read the evidence below and find the words that made it the answer — that is the habit that moves a band.`
          : 'Read the evidence below and find the words that made the correct answer the answer — that is the habit that moves a band.',
        tone: 'danger',
        Icon: XCircle,
      }
  }
}

export function ReasonNoteBox({ note }: { note: ReasonNote }) {
  const { Icon } = note
  return (
    <div className={cn('flex gap-2.5 rounded-xl border p-3 text-sm', TONE_CLASSES[note.tone])}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">{note.title}</p>
        <p className="text-fg">{note.body}</p>
      </div>
    </div>
  )
}
