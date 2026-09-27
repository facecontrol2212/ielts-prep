'use client'

import { useCallback } from 'react'

import { useExamStore } from '@/lib/exam-store'
import type { AnswerValue } from '@/types/api'

/** The stored value for one question as a string ('' when unanswered). */
export function useTextAnswer(questionId: string): [string, (next: string) => void] {
  const raw = useExamStore((s) => s.answers[questionId])
  const setAnswer = useExamStore((s) => s.setAnswer)
  const value = typeof raw === 'string' ? raw : Array.isArray(raw) ? (raw[0] ?? '') : ''
  const set = useCallback(
    (next: string) => setAnswer(questionId, next === '' ? null : next),
    [questionId, setAnswer],
  )
  return [value, set]
}

/** The stored value for one question as a list (multi-select). */
export function useListAnswer(questionId: string): [string[], (next: string[]) => void] {
  const raw = useExamStore((s) => s.answers[questionId])
  const setAnswer = useExamStore((s) => s.setAnswer)
  const value = Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? [raw] : []
  const set = useCallback(
    (next: string[]) => setAnswer(questionId, next.length ? next : null),
    [questionId, setAnswer],
  )
  return [value, set]
}

/** Write the identical value to every question a shared control covers. */
export function useGroupAnswer(questionIds: string[]): (value: AnswerValue) => void {
  const setAnswer = useExamStore((s) => s.setAnswer)
  return useCallback(
    (value: AnswerValue) => questionIds.forEach((id) => setAnswer(id, value)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setAnswer, questionIds.join('|')],
  )
}
