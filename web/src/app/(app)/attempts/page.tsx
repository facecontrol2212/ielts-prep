'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import { AttemptHistory } from '@/components/results/attempt-history'
import { Skeleton } from '@/components/ui'
import type { Skill } from '@/types/api'

const SKILLS: Skill[] = ['listening', 'reading', 'writing', 'speaking']

function HistoryFromUrl() {
  const params = useSearchParams()
  const skill = params.get('skill')
  return <AttemptHistory initialSkill={SKILLS.includes(skill as Skill) ? (skill as Skill) : 'all'} />
}

export default function AttemptsPage() {
  return (
    <Suspense
      fallback={
        <div className="grid gap-2" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      }
    >
      <HistoryFromUrl />
    </Suspense>
  )
}
