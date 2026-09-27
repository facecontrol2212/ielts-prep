import type { AttemptHistoryItem, Skill, Variant } from '@/types/api'

export const CATALOGUE_PAGE_SIZE = 12

export interface TestFilters {
  skill: Skill | 'all'
  variant: Variant | 'all'
  difficulty: number | 'all'
}

export const DEFAULT_FILTERS: TestFilters = { skill: 'all', variant: 'all', difficulty: 'all' }

const SKILLS: Skill[] = ['listening', 'reading', 'writing', 'speaking']
const VARIANTS: Variant[] = ['academic', 'general']

/** Read filters off the URL so a filtered catalogue can be linked to and bookmarked. */
export function filtersFromParams(params: URLSearchParams | null): TestFilters {
  const skill = params?.get('skill')
  const variant = params?.get('variant')
  const difficulty = Number(params?.get('difficulty'))
  return {
    skill: SKILLS.includes(skill as Skill) ? (skill as Skill) : 'all',
    variant: VARIANTS.includes(variant as Variant) ? (variant as Variant) : 'all',
    difficulty: Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5 ? difficulty : 'all',
  }
}

/** The one place that turns filter state into a request. Every "all" is simply omitted. */
export function buildTestsPath(
  filters: TestFilters,
  page: number,
  pageSize: number = CATALOGUE_PAGE_SIZE,
): string {
  const search = new URLSearchParams()
  if (filters.skill !== 'all') search.set('skill', filters.skill)
  if (filters.variant !== 'all') search.set('variant', filters.variant)
  if (filters.difficulty !== 'all') search.set('difficulty', String(filters.difficulty))
  search.set('page', String(page))
  search.set('page_size', String(pageSize))
  return `/tests?${search.toString()}`
}

/** The same filters, as a browser URL for the catalogue route. */
export function catalogueHref(filters: TestFilters, page: number): string {
  const search = new URLSearchParams()
  if (filters.skill !== 'all') search.set('skill', filters.skill)
  if (filters.variant !== 'all') search.set('variant', filters.variant)
  if (filters.difficulty !== 'all') search.set('difficulty', String(filters.difficulty))
  if (page > 1) search.set('page', String(page))
  const qs = search.toString()
  return qs ? `/tests?${qs}` : '/tests'
}

export interface TestUserState {
  /** An attempt the student walked away from — offer "Resume", not "Start". */
  inProgressAttemptId?: string
  /** Their best band on this test so far, if any sitting has been scored. */
  bestBand?: number
  /** The most recent scored attempt, so "See your result" can link straight there. */
  lastResultId?: string
}

/**
 * Fold the student's attempt history into "what does this test look like to me?".
 *
 * TestSummary carries nothing user-specific, so the catalogue cross-references
 * GET /users/me/attempts. See the report: this wants to be one field on TestSummary.
 */
export function attemptStateByTest(
  attempts: AttemptHistoryItem[],
): Map<string, TestUserState> {
  const byTest = new Map<string, TestUserState>()

  for (const attempt of attempts) {
    const state = byTest.get(attempt.test_id) ?? {}
    if (attempt.status === 'in_progress' && !state.inProgressAttemptId) {
      state.inProgressAttemptId = attempt.id
    }
    if (attempt.band != null) {
      if (state.bestBand == null || attempt.band > state.bestBand) state.bestBand = attempt.band
      if (!state.lastResultId) state.lastResultId = attempt.id
    }
    byTest.set(attempt.test_id, state)
  }

  return byTest
}
