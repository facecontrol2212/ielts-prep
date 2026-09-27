'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Microphone capture for speaking practice.
 *
 * Two rules drive the design:
 *  1. The microphone is requested only when the student presses record — never on page load.
 *     A permission prompt that appears unasked is the fastest way to get permanently blocked.
 *  2. Nothing here uploads. The hook hands back a Blob; storing it is the caller's job.
 */

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'finishing'

export type RecorderErrorKind = 'denied' | 'no-device' | 'busy' | 'failed'

export interface RecorderError {
  kind: RecorderErrorKind
  title: string
  message: string
}

export interface RecorderResult {
  blob: Blob
  durationMs: number
  mimeType: string
}

export interface UseRecorderOptions {
  /** Hard stop, e.g. 120_000 for an IELTS Part 2 long turn. */
  maxMs?: number
  onComplete?: (result: RecorderResult) => void | Promise<void>
}

export interface UseRecorder {
  /** `null` until the effect has run on the client — render a placeholder, not a verdict. */
  supported: boolean | null
  status: RecorderStatus
  error: RecorderError | null
  elapsedMs: number
  /** Smoothed microphone level, 0–1. Stays 0 where Web Audio is unavailable. */
  level: number
  start: () => Promise<void>
  stop: () => void
  /** Stop and throw the take away. */
  cancel: () => void
  dismissError: () => void
}

const PREFERRED_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
]

export function isRecordingSupported(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.MediaRecorder === 'undefined') return false
  const devices = window.navigator?.mediaDevices
  return typeof devices?.getUserMedia === 'function'
}

function pickMimeType(): string {
  const Ctor = window.MediaRecorder
  if (typeof Ctor?.isTypeSupported !== 'function') return ''
  return PREFERRED_TYPES.find((t) => Ctor.isTypeSupported(t)) ?? ''
}

function toRecorderError(err: unknown): RecorderError {
  const name = typeof err === 'object' && err !== null ? String((err as DOMException).name) : ''
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return {
      kind: 'denied',
      title: 'Microphone blocked',
      message:
        'Your browser is blocking the microphone for this site. Open the padlock icon in the ' +
        'address bar, set Microphone to Allow, then press record again.',
    }
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return {
      kind: 'no-device',
      title: 'No microphone found',
      message: 'Plug in or enable a microphone, then press record again.',
    }
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return {
      kind: 'busy',
      title: 'Microphone is in use',
      message: 'Another app or tab is holding the microphone. Close it and press record again.',
    }
  }
  return {
    kind: 'failed',
    title: 'Recording failed',
    message: 'The recording could not start. Reload the page and try once more.',
  }
}

type AudioContextCtor = typeof AudioContext

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & { webkitAudioContext?: AudioContextCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export function useRecorder(options: UseRecorderOptions = {}): UseRecorder {
  const { maxMs, onComplete } = options

  const [supported, setSupported] = useState<boolean | null>(null)
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState<RecorderError | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [level, setLevel] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const tickRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const cancelledRef = useRef(false)
  const completeRef = useRef(onComplete)
  completeRef.current = onComplete
  const maxRef = useRef(maxMs)
  maxRef.current = maxMs

  useEffect(() => {
    setSupported(isRecordingSupported())
  }, [])

  const teardownMeter = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const ctx = audioCtxRef.current
    audioCtxRef.current = null
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined)
    setLevel(0)
  }, [])

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const stopTicking = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  // Release the device on unmount: a hot mic behind a closed tab is a trust problem.
  useEffect(
    () => () => {
      stopTicking()
      teardownMeter()
      const rec = recorderRef.current
      recorderRef.current = null
      if (rec && rec.state !== 'inactive') {
        cancelledRef.current = true
        try {
          rec.stop()
        } catch {
          /* already gone */
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    },
    [stopTicking, teardownMeter],
  )

  const attachMeter = useCallback((stream: MediaStream) => {
    const Ctor = getAudioContextCtor()
    if (!Ctor || typeof requestAnimationFrame !== 'function') return
    let ctx: AudioContext
    try {
      ctx = new Ctor()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.7
      source.connect(analyser)
      audioCtxRef.current = ctx
      const buffer = new Uint8Array(analyser.frequencyBinCount)
      const loop = () => {
        analyser.getByteTimeDomainData(buffer)
        let sum = 0
        for (let i = 0; i < buffer.length; i += 1) {
          const v = (buffer[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / buffer.length)
        // Speech RMS sits around 0.05–0.3; scale so normal speech fills most of the meter.
        setLevel(Math.min(1, rms * 3.2))
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    } catch {
      // A level meter is a nicety. Losing it must never lose the recording.
      teardownMeter()
    }
  }, [teardownMeter])

  const stop = useCallback(() => {
    const rec = recorderRef.current
    if (!rec || rec.state === 'inactive') return
    setStatus('finishing')
    try {
      rec.stop()
    } catch {
      recorderRef.current = null
      stopTicking()
      teardownMeter()
      releaseStream()
      setStatus('idle')
    }
  }, [releaseStream, stopTicking, teardownMeter])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    stop()
  }, [stop])

  const start = useCallback(async () => {
    if (!isRecordingSupported()) {
      setSupported(false)
      return
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') return

    setError(null)
    setElapsedMs(0)
    setStatus('requesting')
    cancelledRef.current = false

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
    } catch (err) {
      setError(toRecorderError(err))
      setStatus('idle')
      return
    }

    streamRef.current = stream
    chunksRef.current = []

    let recorder: MediaRecorder
    const mimeType = pickMimeType()
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    } catch {
      try {
        recorder = new MediaRecorder(stream)
      } catch (err) {
        releaseStream()
        setError(toRecorderError(err))
        setStatus('idle')
        return
      }
    }

    recorderRef.current = recorder
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onerror = () => {
      cancelledRef.current = true
      stop()
      setError(toRecorderError({ name: 'UnknownError' }))
    }
    recorder.onstop = () => {
      stopTicking()
      teardownMeter()
      releaseStream()
      recorderRef.current = null
      const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0
      const chunks = chunksRef.current
      chunksRef.current = []
      setStatus('idle')
      if (cancelledRef.current) {
        cancelledRef.current = false
        setElapsedMs(0)
        return
      }
      const type = recorder.mimeType || mimeType || 'audio/webm'
      const blob = new Blob(chunks, { type })
      if (blob.size === 0) {
        setError({
          kind: 'failed',
          title: 'Nothing was recorded',
          message: 'No audio reached the browser. Check the microphone is not muted and try again.',
        })
        return
      }
      void completeRef.current?.({ blob, durationMs, mimeType: type })
    }

    startedAtRef.current = Date.now()
    try {
      recorder.start(250)
    } catch (err) {
      recorderRef.current = null
      releaseStream()
      setError(toRecorderError(err))
      setStatus('idle')
      return
    }

    setStatus('recording')
    attachMeter(stream)
    tickRef.current = window.setInterval(() => {
      const ms = Date.now() - startedAtRef.current
      setElapsedMs(ms)
      const limit = maxRef.current
      if (limit !== undefined && ms >= limit) {
        const rec = recorderRef.current
        if (rec && rec.state !== 'inactive') {
          setStatus('finishing')
          try {
            rec.stop()
          } catch {
            /* handled by onstop / teardown */
          }
        }
      }
    }, 200)
  }, [attachMeter, releaseStream, stop, stopTicking, teardownMeter])

  const dismissError = useCallback(() => setError(null), [])

  return { supported, status, error, elapsedMs, level, start, stop, cancel, dismissError }
}
