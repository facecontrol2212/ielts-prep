import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDraftAutosave } from '@/components/writing/use-draft-autosave'

const { put } = vi.hoisted(() => ({ put: vi.fn() }))

vi.mock('@/lib/api', () => ({
  api: { put, get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
  ApiError: class ApiError extends Error {},
}))

const ATTEMPT = 'attempt-1'

beforeEach(() => {
  put.mockReset()
  put.mockResolvedValue({})
  window.localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDraftAutosave', () => {
  it('marks a task dirty as soon as it is typed into', () => {
    const { result } = renderHook(() => useDraftAutosave(ATTEMPT, true))

    act(() => result.current.setText(2, 'The chart shows'))

    expect(result.current.dirty).toEqual([2])
    expect(result.current.texts[2]).toBe('The chart shows')
    expect(result.current.saveState).toBe('idle')
  })

  it('PUTs the draft with the task number and the text', async () => {
    const { result } = renderHook(() => useDraftAutosave(ATTEMPT, true))

    act(() => result.current.setText(1, 'Task one answer'))
    act(() => result.current.setText(2, 'Task two answer'))
    await act(async () => {
      await result.current.flush()
    })

    expect(put).toHaveBeenCalledTimes(2)
    expect(put).toHaveBeenNthCalledWith(1, `/writing/attempts/${ATTEMPT}/draft`, {
      task_number: 1,
      text: 'Task one answer',
    })
    expect(put).toHaveBeenNthCalledWith(2, `/writing/attempts/${ATTEMPT}/draft`, {
      task_number: 2,
      text: 'Task two answer',
    })
    expect(result.current.saveState).toBe('saved')
    expect(result.current.dirty).toEqual([])
  })

  it('saves on the 10 second interval without being asked', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useDraftAutosave(ATTEMPT, true))

    act(() => result.current.setText(1, 'Ten second autosave'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(put).toHaveBeenCalledWith(`/writing/attempts/${ATTEMPT}/draft`, {
      task_number: 1,
      text: 'Ten second autosave',
    })
  })

  it('shows the error state on a failed save and keeps the text and the dirty flag', async () => {
    put.mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useDraftAutosave(ATTEMPT, true))

    act(() => result.current.setText(2, 'An hour of work'))
    await act(async () => {
      await result.current.flush()
    })

    expect(result.current.saveState).toBe('error')
    expect(result.current.texts[2]).toBe('An hour of work')
    expect(result.current.dirty).toEqual([2])

    // The next attempt recovers without the student retyping anything.
    await act(async () => {
      await result.current.flush()
    })
    await waitFor(() => expect(result.current.saveState).toBe('saved'))
    expect(put).toHaveBeenLastCalledWith(`/writing/attempts/${ATTEMPT}/draft`, {
      task_number: 2,
      text: 'An hour of work',
    })
  })

  it('does not save while disabled', async () => {
    const { result } = renderHook(() => useDraftAutosave(ATTEMPT, false))
    act(() => result.current.setText(1, 'not yet'))
    await act(async () => {
      await result.current.flush()
    })
    expect(put).not.toHaveBeenCalled()
  })

  it('restores unsaved local work over the server copy after a refresh', async () => {
    // First session: type, fail to save, then "close the tab".
    put.mockRejectedValueOnce(new Error('offline'))
    const first = renderHook(() => useDraftAutosave(ATTEMPT, true))
    act(() => first.result.current.hydrate({ 1: 'server copy' }))
    act(() => first.result.current.setText(1, 'server copy plus a new paragraph'))
    await act(async () => {
      await first.result.current.flush()
    })
    first.unmount()

    // Second session: the server still only has the old text.
    const second = renderHook(() => useDraftAutosave(ATTEMPT, true))
    let recovered: number[] = []
    act(() => {
      recovered = second.result.current.hydrate({ 1: 'server copy' })
    })

    expect(recovered).toEqual([1])
    expect(second.result.current.texts[1]).toBe('server copy plus a new paragraph')
    expect(second.result.current.dirty).toEqual([1])
  })

  it('takes the server copy when the local mirror is already synced', async () => {
    const first = renderHook(() => useDraftAutosave(ATTEMPT, true))
    act(() => first.result.current.setText(1, 'saved text'))
    await act(async () => {
      await first.result.current.flush()
    })
    first.unmount()

    const second = renderHook(() => useDraftAutosave(ATTEMPT, true))
    let recovered: number[] = []
    act(() => {
      recovered = second.result.current.hydrate({ 1: 'saved text' })
    })

    expect(recovered).toEqual([])
    expect(second.result.current.texts[1]).toBe('saved text')
  })
})
