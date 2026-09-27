import type { Metadata } from 'next'

import { VerifyEmailView } from '@/components/marketing'

export const metadata: Metadata = {
  title: 'Verify your email',
  description: 'Confirm your email address for your IELTS Prep account.',
  robots: { index: false, follow: true },
}

export default function Page() {
  return <VerifyEmailView />
}
