import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ForgotPasswordForm } from '@/components/marketing/forgot-password-form'
import { LoginForm, safeNext } from '@/components/marketing/login-form'
import { RegisterForm } from '@/components/marketing/register-form'
import { ResetPasswordForm } from '@/components/marketing/reset-password-form'
import { resetAuthForTests } from '@/hooks/use-auth'

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => '/login',
}))

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    api: { ...actual.api, post: vi.fn(), get: vi.fn() },
    tokenStore: { access: null, refresh: null, set: vi.fn(), clear: vi.fn() },
  }
})

const { ApiError, api } = await import('@/lib/api')
const post = vi.mocked(api.post)
const get = vi.mocked(api.get)

const TOKENS = {
  access_token: 'a',
  refresh_token: 'r',
  token_type: 'bearer',
  expires_in: 900,
}

const ME = {
  id: 'u1',
  email: 'nodira@example.com',
  full_name: 'Nodira Yusupova',
  locale: 'uz',
  target_band: 7,
  exam_date: null,
  is_verified: false,
  is_admin: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  resetAuthForTests()
  window.history.replaceState(null, '', '/login')
})

describe('safeNext', () => {
  it.each([
    ['/dashboard/tests', '/dashboard/tests'],
    [null, '/dashboard'],
    ['https://evil.example/steal', '/dashboard'],
    ['//evil.example/steal', '/dashboard'],
  ])('turns %s into %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected)
  })
})

describe('<LoginForm />', () => {
  it('rejects an email that is not an email, without calling the API', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)
    await user.type(screen.getByLabelText('Email'), 'nodira@')
    await user.type(screen.getByLabelText('Password'), 'sunflower77')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That does not look like an email address.',
    )
    expect(post).not.toHaveBeenCalled()
  })

  it('asks for the password when it is missing', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)
    await user.type(screen.getByLabelText('Email'), 'nodira@example.com')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your password.')
    expect(post).not.toHaveBeenCalled()
  })

  it('turns a 401 into something a student can act on', async () => {
    const user = userEvent.setup()
    post.mockRejectedValue(new ApiError(401, 'Incorrect email or password'))
    render(<LoginForm />)
    await user.type(screen.getByLabelText('Email'), 'nodira@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Incorrect email or password. Check both and try again.',
    )
  })

  it("shows the server's own message when it has one we do not translate", async () => {
    const user = userEvent.setup()
    post.mockRejectedValue(new ApiError(403, 'This account has been suspended'))
    render(<LoginForm />)
    await user.type(screen.getByLabelText('Email'), 'nodira@example.com')
    await user.type(screen.getByLabelText('Password'), 'sunflower77')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This account has been suspended')
  })

  it('posts to /auth/login and sends the student to the dashboard', async () => {
    const user = userEvent.setup()
    post.mockResolvedValue(TOKENS)
    get.mockResolvedValue(ME)
    render(<LoginForm />)
    await user.type(screen.getByLabelText('Email'), 'nodira@example.com')
    await user.type(screen.getByLabelText('Password'), 'sunflower77')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/auth/login',
        { email: 'nodira@example.com', password: 'sunflower77' },
        { anonymous: true },
      ),
    )
    await waitFor(() => expect(get).toHaveBeenCalledWith('/users/me'))
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/dashboard'))
  })

  it('returns the student to the page they were sent away from', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/login?next=%2Fresults%2F42')
    post.mockResolvedValue(TOKENS)
    get.mockResolvedValue(ME)
    render(<LoginForm />)
    await user.type(screen.getByLabelText('Email'), 'nodira@example.com')
    await user.type(screen.getByLabelText('Password'), 'sunflower77')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/results/42'))
  })

  it('shows a loading state while the request is in flight', async () => {
    const user = userEvent.setup()
    let release: (value: typeof TOKENS) => void = () => {}
    post.mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    get.mockResolvedValue(ME)
    render(<LoginForm />)
    await user.type(screen.getByLabelText('Email'), 'nodira@example.com')
    await user.type(screen.getByLabelText('Password'), 'sunflower77')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    const submit = await screen.findByRole('button', { name: 'Logging in…' })
    expect(submit).toBeDisabled()
    release(TOKENS)
    await waitFor(() => expect(nav.replace).toHaveBeenCalled())
  })
})

describe('<RegisterForm />', () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, password: string, confirm: string) {
    await user.type(screen.getByLabelText('Email'), 'nodira@example.com')
    await user.type(screen.getByLabelText('Password'), password)
    await user.type(screen.getByLabelText('Confirm password'), confirm)
  }

  it('refuses a password under eight characters', async () => {
    const user = userEvent.setup()
    render(<RegisterForm />)
    await fill(user, 'short1', 'short1')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Passwords need at least 8 characters.',
    )
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses two passwords that do not match', async () => {
    const user = userEvent.setup()
    render(<RegisterForm />)
    await fill(user, 'sunflower77', 'sunflower78')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The two passwords do not match.')
    expect(post).not.toHaveBeenCalled()
  })

  it('explains a 409 instead of repeating "Conflict"', async () => {
    const user = userEvent.setup()
    post.mockRejectedValue(new ApiError(409, 'Email already registered'))
    render(<RegisterForm />)
    await fill(user, 'sunflower77', 'sunflower77')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That email already has an account. Log in instead, or reset the password.',
    )
  })

  it('posts to /auth/register with the optional name', async () => {
    const user = userEvent.setup()
    post.mockResolvedValue(TOKENS)
    get.mockResolvedValue(ME)
    render(<RegisterForm />)
    await user.type(screen.getByLabelText(/Full name/), 'Nodira Yusupova')
    await fill(user, 'sunflower77', 'sunflower77')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/auth/register',
        {
          email: 'nodira@example.com',
          password: 'sunflower77',
          full_name: 'Nodira Yusupova',
        },
        { anonymous: true },
      ),
    )
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/dashboard'))
  })

  it('rates the password as the student types', async () => {
    const user = userEvent.setup()
    render(<RegisterForm />)
    const password = screen.getByLabelText('Password')
    await user.type(password, 'abc')
    expect(screen.getByText(/Password strength: Too short/)).toBeInTheDocument()
    await user.clear(password)
    await user.type(password, 'Qumtepa-2026!')
    expect(screen.getByText(/Password strength: Strong/)).toBeInTheDocument()
  })
})

describe('<ForgotPasswordForm />', () => {
  it('repeats the API message without revealing whether the email exists', async () => {
    const user = userEvent.setup()
    post.mockResolvedValue({ detail: 'If that email is registered, a reset link is on its way.' })
    render(<ForgotPasswordForm />)
    await user.type(screen.getByLabelText('Email'), 'nodira@example.com')
    await user.click(screen.getByRole('button', { name: 'Send the reset link' }))

    expect(
      await screen.findByText('If that email is registered, a reset link is on its way.'),
    ).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith(
      '/auth/forgot-password',
      { email: 'nodira@example.com' },
      { anonymous: true },
    )
  })
})

describe('<ResetPasswordForm />', () => {
  it('will not ask for a new password when the link has no code', async () => {
    window.history.replaceState(null, '', '/reset-password')
    render(<ResetPasswordForm />)
    expect(await screen.findByRole('alert')).toHaveTextContent('This link has no reset code')
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })

  it('sends the token from the link with the new password', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/reset-password?token=abc123')
    post.mockResolvedValue({ detail: 'Password updated' })
    render(<ResetPasswordForm />)
    await user.type(await screen.findByLabelText('New password'), 'sunflower77')
    await user.type(screen.getByLabelText('Confirm password'), 'sunflower77')
    await user.click(screen.getByRole('button', { name: 'Save the new password' }))

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/auth/reset-password',
        { token: 'abc123', password: 'sunflower77' },
        { anonymous: true },
      ),
    )
    expect(await screen.findByText('You can log in with your new password now.')).toBeInTheDocument()
  })
})
