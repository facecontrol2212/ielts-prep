'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export type AudioPhase = 'idle' | 'loading' | 'playing' | 'stalled' | 'error' | 'ended'

/** How far back the clock may drift before we treat it as a seek attempt. */
const SEEK_TOLERANCE_SECONDS = 0.75
/** How long a buffer underrun may last before the student is told. */
const STALL_GRACE_MS = 4000

export interface UseAudioPlayer {
  audioRef: RefObject<HTMLAudioElement | null>
  phase: AudioPhase
  /** True once the single permitted play-through has begun — never resets. */
  started: boolean
  currentTime: number
  duration: number
  error: string | null
  /** Begin the one play-through. Returns false if it has already been used. */
  start: () => boolean
  /** Recover from a stall or a load error, resuming where the audio stopped. */
  retry: () => void
}

/**
 * The listening audio, under real exam rules: one continuous play-through, no seeking,
 * no rewind, no speed control.
 *
 * Enforcement is at the element, not at the UI. Even if a student opens the console and
 * sets `currentTime`, the `seeking` handler snaps playback back to the furthest point
 * reached, and `ratechange` pins the rate to 1. `start()` is a one-shot: once the
 * play-through has begun it can never be called again, so there is no second listen.
 */
export function useAudioPlayer(src: string | null, onEnded?: () => void): UseAudioPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const maxTime = useRef(0)
  const startedRef = useRef(false)
  const endedRef = useRef(false)
  const recovering = useRef(false)
  const stallTimer = useRef<number | null>(null)
  const endedCallback = useRef(onEnded)
  endedCallback.current = onEnded

  const [phase, setPhase] = useState<AudioPhase>('idle')
  const [started, setStarted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const clearStallTimer = useCallback(() => {
    if (stallTimer.current !== null) {
      window.clearTimeout(stallTimer.current)
      stallTimer.current = null
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    }

    const onTimeUpdate = () => {
      if (audio.currentTime > maxTime.current) maxTime.current = audio.currentTime
      setCurrentTime(audio.currentTime)
    }

    // No rewind. No skipping ahead. Any jump is pulled back to the furthest point played.
    const onSeeking = () => {
      if (Math.abs(audio.currentTime - maxTime.current) > SEEK_TOLERANCE_SECONDS) {
        audio.currentTime = maxTime.current
      }
    }

    // No speed control, including from the browser's own context menu.
    const onRateChange = () => {
      if (audio.playbackRate !== 1) audio.playbackRate = 1
    }

    const onPlaying = () => {
      clearStallTimer()
      recovering.current = false
      setError(null)
      setPhase('playing')
    }

    const onWaiting = () => {
      if (endedRef.current) return
      clearStallTimer()
      stallTimer.current = window.setTimeout(() => {
        setPhase('stalled')
        setError('The audio stopped loading.')
      }, STALL_GRACE_MS)
    }

    // The exam does not let you pause. An unrequested pause is a network problem.
    const onPause = () => {
      if (endedRef.current || !startedRef.current || recovering.current) return
      void audio.play().catch(() => {
        setPhase('stalled')
        setError('Playback was interrupted.')
      })
    }

    const onError = () => {
      clearStallTimer()
      setPhase('error')
      setError('The audio file could not be loaded.')
    }

    const onEndedEvent = () => {
      clearStallTimer()
      endedRef.current = true
      setPhase('ended')
      endedCallback.current?.()
    }

    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('seeking', onSeeking)
    audio.addEventListener('ratechange', onRateChange)
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('stalled', onWaiting)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('error', onError)
    audio.addEventListener('ended', onEndedEvent)

    return () => {
      clearStallTimer()
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('seeking', onSeeking)
      audio.removeEventListener('ratechange', onRateChange)
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('stalled', onWaiting)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('ended', onEndedEvent)
    }
  }, [src, clearStallTimer])

  const start = useCallback((): boolean => {
    if (startedRef.current) return false
    const audio = audioRef.current
    if (!audio) return false
    startedRef.current = true
    setStarted(true)
    setPhase('loading')
    audio.playbackRate = 1
    void Promise.resolve(audio.play()).catch(() => {
      setPhase('error')
      setError('The browser refused to start the audio.')
    })
    return true
  }, [])

  const retry = useCallback(() => {
    const audio = audioRef.current
    if (!audio || endedRef.current || !startedRef.current) return
    recovering.current = true
    setPhase('loading')
    setError(null)
    audio.load()
    // Resume where the stall happened — a retry is recovery, never a second listen.
    const resumeAt = maxTime.current
    const resume = () => {
      audio.removeEventListener('loadedmetadata', resume)
      try {
        audio.currentTime = resumeAt
      } catch {
        // Some browsers refuse a seek before the buffer is ready; playback still resumes.
      }
      void Promise.resolve(audio.play()).catch(() => {
        setPhase('error')
        setError('The audio file could not be loaded.')
      })
    }
    audio.addEventListener('loadedmetadata', resume)
  }, [])

  return { audioRef, phase, started, currentTime, duration, error, start, retry }
}
