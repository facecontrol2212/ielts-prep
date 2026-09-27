import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  RECORDINGS_DB,
  clearRecordings,
  deleteRecording,
  isRecordingStorageSupported,
  listRecordings,
  recordingFileName,
  resetRecordingStorage,
  saveRecording,
  type Recording,
} from '@/lib/recordings'

/* ------------------------------------------------------------------------- */
/* A fake IndexedDB covering exactly the surface src/lib/recordings.ts uses.  */
/* jsdom ships no IndexedDB at all, so without this the module is untestable. */
/* ------------------------------------------------------------------------- */

type Row = Record<string, unknown>

class FakeRequest<T> {
  result!: T
  error: Error | null = null
  onsuccess: (() => void) | null = null
  onerror: (() => void) | null = null
  onupgradeneeded: (() => void) | null = null
  onblocked: (() => void) | null = null
}

function resolve<T>(request: FakeRequest<T>, value: T): FakeRequest<T> {
  queueMicrotask(() => {
    request.result = value
    request.onsuccess?.()
  })
  return request
}

interface StoreState {
  keyPath: string
  data: Map<string, Row>
  indexes: Map<string, string>
}

class FakeIndex {
  constructor(
    private readonly state: StoreState,
    private readonly keyPath: string,
  ) {}

  getAll(key: unknown) {
    const rows = [...this.state.data.values()].filter((row) => row[this.keyPath] === key)
    return resolve(new FakeRequest<Row[]>(), rows)
  }
}

class FakeObjectStore {
  constructor(private readonly state: StoreState) {}

  createIndex(name: string, keyPath: string) {
    this.state.indexes.set(name, keyPath)
  }

  index(name: string) {
    const keyPath = this.state.indexes.get(name)
    if (!keyPath) throw new Error(`no index ${name}`)
    return new FakeIndex(this.state, keyPath)
  }

  put(value: Row) {
    const key = String(value[this.state.keyPath])
    this.state.data.set(key, value)
    return resolve(new FakeRequest<string>(), key)
  }

  getAll() {
    return resolve(new FakeRequest<Row[]>(), [...this.state.data.values()])
  }

  delete(key: string) {
    this.state.data.delete(key)
    return resolve(new FakeRequest<undefined>(), undefined)
  }

  clear() {
    this.state.data.clear()
    return resolve(new FakeRequest<undefined>(), undefined)
  }
}

class FakeDatabase {
  readonly stores = new Map<string, StoreState>()

  readonly objectStoreNames = {
    contains: (name: string) => this.stores.has(name),
  }

  createObjectStore(name: string, options: { keyPath: string }) {
    const state: StoreState = { keyPath: options.keyPath, data: new Map(), indexes: new Map() }
    this.stores.set(name, state)
    return new FakeObjectStore(state)
  }

  transaction(name: string) {
    const state = this.stores.get(name)
    if (!state) throw new Error(`no store ${name}`)
    return { objectStore: () => new FakeObjectStore(state) }
  }
}

class FakeIndexedDB {
  readonly databases = new Map<string, FakeDatabase>()

  open(name: string) {
    const request = new FakeRequest<FakeDatabase>()
    const existing = this.databases.get(name)
    const db = existing ?? new FakeDatabase()
    if (!existing) this.databases.set(name, db)
    request.result = db
    queueMicrotask(() => {
      if (!existing) request.onupgradeneeded?.()
      request.onsuccess?.()
    })
    return request
  }
}

function setIndexedDB(value: unknown) {
  Object.defineProperty(globalThis, 'indexedDB', { value, configurable: true, writable: true })
}

function take(over: Partial<Recording> = {}): Omit<Recording, 'id' | 'createdAt'> &
  Partial<Pick<Recording, 'id' | 'createdAt'>> {
  return {
    questionId: 'q-1',
    part: 'part_2',
    topic: 'Places',
    questionText: 'Describe a place you like to visit.',
    durationMs: 42_000,
    mimeType: 'audio/webm',
    blob: new Blob(['audio'], { type: 'audio/webm' }),
    ...over,
  }
}

let fake: FakeIndexedDB

beforeEach(() => {
  fake = new FakeIndexedDB()
  setIndexedDB(fake)
  resetRecordingStorage()
})

afterEach(() => {
  setIndexedDB(undefined)
  resetRecordingStorage()
})

describe('recording storage', () => {
  it('reports support from the presence of IndexedDB', () => {
    expect(isRecordingStorageSupported()).toBe(true)
    setIndexedDB(undefined)
    expect(isRecordingStorageSupported()).toBe(false)
  })

  it('creates the store and its question index on first open', async () => {
    await saveRecording(take())
    const db = fake.databases.get(RECORDINGS_DB)
    expect(db).toBeDefined()
    const store = db?.stores.get('recordings')
    expect(store?.keyPath).toBe('id')
    expect([...(store?.indexes.keys() ?? [])]).toEqual(['by_question', 'by_created'])
  })

  it('saves a recording, gives it an id, and lists it back', async () => {
    const saved = await saveRecording(take())
    expect(saved.id).toBeTruthy()
    expect(saved.createdAt).toBeGreaterThan(0)

    const rows = await listRecordings('q-1')
    expect(rows).toHaveLength(1)
    expect(rows[0].questionText).toBe('Describe a place you like to visit.')
  })

  it('lists only the takes for one question, newest first', async () => {
    await saveRecording(take({ id: 'a', createdAt: 1000 }))
    await saveRecording(take({ id: 'b', createdAt: 3000 }))
    await saveRecording(take({ id: 'c', createdAt: 2000, questionId: 'q-2' }))

    expect((await listRecordings('q-1')).map((r) => r.id)).toEqual(['b', 'a'])
    expect((await listRecordings('q-2')).map((r) => r.id)).toEqual(['c'])
    expect((await listRecordings()).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('deletes one take and clears them all', async () => {
    await saveRecording(take({ id: 'a' }))
    await saveRecording(take({ id: 'b' }))

    await deleteRecording('a')
    expect((await listRecordings('q-1')).map((r) => r.id)).toEqual(['b'])

    await clearRecordings()
    expect(await listRecordings('q-1')).toEqual([])
  })

  it('rejects with a readable message when IndexedDB is unavailable', async () => {
    setIndexedDB(undefined)
    resetRecordingStorage()
    await expect(listRecordings('q-1')).rejects.toThrow(/cannot store recordings/i)
  })
})

describe('recordingFileName', () => {
  it('names the file after the part and the moment it was recorded', () => {
    const name = recordingFileName({
      ...take(),
      id: 'a',
      createdAt: new Date(2026, 8, 27, 14, 12).getTime(),
    } as Recording)
    expect(name).toBe('speaking-part-2-2026-09-27-1412.webm')
  })

  it('uses an m4a extension for Safari recordings', () => {
    const name = recordingFileName({
      ...take({ mimeType: 'audio/mp4' }),
      id: 'a',
      createdAt: Date.now(),
    } as Recording)
    expect(name.endsWith('.m4a')).toBe(true)
  })
})
