import { Skeleton } from '@/components/ui'

export default function ExamLoading() {
  return (
    <div className="flex h-dvh flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 bg-exam-bar px-4">
        <Skeleton className="h-4 w-40 bg-white/10" />
        <Skeleton className="ml-auto h-8 w-24 bg-white/10" />
      </div>
      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Skeleton className="h-5 w-1/3" />
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
        <div className="hidden space-y-4 lg:block">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
      <p role="status" className="sr-only">
        Loading your test
      </p>
    </div>
  )
}
