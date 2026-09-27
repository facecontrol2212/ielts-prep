import { describe, expect, it } from 'vitest'

import {
  accuracyPct,
  daysUntil,
  examHref,
  formatBand,
  formatBandDelta,
  formatBandOrDash,
  formatDuration,
  formatTimestamp,
  overallBand,
} from '@/components/dashboard/format'

describe('formatBand', () => {
  it('always shows exactly one decimal place', () => {
    expect(formatBand(6)).toBe('6.0')
    expect(formatBand(6.5)).toBe('6.5')
    expect(formatBand(9)).toBe('9.0')
    expect(formatBand(4.5)).toBe('4.5')
  })

  it('never renders a bare integer or two decimals', () => {
    for (const band of [4, 4.5, 5, 6, 6.5, 7, 8.5, 9]) {
      expect(formatBand(band)).toMatch(/^\d\.\d$/)
    }
    // the whole-band cases are the ones that regress
    for (const band of [4, 5, 6, 7, 9]) {
      expect(formatBand(band)).not.toBe(String(band))
    }
  })

  it('renders a missing band as an em dash', () => {
    expect(formatBandOrDash(null)).toBe('—')
    expect(formatBandOrDash(undefined)).toBe('—')
    expect(formatBandOrDash(7)).toBe('7.0')
  })
})

describe('formatBandDelta', () => {
  it('signs the gap and keeps one decimal', () => {
    expect(formatBandDelta(0.5)).toBe('+0.5')
    expect(formatBandDelta(-1)).toBe('-1.0')
    expect(formatBandDelta(0)).toBe('0.0')
  })
})

describe('overallBand', () => {
  it('rounds the way IELTS rounds (plan §7)', () => {
    // 6.5 + 6.5 + 5.0 + 7.0 = 25 / 4 = 6.25 -> 6.5
    expect(overallBand([6.5, 6.5, 5, 7])).toBe(6.5)
    // .75 rounds up to the whole band
    expect(overallBand([6.5, 7, 7, 7])).toBe(7)
    // below .25 rounds down
    expect(overallBand([6, 6, 6, 6.5])).toBe(6)
    expect(overallBand([6, 6, 6, 6])).toBe(6)
  })

  it('returns null with nothing to average', () => {
    expect(overallBand([])).toBeNull()
  })
})

describe('formatTimestamp', () => {
  it('is always zero-padded mm:ss', () => {
    expect(formatTimestamp(5)).toBe('00:05')
    expect(formatTimestamp(125)).toBe('02:05')
    expect(formatTimestamp(640)).toBe('10:40')
  })
})

describe('formatDuration', () => {
  it('reads as a time commitment', () => {
    expect(formatDuration(1800)).toBe('30 min')
    expect(formatDuration(3600)).toBe('60 min')
    expect(formatDuration(5400)).toBe('1 h 30 min')
  })
})

describe('accuracyPct', () => {
  it('rounds and survives a zero total', () => {
    expect(accuracyPct(29, 40)).toBe(73)
    expect(accuracyPct(0, 0)).toBe(0)
  })
})

describe('daysUntil', () => {
  it('counts whole days and goes negative once passed', () => {
    const now = new Date('2026-09-27T12:00:00Z')
    expect(daysUntil('2026-10-31', now)).toBe(34)
    expect(daysUntil('2026-09-27', now)).toBe(0)
    expect(daysUntil('2026-09-20', now)).toBe(-7)
  })
})

describe('examHref', () => {
  it('sends writing to its own runner', () => {
    expect(examHref('reading', 'a1')).toBe('/exam/a1')
    expect(examHref('listening', 'a1')).toBe('/exam/a1')
    expect(examHref('writing', 'a1')).toBe('/exam/writing/a1')
  })
})
