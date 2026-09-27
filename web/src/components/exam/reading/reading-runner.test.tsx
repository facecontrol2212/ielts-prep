import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeGroup, makeSection, makeSession } from '@/components/exam/questions/fixtures'
import { PassagePane, withParagraphLetters } from '@/components/exam/reading/passage-pane'
import { ReadingRunner } from '@/components/exam/reading/reading-runner'
import { useExamStore } from '@/lib/exam-store'

const PASSAGE =
  '<p>Kelp forests grow fastest in cold water.</p><p>Otters keep the urchins in check.</p>'

function readingSession() {
  return makeSession({
    sections: [
      makeSection(1, [makeGroup('matching_headings', [1, 2], { options: [{ label: 'i', text: 'Growth' }] })], {
        passage_html: PASSAGE,
        title: 'Passage 1',
      }),
      makeSection(2, [makeGroup('short_answer', [3, 4])], {
        passage_html: '<p>Second passage.</p>',
        title: 'Passage 2',
      }),
    ],
  })
}

function setViewport(desktop: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: desktop && query.includes('min-width: 1024px'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  useExamStore.getState().reset()
  window.localStorage.clear()
  setViewport(false)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('paragraph letters', () => {
  it('puts A, B, C in front of each paragraph', () => {
    const html = withParagraphLetters(PASSAGE)
    expect(html).toContain('<span class="para-label">A</span>')
    expect(html).toContain('<span class="para-label">B</span>')
  })

  it('leaves an authored passage that already has letters alone', () => {
    const authored = '<p><span class="para-label">A</span>Already lettered.</p>'
    expect(withParagraphLetters(authored)).toBe(authored)
  })
})

describe('the passage pane', () => {
  const mount = () =>
    render(
      <PassagePane
        attemptId="attempt-1"
        sectionId="section-1"
        title="Passage 1"
        instructions="Read the passage below."
        passageHtml={PASSAGE}
        paragraphLetters
      />,
    )

  it('warns that the two panes scroll separately', () => {
    setViewport(true)
    render(<ReadingRunner session={readingSession()} />)
    expect(screen.getByText(/does not move the passage/i)).toBeInTheDocument()
  })

  it('highlights a selection and keeps it across a remount', async () => {
    const { unmount } = mount()
    const paragraph = screen.getByText(/Kelp forests grow fastest/)
    const textNode = paragraph.lastChild
    if (!textNode) throw new Error('no text node')

    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 4)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    await userEvent.click(screen.getByRole('button', { name: /Highlight/ }))
    expect(document.querySelectorAll('mark.hl')).toHaveLength(1)
    expect(window.localStorage.getItem('ielts.highlights.attempt-1.section-1')).toContain('start')

    unmount()
    mount()
    expect(document.querySelectorAll('mark.hl')).toHaveLength(1)
    expect(document.querySelector('mark.hl')?.textContent).toBe('Kelp')
  })

  it('survives a localStorage that refuses to write', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    mount()
    const paragraph = screen.getByText(/Kelp forests grow fastest/)
    const textNode = paragraph.lastChild
    if (!textNode) throw new Error('no text node')
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 4)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    await userEvent.click(screen.getByRole('button', { name: /Highlight/ }))
    expect(document.querySelectorAll('mark.hl')).toHaveLength(1)
  })
})

describe('layout', () => {
  it('stacks into tabs on a phone', async () => {
    render(<ReadingRunner session={readingSession()} />)
    const tabs = screen.getByRole('tablist', { name: /Passage or questions/ })
    expect(within(tabs).getAllByRole('tab')).toHaveLength(2)

    expect(screen.getByText(/Kelp forests grow fastest/)).toBeInTheDocument()
    await userEvent.click(within(tabs).getByRole('tab', { name: 'questions' }))
    expect(screen.getByLabelText('Question 1 answer')).toBeInTheDocument()
  })

  it('uses a draggable divider on a wide screen and remembers the ratio', () => {
    window.localStorage.setItem('ielts.exam.reading.split', '40')
    setViewport(true)
    render(<ReadingRunner session={readingSession()} />)

    const divider = screen.getByRole('separator', { name: /Resize the passage/ })
    expect(divider).toHaveAttribute('aria-valuenow', '40')
    expect(screen.queryByRole('tablist', { name: /Passage or questions/ })).not.toBeInTheDocument()
  })

  it('moves the divider with the arrow keys and stores the new ratio', async () => {
    setViewport(true)
    render(<ReadingRunner session={readingSession()} />)
    const divider = screen.getByRole('separator', { name: /Resize the passage/ })
    divider.focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(divider).toHaveAttribute('aria-valuenow', '50')
    expect(window.localStorage.getItem('ielts.exam.reading.split')).toBe('50')
  })

  it('brings the questions tab forward when the navigator jumps to a question', () => {
    render(<ReadingRunner session={readingSession()} />)
    expect(screen.getByText(/Kelp forests grow fastest/)).toBeInTheDocument()
    act(() => useExamStore.getState().goToQuestion(2))
    expect(screen.getByLabelText('Question 2 answer')).toBeInTheDocument()
  })

  it('switches passage when a section tab is chosen', async () => {
    render(<ReadingRunner session={readingSession()} />)
    await userEvent.click(screen.getByRole('button', { name: /Passage 2/ }))
    expect(screen.getByText('Second passage.')).toBeInTheDocument()
    expect(useExamStore.getState().currentQuestion).toBe(3)
  })
})
