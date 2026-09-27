import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { AttemptResult, QuestionReview } from '@/types/api'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

// imported after vi.mock so the module mocks above are registered first
import { ResultView } from '@/components/results/result-view'

/** One question per `reason` value, plus a correct one and a flagged one. */
const REVIEW: QuestionReview[] = [
  {
    question_id: 'q1',
    number: 1,
    type: 'note_completion',
    prompt: 'The tour leaves from the ____.',
    your_answer: 'main entrance',
    correct_answers: ['main entrance'],
    is_correct: true,
    reason: null,
    explanation: null,
    evidence: 'We meet at the main entrance at nine.',
    audio_timestamp: 125,
  },
  {
    question_id: 'q2',
    number: 2,
    type: 'multiple_choice',
    prompt: 'What does the speaker say about the museum café?',
    your_answer: 'B',
    correct_answers: ['C'],
    is_correct: false,
    reason: 'wrong',
    explanation: 'The speaker mentions the café is closed for refurbishment, not that it is busy.',
    evidence: 'The café is shut this month while they redo the kitchen.',
    audio_timestamp: 214,
  },
  {
    question_id: 'q3',
    number: 3,
    type: 'short_answer',
    prompt: 'How long does the guided walk last?',
    your_answer: null,
    correct_answers: ['90 minutes'],
    is_correct: false,
    reason: 'blank',
    explanation: null,
    evidence: 'The walk takes about ninety minutes.',
    audio_timestamp: 305,
  },
  {
    question_id: 'q4',
    number: 4,
    type: 'form_completion',
    prompt: 'Surname of the group leader: ____',
    your_answer: 'Kavanagh',
    correct_answers: ['Cavanagh'],
    is_correct: false,
    reason: 'spelling',
    explanation: null,
    evidence: 'That is Cavanagh — C-A-V-A-N-A-G-H.',
    audio_timestamp: 62,
  },
  {
    question_id: 'q5',
    number: 5,
    type: 'sentence_completion',
    prompt: 'Visitors should leave their bags in the ____.',
    your_answer: 'the car park',
    correct_answers: ['car park'],
    is_correct: false,
    reason: 'over_word_limit',
    explanation: null,
    evidence: 'Please leave larger bags in the car park before you come in.',
    audio_timestamp: 400,
  },
  {
    question_id: 'q6',
    number: 6,
    type: 'matching_features',
    prompt: 'Which room holds the ceramics collection?',
    your_answer: 'A',
    correct_answers: ['A'],
    is_correct: true,
    reason: null,
    explanation: null,
    evidence: null,
    audio_timestamp: null,
  },
]

const RESULT: AttemptResult = {
  attempt_id: 'att-1',
  skill: 'listening',
  test_title: 'Listening Practice Test 3',
  status: 'scored',
  raw_score: 2,
  total_questions: 6,
  band: 6.5,
  submitted_at: '2026-09-24T10:30:00Z',
  duration_seconds: 1860,
  sections: [
    { section_order: 1, title: 'Section 1', correct: 1, total: 2 },
    { section_order: 2, title: 'Section 2', correct: 1, total: 4 },
  ],
  by_type: [
    { type: 'sentence_completion', correct: 0, total: 1 },
    { type: 'multiple_choice', correct: 0, total: 1 },
    { type: 'matching_features', correct: 1, total: 1 },
  ],
  review: REVIEW,
}

const FLAGGED = new Set(['q2', 'q6'])

describe('ResultView — the headline', () => {
  it('states the band and the raw score together', () => {
    render(<ResultView result={RESULT} />)
    expect(screen.getByTestId('band-headline')).toHaveTextContent('Band 6.5 — 2 of 6 correct')
  })

  it('renders a whole band as 6.0, never 6', () => {
    render(<ResultView result={{ ...RESULT, band: 6 }} />)
    expect(screen.getByTestId('band-headline')).toHaveTextContent('Band 6.0 — 2 of 6 correct')
  })

  it('breaks the paper down by section and by question type', () => {
    render(<ResultView result={RESULT} />)
    expect(screen.getByText('Section by section')).toBeInTheDocument()
    expect(screen.getByText('Accuracy by question type')).toBeInTheDocument()
    expect(screen.getByText(/Your weakest part of this paper was Section 2/)).toBeInTheDocument()
  })
})

describe('ResultView — the reason a mark was lost', () => {
  it('explains an over-the-word-limit answer with the actual counts', () => {
    render(<ResultView result={RESULT} />)
    expect(screen.getByText('Over the word limit')).toBeInTheDocument()
    expect(
      screen.getByText(
        /Your answer was correct but used 3 words where the instructions allowed 2 — this is marked wrong in the real test\./,
      ),
    ).toBeInTheDocument()
  })

  it('says a spelling slip had the right idea', () => {
    render(<ResultView result={RESULT} />)
    expect(screen.getByText('The idea was right — the spelling cost the mark')).toBeInTheDocument()
    expect(
      screen.getByText(/IELTS marks a misspelling wrong even when the meaning is obvious/),
    ).toBeInTheDocument()
  })

  it('tells a student why a blank is never worth leaving', () => {
    render(<ResultView result={RESULT} />)
    expect(screen.getByText('You left this blank')).toBeInTheDocument()
    expect(screen.getByText(/IELTS never penalises a wrong guess/)).toBeInTheDocument()
    expect(screen.getByText('Left blank')).toBeInTheDocument()
  })

  it('points a plainly wrong answer at the evidence', () => {
    render(<ResultView result={RESULT} />)
    expect(screen.getByText('Not the answer this question wanted')).toBeInTheDocument()
    expect(
      screen.getByText(
        /The speaker mentions the café is closed for refurbishment, not that it is busy\./,
      ),
    ).toBeInTheDocument()
  })

  it('adds no reason note to a correct answer', () => {
    render(<ResultView result={{ ...RESULT, review: [REVIEW[0]] }} />)
    expect(screen.queryByText('Over the word limit')).not.toBeInTheDocument()
    expect(screen.queryByText('Not the answer this question wanted')).not.toBeInTheDocument()
    expect(screen.getByText('Correct')).toBeInTheDocument()
  })
})

describe('ResultView — evidence and timestamps', () => {
  it('quotes the passage or transcript', () => {
    render(<ResultView result={RESULT} />)
    expect(screen.getByText('The walk takes about ninety minutes.')).toBeInTheDocument()
  })

  it('shows a listening timestamp as mm:ss', () => {
    render(<ResultView result={RESULT} />)
    expect(screen.getAllByText('02:05').length).toBeGreaterThan(0)
    expect(screen.getByText('From the transcript at 01:02')).toBeInTheDocument()
  })
})

describe('ResultView — review filters', () => {
  it('shows every question by default', () => {
    render(<ResultView result={RESULT} flaggedIds={FLAGGED} />)
    expect(screen.getAllByTestId('review-item')).toHaveLength(6)
    expect(screen.getByTestId('review-count')).toHaveTextContent('Showing 6 of 6 questions')
  })

  it('narrows to the wrong answers only', async () => {
    const user = userEvent.setup()
    render(<ResultView result={RESULT} flaggedIds={FLAGGED} />)

    await user.click(screen.getByRole('button', { name: /Only wrong/ }))

    const items = screen.getAllByTestId('review-item')
    expect(items).toHaveLength(4)
    expect(items.every((li) => li.dataset.correct === 'false')).toBe(true)
    expect(screen.getByTestId('review-count')).toHaveTextContent('Showing 4 of 6 questions')
  })

  it('narrows to the flagged questions only', async () => {
    const user = userEvent.setup()
    render(<ResultView result={RESULT} flaggedIds={FLAGGED} />)

    await user.click(screen.getByRole('button', { name: /Only flagged/ }))

    expect(screen.getAllByTestId('review-item')).toHaveLength(2)
    expect(screen.getByTestId('review-count')).toHaveTextContent('Showing 2 of 6 questions')
  })

  it('disables the flagged filter when nothing was flagged', () => {
    render(<ResultView result={RESULT} />)
    expect(screen.getByRole('button', { name: /Only flagged/ })).toBeDisabled()
  })
})
