import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BandPanel, criterionRows } from '@/components/writing/band-panel'
import type { WritingFeedback } from '@/types/api'

const feedback: WritingFeedback = {
  band_task: 6.5,
  band_coherence: 6,
  band_lexical: 5.5,
  band_grammar: 6,
  band_overall: 6,
  strengths: [],
  improvements: [],
  corrections: [],
  improved_paragraph: null,
  off_topic: false,
  under_length_penalty: false,
}

describe('<BandPanel />', () => {
  it('renders the four criterion bands and the overall', () => {
    render(<BandPanel feedback={feedback} taskNumber={2} />)

    expect(screen.getByTestId('overall-band')).toHaveTextContent('6.0')
    expect(screen.getByTestId('band-task')).toHaveTextContent('6.5')
    expect(screen.getByTestId('band-coherence')).toHaveTextContent('6.0')
    expect(screen.getByTestId('band-lexical')).toHaveTextContent('5.5')
    expect(screen.getByTestId('band-grammar')).toHaveTextContent('6.0')
  })

  it('marks the lowest criterion and nothing else', () => {
    render(<BandPanel feedback={feedback} taskNumber={2} />)

    const weakest = screen.getAllByText('Weakest')
    expect(weakest).toHaveLength(1)

    const row = weakest[0].closest('li')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('Lexical Resource')).toBeInTheDocument()
    expect(within(row as HTMLElement).getByTestId('band-lexical')).toHaveTextContent('5.5')
  })

  it('marks every criterion tied at the lowest band', () => {
    render(
      <BandPanel
        feedback={{ ...feedback, band_lexical: 6, band_task: 6 }}
        taskNumber={2}
      />,
    )
    expect(screen.getAllByText('Weakest')).toHaveLength(4)
  })

  it('names the task criterion correctly for each task', () => {
    expect(criterionRows(feedback, 1)[0].label).toBe('Task Achievement')
    expect(criterionRows(feedback, 2)[0].label).toBe('Task Response')
  })

  it('exposes each band to assistive tech on the 0-9 scale', () => {
    render(<BandPanel feedback={feedback} taskNumber={1} />)
    const meter = screen.getByRole('meter', { name: /Lexical Resource: band 5.5 of 9/i })
    expect(meter).toHaveAttribute('aria-valuemax', '9')
  })
})
