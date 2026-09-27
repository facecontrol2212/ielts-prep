import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { CorrectedText } from '@/components/writing/corrected-text'
import { layoutCorrections } from '@/components/writing/corrections'
import type { Correction } from '@/types/api'

const TEXT = 'The chart show a rise in sales between 1990 and 2000.'

function correction(over: Partial<Correction>): Correction {
  return {
    offset: 0,
    length: 3,
    original: 'The',
    suggestion: 'A',
    issue: 'grammar',
    explanation: 'why',
    ...over,
  }
}

/** The one invariant that matters: the essay on screen is still the essay the student wrote. */
function renderedText(): string {
  return screen.getByTestId('marked-essay').textContent ?? ''
}

describe('layoutCorrections', () => {
  it('marks a valid range and leaves the rest of the text alone', () => {
    const c = correction({ offset: 10, length: 4, original: 'show', suggestion: 'shows' })
    const { segments, applied, dropped } = layoutCorrections(TEXT, [c])

    expect(dropped).toHaveLength(0)
    expect(applied).toHaveLength(1)
    expect(applied[0].text).toBe('show')
    expect(segments.map((s) => s.text).join('')).toBe(TEXT)
  })

  it('drops the later of two overlapping ranges, keeping the longer one', () => {
    const wide = correction({ offset: 4, length: 10, original: 'chart show', suggestion: 'chart shows' })
    const narrow = correction({ offset: 10, length: 4, original: 'show', suggestion: 'shows' })

    const { applied, dropped, segments } = layoutCorrections(TEXT, [narrow, wide])

    expect(applied.map((m) => m.text)).toEqual(['chart show'])
    expect(dropped).toEqual([{ correction: narrow, reason: 'overlap' }])
    expect(segments.map((s) => s.text).join('')).toBe(TEXT)
  })

  it('drops a range that runs past the end of the text', () => {
    const past = correction({ offset: TEXT.length - 2, length: 40, original: 'nope' })
    const beyond = correction({ offset: TEXT.length + 50, length: 3, original: 'xyz' })

    const { applied, dropped, segments } = layoutCorrections(TEXT, [past, beyond])

    expect(applied).toHaveLength(0)
    expect(dropped.map((d) => d.reason)).toEqual(['out_of_range', 'out_of_range'])
    expect(segments.map((s) => s.text).join('')).toBe(TEXT)
  })

  it('drops a zero-length correction', () => {
    const empty = correction({ offset: 10, length: 0, original: '' })
    const { applied, dropped, segments } = layoutCorrections(TEXT, [empty])

    expect(applied).toHaveLength(0)
    expect(dropped).toEqual([{ correction: empty, reason: 'empty' }])
    expect(segments.map((s) => s.text).join('')).toBe(TEXT)
  })

  it('drops a correction whose original does not match the text at that offset', () => {
    const stale = correction({ offset: 10, length: 4, original: 'sold', suggestion: 'sells' })
    const { applied, dropped, segments } = layoutCorrections(TEXT, [stale])

    expect(applied).toHaveLength(0)
    expect(dropped).toEqual([{ correction: stale, reason: 'text_mismatch' }])
    expect(segments.map((s) => s.text).join('')).toBe(TEXT)
  })

  it('rejects negative and non-integer offsets', () => {
    const negative = correction({ offset: -1, length: 3 })
    const fractional = correction({ offset: 1.5, length: 3 })
    const { dropped } = layoutCorrections(TEXT, [negative, fractional])
    expect(dropped.map((d) => d.reason)).toEqual(['invalid', 'invalid'])
  })

  it('tolerates a curly apostrophe in `original`', () => {
    const text = "It doesn't matter."
    const curly = correction({ offset: 3, length: 7, original: 'doesn’t', suggestion: 'does not' })
    const { applied } = layoutCorrections(text, [curly])
    expect(applied).toHaveLength(1)
  })

  it('handles an empty correction list and empty text', () => {
    expect(layoutCorrections(TEXT, []).segments.map((s) => s.text).join('')).toBe(TEXT)
    expect(layoutCorrections(TEXT, null).segments.map((s) => s.text).join('')).toBe(TEXT)
    expect(layoutCorrections('', [correction({})]).segments.map((s) => s.text).join('')).toBe('')
  })
})

describe('<CorrectedText />', () => {
  it('renders the whole essay intact when every correction is unusable', () => {
    render(
      <CorrectedText
        text={TEXT}
        corrections={[
          correction({ offset: 10, length: 0, original: '' }),
          correction({ offset: 900, length: 4, original: 'show' }),
          correction({ offset: 10, length: 4, original: 'sold' }),
        ]}
      />,
    )

    expect(renderedText()).toBe(TEXT)
    expect(screen.queryByRole('button', { name: /correction/i })).not.toBeInTheDocument()
    expect(screen.getByText(/3 further suggestions could not be matched/i)).toBeInTheDocument()
  })

  it('renders overlapping corrections without corrupting the text', () => {
    render(
      <CorrectedText
        text={TEXT}
        corrections={[
          correction({ offset: 10, length: 4, original: 'show', suggestion: 'shows' }),
          correction({ offset: 4, length: 10, original: 'chart show', suggestion: 'chart shows' }),
        ]}
      />,
    )

    expect(renderedText()).toBe(TEXT)
    expect(screen.getAllByRole('button', { name: /^Grammar correction/i })).toHaveLength(1)
  })

  it('opens a popover with the suggestion and the explanation', async () => {
    const user = userEvent.setup()
    render(
      <CorrectedText
        text={TEXT}
        corrections={[
          correction({
            offset: 10,
            length: 4,
            original: 'show',
            suggestion: 'shows',
            issue: 'grammar',
            explanation: 'The subject "chart" is singular.',
          }),
        ]}
      />,
    )

    const mark = screen.getByRole('button', { name: /Grammar correction 1: show/i })
    expect(mark).toHaveAttribute('aria-expanded', 'false')

    await user.click(mark)

    const popover = screen.getByRole('dialog', { name: /Grammar correction 1/i })
    expect(popover).toHaveTextContent('shows')
    expect(popover).toHaveTextContent('The subject "chart" is singular.')
    expect(mark).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('summarises the corrections by issue', () => {
    render(
      <CorrectedText
        text={TEXT}
        corrections={[
          correction({ offset: 10, length: 4, original: 'show', issue: 'grammar' }),
          correction({ offset: 25, length: 5, original: 'sales', issue: 'vocabulary' }),
        ]}
      />,
    )
    expect(screen.getByText(/Grammar 1/)).toBeInTheDocument()
    expect(screen.getByText(/Vocabulary 1/)).toBeInTheDocument()
    expect(renderedText()).toBe(TEXT)
  })
})
