import { countWords } from '@/lib/utils'

const NUMERALS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN']

/** "NO MORE THAN TWO WORDS AND/OR A NUMBER" — the wording the real rubric uses. */
export function limitHint(limit: number | null, allowNumber: boolean): string | null {
  if (!limit) return allowNumber ? 'WRITE A NUMBER' : null
  const word = NUMERALS[limit - 1] ?? String(limit)
  const noun = limit === 1 ? 'WORD' : 'WORDS'
  return `NO MORE THAN ${word} ${noun}${allowNumber ? ' AND/OR A NUMBER' : ''}`
}

const NUMERIC_TOKEN = /^[\d][\d.,:/\\-]*$/

/**
 * Words the limit actually counts.
 *
 * "TWO WORDS AND/OR A NUMBER" allows two words *plus* one number, so a single purely
 * numeric token is free when `allowNumber` is set. Everything else follows countWords().
 */
export function countAnswerWords(value: string, allowNumber: boolean): number {
  const text = value.trim()
  if (!text) return 0
  if (!allowNumber) return countWords(text)
  let dropped = false
  const kept = text.split(/\s+/).filter((token) => {
    if (!dropped && NUMERIC_TOKEN.test(token)) {
      dropped = true
      return false
    }
    return true
  })
  return countWords(kept.join(' '))
}

/**
 * The warning string, or null when the answer is within the limit.
 *
 * We warn, we never block: the real test lets you over-write and then marks you wrong,
 * and a student needs to feel that before exam day.
 */
export function wordLimitWarning(
  value: string,
  limit: number | null,
  allowNumber: boolean,
): string | null {
  if (!limit) return null
  const count = countAnswerWords(value, allowNumber)
  if (count <= limit) return null
  return `${count} words — the limit is ${limit}`
}
