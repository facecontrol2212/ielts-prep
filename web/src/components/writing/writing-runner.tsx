'use client'

import { Loader2, X } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ExamShell, SubmitDialog } from '@/components/exam'
import { Button } from '@/components/ui'
import { EssayEditor } from '@/components/writing/essay-editor'
import { WritingFeedbackView } from '@/components/writing/feedback-view'
import { DailyLimitReached, GradingFailed, GradingWait } from '@/components/writing/grading-state'
import { clearLocalDrafts } from '@/components/writing/local-draft'
import { PromptPanel } from '@/components/writing/prompt-panel'
import { TaskTabs, TimingGuidance, suggestedSplit } from '@/components/writing/task-tabs'
import { useDraftAutosave, type WritingDraftBody } from '@/components/writing/use-draft-autosave'
import { minimumWords } from '@/components/writing/word-count'
import { useExamClock } from '@/hooks/use-exam-clock'
import { ApiError, api } from '@/lib/api'
import { cn, countWords } from '@/lib/utils'
import type { AttemptSession, Section, WritingSubmission } from '@/types/api'

type Phase = 'loading' | 'load-error' | 'writing' | 'grading' | 'feedback' | 'limit' | 'grade-failed'

export function WritingRunner({ attemptId }: { attemptId: string }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [session, setSession] = useState<AttemptSession | null>(null)
  const [submissions, setSubmissions] = useState<WritingSubmission[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [gradeError, setGradeError] = useState<string | null>(null)
  const [limitDetail, setLimitDetail] = useState<string | null>(null)
  const [saveBlocked, setSaveBlocked] = useState<string | null>(null)
  const [recovered, setRecovered] = useState<number[]>([])
  const [activeTask, setActiveTask] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const draft = useDraftAutosave(attemptId, phase === 'writing')
  const { texts, setText, hydrate, flush, saveState } = draft

  const sections: Section[] = useMemo(
    () => [...(session?.test.sections ?? [])].sort((a, b) => a.order - b.order),
    [session],
  )

  /* ------------------------------------------------------------------ load */

  const load = useCallback(async () => {
    setPhase('loading')
    setLoadError(null)
    try {
      const attempt = await api.get<AttemptSession>(`/attempts/${attemptId}`)
      let existing: WritingSubmission[] = []
      try {
        existing = await api.get<WritingSubmission[]>(`/writing/attempts/${attemptId}`)
      } catch {
        existing = []
      }

      setSession(attempt)
      setSubmissions(existing)

      const seed: Record<number, string> = {}
      for (const section of attempt.test.sections) seed[section.order] = ''
      for (const submission of existing) seed[submission.task_number] = submission.text
      setRecovered(hydrate(seed))
      setActiveTask(attempt.test.sections[0]?.order ?? 1)

      if (attempt.attempt.status === 'in_progress') {
        setPhase('writing')
      } else if (existing.some((s) => s.feedback || s.grading_error)) {
        setPhase('feedback')
      } else {
        setGradeError('This attempt was submitted but has not been marked yet.')
        setPhase('grade-failed')
      }
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.status === 403
            ? 'This attempt belongs to another account.'
            : err.detail
          : 'We could not load this attempt. Check your connection and try again.',
      )
      setPhase('load-error')
    }
  }, [attemptId, hydrate])

  useEffect(() => {
    void load()
  }, [load])

  /* ---------------------------------------------------------------- submit */

  const textsRef = useRef(texts)
  textsRef.current = texts
  const sectionsRef = useRef(sections)
  sectionsRef.current = sections

  const localSubmissions = useCallback((): WritingSubmission[] => {
    return sectionsRef.current.map((section) => {
      const text = textsRef.current[section.order] ?? ''
      return {
        id: `local-${section.order}`,
        task_number: section.order,
        text,
        word_count: countWords(text),
        band_task: null,
        band_coherence: null,
        band_lexical: null,
        band_grammar: null,
        band_overall: null,
        feedback: null,
        graded_at: null,
        grading_error: null,
      }
    })
  }, [])

  /** Pull the server's copy so the fallback views show what was actually stored. */
  const refreshSubmissions = useCallback(async () => {
    try {
      const rows = await api.get<WritingSubmission[]>(`/writing/attempts/${attemptId}`)
      setSubmissions(rows.length > 0 ? rows : localSubmissions())
    } catch {
      setSubmissions(localSubmissions())
    }
  }, [attemptId, localSubmissions])

  const grade = useCallback(async () => {
    setBusy(true)
    setPhase('grading')
    try {
      const graded = await api.post<WritingSubmission[]>(`/writing/attempts/${attemptId}/grade`)
      setSubmissions(graded.length > 0 ? graded : localSubmissions())
      clearLocalDrafts(attemptId, sectionsRef.current.map((s) => s.order))
      setPhase('feedback')
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setLimitDetail(err.detail)
        await refreshSubmissions()
        setPhase('limit')
      } else {
        setGradeError(
          err instanceof ApiError
            ? `${err.detail}.`
            : 'The marker could not be reached. This is on us, not your answer.',
        )
        await refreshSubmissions()
        setPhase('grade-failed')
      }
    } finally {
      setBusy(false)
    }
  }, [attemptId, localSubmissions, refreshSubmissions])

  const submitAndGrade = useCallback(async () => {
    setDialogOpen(false)
    setSaveBlocked(null)
    setBusy(true)

    // Every task goes to the server before the attempt is closed. If this fails we stay in the
    // editor: submitting an attempt whose text never arrived is how an hour of work disappears.
    try {
      for (const section of sectionsRef.current) {
        const body: WritingDraftBody = {
          task_number: section.order,
          text: textsRef.current[section.order] ?? '',
        }
        await api.put(`/writing/attempts/${attemptId}/draft`, body)
      }
    } catch {
      setSaveBlocked(
        'We could not save your answer, so nothing was submitted. Your text is still here — ' +
          'check your connection and press Submit again.',
      )
      setBusy(false)
      return
    }

    try {
      await api.post(`/attempts/${attemptId}/submit`)
    } catch (err) {
      // 409 means it is already submitted (expired and auto-submitted, say) — carry on to grading.
      if (!(err instanceof ApiError && err.status === 409)) {
        setSaveBlocked(
          err instanceof ApiError
            ? `${err.detail}. Your answer is saved — press Submit again.`
            : 'We could not submit the attempt. Your answer is saved — press Submit again.',
        )
        setBusy(false)
        return
      }
    }

    await grade()
  }, [attemptId, grade])

  const submitRef = useRef(submitAndGrade)
  submitRef.current = submitAndGrade
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const onExpire = useCallback(() => {
    // An attempt opened after it was already scored reports 0 seconds left. Without this guard
    // the clock would "expire" on arrival and silently re-grade it, burning a daily slot.
    if (phaseRef.current !== 'writing') return
    void submitRef.current()
  }, [])

  const secondsRemaining = useExamClock(session?.attempt.seconds_remaining ?? null, onExpire)

  const switchTask = useCallback(
    (taskNumber: number) => {
      setActiveTask(taskNumber)
      void flush()
    },
    [flush],
  )

  /* ---------------------------------------------------------------- render */

  if (phase === 'loading') return <FullPageSpinner />

  if (phase === 'load-error') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-lg font-semibold tracking-tight">We could not open this test</h1>
        <p className="text-sm text-muted">{loadError}</p>
        <div className="flex gap-2">
          <Button onClick={() => void load()}>Try again</Button>
          <Link href="/dashboard">
            <Button variant="outline">Back to dashboard</Button>
          </Link>
        </div>
      </main>
    )
  }

  if (phase === 'grading') return <GradingWait />

  if (phase === 'limit') {
    return (
      <DailyLimitReached
        submissions={submissions.length > 0 ? submissions : localSubmissions()}
        detail={limitDetail}
      />
    )
  }

  if (phase === 'grade-failed') {
    return (
      <GradingFailed
        message={gradeError ?? 'The marker did not return a result.'}
        submissions={submissions.length > 0 ? submissions : localSubmissions()}
        onRetry={() => void grade()}
        retrying={busy}
      />
    )
  }

  if (phase === 'feedback') {
    return (
      <WritingFeedbackView
        testTitle={session?.test.title ?? 'Writing test'}
        submissions={submissions}
        onRetryGrade={() => void grade()}
        retrying={busy}
      />
    )
  }

  if (!session) return <FullPageSpinner />

  if (session.test.skill !== 'writing') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-lg font-semibold tracking-tight">This is not a writing test</h1>
        <p className="text-sm text-muted">
          Open it from the {session.test.skill} runner instead.
        </p>
        <Link href={`/exam/${attemptId}`}>
          <Button>Open the test</Button>
        </Link>
      </main>
    )
  }

  const totalSeconds = session.test.duration_seconds
  const split = suggestedSplit(totalSeconds)
  const activeSection = sections.find((s) => s.order === activeTask) ?? sections[0]
  const tabs = sections.map((section) => ({
    taskNumber: section.order,
    label: `Task ${section.order}`,
    words: countWords(texts[section.order] ?? ''),
    min: minimumWords(section.order, section.min_words),
  }))
  const activeMin = minimumWords(activeSection?.order ?? 1, activeSection?.min_words)
  const startedCount = tabs.filter((t) => t.words > 0).length
  const underLength = tabs.filter((t) => t.words < t.min).length

  return (
    <>
      <ExamShell
        title={session.test.title}
        secondsRemaining={secondsRemaining}
        saveState={saveState}
        paletteSections={[]}
        currentQuestion={activeTask}
        onSelectQuestion={switchTask}
        onSubmit={() => setDialogOpen(true)}
        hidePalette
      >
        <div className="flex h-full flex-col">
          <TaskTabs tabs={tabs} active={activeTask} onSelect={switchTask} />
          <TimingGuidance
            totalSeconds={totalSeconds}
            secondsRemaining={secondsRemaining}
            activeTask={activeTask}
          />

          {recovered.length > 0 && (
            <div className="flex items-start gap-2 border-b border-border bg-warning/10 px-4 py-2 text-xs text-fg">
              <p className="flex-1">
                Unsaved work on Task {recovered.join(' and ')} was restored from this device and
                is being saved now.
              </p>
              <button
                type="button"
                onClick={() => setRecovered([])}
                aria-label="Dismiss restored draft notice"
                className="rounded p-0.5 text-muted hover:text-fg"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          )}

          {saveBlocked && (
            <p role="alert" className="border-b border-border bg-danger/10 px-4 py-2 text-xs text-fg">
              {saveBlocked}
            </p>
          )}

          {activeSection && (
            <div
              role="tabpanel"
              id={`task-panel-${activeTask}`}
              aria-labelledby={`task-tab-${activeTask}`}
              className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden"
            >
              <div className="grid min-h-full lg:h-full lg:grid-cols-2">
                <PromptPanel
                  section={activeSection}
                  taskNumber={activeTask}
                  suggestedMinutes={Math.round(
                    (activeTask === 1 ? split.task1 : split.task2) / 60,
                  )}
                  className="border-b lg:border-b-0 lg:border-r"
                />
                <EssayEditor
                  taskNumber={activeTask}
                  value={texts[activeTask] ?? ''}
                  min={activeMin}
                  onChange={(text) => setText(activeTask, text)}
                  onBlur={() => void flush()}
                  className="min-h-[24rem] lg:min-h-0"
                />
              </div>
            </div>
          )}

          <div className="flex shrink-0 items-center gap-3 border-t border-border bg-surface px-4 py-2">
            <p className={cn('flex-1 text-xs', saveState === 'error' ? 'text-danger' : 'text-muted')}>
              {saveState === 'saving'
                ? 'Saving your draft…'
                : saveState === 'error'
                  ? 'Your last save failed. We keep retrying — do not close this tab.'
                  : saveState === 'saved'
                    ? 'Draft saved'
                    : 'Draft saves every 10 seconds'}
            </p>
            <Button variant="accent" size="sm" onClick={() => setDialogOpen(true)} loading={busy}>
              Submit for marking
            </Button>
          </div>
        </div>
      </ExamShell>

      <SubmitDialog
        open={dialogOpen}
        answered={startedCount}
        total={tabs.length}
        flagged={underLength}
        onCancel={() => setDialogOpen(false)}
        onConfirm={() => void submitAndGrade()}
        submitting={busy}
      />
    </>
  )
}

function FullPageSpinner() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Opening your test…
      </p>
    </main>
  )
}
