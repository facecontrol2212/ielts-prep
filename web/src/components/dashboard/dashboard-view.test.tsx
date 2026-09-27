import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { DashboardStats, User } from '@/types/api'

// recharts' ResponsiveContainer needs ResizeObserver, which jsdom does not implement.
// Declared here rather than in the shared vitest.setup.ts, which another agent owns.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

// imported after vi.mock so the module mocks above are registered first
import { DashboardView } from '@/components/dashboard/dashboard-view'

const EMPTY_STATS: DashboardStats = {
  attempts_total: 0,
  tests_completed: 0,
  current_streak_days: 0,
  best_band: {},
  latest_band: {},
  band_history: [],
  weakest_types: [],
}

const USER: User = {
  id: 'u1',
  email: 'aziza@example.com',
  full_name: 'Aziza Karimova',
  locale: 'uz',
  target_band: 7,
  exam_date: '2026-10-31',
  is_verified: true,
  is_admin: false,
}

const POPULATED_STATS: DashboardStats = {
  attempts_total: 7,
  tests_completed: 6,
  current_streak_days: 4,
  best_band: { listening: 7, reading: 6.5 },
  latest_band: { listening: 6.5, reading: 6.5 },
  band_history: [
    { date: '2026-08-02', skill: 'reading', band: 5.5 },
    { date: '2026-08-16', skill: 'listening', band: 6 },
    { date: '2026-09-06', skill: 'reading', band: 6 },
    { date: '2026-09-20', skill: 'listening', band: 6.5 },
    { date: '2026-09-24', skill: 'reading', band: 6.5 },
  ],
  weakest_types: [
    { type: 'matching_headings', correct: 4, total: 16 },
    { type: 'true_false_not_given', correct: 11, total: 18 },
    { type: 'sentence_completion', correct: 15, total: 20 },
  ],
}

describe('DashboardView — brand-new account', () => {
  it('shows the empty state and tells the student exactly what to do next', () => {
    render(<DashboardView stats={EMPTY_STATS} user={null} />)

    expect(screen.getByTestId('dashboard-empty')).toBeInTheDocument()
    expect(
      screen.getByText('Take your first Reading test — 60 minutes'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Take a Listening test — 30 minutes/)).toBeInTheDocument()
  })

  it('does not render a chart when there is no history', () => {
    render(<DashboardView stats={EMPTY_STATS} user={null} />)
    expect(screen.queryByTestId('band-history-chart')).not.toBeInTheDocument()
  })

  it('does not render a chart from a single scored sitting either', () => {
    render(
      <DashboardView
        stats={{
          ...EMPTY_STATS,
          attempts_total: 1,
          tests_completed: 1,
          latest_band: { reading: 6 },
          best_band: { reading: 6 },
          band_history: [{ date: '2026-09-24', skill: 'reading', band: 6 }],
        }}
        user={USER}
      />,
    )
    expect(screen.queryByTestId('band-history-chart')).not.toBeInTheDocument()
    expect(screen.getByText(/One more result and your trend appears/)).toBeInTheDocument()
  })
})

describe('DashboardView — a student with history', () => {
  it('renders the populated dashboard, not the empty state', () => {
    render(<DashboardView stats={POPULATED_STATS} user={USER} />)
    expect(screen.getByTestId('dashboard-view')).toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-empty')).not.toBeInTheDocument()
  })

  it('renders the band history chart once there are two or more results', () => {
    render(<DashboardView stats={POPULATED_STATS} user={USER} />)
    expect(screen.getByTestId('band-history-chart')).toBeInTheDocument()
  })

  it('leads with the estimated overall band, formatted to one decimal', () => {
    render(<DashboardView stats={POPULATED_STATS} user={USER} />)
    // latest listening 6.5 + reading 6.5 -> 6.5
    expect(screen.getByText('Estimated overall band')).toBeInTheDocument()
    expect(screen.getAllByText('6.5').length).toBeGreaterThan(0)
  })

  it('makes the gap to the target unmissable', () => {
    render(<DashboardView stats={POPULATED_STATS} user={USER} />)
    expect(screen.getByText('0.5 to go before you are ready')).toBeInTheDocument()
    expect(screen.getAllByText(/0\.5 below target/).length).toBe(2)
  })

  it('shows tests completed, the streak and the days until the exam', () => {
    vi.setSystemTime(new Date('2026-09-27T09:00:00Z'))
    render(<DashboardView stats={POPULATED_STATS} user={USER} />)

    expect(screen.getByText('Tests completed')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText('Current streak')).toBeInTheDocument()
    expect(screen.getByText('4 days')).toBeInTheDocument()
    expect(screen.getByText('Until your exam')).toBeInTheDocument()
    expect(screen.getByText('34 days')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('ranks the weakest question types with their accuracy and a practice link', () => {
    render(<DashboardView stats={POPULATED_STATS} user={USER} />)

    const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
    const headings = items.find((t) => t.includes('Matching headings'))
    expect(headings).toContain('25%')
    expect(headings).toContain('4 of 16')

    const link = screen.getByRole('link', { name: /Practise matching headings/i })
    expect(link).toHaveAttribute('href', '/tests?skill=reading')
  })

  it('hides the exam countdown when no exam date is set', () => {
    render(<DashboardView stats={POPULATED_STATS} user={{ ...USER, exam_date: null }} />)
    expect(screen.getByText('Exam date')).toBeInTheDocument()
    expect(screen.getByText('Not set')).toBeInTheDocument()
  })
})
