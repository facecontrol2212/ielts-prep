/**
 * Auth: validation schemas, the five auth API calls, and the translation of an
 * API failure into a sentence a student can act on.
 *
 * Tokens are never touched here by hand — `tokenStore` from @/lib/api owns them.
 */
import { z } from 'zod'

import type { Copy } from '@/components/marketing/copy'
import { ApiError, api, tokenStore } from '@/lib/api'
import type { TokenPair, User } from '@/types/api'

export type AuthErrors = Copy['auth']['errors']

/** `POST /auth/forgot-password` and friends answer with `{ detail }`. */
export interface Message {
  detail: string
}

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128
export const NAME_MAX = 120

/* ------------------------------------------------------------------ schemas */

const emailField = (e: AuthErrors) =>
  z.string().trim().min(1, e.emailRequired).email(e.emailInvalid)

const newPasswordField = (e: AuthErrors) =>
  z.string().min(PASSWORD_MIN, e.passwordShort).max(PASSWORD_MAX, e.passwordLong)

export const loginSchema = (e: AuthErrors) =>
  z.object({
    email: emailField(e),
    password: z.string().min(1, e.passwordRequired),
  })

export const registerSchema = (e: AuthErrors) =>
  z
    .object({
      full_name: z.string().trim().max(NAME_MAX, e.nameLong),
      email: emailField(e),
      password: newPasswordField(e),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, {
      message: e.confirmMismatch,
      path: ['confirm'],
    })

export const forgotPasswordSchema = (e: AuthErrors) => z.object({ email: emailField(e) })

export const resetPasswordSchema = (e: AuthErrors) =>
  z
    .object({
      password: newPasswordField(e),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, {
      message: e.confirmMismatch,
      path: ['confirm'],
    })

export type LoginValues = z.infer<ReturnType<typeof loginSchema>>
export type RegisterValues = z.infer<ReturnType<typeof registerSchema>>
export type ForgotPasswordValues = z.infer<ReturnType<typeof forgotPasswordSchema>>
export type ResetPasswordValues = z.infer<ReturnType<typeof resetPasswordSchema>>

/** First message per field, ready to drop next to an input. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    out[key] ??= issue.message
  }
  return out
}

/* ------------------------------------------------------------- strength hint */

export interface PasswordStrength {
  /** 0 = too short, 4 = strong. Indexes into `copy.auth.strengthLevels`. */
  score: 0 | 1 | 2 | 3 | 4
  tone: 'danger' | 'warning' | 'success'
}

export function passwordStrength(password: string): PasswordStrength {
  if (password.length < PASSWORD_MIN) return { score: 0, tone: 'danger' }
  const classes =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/\d/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password))
  let score = 1
  if (password.length >= 12) score += 1
  if (classes >= 3) score += 1
  if (classes >= 4 || password.length >= 16) score += 1
  const capped = Math.min(4, score) as 1 | 2 | 3 | 4
  return { score: capped, tone: capped >= 4 ? 'success' : capped >= 2 ? 'warning' : 'danger' }
}

/* ------------------------------------------------------------ error mapping */

/**
 * The API deliberately says the same thing for an unknown email and a wrong
 * password, and never reveals whether an address is registered. We keep that
 * and only make the wording actionable.
 */
export function authErrorMessage(error: unknown, e: AuthErrors): string {
  if (!(error instanceof ApiError)) {
    if (error instanceof TypeError) return e.offline
    return error instanceof Error && error.message ? error.message : e.unknown
  }
  switch (error.status) {
    case 401:
      return e.invalidCredentials
    case 409:
      return e.emailTaken
    case 400:
      return /token/i.test(error.detail) ? e.badToken : error.detail || e.unknown
    case 404:
      return e.badToken
    case 429:
      return e.rateLimited
    default:
      if (error.status >= 500) return e.server
      return error.detail || e.unknown
  }
}

/* --------------------------------------------------------------- api calls */

export async function loginRequest(email: string, password: string): Promise<TokenPair> {
  const pair = await api.post<TokenPair>(
    '/auth/login',
    { email, password },
    { anonymous: true },
  )
  tokenStore.set(pair)
  return pair
}

export interface RegisterInput {
  email: string
  password: string
  full_name?: string
}

export async function registerRequest(input: RegisterInput): Promise<TokenPair> {
  const pair = await api.post<TokenPair>(
    '/auth/register',
    { ...input, full_name: input.full_name?.trim() || null },
    { anonymous: true },
  )
  tokenStore.set(pair)
  return pair
}

export function fetchMe(): Promise<User> {
  return api.get<User>('/users/me')
}

export function forgotPasswordRequest(email: string): Promise<Message> {
  return api.post<Message>('/auth/forgot-password', { email }, { anonymous: true })
}

export function resetPasswordRequest(token: string, password: string): Promise<Message> {
  return api.post<Message>('/auth/reset-password', { token, password }, { anonymous: true })
}

export function verifyEmailRequest(token: string): Promise<Message> {
  return api.post<Message>('/auth/verify-email', { token }, { anonymous: true })
}

export function clearSession(): void {
  tokenStore.clear()
}
