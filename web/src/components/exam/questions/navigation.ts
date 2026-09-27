import { allQuestions } from '@/lib/exam-store'
import type { AttemptSession } from '@/types/api'

/** Every question number in exam order. */
export function questionNumbers(session: AttemptSession | null): number[] {
  return allQuestions(session).map((q) => q.number)
}

/** The neighbouring question number, clamped at both ends. */
export function stepQuestion(
  session: AttemptSession | null,
  current: number,
  direction: 1 | -1,
): number {
  const numbers = questionNumbers(session)
  if (numbers.length === 0) return current
  const index = numbers.indexOf(current)
  if (index === -1) return numbers[0]
  const next = index + direction
  if (next < 0 || next >= numbers.length) return current
  return numbers[next]
}

/** The section that owns a question number, for keeping the section tabs in step. */
export function sectionOrderOf(session: AttemptSession | null, number: number): number | null {
  if (!session) return null
  for (const section of session.test.sections) {
    for (const group of section.groups) {
      if (group.questions.some((q) => q.number === number)) return section.order
    }
  }
  return null
}

export const focusAttr = 'data-question-focus'

/** Move the caret to a question's own control. Used by the palette, arrows and Enter. */
export function focusQuestion(number: number): void {
  if (typeof document === 'undefined') return
  const el = document.querySelector<HTMLElement>(`[${focusAttr}="${number}"]`)
  if (el) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.focus({ preventScroll: true })
    return
  }
  // Shared controls (a two-answer multiple choice) have no field of their own —
  // at least bring the block onto the screen.
  document
    .querySelector<HTMLElement>(`[data-question="${number}"]`)
    ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

/** True when the keystroke belongs to whatever the student is typing in. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true
  )
}
