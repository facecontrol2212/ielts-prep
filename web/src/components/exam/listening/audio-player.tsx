'use client'

import { AlertTriangle, Headphones, Play } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/ui'
import { useAudioPlayer, type AudioPhase } from '@/hooks/use-audio-player'
import { cn, formatClock } from '@/lib/utils'
import type { Section } from '@/types/api'

export interface AudioPlayerProps {
  src: string
  sections: Section[]
  currentSection: number
  onEnded: () => void
  /** Raised while playback is broken so the page can hold the clock display. */
  onTrouble?: (inTrouble: boolean) => void
}

/**
 * The listening recording.
 *
 * Deliberately not an `<audio controls>` element: the native player offers a scrub bar, a
 * rewind and a speed menu, none of which exist in the real test. What is left is a start
 * gate, a read-only progress read-out, and an explicit error state.
 */
export function AudioPlayer({
  src,
  sections,
  currentSection,
  onEnded,
  onTrouble,
}: AudioPlayerProps) {
  const { audioRef, phase, started, currentTime, duration, error, start, retry } = useAudioPlayer(
    src,
    onEnded,
  )

  const trouble = phase === 'error' || phase === 'stalled'
  useEffect(() => {
    onTrouble?.(trouble)
  }, [trouble, onTrouble])

  const remaining = duration > 0 ? Math.max(0, duration - currentTime) : 0
  const percent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0

  return (
    <div className="border-b border-border bg-surface">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={src} preload="auto" controlsList="nodownload noplaybackrate" />

      {!started ? (
        <StartGate onStart={start} />
      ) : (
        <div className="space-y-2 px-3 py-2 sm:px-4">
          <div className="flex items-center gap-3">
            <Headphones
              className={cn('h-4 w-4 shrink-0', trouble ? 'text-danger' : 'text-primary')}
              aria-hidden
            />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              <PhaseLabel phase={phase} />
            </p>
            <p className="ml-auto font-mono text-xs tabular-nums text-fg">
              <span aria-label="Audio elapsed">{formatClock(currentTime)}</span>
              <span className="text-muted"> / </span>
              <span aria-label="Audio remaining">-{formatClock(remaining)}</span>
            </p>
          </div>

          <div
            role="progressbar"
            aria-label="Recording progress"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div
              className={cn('h-full rounded-full', trouble ? 'bg-danger' : 'bg-primary')}
              style={{ width: `${percent}%` }}
            />
          </div>

          <SectionMarkers sections={sections} current={currentSection} />
        </div>
      )}

      {trouble && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border-t border-danger/30 bg-danger/10 px-3 py-2.5 text-sm sm:px-4"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-danger" aria-hidden />
          <p className="min-w-0 flex-1 text-fg">
            <span className="font-semibold">{error ?? 'The audio stopped.'}</span>{' '}
            Your timer is held while this is on screen. Check your connection and continue —
            playback resumes where it stopped, not from the beginning.
          </p>
          <Button size="sm" variant="danger" onClick={retry}>
            Continue playing
          </Button>
        </div>
      )}
    </div>
  )
}

function PhaseLabel({ phase }: { phase: AudioPhase }) {
  const text: Record<AudioPhase, string> = {
    idle: 'Ready',
    loading: 'Loading…',
    playing: 'Playing — you will hear this once',
    stalled: 'Audio interrupted',
    error: 'Audio failed',
    ended: 'Recording finished',
  }
  return <>{text[phase]}</>
}

function StartGate({ onStart }: { onStart: () => boolean }) {
  return (
    <div className="flex flex-col items-start gap-3 px-3 py-4 sm:flex-row sm:items-center sm:px-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold uppercase tracking-wide text-fg">Listening recording</h2>
        <p className="mt-1 text-sm text-muted">
          The recording plays <strong className="font-semibold text-fg">once</strong>, straight
          through. There is no pause, no rewind and no speed control — exactly like the real test.
          Put your headphones on before you start.
        </p>
      </div>
      <Button size="lg" variant="accent" onClick={onStart} className="w-full sm:w-auto">
        <Play className="h-4 w-4" aria-hidden />
        Start audio
      </Button>
    </div>
  )
}

/**
 * Which part of the test the student is on. The payload carries no per-section audio
 * offsets, so this marks the section being answered rather than pretending to know where
 * the recording is.
 */
function SectionMarkers({ sections, current }: { sections: Section[]; current: number }) {
  if (sections.length < 2) return null
  return (
    <ol className="flex gap-1" aria-label="Test sections">
      {sections.map((section) => (
        <li
          key={section.id}
          aria-current={section.order === current ? 'step' : undefined}
          className={cn(
            'flex-1 rounded border px-1.5 py-1 text-center text-[11px] font-semibold tabular-nums',
            section.order === current
              ? 'border-primary bg-primary-soft/60 text-fg'
              : 'border-border text-muted',
          )}
        >
          {section.start_question && section.end_question
            ? `${section.start_question}–${section.end_question}`
            : section.title}
        </li>
      ))}
    </ol>
  )
}
