import { Skeleton } from '@/components/ui'

export default function WritingExamLoading() {
  return (
    <div className="flex h-dvh flex-col bg-bg">
      <div className="flex h-14 shrink-0 items-center gap-3 bg-exam-bar px-4">
        <Skeleton className="h-4 w-40 bg-white/10" />
        <Skeleton className="ml-auto h-8 w-24 bg-white/10" />
      </div>
      <div className="flex gap-2 border-b border-border bg-surface px-2 py-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid min-h-0 flex-1 gap-px bg-border lg:grid-cols-2">
        <div className="space-y-3 bg-exam-paper p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-40 w-full" />
        </div>
        <div className="space-y-3 bg-exam-paper p-4">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
      <p className="sr-only" role="status">
        Opening your writing test
      </p>
    </div>
  )
}
