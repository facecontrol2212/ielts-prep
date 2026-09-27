'use client'

import { Download, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui'
import { recordingFileName, type Recording } from '@/lib/recordings'
import { formatClock } from '@/lib/utils'

/**
 * Previous takes for the current question. Playback, download and delete only — there is no
 * upload, so "download" is the single way a recording ever leaves this browser.
 */
export function RecordingList({
  recordings,
  onDelete,
}: {
  recordings: Recording[]
  onDelete: (id: string) => void | Promise<void>
}) {
  if (recordings.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
        No takes yet for this question. Record one, then listen back for hesitation and repeated
        words.
      </p>
    )
  }

  return (
    <ul aria-label="Your recordings for this question" className="space-y-3">
      {recordings.map((recording, i) => (
        <RecordingRow
          key={recording.id}
          recording={recording}
          take={recordings.length - i}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )
}

function RecordingRow({
  recording,
  take,
  onDelete,
}: {
  recording: Recording
  take: number
  onDelete: (id: string) => void | Promise<void>
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return
    const next = URL.createObjectURL(recording.blob)
    setUrl(next)
    return () => {
      URL.revokeObjectURL(next)
      setUrl(null)
    }
  }, [recording.blob])

  const when = new Date(recording.createdAt)
  const duration = formatClock(Math.round(recording.durationMs / 1000))

  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium text-fg">
          Take {take}
          <span className="ml-2 font-normal tabular-nums text-muted">{duration}</span>
        </p>
        <p className="text-xs text-muted">
          {when.toLocaleDateString()} {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {url && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio
          src={url}
          controls
          preload="none"
          aria-label={`Take ${take}, ${duration}`}
          className="mt-2 w-full"
        />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {url && (
          <a
            href={url}
            download={recordingFileName(recording)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-fg hover:bg-surface-2"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download
          </a>
        )}

        {confirming ? (
          <>
            <Button
              variant="danger"
              size="sm"
              onClick={() => void onDelete(recording.id)}
              aria-label={`Confirm delete take ${take}`}
            >
              Delete for good
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(true)}
            aria-label={`Delete take ${take}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Delete
          </Button>
        )}
      </div>
    </li>
  )
}
