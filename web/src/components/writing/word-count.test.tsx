import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  UnderLengthWarning,
  WordCount,
  minimumWords,
  wordCountTone,
} from '@/components/writing/word-count'

describe('wordCountTone', () => {
  it('flips at the Task 1 minimum of 150', () => {
    expect(wordCountTone(149, 150)).toBe('warning')
    expect(wordCountTone(150, 150)).toBe('success')
    expect(wordCountTone(151, 150)).toBe('success')
  })

  it('flips at the Task 2 minimum of 250', () => {
    expect(wordCountTone(249, 250)).toBe('warning')
    expect(wordCountTone(250, 250)).toBe('success')
  })

  it('is neutral before anything is written and red while a long way short', () => {
    expect(wordCountTone(0, 250)).toBe('muted')
    expect(wordCountTone(100, 250)).toBe('danger')
    // The amber band starts at 90% of the minimum.
    expect(wordCountTone(224, 250)).toBe('danger')
    expect(wordCountTone(225, 250)).toBe('warning')
  })
})

describe('minimumWords', () => {
  it('defaults by task number and respects a section override', () => {
    expect(minimumWords(1)).toBe(150)
    expect(minimumWords(2)).toBe(250)
    expect(minimumWords(1, 200)).toBe(200)
  })
})

describe('WordCount', () => {
  it('renders the count with the tone for the threshold', () => {
    const { rerender } = render(<WordCount count={149} min={150} />)
    expect(screen.getByTestId('word-count')).toHaveAttribute('data-tone', 'warning')
    expect(screen.getByTestId('word-count')).toHaveTextContent('149')

    rerender(<WordCount count={150} min={150} />)
    expect(screen.getByTestId('word-count')).toHaveAttribute('data-tone', 'success')
  })
})

describe('UnderLengthWarning', () => {
  it('warns while under the minimum and says how many words are missing', () => {
    render(<UnderLengthWarning count={230} min={250} taskNumber={2} />)
    expect(screen.getByRole('status')).toHaveTextContent('20 words short')
    expect(screen.getByRole('status')).toHaveTextContent('length penalty')
  })

  it('says nothing at the minimum or on an empty answer', () => {
    const { container, rerender } = render(
      <UnderLengthWarning count={250} min={250} taskNumber={2} />,
    )
    expect(container).toBeEmptyDOMElement()
    rerender(<UnderLengthWarning count={0} min={250} taskNumber={2} />)
    expect(container).toBeEmptyDOMElement()
  })
})
