'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ExamShell, SubmitDialog, type PaletteSection } from '@/components/exam'
import { ListeningRunner } from '@/components/exam/listening'
import {
  focusQuestion,
  isTypingTarget,
  sectionOrderOf,
  stepQuestion,
} from '@/components/exam/questions'
import { ShortcutsHelp } from '@/components/exam/questions/shortcuts-help'
import { ReadingRunner } from '@/components/exam/reading'
import { Alert, Button } from '@/components/ui'
import { useAutosave } from '@/hooks/use-autosave'
import { useExamClock } from '@/hooks/use-exam-clock'
import { ApiError, api } from '@/lib/api'
import { allQuestions, isAnswered, useExamStore } from '@/lib/exam-store'
import type { AttemptResult, AttemptSession } from '@/types/api'

type LoadPhase = 'loading' | 'ready' | 'failed'

interface LoadFailure {
  status: number
  message: string
}

/**
 * The exam runner.
 *
 * Everything the student does goes through the store; the store is drained to the server by
 * the autosave hook; the deadline comes from the server. Nothing here is the source of truth
 * for anything that decides a band score.
 */
export function ExamRunner({ attemptId }: { attemptId: string }) {
  const router = useRouter()
  // Held in a ref: the router object is not guaranteed to be referentially stable, and a
  // reload effect that re-fires on every render would restart the exam in a loop.
  const routerRef = useRef(router)
  routerRef.current = router
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [failure, setFailure] = useState<LoadFailure | null>(null)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [timeUp, setTimeUp] = useState(false)
  const [heldClock, setHeldClock] = useState<number | null>(null)

  const session = useExamStore((s) => s.session)
  const answers = useExamStore((s) => s.answers)
  const flags = useExamStore((s) => s.flags)
  const saveState = useExamStore((s) => s.saveState)
  const currentQuestion = useExamStore((s) => s.currentQuestion)

  const submittedRef = useRef(false)
  const expiredRef = useRef(false)
  const finishRef = useRef<(automatic: boolean) => Promise<void>>(async () => {})

  // ---------------------------------------------------------------- loading

  const load = useCallback(async () => {
    setPhase('loading')
    setFailure(null)
    try {
      const fresh = await api.get<AttemptSession>(`/attempts/${attemptId}`)
      if (fresh.attempt.status !== 'in_progress') {
        routerRef.current.replace(`/results/${attemptId}`)
        return
      }
      hydrateKeepingLocalEdits(fresh)
      setPhase('ready')
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? { status: error.status, message: error.detail }
          : { status: 0, message: 'We could not reach the server.' },
      )
      setPhase('failed')
    }
  }, [attemptId])

  useEffect(() => {
    const store = useExamStore.getState()
    if (store.attemptId && store.attemptId !== attemptId) store.reset()
    void load()
  }, [attemptId, load])

  // ------------------------------------------------------------ clock + save

  const ready = phase === 'ready' && !timeUp
  const flush = useAutosave(attemptId, ready)

  const onExpire = useCallback(() => {
    if (expiredRef.current) return
    expiredRef.current = true
    setTimeUp(true)
    // `finish` from the render that was still live when the clock hit zero: its autosave
    // flush is the one that is still enabled.
    void finishRef.current(true)
  }, [])

  const secondsRemaining = useExamClock(session?.attempt.seconds_remaining ?? null, onExpire)
  const remainingRef = useRef(secondsRemaining)
  remainingRef.current = secondsRemaining

  // A broken audio file must not quietly eat exam minutes: hold the displayed clock and
  // say so. The server deadline is untouched — only the presentation stops moving.
  const onAudioTrouble = useCallback((trouble: boolean) => {
    setHeldClock((prev) => (trouble ? (prev ?? remainingRef.current) : null))
  }, [])

  // ------------------------------------------------------------- submission

  const finish = useCallback(
    async (_automatic: boolean) => {
      if (submittedRef.current) return
      submittedRef.current = true
      setSubmitting(true)
      setSubmitError(null)
      try {
        await flush()
        // A save already in flight makes the first flush a no-op; give the last keystrokes
        // one more chance before the attempt is closed for good.
        if (useExamStore.getState().dirty.size > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 250))
          await flush()
        }
      } catch {
        // A failed final save is survivable; the server already has every earlier answer.
      }
      try {
        await api.post<AttemptResult>(`/attempts/${attemptId}/submit`)
      } catch (error) {
        // 409 means the server already closed this attempt (its own expiry sweep) — that is
        // a successful outcome, not an error the student needs to see.
        if (!(error instanceof ApiError && error.status === 409)) {
          submittedRef.current = false
          setSubmitting(false)
          // Close the confirmation and put the student back in the exam with their answers
          // intact — a dead dialog over a live test is the worst place to strand them.
          setSubmitOpen(false)
          setSubmitError(
            error instanceof ApiError ? error.detail : 'We could not reach the server.',
          )
          return
        }
      }
      setSubmitOpen(false)
      routerRef.current.replace(`/results/${attemptId}`)
    },
    [attemptId, flush],
  )
  finishRef.current = finish

  // ------------------------------------------------------------- navigation

  const goTo = useCallback((number: number) => {
    const store = useExamStore.getState()
    store.goToQuestion(number)
    const order = sectionOrderOf(store.session, number)
    if (order !== null && order !== store.currentSection) store.setSection(order)
    focusQuestion(number)
  }, [])

  useEffect(() => {
    if (phase !== 'ready') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const typing = isTypingTarget(event.target)
      const store = useExamStore.getState()

      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        if (typing) return
        const next = stepQuestion(store.session, store.currentQuestion, event.key === 'ArrowRight' ? 1 : -1)
        if (next === store.currentQuestion) return
        event.preventDefault()
        goTo(next)
        return
      }

      if (!typing && (event.key === 'f' || event.key === 'F')) {
        const question = allQuestions(store.session).find(
          (q) => q.number === store.currentQuestion,
        )
        if (!question) return
        event.preventDefault()
        store.toggleFlag(question.id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase, goTo])

  // ----------------------------------------------------------------- derived

  const questions = useMemo(() => allQuestions(session), [session])
  const answeredCount = questions.filter((q) => isAnswered(answers[q.id] ?? null)).length
  const flaggedCount = questions.filter((q) => flags[q.id]).length

  const paletteSections: PaletteSection[] = useMemo(
    () =>
      (session?.test.sections ?? []).map((section) => ({
        order: section.order,
        title: section.title,
        items: section.groups
          .flatMap((group) => group.questions)
          .sort((a, b) => a.number - b.number)
          .map((question) => ({
            number: question.number,
            questionId: question.id,
            answered: isAnswered(answers[question.id] ?? null),
            flagged: Boolean(flags[question.id]),
          })),
      })),
    [session, answers, flags],
  )

  // ------------------------------------------------------------------ render

  if (phase === 'loading') return <LoadingState />
  if (phase === 'failed' && failure) {
    return <FailureState failure={failure} onRetry={load} hasLocalWork={questions.length > 0} />
  }
  if (!session) return <LoadingState />

  if (timeUp) return <TimeUpState error={submitError} onRetry={() => void finish(true)} />

  return (
    <>
      <ExamShell
        title={session.test.title}
        secondsRemaining={heldClock !== null ? heldClock : secondsRemaining}
        saveState={saveState}
        paletteSections={paletteSections}
        currentQuestion={currentQuestion}
        onSelectQuestion={goTo}
        onSubmit={() => setSubmitOpen(true)}
        submitting={submitting}
      >
        {session.test.skill === 'listening' ? (
          <ListeningRunner session={session} onAudioTrouble={onAudioTrouble} />
        ) : (
          <ReadingRunner session={session} />
        )}
      </ExamShell>

      <ShortcutsHelp />

      {submitError && !submitOpen && (
        <div className="fixed bottom-24 left-1/2 z-30 w-[min(28rem,92vw)] -translate-x-1/2">
          <Alert tone="danger" title="We could not submit your test">
            {submitError} Your answers are saved. Press Submit test to try again.
          </Alert>
        </div>
      )}

      <SubmitDialog
        open={submitOpen}
        answered={answeredCount}
        total={questions.length}
        flagged={flaggedCount}
        submitting={submitting}
        onCancel={() => setSubmitOpen(false)}
        onConfirm={() => void finish(false)}
      />
    </>
  )
}

/**
 * Replay the server's answers, then put back anything typed since the last successful save.
 * A retry after a dropped connection must never cost the student a word.
 */
function hydrateKeepingLocalEdits(fresh: AttemptSession): void {
  const before = useExamStore.getState()
  const pending = [...before.dirty]
  const localAnswers = before.answers
  const localFlags = before.flags
  const sameAttempt = before.attemptId === fresh.attempt.id

  before.hydrate(fresh)
  if (!sameAttempt || pending.length === 0) return

  const after = useExamStore.getState()
  for (const id of pending) {
    after.setAnswer(id, localAnswers[id] ?? null)
    if (Boolean(localFlags[id]) !== Boolean(after.flags[id])) after.toggleFlag(id)
  }
}

function LoadingState() {
  return (
    <div className="flex h-dvh items-center justify-center bg-bg px-4">
      <p role="status" className="text-sm text-muted">
        Loading your test…
      </p>
    </div>
  )
}

function FailureState({
  failure,
  onRetry,
  hasLocalWork,
}: {
  failure: LoadFailure
  onRetry: () => void
  hasLocalWork: boolean
}) {
  const router = useRouter()
  const { title, body, retryable } = describeFailure(failure)
  return (
    <div className="flex h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md space-y-4">
        <Alert tone="danger" title={title}>
          {body}
        </Alert>
        {hasLocalWork && (
          <p className="text-sm text-muted">
            The answers you have already typed are still on screen and will be sent as soon as
            the connection is back.
          </p>
        )}
        <div className="flex gap-2">
          {retryable && <Button onClick={onRetry}>Try again</Button>}
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}

function describeFailure(failure: LoadFailure): {
  title: string
  body: string
  retryable: boolean
} {
  if (failure.status === 403) {
    return {
      title: 'This test belongs to another account',
      body: 'Sign in with the account that started this attempt to continue it.',
      retryable: false,
    }
  }
  if (failure.status === 404) {
    return {
      title: 'We could not find this test',
      body: 'The link may be wrong, or the attempt may have been removed. Start a new test from your dashboard.',
      retryable: false,
    }
  }
  if (failure.status === 401) {
    return {
      title: 'Your session expired',
      body: 'Sign in again and reopen the test — your answers are saved on the server.',
      retryable: true,
    }
  }
  return {
    title: 'We could not load your test',
    body: `${failure.message} Check your connection and try again — nothing you have typed is lost.`,
    retryable: true,
  }
}

function TimeUpState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-danger">Time is up</p>
        <h1 className="text-2xl font-semibold text-fg">Submitting your answers</h1>
        <p className="text-sm text-muted">
          Everything you typed has been saved. Your result opens in a moment.
        </p>
        {error && (
          <div className="space-y-3 pt-2">
            <Alert tone="danger" title="The submission did not go through">
              {error}
            </Alert>
            <Button onClick={onRetry}>Try again</Button>
          </div>
        )}
      </div>
    </div>
  )
}
