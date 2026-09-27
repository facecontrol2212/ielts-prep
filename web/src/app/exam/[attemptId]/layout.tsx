import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Test in progress',
  // Nothing about a live sitting belongs in a search index or a link preview.
  robots: { index: false, follow: false },
}

/**
 * The exam route has no site chrome: no nav, no footer, no notifications. The only way
 * out is the Submit button or the clock.
 */
export default function ExamLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-dvh overflow-hidden bg-bg">{children}</div>
}
