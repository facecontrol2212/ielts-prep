/**
 * Browser-local storage for speaking practice recordings.
 *
 * v1 has no upload endpoint on purpose (see docs/api-contract.md § speaking): a student's voice
 * never leaves their machine. Everything lives in IndexedDB, which means it also dies with the
 * browser profile — the UI has to say so out loud.
 *
 * Schema
 *   database  `ielts-recordings`  version 1
 *   store     `recordings`        keyPath `id` (uuid)
 *   index     `by_question`       on `questionId`  (list a question's takes)
 *   index     `by_created`        on `createdAt`   (newest-first listing)
 *
 * Every entry embeds the question text and topic as they were at record time, so a recording is
 * still readable after the question bank changes underneath it.
 */
import type { SpeakingQuestion } from '@/types/api'

export const RECORDINGS_DB = 'ielts-recordings'
export const RECORDINGS_DB_VERSION = 1
export const RECORDINGS_STORE = 'recordings'
const INDEX_QUESTION = 'by_question'
const INDEX_CREATED = 'by_created'

export interface Recording {
  id: string
  questionId: string
  part: SpeakingQuestion['part']
  topic: string
  /** Snapshot of the prompt, so the take makes sense even if the bank changes. */
  questionText: string
  /** Epoch milliseconds. */
  createdAt: number
  durationMs: number
  mimeType: string
  blob: Blob
}

export type NewRecording = Omit<Recording, 'id' | 'createdAt'> &
  Partial<Pick<Recording, 'id' | 'createdAt'>>

export class RecordingStorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecordingStorageError'
  }
}

function getFactory(): IDBFactory | null {
  const scope = globalThis as { indexedDB?: IDBFactory | null }
  return scope.indexedDB ?? null
}

/** IndexedDB is missing in some private-browsing modes; the page must degrade, not crash. */
export function isRecordingStorageSupported(): boolean {
  return getFactory() !== null
}

export function newRecordingId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

let dbPromise: Promise<IDBDatabase> | null = null

/** Test seam: drops the cached connection so a fresh fake factory is picked up. */
export function resetRecordingStorage(): void {
  dbPromise = null
}

function openDb(): Promise<IDBDatabase> {
  const factory = getFactory()
  if (!factory) {
    return Promise.reject(
      new RecordingStorageError('This browser cannot store recordings on the device.'),
    )
  }
  if (!dbPromise) {
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest
      try {
        request = factory.open(RECORDINGS_DB, RECORDINGS_DB_VERSION)
      } catch (err) {
        reject(new RecordingStorageError(errorMessage(err)))
        return
      }
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(RECORDINGS_STORE)) {
          const store = db.createObjectStore(RECORDINGS_STORE, { keyPath: 'id' })
          store.createIndex(INDEX_QUESTION, 'questionId', { unique: false })
          store.createIndex(INDEX_CREATED, 'createdAt', { unique: false })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () =>
        reject(new RecordingStorageError(errorMessage(request.error) || 'Could not open storage.'))
      request.onblocked = () =>
        reject(
          new RecordingStorageError(
            'Another tab is using your recordings. Close it and reload this page.',
          ),
        )
    })
    opening.catch(() => {
      dbPromise = null
    })
    dbPromise = opening
  }
  return dbPromise
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return ''
}

async function run<T>(
  mode: IDBTransactionMode,
  make: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    let request: IDBRequest<T>
    try {
      const tx = db.transaction(RECORDINGS_STORE, mode)
      request = make(tx.objectStore(RECORDINGS_STORE))
    } catch (err) {
      reject(new RecordingStorageError(errorMessage(err) || 'Recording storage failed.'))
      return
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(new RecordingStorageError(errorMessage(request.error) || 'Recording storage failed.'))
  })
}

export async function saveRecording(input: NewRecording): Promise<Recording> {
  const record: Recording = {
    ...input,
    id: input.id ?? newRecordingId(),
    createdAt: input.createdAt ?? Date.now(),
  }
  await run('readwrite', (store) => store.put(record) as IDBRequest<IDBValidKey>)
  return record
}

/** Newest first. Pass a questionId to list only that question's takes. */
export async function listRecordings(questionId?: string): Promise<Recording[]> {
  const rows = await run<Recording[]>('readonly', (store) =>
    questionId === undefined
      ? (store.getAll() as IDBRequest<Recording[]>)
      : (store.index(INDEX_QUESTION).getAll(questionId) as IDBRequest<Recording[]>),
  )
  return [...(rows ?? [])].sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteRecording(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id) as IDBRequest<undefined>)
}

export async function clearRecordings(): Promise<void> {
  await run('readwrite', (store) => store.clear() as IDBRequest<undefined>)
}

/** `speaking-part-2-2026-09-27-1412.webm` — readable in a Downloads folder a month later. */
export function recordingFileName(recording: Recording): string {
  const d = new Date(recording.createdAt)
  const pad = (n: number) => n.toString().padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
  const ext = recording.mimeType.includes('mp4')
    ? 'm4a'
    : recording.mimeType.includes('ogg')
      ? 'ogg'
      : 'webm'
  return `speaking-${recording.part.replace('_', '-')}-${stamp}.${ext}`
}
