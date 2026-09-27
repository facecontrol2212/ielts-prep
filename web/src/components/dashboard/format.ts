/**
 * Formatting helpers for the signed-in area (dashboard, catalogue, attempts, results).
 *
 * NOTE FOR THE OWNER OF src/lib: these belong in `src/lib/format.ts`. They live here
 * only because this agent may not write to src/lib. Move them and re-point the imports.
 */
import type { AnswerValue, Skill } from '@/types/api'

/** A band is always one decimal place: 6 -> "6.0", 6.5 -> "6.5". Never "6", never "6.50". */
export function formatBand(band: number): string {
  return band.toFixed(1)
}

export function formatBandOrDash(band: number | null | undefined): string {
  return band == null ? '—' : formatBand(band)
}

/** Signed band gap for "you are 0.5 below target": 0.5 -> "+0.5", -1 -> "-1.0". */
export function formatBandDelta(delta: number): string {
  if (Math.abs(delta) < 0.05) return '0.0'
  const magnitude = Math.abs(delta).toFixed(1)
  return delta > 0 ? `+${magnitude}` : `-${magnitude}`
}

/**
 * Overall band from the skill bands the student actually has (plan §7):
 * average, then round to the nearest half band with .25 and .75 rounding up.
 */
export function overallBand(bands: number[]): number | null {
  if (bands.length === 0) return null
  const average = bands.reduce((sum, b) => sum + b, 0) / bands.length
  const floorHalf = Math.floor(average * 2) / 2
  return average - floorHalf >= 0.25 - 1e-9 ? floorHalf + 0.5 : floorHalf
}

/** 3600 -> "60 min", 5400 -> "1 h 30 min". The catalogue promises a time commitment. */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60)
  // A 60-minute paper is "60 min" to a candidate, never "1 h".
  if (totalMinutes <= 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`
}

/** Listening evidence timestamps are always mm:ss, zero-padded, so they line up in a column. */
export function formatTimestamp(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${minutes.toString().padStart(2, '0')}:${rest.toString().padStart(2, '0')}`
}

export function accuracyPct(correct: number, total: number): number {
  return total === 0 ? 0 : Math.round((correct / total) * 100)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatShortDate(iso: string | number | null | undefined): string {
  if (iso == null) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Whole days from today to an exam date. Negative once the date has passed. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return 0
  const startOfDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((startOfDay(target) - startOfDay(now)) / 86_400_000)
}

/** A student's saved answer, rendered for reading. Multi-select answers join with ", ". */
export function answerText(value: AnswerValue): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.filter(Boolean).join(', ')
  return value.trim()
}

export const SKILL_ORDER: Skill[] = ['listening', 'reading', 'writing', 'speaking']

/** Where a test of this skill is sat. Writing has its own runner; speaking is not a timed exam. */
export function examHref(skill: Skill, attemptId: string): string {
  if (skill === 'writing') return `/exam/writing/${attemptId}`
  if (skill === 'speaking') return `/speaking`
  return `/exam/${attemptId}`
}

const DIFFICULTY_LABELS = ['', 'Foundation', 'Easy', 'Standard', 'Hard', 'Exam-hard']

export function difficultyLabel(difficulty: number): string {
  return DIFFICULTY_LABELS[Math.min(Math.max(difficulty, 1), 5)] ?? 'Standard'
}
