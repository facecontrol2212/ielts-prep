/**
 * A belt-and-braces mirror of the essay in localStorage.
 *
 * The server draft is the real store. This exists for the one case it cannot cover: the save
 * request failed (offline, 500, laptop lid) and the student then reloads. Without the mirror the
 * reload would quietly serve them an older essay and they would never know what they lost.
 *
 * `at` is when the text last changed locally; `syncedAt` is when the server last acknowledged it.
 * `at > syncedAt` therefore means "this browser holds work the server has not got".
 */

export interface LocalDraft {
  text: string
  at: number
  syncedAt: number
}

function key(attemptId: string, taskNumber: number): string {
  return `ielts.writing.${attemptId}.${taskNumber}`
}

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

export function readLocalDraft(attemptId: string, taskNumber: number): LocalDraft | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(key(attemptId, taskNumber))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { text, at, syncedAt } = parsed as Partial<LocalDraft>
    if (typeof text !== 'string' || typeof at !== 'number') return null
    return { text, at, syncedAt: typeof syncedAt === 'number' ? syncedAt : 0 }
  } catch {
    return null
  }
}

function write(attemptId: string, taskNumber: number, draft: LocalDraft): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(key(attemptId, taskNumber), JSON.stringify(draft))
  } catch {
    // Quota or a locked-down profile. The server draft still carries the essay.
  }
}

export function writeLocalDraft(attemptId: string, taskNumber: number, text: string): void {
  const previous = readLocalDraft(attemptId, taskNumber)
  write(attemptId, taskNumber, { text, at: Date.now(), syncedAt: previous?.syncedAt ?? 0 })
}

export function markLocalSynced(attemptId: string, taskNumber: number, text: string): void {
  const now = Date.now()
  const previous = readLocalDraft(attemptId, taskNumber)
  // Only the text we actually sent is acknowledged; keystrokes since then stay unsynced.
  if (previous && previous.text !== text) {
    write(attemptId, taskNumber, { ...previous, syncedAt: 0 })
    return
  }
  write(attemptId, taskNumber, { text, at: previous?.at ?? now, syncedAt: now })
}

/** True when this browser holds text the server never acknowledged. */
export function hasUnsyncedLocalDraft(draft: LocalDraft | null, serverText: string): boolean {
  if (!draft) return false
  if (draft.text === serverText) return false
  return draft.at > draft.syncedAt
}

export function clearLocalDrafts(attemptId: string, taskNumbers: readonly number[]): void {
  const store = storage()
  if (!store) return
  for (const n of taskNumbers) {
    try {
      store.removeItem(key(attemptId, n))
    } catch {
      /* nothing to do */
    }
  }
}
