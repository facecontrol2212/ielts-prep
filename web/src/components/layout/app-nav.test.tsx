import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppNav } from '@/components/layout/app-nav'
import { resetThemeForTests } from '@/components/layout/theme'
import { resetLangForTests } from '@/components/marketing/locale'
import { resetAuthForTests } from '@/hooks/use-auth'

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }))
const store = vi.hoisted(() => ({ access: null as string | null, refresh: null as string | null }))

vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => '/dashboard',
}))

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: { ...actual.api, get: vi.fn(), post: vi.fn() },
    tokenStore: {
      get access() {
        return store.access
      },
      get refresh() {
        return store.refresh
      },
      set: vi.fn(),
      clear: vi.fn(() => {
        store.access = null
      }),
    },
  }
})

const { api, tokenStore } = await import('@/lib/api')
const get = vi.mocked(api.get)

const ME = {
  id: 'u1',
  email: 'nodira@example.com',
  full_name: 'Nodira Yusupova',
  locale: 'uz' as const,
  target_band: 7,
  exam_date: null,
  is_verified: true,
  is_admin: false,
}

function signIn() {
  store.access = 'access-token'
  get.mockResolvedValue(ME)
}

beforeEach(() => {
  vi.clearAllMocks()
  store.access = null
  store.refresh = null
  resetAuthForTests()
  resetLangForTests()
  resetThemeForTests()
})

describe('<AppNav /> signed out', () => {
  it('offers the way in instead of the app links', async () => {
    render(<AppNav />)
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Log in' })).not.toHaveLength(0))
    expect(screen.queryByRole('link', { name: 'Results' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Start free' })).not.toHaveLength(0)
    expect(get).not.toHaveBeenCalled()
  })
})

describe('<AppNav /> signed in', () => {
  it('shows the four sections and the student behind the profile menu', async () => {
    signIn()
    render(<AppNav />)

    expect(await screen.findByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    )
    for (const label of ['Tests', 'Speaking', 'Results']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: /Nodira Yusupova/ })).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/users/me')
  })

  it('marks the page you are on', async () => {
    signIn()
    render(<AppNav />)
    expect(await screen.findByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Tests' })).not.toHaveAttribute('aria-current')
  })

  it('opens and closes the profile menu', async () => {
    const user = userEvent.setup()
    signIn()
    render(<AppNav />)

    const trigger = await screen.findByRole('button', { name: /Nodira Yusupova/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(within(screen.getByRole('menu')).getByText('nodira@example.com')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('logs out, clears the tokens and goes back to the public site', async () => {
    const user = userEvent.setup()
    signIn()
    render(<AppNav />)

    await user.click(await screen.findByRole('button', { name: /Nodira Yusupova/ }))
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Log out' }))

    expect(tokenStore.clear).toHaveBeenCalled()
    expect(nav.replace).toHaveBeenCalledWith('/')
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Nodira Yusupova/ })).not.toBeInTheDocument(),
    )
  })

  it('opens and closes the mobile menu', async () => {
    const user = userEvent.setup()
    signIn()
    render(<AppNav />)
    await screen.findByRole('button', { name: /Nodira Yusupova/ })

    const panel = document.getElementById('app-menu')
    expect(panel).not.toBeVisible()

    const hamburger = screen.getByRole('button', { name: 'Open menu' })
    expect(hamburger).toHaveAttribute('aria-expanded', 'false')
    await user.click(hamburger)

    expect(panel).toBeVisible()
    expect(within(panel as HTMLElement).getByRole('link', { name: 'Profile' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(panel).not.toBeVisible()
  })
})
