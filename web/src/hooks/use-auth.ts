'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useSyncExternalStore } from 'react'

import { tokenStore } from '@/lib/api'
import {
  type RegisterInput,
  clearSession,
  fetchMe,
  loginRequest,
  registerRequest,
} from '@/lib/auth'
import type { User } from '@/types/api'

/**
 * The signed-in user, as a module-level store.
 *
 * A store rather than a context because the app shell, the nav and a page can
 * each call useAuth() independently and must agree — and because adding a
 * provider would mean editing app/providers.tsx, which this agent does not own.
 */

interface AuthState {
  user: User | null
  loading: boolean
}

const SERVER_STATE: AuthState = { user: null, loading: true }

let state: AuthState = { user: null, loading: true }
let bootstrapped = false
let inFlight: Promise<void> | null = null
const listeners = new Set<() => void>()

function setState(next: AuthState) {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): AuthState {
  return state
}

function getServerSnapshot(): AuthState {
  return SERVER_STATE
}

/**
 * Resolve the session once per page load. With no access token there is no
 * request at all, so an anonymous visitor to the landing page costs nothing.
 */
function bootstrap(): Promise<void> {
  if (bootstrapped) return inFlight ?? Promise.resolve()
  bootstrapped = true
  if (!tokenStore.access) {
    setState({ user: null, loading: false })
    return Promise.resolve()
  }
  inFlight = (async () => {
    try {
      setState({ user: await fetchMe(), loading: false })
    } catch {
      clearSession()
      setState({ user: null, loading: false })
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/** Test-only: drop the cached session so each test starts signed out. */
export function resetAuthForTests() {
  state = { user: null, loading: true }
  bootstrapped = false
  inFlight = null
  for (const listener of listeners) listener()
}

export interface UseAuth {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => void
}

export function useAuth(): UseAuth {
  const { user, loading } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const router = useRouter()

  useEffect(() => {
    void bootstrap()
  }, [])

  const adopt = useCallback(async () => {
    try {
      setState({ user: await fetchMe(), loading: false })
    } catch (error) {
      clearSession()
      setState({ user: null, loading: false })
      throw error
    }
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      await loginRequest(email, password)
      bootstrapped = true
      await adopt()
    },
    [adopt],
  )

  const register = useCallback(
    async (input: RegisterInput) => {
      await registerRequest(input)
      bootstrapped = true
      await adopt()
    },
    [adopt],
  )

  const logout = useCallback(() => {
    clearSession()
    bootstrapped = true
    setState({ user: null, loading: false })
    router.replace('/')
  }, [router])

  return { user, loading, login, register, logout }
}

/**
 * For pages behind the login wall. Sends a signed-out visitor to /login and
 * remembers where they were headed so the form can put them back.
 */
export function useRequireAuth(): { user: User | null; loading: boolean } {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading || user) return
    const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : ''
    router.replace(`/login${next}`)
  }, [loading, user, pathname, router])

  return { user, loading }
}
