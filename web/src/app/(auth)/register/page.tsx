import type { Metadata } from 'next'

import { RegisterForm } from '@/components/marketing'

export const metadata: Metadata = {
  title: 'Create a free account',
  description: 'Create a free IELTS Prep account and start a full-length timed mock test in minutes.',
  robots: { index: true, follow: true },
}

export default function Page() {
  return <RegisterForm />
}
