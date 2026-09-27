import type { Metadata } from 'next'

import { WritingRunner } from '@/components/writing/writing-runner'

export const metadata: Metadata = {
  title: 'Writing test',
  robots: { index: false, follow: false },
}

export default async function WritingExamPage({
  params,
}: {
  params: Promise<{ attemptId: string }>
}) {
  const { attemptId } = await params
  return <WritingRunner attemptId={attemptId} />
}
