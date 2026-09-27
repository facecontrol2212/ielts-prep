import type { Metadata } from 'next'

import { LoginForm } from '@/components/marketing'

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in to your IELTS Prep account to continue your mock tests and see your band history.',
  robots: { index: true, follow: true },
}

export default function Page() {
  return <LoginForm />
}
