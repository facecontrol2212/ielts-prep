import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AttemptHistoryItem, Page, TestSummary } from '@/types/api'

const apiGet = vi.fn()
const apiPost = vi.fn()
const routerPush = vi.fn()
const routerReplace = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get: (path: string) => apiGet(path),
    post: (path: string, body?: unknown) => apiPost(path, body),
  },
  ApiError: class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly detail: string,
    ) {
      super(detail)
    }
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

// imported after vi.mock so the module mocks above are registered first
import {
  attemptStateByTest,
  buildTestsPath,
  catalogueHref,
  DEFAULT_FILTERS,
  filtersFromParams,
} from '@/components/catalogue/query'
// imported after vi.mock so the module mocks above are registered first
import { TestsCatalogue } from '@/components/catalogue/tests-catalogue'

const TESTS: TestSummary[] = [
  {
    id: 'test-1',
    slug: 'reading-academic-01',
    skill: 'reading',
    variant: 'academic',
    title: 'Academic Reading Test 1',
    description: 'Three passages on urban planning, coral reefs and sleep.',
    difficulty: 3,
    duration_seconds: 3600,
    question_count: 40,
  },
  {
    id: 'test-2',
    slug: 'listening-01',
    skill: 'listening',
    variant: 'academic',
    title: 'Listening Test 1',
    description: null,
    difficulty: 2,
    duration_seconds: 1800,
    question_count: 40,
  },
  {
    id: 'test-3',
    slug: 'reading-academic-02',
    skill: 'reading',
    variant: 'academic',
    title: 'Academic Reading Test 2',
    description: null,
    difficulty: 4,
    duration_seconds: 3600,
    question_count: 40,
  },
]

const ATTEMPTS: AttemptHistoryItem[] = [
  {
    id: 'att-open',
    test_id: 'test-1',
    test_title: 'Academic Reading Test 1',
    skill: 'reading',
    status: 'in_progress',
    band: null,
    raw_score: null,
    submitted_at: null,
  },
  {
    id: 'att-done',
    test_id: 'test-2',
    test_title: 'Listening Test 1',
    skill: 'listening',
    status: 'scored',
    band: 6.5,
    raw_score: 29,
    submitted_at: '2026-09-20T09:00:00Z',
  },
  {
    id: 'att-older',
    test_id: 'test-2',
    test_title: 'Listening Test 1',
    skill: 'listening',
    status: 'scored',
    band: 6,
    raw_score: 25,
    submitted_at: '2026-09-01T09:00:00Z',
  },
]

function page<T>(items: T[]): Page<T> {
  return { items, total: items.length, page: 1, page_size: 12 }
}

function renderCatalogue() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <TestsCatalogue />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  apiGet.mockImplementation((path: string) => {
    if (path.startsWith('/users/me/attempts')) return Promise.resolve(page(ATTEMPTS))
    return Promise.resolve(page(TESTS))
  })
})

describe('buildTestsPath', () => {
  it('omits every "all" and always sends the page window', () => {
    expect(buildTestsPath(DEFAULT_FILTERS, 1)).toBe('/tests?page=1&page_size=12')
  })

  it('sends each filter the API understands', () => {
    expect(buildTestsPath({ skill: 'reading', variant: 'academic', difficulty: 4 }, 2)).toBe(
      '/tests?skill=reading&variant=academic&difficulty=4&page=2&page_size=12',
    )
  })
})

describe('filtersFromParams / catalogueHref', () => {
  it('round-trips a filtered catalogue URL', () => {
    const filters = filtersFromParams(new URLSearchParams('skill=listening&difficulty=2'))
    expect(filters).toEqual({ skill: 'listening', variant: 'all', difficulty: 2 })
    expect(catalogueHref(filters, 1)).toBe('/tests?skill=listening&difficulty=2')
  })

  it('throws nothing away on junk input', () => {
    expect(filtersFromParams(new URLSearchParams('skill=cooking&difficulty=99'))).toEqual(
      DEFAULT_FILTERS,
    )
  })
})

describe('attemptStateByTest', () => {
  it('keeps the open attempt and the best band per test', () => {
    const states = attemptStateByTest(ATTEMPTS)
    expect(states.get('test-1')?.inProgressAttemptId).toBe('att-open')
    expect(states.get('test-2')?.bestBand).toBe(6.5)
    expect(states.get('test-2')?.lastResultId).toBe('att-done')
    expect(states.get('test-3')).toBeUndefined()
  })
})

describe('TestsCatalogue — filters drive the request', () => {
  it('asks for every test on first load', async () => {
    renderCatalogue()
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/tests?page=1&page_size=12'))
  })

  it('refetches with skill=reading when the Reading chip is pressed', async () => {
    const user = userEvent.setup()
    renderCatalogue()
    await screen.findByText('Academic Reading Test 1')

    await user.click(screen.getByRole('button', { name: 'Reading' }))

    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith('/tests?skill=reading&page=1&page_size=12'),
    )
    expect(routerReplace).toHaveBeenCalledWith('/tests?skill=reading', { scroll: false })
  })

  it('refetches with the difficulty when the select changes', async () => {
    const user = userEvent.setup()
    renderCatalogue()
    await screen.findByText('Academic Reading Test 1')

    await user.selectOptions(screen.getByLabelText('Difficulty'), '4')

    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith('/tests?difficulty=4&page=1&page_size=12'),
    )
  })

  it('refetches with the variant when the select changes', async () => {
    const user = userEvent.setup()
    renderCatalogue()
    await screen.findByText('Academic Reading Test 1')

    await user.selectOptions(screen.getByLabelText('Variant'), 'general')

    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith('/tests?variant=general&page=1&page_size=12'),
    )
  })
})

describe('TestsCatalogue — resume and retake', () => {
  it('offers Resume for a test with an attempt still in progress', async () => {
    renderCatalogue()
    const card = await screen.findByTestId('test-card-reading-academic-01')

    expect(card).toHaveTextContent('In progress')
    const resume = screen.getByRole('link', { name: /Resume/ })
    expect(resume).toHaveAttribute('href', '/exam/att-open')
    expect(card).not.toHaveTextContent('Start test')
  })

  it('offers Retake plus the best band for a test already scored', async () => {
    renderCatalogue()
    const card = await screen.findByTestId('test-card-listening-01')

    expect(card).toHaveTextContent('Best 6.5')
    expect(card).toHaveTextContent('Retake')
    expect(screen.getByRole('link', { name: /See your last result/ })).toHaveAttribute(
      'href',
      '/results/att-done',
    )
  })

  it('offers Start test for a test never attempted', async () => {
    renderCatalogue()
    const card = await screen.findByTestId('test-card-reading-academic-02')

    expect(card).toHaveTextContent('Start test')
    expect(card).not.toHaveTextContent('In progress')
    expect(card).not.toHaveTextContent('Best ')
  })

  it('starts an attempt and routes to the exam runner', async () => {
    const user = userEvent.setup()
    apiPost.mockResolvedValue({
      attempt: { id: 'att-new' },
      test: { skill: 'reading' },
      answers: [],
    })
    renderCatalogue()
    const card = await screen.findByTestId('test-card-reading-academic-02')

    await user.click(await within(card).findByRole('button', { name: /Start test/ }))

    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/attempts', { test_id: 'test-3' }))
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/exam/att-new'))
  })
})
