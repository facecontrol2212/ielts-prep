import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { QuestionGroupView } from '@/components/exam/questions/question-group-view'
import {
  makeGroup,
  makeOptions,
  makeQuestion,
  makeSection,
  makeSession,
} from '@/components/exam/questions/fixtures'
import { useExamStore } from '@/lib/exam-store'
import type { AnswerValue, QuestionGroup } from '@/types/api'

function mount(group: QuestionGroup, answers: Record<string, AnswerValue> = {}) {
  const session = makeSession({ sections: [makeSection(1, [group])] })
  useExamStore.getState().hydrate({
    ...session,
    answers: Object.entries(answers).map(([question_id, value]) => ({
      question_id,
      value,
      is_flagged: false,
    })),
  })
  return render(<QuestionGroupView group={group} />)
}

const answerOf = (id: string) => useExamStore.getState().answers[id]

beforeEach(() => {
  useExamStore.getState().reset()
})

describe('multiple choice (one answer)', () => {
  const group = () =>
    makeGroup('multiple_choice', [1], {
      options: makeOptions(['A', 'B', 'C'], ['Kelp', 'Urchins', 'Otters']),
      questions: [makeQuestion(1, 'multiple_choice', { prompt: 'What do otters eat?' })],
    })

  it('records the chosen letter', async () => {
    const g = group()
    mount(g)
    await userEvent.click(screen.getByRole('radio', { name: /Urchins/ }))
    expect(answerOf(g.questions[0].id)).toBe('B')
  })

  it('shows an answer that was already saved', () => {
    const g = group()
    mount(g, { [g.questions[0].id]: 'C' })
    expect(screen.getByRole('radio', { name: /Otters/ })).toBeChecked()
  })
})

describe('multiple choice (several answers)', () => {
  const group = () =>
    makeGroup('multiple_choice_multi', [2, 3], {
      select_count: 2,
      options: makeOptions(['A', 'B', 'C', 'D']),
    })

  it('writes the whole set to every question the item covers', async () => {
    const g = group()
    mount(g)
    await userEvent.click(screen.getByRole('checkbox', { name: /option A/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /option C/ }))
    expect(answerOf(g.questions[0].id)).toEqual(['A', 'C'])
    expect(answerOf(g.questions[1].id)).toEqual(['A', 'C'])
  })

  it('blocks a third tick once select_count is reached', async () => {
    const g = group()
    mount(g)
    await userEvent.click(screen.getByRole('checkbox', { name: /option A/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /option B/ }))

    const third = screen.getByRole('checkbox', { name: /option C/ })
    expect(third).toBeDisabled()
    await userEvent.click(third)
    expect(answerOf(g.questions[0].id)).toEqual(['A', 'B'])
  })

  it('frees a slot again when one is unticked', async () => {
    const g = group()
    mount(g, { [g.questions[0].id]: ['A', 'B'] })
    await userEvent.click(screen.getByRole('checkbox', { name: /option A/ }))
    expect(screen.getByRole('checkbox', { name: /option C/ })).toBeEnabled()
    expect(answerOf(g.questions[0].id)).toEqual(['B'])
  })

  it('shows a saved set on mount', () => {
    const g = group()
    mount(g, { [g.questions[0].id]: ['B', 'D'] })
    expect(screen.getByRole('checkbox', { name: /option B/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /option D/ })).toBeChecked()
  })
})

describe('true/false/not given and yes/no/not given', () => {
  it('stores the segment label', async () => {
    const g = makeGroup('true_false_not_given', [1])
    mount(g)
    await userEvent.click(screen.getByRole('radio', { name: 'NOT GIVEN' }))
    expect(answerOf(g.questions[0].id)).toBe('NOT GIVEN')
  })

  it('uses YES/NO wording for yes_no_not_given', async () => {
    const g = makeGroup('yes_no_not_given', [1])
    mount(g)
    expect(screen.getByRole('radio', { name: 'YES' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'TRUE' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'NO' }))
    expect(answerOf(g.questions[0].id)).toBe('NO')
  })

  it('reflects a saved answer', () => {
    const g = makeGroup('true_false_not_given', [1])
    mount(g, { [g.questions[0].id]: 'FALSE' })
    expect(screen.getByRole('radio', { name: 'FALSE' })).toBeChecked()
  })
})

describe.each([
  'matching_headings',
  'matching_information',
  'matching_features',
  'matching_sentence_endings',
] as const)('%s', (type) => {
  const group = () => makeGroup(type, [1, 2], { options: makeOptions(['A', 'B', 'C']) })

  it('stores the selected option label', async () => {
    const g = group()
    mount(g)
    await userEvent.selectOptions(screen.getByLabelText('Question 1 answer'), 'B')
    expect(answerOf(g.questions[0].id)).toBe('B')
  })

  it('reflects a saved answer', () => {
    const g = group()
    mount(g, { [g.questions[1].id]: 'C' })
    expect(screen.getByLabelText<HTMLSelectElement>('Question 2 answer').value).toBe('C')
  })
})

describe('matching reuse rules', () => {
  it('greys out a letter already used elsewhere in the group', async () => {
    const g = makeGroup('matching_headings', [1, 2], { options: makeOptions(['A', 'B']) })
    mount(g, { [g.questions[0].id]: 'A' })
    const second = screen.getByLabelText('Question 2 answer')
    expect(within(second).getByRole('option', { name: /^A/ })).toBeDisabled()
  })

  it('keeps every letter available for matching information', () => {
    const g = makeGroup('matching_information', [1, 2], { options: makeOptions(['A', 'B']) })
    mount(g, { [g.questions[0].id]: 'A' })
    const second = screen.getByLabelText('Question 2 answer')
    expect(within(second).getByRole('option', { name: /^A/ })).toBeEnabled()
  })
})

describe.each([
  ['sentence_completion', '<p>Otters eat [[1]] daily.</p>'],
  ['summary_completion', '<p>The forest shelters [[1]].</p>'],
  ['note_completion', '<ul><li>Depth: [[1]]</li></ul>'],
  ['table_completion', '<table><tbody><tr><td>Year</td><td>[[1]]</td></tr></tbody></table>'],
  ['flow_chart_completion', '<p>Survey &rarr; [[1]] &rarr; Report</p>'],
  ['form_completion', '<p>Name: [[1]]</p>'],
] as const)('%s', (type, html) => {
  const group = () => makeGroup(type, [1], { word_limit: 2, content_html: html })

  it('renders an input in the gap and stores what is typed', async () => {
    const g = group()
    mount(g)
    const input = screen.getByLabelText('Question 1 answer')
    await userEvent.type(input, 'sea urchins')
    expect(answerOf(g.questions[0].id)).toBe('sea urchins')
  })

  it('shows a saved answer', () => {
    const g = group()
    mount(g, { [g.questions[0].id]: 'kelp' })
    expect(screen.getByLabelText<HTMLInputElement>('Question 1 answer').value).toBe('kelp')
  })
})

describe('completion placeholders', () => {
  it('renders one input per placeholder, in document order', () => {
    const g = makeGroup('table_completion', [14, 15, 16], {
      word_limit: 2,
      content_html:
        '<table><tbody>' +
        '<tr><td>First</td><td>[[14]]</td></tr>' +
        '<tr><td>Second</td><td>[[15]]</td></tr>' +
        '<tr><td>Third</td><td>[[16]]</td></tr>' +
        '</tbody></table>',
    })
    mount(g)
    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(3)
    expect(inputs.map((i) => i.getAttribute('aria-label'))).toEqual([
      'Question 14 answer',
      'Question 15 answer',
      'Question 16 answer',
    ])
    // the surrounding table survived the parse
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('keeps a blank that sits mid-sentence inline with its text', () => {
    const g = makeGroup('sentence_completion', [7], {
      content_html: '<p>The kelp grows to [[7]] in one season.</p>',
    })
    mount(g)
    const paragraph = screen.getByText(/The kelp grows to/)
    expect(within(paragraph).getByLabelText('Question 7 answer')).toBeInTheDocument()
    expect(paragraph.textContent).toContain('in one season.')
  })

  it('falls back to a plain field for a question with no placeholder', () => {
    const g = makeGroup('note_completion', [1, 2], {
      content_html: '<p>Only [[1]] is in the text.</p>',
    })
    mount(g)
    expect(screen.getByLabelText('Question 1 answer')).toBeInTheDocument()
    expect(screen.getByLabelText('Question 2 answer')).toBeInTheDocument()
  })
})

describe('diagram and map labelling', () => {
  it('pairs a numbered marker with a text field beside the image', async () => {
    const g = makeGroup('diagram_labelling', [19], {
      image_url: '/diagram.png',
      word_limit: 2,
    })
    mount(g)
    expect(screen.getByRole('img')).toHaveAttribute('src', '/diagram.png')
    await userEvent.type(screen.getByLabelText('Question 19 answer'), 'rudder')
    expect(answerOf(g.questions[0].id)).toBe('rudder')
  })

  it('uses a dropdown when the labels come from a box', async () => {
    const g = makeGroup('map_labelling', [20], {
      image_url: '/map.png',
      options: makeOptions(['A', 'B', 'C']),
    })
    mount(g)
    await userEvent.selectOptions(screen.getByLabelText('Question 20 answer'), 'C')
    expect(answerOf(g.questions[0].id)).toBe('C')
  })

  it('reflects a saved label', () => {
    const g = makeGroup('diagram_labelling', [19], { image_url: '/d.png' })
    mount(g, { [g.questions[0].id]: 'keel' })
    expect(screen.getByLabelText<HTMLInputElement>('Question 19 answer').value).toBe('keel')
  })
})

describe('short answer', () => {
  it('stores the text and shows a saved answer', async () => {
    const g = makeGroup('short_answer', [1], { word_limit: 3, allow_number: true })
    mount(g)
    await userEvent.type(screen.getByLabelText('Question 1 answer'), 'in the bay')
    expect(answerOf(g.questions[0].id)).toBe('in the bay')
  })

  it('prints the word limit as the rubric words it', () => {
    mount(makeGroup('short_answer', [1], { word_limit: 2, allow_number: true }))
    expect(screen.getByText('NO MORE THAN TWO WORDS AND/OR A NUMBER')).toBeInTheDocument()
  })
})

describe('word limit warning', () => {
  it('stays quiet at exactly the limit', async () => {
    mount(makeGroup('short_answer', [1], { word_limit: 2 }))
    await userEvent.type(screen.getByLabelText('Question 1 answer'), 'sea otters')
    expect(screen.queryByText(/the limit is/)).not.toBeInTheDocument()
  })

  it('warns at one word over the limit, without blocking the answer', async () => {
    const g = makeGroup('short_answer', [1], { word_limit: 2 })
    mount(g)
    const input = screen.getByLabelText('Question 1 answer')
    await userEvent.type(input, 'three sea otters')
    expect(screen.getByText('3 words — the limit is 2')).toBeInTheDocument()
    // the student is never prevented from typing it
    expect(answerOf(g.questions[0].id)).toBe('three sea otters')
    expect(input).toBeEnabled()
  })

  it('lets a number ride free when the rubric allows one', async () => {
    mount(makeGroup('short_answer', [1], { word_limit: 2, allow_number: true }))
    await userEvent.type(screen.getByLabelText('Question 1 answer'), '1920 sea otters')
    expect(screen.queryByText(/the limit is/)).not.toBeInTheDocument()
  })

  it('says nothing when the group has no limit', async () => {
    mount(makeGroup('short_answer', [1]))
    await userEvent.type(screen.getByLabelText('Question 1 answer'), 'as many words as I like')
    expect(screen.queryByText(/the limit is/)).not.toBeInTheDocument()
  })
})

describe('moving on with Enter', () => {
  it('jumps from one text box to the next', async () => {
    const g = makeGroup('short_answer', [1, 2])
    mount(g)
    const first = screen.getByLabelText('Question 1 answer')
    await userEvent.click(first)
    await userEvent.keyboard('otters{Enter}')

    expect(answerOf(g.questions[0].id)).toBe('otters')
    expect(useExamStore.getState().currentQuestion).toBe(2)
    expect(screen.getByLabelText('Question 2 answer')).toHaveFocus()
  })

  it('stays put on the last question', async () => {
    const g = makeGroup('short_answer', [1])
    mount(g)
    const only = screen.getByLabelText('Question 1 answer')
    await userEvent.click(only)
    await userEvent.keyboard('kelp{Enter}')
    expect(only).toHaveFocus()
    expect(useExamStore.getState().currentQuestion).toBe(1)
  })
})

describe('flagging', () => {
  it('flags the question the button belongs to', async () => {
    const g = makeGroup('short_answer', [1])
    mount(g)
    await userEvent.click(screen.getByRole('button', { name: /Flag question 1/ }))
    expect(useExamStore.getState().flags[g.questions[0].id]).toBe(true)
  })
})
