'use client'

import { Loader2, Mic, Square, Timer } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { RecordingList } from '@/components/speaking/recording-list'
import { Button } from '@/components/ui'
import { useRecorder } from '@/hooks/use-recorder'
import {
  deleteRecording,
  isRecordingStorageSupported,
  listRecordings,
  saveRecording,
  type Recording,
} from '@/lib/recordings'
import { cn, formatClock } from '@/lib/utils'
import type { SpeakingQuestion } from '@/types/api'

const PREP_SECONDS = 60
const LONG_TURN_MS = 120_000
const FREE_TURN_MS = 300_000

type Phase = 'idle' | 'preparing' | 'ready'

/**
 * Timer, level meter and the record button, kept together in one bar that sticks to the bottom
 * of the screen. On a 360px phone the cue card sits above it and neither has to be scrolled to.
 */
export function RecorderPanel({
  question,
  longTurn,
}: {
  question: SpeakingQuestion
  longTurn?: boolean
}) {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [storageSupported, setStorageSupported] = useState<boolean | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [prepLeft, setPrepLeft] = useState(PREP_SECONDS)

  const questionRef = useRef(question)
  questionRef.current = question

  const refresh = useCallback(async (questionId: string) => {
    try {
      setRecordings(await listRecordings(questionId))
      setStorageError(null)
    } catch (err) {
      setRecordings([])
      setStorageError(
        err instanceof Error ? err.message : 'Your recordings could not be read from this device.',
      )
    }
  }, [])

  const onComplete = useCallback(
    async ({ blob, durationMs, mimeType }: { blob: Blob; durationMs: number; mimeType: string }) => {
      const q = questionRef.current
      setSaving(true)
      try {
        await saveRecording({
          questionId: q.id,
          part: q.part,
          topic: q.topic,
          questionText: q.question,
          durationMs,
          mimeType,
          blob,
        })
        await refresh(q.id)
      } catch (err) {
        setStorageError(
          err instanceof Error
            ? `${err.message} The take could not be kept.`
            : 'The recording could not be saved on this device.',
        )
      } finally {
        setSaving(false)
        setPhase('idle')
        setPrepLeft(PREP_SECONDS)
      }
    },
    [refresh],
  )

  const recorder = useRecorder({ maxMs: longTurn ? LONG_TURN_MS : FREE_TURN_MS, onComplete })

  useEffect(() => {
    const supported = isRecordingStorageSupported()
    setStorageSupported(supported)
    if (supported) void refresh(question.id)
    else setRecordings([])
  }, [question.id, refresh])

  // A new question is a clean slate: no leftover preparation countdown from the last one.
  useEffect(() => {
    setPhase('idle')
    setPrepLeft(PREP_SECONDS)
  }, [question.id])

  useEffect(() => {
    if (phase !== 'preparing') return
    const id = window.setInterval(() => {
      setPrepLeft((s) => {
        if (s <= 1) {
          window.clearInterval(id)
          setPhase('ready')
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [phase])

  const onDelete = useCallback(
    async (id: string) => {
      try {
        await deleteRecording(id)
        await refresh(questionRef.current.id)
      } catch (err) {
        setStorageError(
          err instanceof Error ? err.message : 'That recording could not be deleted.',
        )
      }
    },
    [refresh],
  )

  const recording = recorder.status === 'recording' || recorder.status === 'finishing'
  const elapsedSeconds = Math.floor(recorder.elapsedMs / 1000)
  const remainingSeconds = Math.max(0, Math.round(LONG_TURN_MS / 1000) - elapsedSeconds)

  const unsupported =
    recorder.supported === false || storageSupported === false
      ? recorder.supported === false && storageSupported === false
        ? 'Recording is not supported in this browser. It has neither the MediaRecorder API nor the on-device storage this page needs.'
        : recorder.supported === false
          ? 'Recording is not supported in this browser — it has no MediaRecorder API. Try the latest Chrome, Edge, Firefox or Safari.'
          : 'Recording is not supported in this browser: it cannot store files on the device. Private browsing usually blocks this — try a normal window.'
      : null

  return (
    <div className="space-y-4">
      <section aria-labelledby="takes-title" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="takes-title" className="text-sm font-semibold uppercase tracking-wider text-muted">
            Your takes
          </h2>
          {recordings.length > 0 && (
            <p className="text-xs text-muted">{recordings.length} on this device</p>
          )}
        </div>

        {storageError && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-fg">
            {storageError}
          </p>
        )}

        <RecordingList recordings={recordings} onDelete={onDelete} />

        <p className="text-xs leading-relaxed text-muted">
          Recordings stay in this browser and are never uploaded — there is no speaking upload in
          this version. Clearing your browsing data, or using a private window, deletes them.
          Download anything you want to keep.
        </p>
      </section>

      <div className="sticky bottom-0 z-20 border-t border-border bg-surface/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        {unsupported ? (
          <p role="status" className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg">
            {unsupported} You can still read the questions, model answers and useful phrases.
          </p>
        ) : recorder.supported === null ? (
          <p className="px-1 text-sm text-muted">Checking what this browser supports…</p>
        ) : (
          <>
            {recorder.error && (
              <div role="alert" className="mb-3 rounded-lg bg-danger/10 px-3 py-2">
                <p className="text-sm font-semibold text-fg">{recorder.error.title}</p>
                <p className="mt-0.5 text-sm text-muted">{recorder.error.message}</p>
                <button
                  type="button"
                  onClick={recorder.dismissError}
                  className="mt-1 rounded text-xs font-medium text-primary underline underline-offset-2"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <TimerBlock
                label={
                  phase === 'preparing'
                    ? 'Preparation'
                    : recording
                      ? longTurn
                        ? 'Speaking'
                        : 'Recording'
                      : phase === 'ready'
                        ? 'Ready to speak'
                        : 'Ready'
                }
                value={
                  phase === 'preparing'
                    ? formatClock(prepLeft)
                    : recording
                      ? formatClock(longTurn ? remainingSeconds : elapsedSeconds)
                      : longTurn
                        ? '2:00'
                        : '0:00'
                }
                urgent={
                  (phase === 'preparing' && prepLeft <= 10) ||
                  (recording && longTurn && remainingSeconds <= 15)
                }
              />

              <LevelMeter level={recorder.level} active={recording} />

              <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                {saving && (
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Saving
                  </span>
                )}

                {recording ? (
                  <Button variant="danger" onClick={recorder.stop}>
                    <Square className="h-4 w-4" aria-hidden />
                    Stop
                  </Button>
                ) : phase === 'preparing' ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setPhase('idle')}>
                      Cancel
                    </Button>
                    <Button onClick={() => setPhase('ready')}>Start speaking now</Button>
                  </>
                ) : (
                  <>
                    {longTurn && phase === 'idle' && (
                      <Button variant="outline" onClick={() => setPhase('preparing')}>
                        <Timer className="h-4 w-4" aria-hidden />
                        Prepare (1 min)
                      </Button>
                    )}
                    <Button
                      onClick={() => void recorder.start()}
                      loading={recorder.status === 'requesting'}
                    >
                      <Mic className="h-4 w-4" aria-hidden />
                      {longTurn ? 'Record answer' : 'Record'}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <p className="mt-2 text-xs text-muted">
              {phase === 'preparing'
                ? 'Make notes. The microphone is not on yet.'
                : recording
                  ? longTurn
                    ? 'Speak until the timer runs out — it stops at two minutes.'
                    : 'Press stop when you have finished.'
                  : 'The microphone is only requested when you press record.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function TimerBlock({
  label,
  value,
  urgent,
}: {
  label: string
  value: string
  urgent?: boolean
}) {
  return (
    <div className="shrink-0" role="timer" aria-live="off">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p
        className={cn(
          'font-mono text-2xl font-semibold leading-none tabular-nums',
          urgent ? 'text-danger' : 'text-fg',
        )}
      >
        {value}
      </p>
    </div>
  )
}

const SEGMENTS = 10

function LevelMeter({ level, active }: { level: number; active: boolean }) {
  const lit = Math.round(level * SEGMENTS)
  return (
    <div
      className="flex min-w-[3.5rem] flex-1 items-end gap-0.5"
      role="meter"
      aria-valuenow={Math.round(level * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Microphone level"
      aria-hidden={!active}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={cn(
            'w-full rounded-sm transition-[height,background-color] duration-100',
            active && i < lit ? (i > 7 ? 'bg-danger' : 'bg-success') : 'bg-surface-2',
          )}
          style={{ height: `${6 + i * 1.8}px` }}
        />
      ))}
    </div>
  )
}
