import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ACADEMIC_READING_TABLE,
  BAND_STEPS,
  LISTENING_TABLE,
  bandFromRaw,
  explainOverall,
  formatBand,
  overallBand,
} from '@/components/marketing/band'
import { BandCalculator, bandsFromQuery, queryFromBands } from '@/components/marketing/band-calculator'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: { ...actual.api, post: vi.fn(), get: vi.fn() },
  }
})

const { api } = await import('@/lib/api')
const post = vi.mocked(api.post)

describe('overallBand', () => {
  const cases: [number, number, number, number, number, string][] = [
    [6.5, 6.5, 5.0, 7.0, 6.5, 'the official example: 6.25 rounds up to 6.5'],
    [6.5, 6.5, 7.0, 7.0, 7.0, '6.75 rounds up to the next whole band'],
    [7.0, 7.0, 6.5, 7.0, 7.0, '6.875 rounds up to 7.0'],
    [6.0, 6.0, 6.0, 6.5, 6.0, '6.125 rounds down to 6.0'],
    [6.0, 6.5, 6.5, 6.5, 6.5, '6.375 rounds up to 6.5'],
    [6.5, 6.5, 6.5, 7.0, 6.5, '6.625 rounds down to 6.5'],
    [6.0, 6.0, 6.0, 6.0, 6.0, 'an exact band stays put'],
    [6.5, 6.5, 6.5, 6.5, 6.5, 'an exact half band stays put'],
    [5.5, 6.0, 6.5, 7.0, 6.5, '6.25 rounds up to 6.5'],
    [4.0, 5.0, 5.5, 5.0, 5.0, '4.875 rounds up to 5.0'],
    [8.5, 9.0, 8.0, 9.0, 8.5, '8.625 rounds down to 8.5'],
    [9.0, 9.0, 9.0, 9.0, 9.0, 'the ceiling'],
    [0, 0, 0, 0, 0, 'the floor'],
    [5.0, 5.0, 5.0, 6.0, 5.5, '5.25 rounds up to 5.5'],
    [5.0, 5.5, 6.0, 6.5, 6.0, '5.75 rounds up to the next whole band'],
  ]

  it.each(cases)('%s/%s/%s/%s -> %s (%s)', (l, r, w, s, expected) => {
    expect(overallBand(l, r, w, s)).toBe(expected)
  })

  it('every combination of valid skill bands lands on a valid band', () => {
    for (const l of BAND_STEPS) {
      for (const r of BAND_STEPS) {
        const band = overallBand(l, r, 6, 6)
        expect(BAND_STEPS).toContain(band)
        expect(band).toBeGreaterThanOrEqual(0)
        expect(band).toBeLessThanOrEqual(9)
      }
    }
  })

  it('never moves the average by more than a quarter band', () => {
    const bands = { listening: 6.5, reading: 7, writing: 6, speaking: 5.5 }
    const average =
      (bands.listening + bands.reading + bands.writing + bands.speaking) / 4
    const overall = overallBand(bands.listening, bands.reading, bands.writing, bands.speaking)
    expect(Math.abs(overall - average)).toBeLessThanOrEqual(0.25)
  })
})

describe('explainOverall', () => {
  it('names the direction the average moved', () => {
    expect(explainOverall({ listening: 6.5, reading: 6.5, writing: 5, speaking: 7 })).toBe(
      'The average of 6.5, 6.5, 5, 7 is 6.25, which rounds up to 6.5.',
    )
  })

  it('says so when the average is already a band', () => {
    expect(explainOverall({ listening: 6, reading: 6, writing: 6, speaking: 6 })).toContain(
      'is already a valid band: 6.0',
    )
  })
})

describe('raw score tables', () => {
  it.each([
    [LISTENING_TABLE, 40, 9],
    [LISTENING_TABLE, 32, 7.5],
    [LISTENING_TABLE, 26, 6.5],
    [LISTENING_TABLE, 23, 6],
    [LISTENING_TABLE, 0, 0],
    [ACADEMIC_READING_TABLE, 33, 7.5],
    [ACADEMIC_READING_TABLE, 30, 7],
    [ACADEMIC_READING_TABLE, 26, 6],
    [ACADEMIC_READING_TABLE, 8, 3.5],
  ])('converts a raw score to the published band', (table, raw, band) => {
    expect(bandFromRaw(table, raw)).toBe(band)
  })

  it('covers every raw score from 0 to 40 with no gaps', () => {
    for (const table of [LISTENING_TABLE, ACADEMIC_READING_TABLE]) {
      for (let raw = 0; raw <= 40; raw += 1) {
        expect(table.filter((row) => raw >= row.raw_min && raw <= row.raw_max)).toHaveLength(1)
      }
    }
  })
})

describe('formatBand', () => {
  it.each([
    [6, '6.0'],
    [6.5, '6.5'],
    [9, '9.0'],
  ])('writes %s as %s', (input, expected) => {
    expect(formatBand(input)).toBe(expected)
  })
})

describe('share link', () => {
  it('round-trips the four bands through the query string', () => {
    const bands = { listening: 6.5, reading: 7, writing: 5.5, speaking: 8 }
    expect(bandsFromQuery(queryFromBands(bands))).toEqual(bands)
  })

  it('clamps nonsense in a shared link to a real band', () => {
    expect(bandsFromQuery('?l=12&r=-3&w=6.3&s=abc')).toEqual({
      listening: 9,
      reading: 0,
      writing: 6.5,
      speaking: 6,
    })
  })
})

describe('<BandCalculator />', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockRejectedValue(new Error('offline'))
    window.history.replaceState(null, '', '/calculator')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the overall band for the values in the sliders', async () => {
    render(<BandCalculator />)
    expect(await screen.findByTestId('overall-band')).toHaveTextContent('6.0')
    expect(screen.getByLabelText('Listening')).toHaveValue('6')
  })

  it('recalculates when a skill band changes', async () => {
    render(<BandCalculator />)
    const listening = screen.getByLabelText('Listening')
    fireEvent.change(listening, { target: { value: '7' } })
    expect(listening).toHaveValue('7')
    expect(screen.getByTestId('overall-band')).toHaveTextContent('6.5')
    expect(
      screen.getByText('The average of 7, 6, 6, 6 is 6.25, which rounds up to 6.5.'),
    ).toBeInTheDocument()
  })

  it('reads a shared result out of the URL', async () => {
    window.history.replaceState(null, '', '/calculator?l=7&r=6.5&w=6&s=7.5')
    render(<BandCalculator />)
    expect(await screen.findByLabelText('Reading')).toHaveValue('6.5')
    expect(screen.getByTestId('overall-band')).toHaveTextContent('7.0')
  })

  it('says so when the scoring service cannot be reached', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<BandCalculator />)
    await vi.advanceTimersByTimeAsync(500)
    expect(
      await screen.findByText(/the scoring service is not reachable/i),
    ).toBeInTheDocument()
  })

  it('warns loudly when the scoring service disagrees with the local answer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    post.mockResolvedValue({ overall: 7, average: 6, explanation: 'server says 7' })
    render(<BandCalculator />)
    await vi.advanceTimersByTimeAsync(500)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/different number/i)
    expect(post).toHaveBeenCalledWith(
      '/score/overall',
      { listening: 6, reading: 6, writing: 6, speaking: 6 },
      { anonymous: true },
    )
  })
})
