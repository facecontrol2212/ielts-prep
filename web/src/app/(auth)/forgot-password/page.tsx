import type { Metadata } from 'next'

import { ForgotPasswordForm } from '@/components/marketing'

export const metadata: Metadata = {
  title: 'Forgot your password',
  description: 'Send yourself a link to reset your IELTS Prep password.',
  robots: { index: false, follow: true },
}

export default function Page() {
  return <ForgotPasswordForm />
}
