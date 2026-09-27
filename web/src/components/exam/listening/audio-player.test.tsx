import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AudioPlayer } from '@/components/exam/listening/audio-player'
import { makeGroup, makeSection } from '@/components/exam/questions/fixtures'

const sections = [
  makeSection(1, [makeGroup('short_answer', [1, 2, 3])], { audio_url: '/test.mp3' }),
  makeSection(2, [makeGroup('short_answer', [4, 5, 6])]),
]

let play: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  play = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function mount(onEnded = () => {}) {
  return render(
    <AudioPlayer src="/test.mp3" sections={sections} currentSection={1} onEnded={onEnded} />,
  )
}

describe('listening audio player', () => {
  it('gates playback behind an explicit start, because browsers block autoplay', () => {
    mount()
    expect(screen.getByRole('button', { name: /Start audio/ })).toBeInTheDocument()
    expect(play).not.toHaveBeenCalled()
  })

  it('exposes no seek, rewind or speed control at any point', async () => {
    const { container } = mount()
    await userEvent.click(screen.getByRole('button', { name: /Start audio/ }))

    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(container.querySelector('input[type="range"]')).toBeNull()
    expect(container.querySelector('audio')).not.toHaveAttribute('controls')

    const labels = screen
      .queryAllByRole('button')
      .map((b) => (b.textContent ?? '') + (b.getAttribute('aria-label') ?? ''))
      .join(' ')
      .toLowerCase()
    expect(labels).not.toMatch(/rewind|back|seek|speed|pause|replay|restart|forward/)
  })

  it('refuses a second play-through', async () => {
    mount()
    const start = screen.getByRole('button', { name: /Start audio/ })
    await userEvent.click(start)
    expect(play).toHaveBeenCalledTimes(1)

    // the gate is gone, so there is nothing left to click…
    expect(screen.queryByRole('button', { name: /Start audio/ })).not.toBeInTheDocument()

    // …and even a stale reference to it cannot start the audio again.
    await userEvent.click(start)
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('pulls playback back when someone tries to rewind', async () => {
    const { container } = mount()
    await userEvent.click(screen.getByRole('button', { name: /Start audio/ }))
    const audio = container.querySelector('audio')
    if (!audio) throw new Error('no audio element')

    Object.defineProperty(audio, 'duration', { value: 600, configurable: true })
    let time = 120
    Object.defineProperty(audio, 'currentTime', {
      get: () => time,
      set: (next: number) => {
        time = next
      },
      configurable: true,
    })

    act(() => audio.dispatchEvent(new Event('timeupdate')))
    time = 5 // a console-level rewind
    act(() => audio.dispatchEvent(new Event('seeking')))

    expect(audio.currentTime).toBe(120)
  })

  it('pins the playback rate to normal speed', async () => {
    const { container } = mount()
    await userEvent.click(screen.getByRole('button', { name: /Start audio/ }))
    const audio = container.querySelector('audio')
    if (!audio) throw new Error('no audio element')

    audio.playbackRate = 1.5
    act(() => audio.dispatchEvent(new Event('ratechange')))
    expect(audio.playbackRate).toBe(1)
  })

  it('shows an explicit error with a retry when the file fails, and says the clock is held', async () => {
    const trouble = vi.fn()
    render(
      <AudioPlayer
        src="/test.mp3"
        sections={sections}
        currentSection={1}
        onEnded={() => {}}
        onTrouble={trouble}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Start audio/ }))
    const audio = document.querySelector('audio')
    if (!audio) throw new Error('no audio element')

    act(() => audio.dispatchEvent(new Event('error')))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not be loaded/i)
    expect(alert).toHaveTextContent(/timer is held/i)
    expect(screen.getByRole('button', { name: /Continue playing/ })).toBeInTheDocument()
    await waitFor(() => expect(trouble).toHaveBeenCalledWith(true))
  })

  it('reports the end of the recording once', async () => {
    const onEnded = vi.fn()
    mount(onEnded)
    await userEvent.click(screen.getByRole('button', { name: /Start audio/ }))
    const audio = document.querySelector('audio')
    if (!audio) throw new Error('no audio element')

    act(() => audio.dispatchEvent(new Event('ended')))
    expect(onEnded).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Recording finished/)).toBeInTheDocument()
  })
})
