import type { Metadata, Viewport } from 'next'

import { Providers } from '@/app/providers'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: {
    default: 'IELTS Prep — free mock tests with instant band scores',
    template: '%s · IELTS Prep',
  },
  description:
    'Free, full-length IELTS mock tests. Timed Listening and Reading with instant band scores, ' +
    'AI feedback on Writing, and Speaking practice. Built for Uzbek learners.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
