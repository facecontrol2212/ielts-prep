'use client'

import { PencilLine } from 'lucide-react'

import { formatClock } from '@/lib/utils'

/**
 * The transfer phase. On paper you get these minutes to copy answers onto the answer sheet;
 * on screen they are your last chance to check spelling and fill the blanks you skipped,
 * and the clock keeps running.
 */
export function TransferBanner({ seconds }: { seconds: number }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 border-b border-accent/40 bg-accent/10 px-3 py-2.5 text-sm sm:px-4"
    >
      <PencilLine className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <p className="min-w-0 flex-1 text-fg">
        <span className="font-semibold">The recording has finished.</span> You have{' '}
        <span className="font-mono font-semibold tabular-nums">{formatClock(seconds)}</span> of
        transfer time to check your answers and fill in anything you left blank. Spelling counts.
      </p>
    </div>
  )
}
