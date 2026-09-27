'use client'

import { BookOpen, Headphones, Mic, PenLine } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useCopy } from '@/components/marketing/locale'
import { Badge } from '@/components/ui'

const ICONS: Record<string, LucideIcon> = {
  listening: Headphones,
  reading: BookOpen,
  writing: PenLine,
  speaking: Mic,
}

const TONES: Record<string, 'primary' | 'accent' | 'neutral'> = {
  listening: 'primary',
  reading: 'primary',
  writing: 'accent',
  speaking: 'neutral',
}

export function SkillCards() {
  const copy = useCopy()

  return (
    <section id="skills" className="scroll-mt-20 border-b border-border bg-bg">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="text-balance font-serif text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            {copy.skills.title}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted">{copy.skills.subtitle}</p>
        </div>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {copy.skills.items.map((item) => {
            const Icon = ICONS[item.key] ?? BookOpen
            return (
              <li
                key={item.key}
                className="flex flex-col rounded-2xl border border-border bg-surface p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <Badge tone={TONES[item.key] ?? 'neutral'}>{item.badge}</Badge>
                </div>
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-fg">{item.name}</h3>
                <p className="mt-1 font-mono text-xs leading-relaxed text-muted">{item.spec}</p>
                <p className="mt-3 text-sm leading-relaxed text-fg/80">{item.body}</p>
              </li>
            )
          })}
        </ul>

        <p className="mt-5 text-sm text-muted">{copy.skills.speakingNote}</p>
      </div>
    </section>
  )
}
