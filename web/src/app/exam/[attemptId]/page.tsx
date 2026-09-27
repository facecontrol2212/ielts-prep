import { ExamRunner } from '@/app/exam/[attemptId]/exam-runner'

export const dynamic = 'force-dynamic'

export default async function ExamPage({
  params,
}: {
  params: Promise<{ attemptId: string }>
}) {
  const { attemptId } = await params
  return <ExamRunner attemptId={attemptId} />
}
