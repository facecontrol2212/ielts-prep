import { describe, expect, it } from 'vitest'

import { countWords, formatClock } from '@/lib/utils'

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [65, '1:05'],
    [600, '10:00'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [-10, '0:00'],
  ])('formats %i seconds as %s', (input, expected) => {
    expect(formatClock(input)).toBe(expected)
  })
})

describe('countWords', () => {
  it.each([
    ['', 0],
    ['hello', 1],
    ['hello world', 2],
    ['  spaced   out  words ', 3],
    ['air-conditioning is cold', 3],
    ['I spent 20,000 dollars', 4],
    ["don't stop", 2],
  ])('counts %j as %i words', (text, expected) => {
    expect(countWords(text)).toBe(expected)
  })
})
