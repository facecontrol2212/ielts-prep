import type { Metadata } from 'next'

import { ResetPasswordForm } from '@/components/marketing'

export const metadata: Metadata = {
  title: 'Choose a new password',
  description: 'Set a new password for your IELTS Prep account.',
  robots: { index: false, follow: true },
}

export default function Page() {
  return <ResetPasswordForm />
}
