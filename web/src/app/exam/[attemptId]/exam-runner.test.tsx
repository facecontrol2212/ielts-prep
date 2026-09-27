import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ExamRunner } from '@/app/exam/[attemptId]/exam-runner'
import {
  makeGroup,
  makeSection,
  makeSession,
} from '@/components/exam/questions/fixtures'
import { useExamStore } from '@/lib/exam-store'
import type { AttemptSession } from '@/types/api'

const replace = vi.fn()
const push = vi.fn()

const router = { replace, push, back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => router }))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn() },
  }
})

const { api, ApiError } = await import('@/lib/api')
const get = vi.mocked(api.get)
const post = vi.mocked(api.post)
const patch = vi.mocked(api.patch)

// jsdom does not implement the modal dialog methods the submit confirmation relies on.
const dialogProto = window.HTMLDialogElement?.prototype
if (dialogProto && !dialogProto.showModal) {
  dialogProto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  dialogProto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
}

function session(overrides: Partial<Parameters<typeof makeSession>[0]> = {}): AttemptSession {
  return makeSession({
    sections: [
      makeSection(1, [
        makeGroup('true_false_not_given', [1, 2]),
        makeGroup('short_answer', [3, 4], { word_limit: 2 }),
      ]),
    ],
    ...overrides,
  })
}

beforeEach(() => {
  replace.mockReset()
  push.mockReset()
  get.mockReset()
  post.mockReset().mockResolvedValue({})
  patch.mockReset().mockResolvedValue({ saved: 0, seconds_remaining: 3600 })
  useExamStore.getState().reset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loading an attempt', () => {
  it('hydrates the store from the server payload', async () => {
    const s = session()
    get.mockResolvedValue(s)
    render(<ExamRunner attemptId={s.attempt.id} />)
    await screen.findByRole('timer')
    expect(useExamStore.getState().session?.attempt.id).toBe(s.attempt.id)
    expect(get).toHaveBeenCalledWith(`/attempts/${s.attempt.id}`)
  })

  it('restores saved answers after a hard refresh', async () => {
    const s = session()
    const q1 = s.test.sections[0].groups[0].questions[0]
    get.mockResolvedValue({
      ...s,
      answers: [{ question_id: q1.id, value: 'TRUE', is_flagged: true }],
    })
    render(<ExamRunner attemptId={s.attempt.id} />)
    await screen.findByRole('timer')
    expect(useExamStore.getState().answers[q1.id]).toBe('TRUE')
    expect(useExamStore.getState().flags[q1.id]).toBe(true)
  })

  it('sends an already-submitted attempt to its result page', async () => {
    const s = session({ status: 'scored' })
    get.mockResolvedValue(s)
    render(<ExamRunner attemptId={s.attempt.id} />)
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/results/${s.attempt.id}`))
  })

  it('explains a 403 without offering a pointless retry', async () => {
    get.mockRejectedValue(new ApiError(403, 'Forbidden'))
    render(<ExamRunner attemptId="someone-elses" />)
    expect(await screen.findByText(/belongs to another account/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Try again/ })).not.toBeInTheDocument()
  })

  it('explains a 404', async () => {
    get.mockRejectedValue(new ApiError(404, 'Not found'))
    render(<ExamRunner attemptId="missing" />)
    expect(await screen.findByText(/could not find this test/i)).toBeInTheDocument()
  })

  it('offers a retry after a network failure and keeps unsaved answers', async () => {
    const s = session()
    const q3 = s.test.sections[0].groups[1].questions[0]

    get.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(s)
    render(<ExamRunner attemptId={s.attempt.id} />)

    const retry = await screen.findByRole('button', { name: /Try again/ })

    // the student had already typed something before the connection dropped
    useExamStore.getState().hydrate(s)
    useExamStore.getState().setAnswer(q3.id, 'local words')

    await userEvent.click(retry)
    await screen.findByRole('timer')
    expect(useExamStore.getState().answers[q3.id]).toBe('local words')
    expect(useExamStore.getState().dirty.has(q3.id)).toBe(true)
  })
})

describe('submitting', () => {
  it('shows the real answered, unanswered and flagged counts', async () => {
    const s = session()
    const questions = s.test.sections[0].groups.flatMap((g) => g.questions)
    get.mockResolvedValue({
      ...s,
      answers: [
        { question_id: questions[0].id, value: 'TRUE', is_flagged: false },
        { question_id: questions[1].id, value: 'FALSE', is_flagged: true },
        { question_id: questions[2].id, value: null, is_flagged: true },
      ],
    })
    render(<ExamRunner attemptId={s.attempt.id} />)
    await screen.findByRole('timer')

    await userEvent.click(screen.getByRole('button', { name: /Submit test/ }))

    const dialog = await screen.findByRole('heading', { name: /Submit your test/ })
    const panel = dialog.closest('dialog')
    if (!panel) throw new Error('no dialog')
    const stat = (label: string) =>
      within(panel).getByText(label).parentElement?.querySelector('dd')?.textContent

    expect(stat('Answered')).toBe('2')
    expect(stat('Unanswered')).toBe('2')
    expect(stat('Flagged')).toBe('2')
  })

  it('flushes, submits and navigates to the result', async () => {
    const s = session()
    const q = s.test.sections[0].groups[1].questions[0]
    get.mockResolvedValue(s)
    render(<ExamRunner attemptId={s.attempt.id} />)
    await screen.findByRole('timer')

    useExamStore.getState().setAnswer(q.id, 'kelp forest')

    await userEvent.click(screen.getByRole('button', { name: /Submit test/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Submit$/ }))

    await waitFor(() => expect(post).toHaveBeenCalledWith(`/attempts/${s.attempt.id}/submit`))
    expect(patch).toHaveBeenCalledWith(
      `/attempts/${s.attempt.id}/answers`,
      expect.objectContaining({
        answers: expect.arrayContaining([
          expect.objectContaining({ question_id: q.id, value: 'kelp forest' }),
        ]),
      }),
    )
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/results/${s.attempt.id}`))
  })

  it('keeps the student in the exam when the submit fails', async () => {
    const s = session()
    get.mockResolvedValue(s)
    post.mockRejectedValue(new ApiError(500, 'Server error'))
    render(<ExamRunner attemptId={s.attempt.id} />)
    await screen.findByRole('timer')

    await userEvent.click(screen.getByRole('button', { name: /Submit test/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Submit$/ }))

    expect(await screen.findByText(/could not submit your test/i)).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('auto-submits exactly once when the clock runs out', async () => {
    const s = session({ secondsRemaining: 0 })
    get.mockResolvedValue(s)
    render(<ExamRunner attemptId={s.attempt.id} />)

    expect(await screen.findByText(/Time is up/i)).toBeInTheDocument()
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/results/${s.attempt.id}`))

    // let several more clock ticks go by
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('treats a 409 on submit as already submitted and moves on', async () => {
    const s = session()
    get.mockResolvedValue(s)
    post.mockRejectedValue(new ApiError(409, 'Attempt is not in progress'))
    render(<ExamRunner attemptId={s.attempt.id} />)
    await screen.findByRole('timer')

    await userEvent.click(screen.getByRole('button', { name: /Submit test/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Submit$/ }))

    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/results/${s.attempt.id}`))
  })
})

describe('keyboard shortcuts', () => {
  it('moves between questions with the arrow keys', async () => {
    const s = session()
    get.mockResolvedValue(s)
    render(<ExamRunner attemptId={s.attempt.id} />)
    await screen.findByRole('timer')

    expect(useExamStore.getState().currentQuestion).toBe(1)
    await userEvent.keyboard('{ArrowRight}')
    expect(useExamStore.getState().currentQuestion).toBe(2)
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}')
    expect(useExamStore.getState().currentQuestion).toBe(2)
  })

  it('stops at both ends instead of wrapping', async () => {
    const s = session()
    get.mockResolvedValue(s)
    render(<ExamRunner attemptId={s.attempt.id} />)
    await screen.findByRole('timer')

    await userEvent.keyboard('{ArrowLeft}')
    expect(useExamStore.getState().currentQuestion).toBe(1)
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(useExamStore.getState().currentQuestion).toBe(4)
  })

  it('flags the current question with f', async () => {
    const s = session()
    const q2 = s.test.sections[0].groups[0].questions[1]
    get.mockResolvedValue(s)
    render(<ExamRunner attemptId={s.attempt.id} />)
    await screen.findByRole('timer')

    await userEvent.keyboard('{ArrowRight}f')
    expect(useExamStore.getState().flags[q2.id]).toBe(true)
    await userEvent.keyboard('f')
    expect(useExamStore.getState().flags[q2.id]).toBe(false)
  })

  it('leaves the arrow keys alone while the student is typing', async () => {
    const s = session()
    get.mockResolvedValue(s)
    render(<ExamRunner attemptId={s.attempt.id} />)
    await screen.findByRole('timer')

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    await userEvent.keyboard('ab{ArrowLeft}f')

    expect(useExamStore.getState().currentQuestion).toBe(1)
    expect(input.value).toBe('afb')
    input.remove()
  })
})

describe('the question palette', () => {
  it('marks answered and flagged questions and jumps to the one clicked', async () => {
    const s = session()
    const questions = s.test.sections[0].groups.flatMap((g) => g.questions)
    get.mockResolvedValue({
      ...s,
      answers: [{ question_id: questions[0].id, value: 'TRUE', is_flagged: true }],
    })
    render(<ExamRunner attemptId={s.attempt.id} />)
    await screen.findByRole('timer')

    expect(
      screen.getByRole('button', { name: /Question 1, answered, flagged for review/ }),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Question 3, not answered/ }))
    expect(useExamStore.getState().currentQuestion).toBe(3)
  })
})
