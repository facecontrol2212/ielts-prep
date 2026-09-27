import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RecorderPanel } from '@/components/speaking/recorder-panel'
import type { Recording } from '@/lib/recordings'
import type { SpeakingQuestion } from '@/types/api'

/* ------------------------------------------------------------ IndexedDB mock */

const { store, storageSupported } = vi.hoisted(() => ({
  store: new Map<string, Recording>(),
  storageSupported: { value: true },
}))

vi.mock('@/lib/recordings', () => ({
  isRecordingStorageSupported: () => storageSupported.value,
  listRecordings: vi.fn(async (questionId?: string) =>
    [...store.values()]
      .filter((r) => questionId === undefined || r.questionId === questionId)
      .sort((a, b) => b.createdAt - a.createdAt),
  ),
  saveRecording: vi.fn(async (input: Omit<Recording, 'id' | 'createdAt'>) => {
    const record: Recording = { ...input, id: `rec-${store.size + 1}`, createdAt: Date.now() }
    store.set(record.id, record)
    return record
  }),
  deleteRecording: vi.fn(async (id: string) => {
    store.delete(id)
  }),
  recordingFileName: () => 'take.webm',
}))

/* --------------------------------------------------------- MediaRecorder mock */

type DataHandler = (event: { data: Blob }) => void

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = []
  static isTypeSupported = () => true

  state: 'inactive' | 'recording' | 'paused' = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: DataHandler | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor() {
    MockMediaRecorder.instances.push(this)
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}

const getUserMedia = vi.fn()

function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop: () => undefined }] } as unknown as MediaStream
}

function install({ mediaRecorder = true }: { mediaRecorder?: boolean } = {}) {
  Object.defineProperty(window, 'MediaRecorder', {
    value: mediaRecorder ? MockMediaRecorder : undefined,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(window.navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
    writable: true,
  })
}

const question: SpeakingQuestion = {
  id: 'q-1',
  part: 'part_2',
  topic: 'Places',
  question: 'Describe a place you like to visit.',
  cue_points: ['where it is', 'how often you go'],
  model_answer: null,
  useful_phrases: null,
}

beforeEach(() => {
  store.clear()
  storageSupported.value = true
  MockMediaRecorder.instances = []
  getUserMedia.mockReset()
  getUserMedia.mockResolvedValue(fakeStream())
  install()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('<RecorderPanel />', () => {
  it('does not touch the microphone until record is pressed', async () => {
    render(<RecorderPanel question={question} longTurn />)
    await screen.findByText(/No takes yet/i)
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(screen.getByText(/only requested when you press record/i)).toBeInTheDocument()
  })

  it('explains a denied microphone instead of failing silently', async () => {
    const user = userEvent.setup()
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))

    render(<RecorderPanel question={question} longTurn />)
    await user.click(screen.getByRole('button', { name: /Record answer/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Microphone blocked')
    expect(alert).toHaveTextContent(/set Microphone to Allow/i)
    // Still ready to try again.
    expect(screen.getByRole('button', { name: /Record answer/i })).toBeEnabled()
  })

  it('saves a recording to device storage and lists it, then deletes it', async () => {
    const user = userEvent.setup()
    render(<RecorderPanel question={question} longTurn />)
    await screen.findByText(/No takes yet/i)

    await user.click(screen.getByRole('button', { name: /Record answer/i }))
    const stop = await screen.findByRole('button', { name: /Stop/i })

    await user.click(stop)

    expect(await screen.findByText(/Take 1/)).toBeInTheDocument()
    expect(store.size).toBe(1)
    const saved = [...store.values()][0]
    expect(saved.questionId).toBe('q-1')
    expect(saved.part).toBe('part_2')
    expect(saved.questionText).toBe(question.question)
    expect(saved.mimeType).toBe('audio/webm')

    await user.click(screen.getByRole('button', { name: /^Delete take 1$/i }))
    await user.click(screen.getByRole('button', { name: /Confirm delete take 1/i }))

    await waitFor(() => expect(store.size).toBe(0))
    expect(await screen.findByText(/No takes yet/i)).toBeInTheDocument()
  })

  it('runs the one-minute preparation before the microphone is opened', async () => {
    const user = userEvent.setup()
    render(<RecorderPanel question={question} longTurn />)

    await user.click(screen.getByRole('button', { name: /Prepare \(1 min\)/i }))

    expect(screen.getByText('Preparation')).toBeInTheDocument()
    expect(screen.getByText('1:00')).toBeInTheDocument()
    expect(screen.getByText(/The microphone is not on yet/i)).toBeInTheDocument()
    expect(getUserMedia).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Start speaking now/i }))
    expect(screen.getByRole('button', { name: /Record answer/i })).toBeInTheDocument()
  })

  it('degrades to a clear message when MediaRecorder is missing', async () => {
    install({ mediaRecorder: false })
    render(<RecorderPanel question={question} longTurn />)

    expect(
      await screen.findByText(/Recording is not supported in this browser/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Record answer/i })).not.toBeInTheDocument()
    // The rest of the page still works.
    expect(screen.getByText(/No takes yet/i)).toBeInTheDocument()
  })

  it('degrades when the browser cannot store recordings', async () => {
    storageSupported.value = false
    render(<RecorderPanel question={question} longTurn />)

    expect(await screen.findByText(/cannot store files on the device/i)).toBeInTheDocument()
  })

  it('says recordings never leave the device', async () => {
    render(<RecorderPanel question={question} longTurn />)
    await screen.findByText(/No takes yet/i)
    expect(screen.getByText(/never uploaded/i)).toBeInTheDocument()
    expect(screen.getByText(/Clearing your browsing data/i)).toBeInTheDocument()
  })
})
