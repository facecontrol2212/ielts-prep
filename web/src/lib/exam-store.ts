'use client'

import { create } from 'zustand'

import type { AnswerValue, AttemptSession, Question } from '@/types/api'

export interface ExamState {
  attemptId: string | null
  session: AttemptSession | null
  /** question_id -> value */
  answers: Record<string, AnswerValue>
  /** question_id -> flagged */
  flags: Record<string, boolean>
  /** question ids changed since the last successful save */
  dirty: Set<string>
  currentQuestion: number
  currentSection: number
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  lastSavedAt: number | null
  submitted: boolean

  hydrate: (session: AttemptSession) => void
  setAnswer: (questionId: string, value: AnswerValue) => void
  toggleFlag: (questionId: string) => void
  goToQuestion: (n: number) => void
  setSection: (order: number) => void
  markSaved: (ids: string[]) => void
  setSaveState: (s: ExamState['saveState']) => void
  reset: () => void
}

export const useExamStore = create<ExamState>((set) => ({
  attemptId: null,
  session: null,
  answers: {},
  flags: {},
  dirty: new Set(),
  currentQuestion: 1,
  currentSection: 1,
  saveState: 'idle',
  lastSavedAt: null,
  submitted: false,

  hydrate: (session) =>
    set(() => ({
      attemptId: session.attempt.id,
      session,
      answers: Object.fromEntries(session.answers.map((a) => [a.question_id, a.value])),
      flags: Object.fromEntries(session.answers.map((a) => [a.question_id, a.is_flagged])),
      dirty: new Set<string>(),
      currentSection: session.test.sections[0]?.order ?? 1,
      currentQuestion: session.test.sections[0]?.start_question ?? 1,
      submitted: session.attempt.status !== 'in_progress',
    })),

  setAnswer: (questionId, value) =>
    set((s) => {
      const dirty = new Set(s.dirty)
      dirty.add(questionId)
      return { answers: { ...s.answers, [questionId]: value }, dirty, saveState: 'idle' }
    }),

  toggleFlag: (questionId) =>
    set((s) => {
      const dirty = new Set(s.dirty)
      dirty.add(questionId)
      return { flags: { ...s.flags, [questionId]: !s.flags[questionId] }, dirty }
    }),

  goToQuestion: (n) => set({ currentQuestion: n }),
  setSection: (order) => set({ currentSection: order }),

  markSaved: (ids) =>
    set((s) => {
      const dirty = new Set(s.dirty)
      ids.forEach((id) => dirty.delete(id))
      return { dirty, saveState: dirty.size ? 'idle' : 'saved', lastSavedAt: Date.now() }
    }),

  setSaveState: (saveState) => set({ saveState }),
  reset: () =>
    set({
      attemptId: null,
      session: null,
      answers: {},
      flags: {},
      dirty: new Set(),
      currentQuestion: 1,
      currentSection: 1,
      saveState: 'idle',
      lastSavedAt: null,
      submitted: false,
    }),
}))

/** Flatten every question of a session in exam order. */
export function allQuestions(session: AttemptSession | null): Question[] {
  if (!session) return []
  return session.test.sections
    .flatMap((s) => s.groups.flatMap((g) => g.questions))
    .sort((a, b) => a.number - b.number)
}

export function isAnswered(value: AnswerValue): boolean {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  return value.trim() !== ''
}
