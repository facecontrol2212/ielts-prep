/**
 * Typed API client. One place that knows about tokens, refresh and error shape.
 *
 * Tokens live in localStorage: the exam runner must survive a hard refresh mid-test,
 * and a memory-only token would log the student out and lose the sitting.
 */
import type { TokenPair } from '@/types/api'

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? '/api'
const ACCESS_KEY = 'ielts.access'
const REFRESH_KEY = 'ielts.refresh'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(detail)
    this.name = 'ApiError'
  }
}

export const tokenStore = {
  get access() {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(ACCESS_KEY)
  },
  get refresh() {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(REFRESH_KEY)
  },
  set(pair: TokenPair) {
    window.localStorage.setItem(ACCESS_KEY, pair.access_token)
    window.localStorage.setItem(REFRESH_KEY, pair.refresh_token)
  },
  clear() {
    window.localStorage.removeItem(ACCESS_KEY)
    window.localStorage.removeItem(REFRESH_KEY)
  },
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') return body.detail
    if (Array.isArray(body?.detail)) return body.detail.map((d: { msg: string }) => d.msg).join(', ')
    return res.statusText
  } catch {
    return res.statusText
  }
}

let refreshInFlight: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  const refresh = tokenStore.refresh
  if (!refresh) return false
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      })
      if (!res.ok) return false
      tokenStore.set((await res.json()) as TokenPair)
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** Skip the Authorization header (public endpoints). */
  anonymous?: boolean
  /** Internal: prevents an infinite refresh loop. */
  _retried?: boolean
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, anonymous, _retried, headers, ...rest } = options
  const finalHeaders = new Headers(headers)
  if (body !== undefined) finalHeaders.set('Content-Type', 'application/json')
  if (!anonymous) {
    const token = tokenStore.access
    if (token) finalHeaders.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.status === 401 && !anonymous && !_retried && (await tryRefresh())) {
    return apiFetch<T>(path, { ...options, _retried: true })
  }

  if (!res.ok) throw new ApiError(res.status, await parseError(res))
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string, o?: RequestOptions) => apiFetch<T>(path, { ...o, method: 'GET' }),
  post: <T>(path: string, body?: unknown, o?: RequestOptions) =>
    apiFetch<T>(path, { ...o, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, o?: RequestOptions) =>
    apiFetch<T>(path, { ...o, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, o?: RequestOptions) =>
    apiFetch<T>(path, { ...o, method: 'PATCH', body }),
  del: <T>(path: string, o?: RequestOptions) => apiFetch<T>(path, { ...o, method: 'DELETE' }),
}
