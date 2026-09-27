'use client'

import { useCopy } from '@/components/marketing/locale'

/** The questions a student actually asks before signing up, answered plainly. */
export function StraightAnswers() {
  const copy = useCopy()

  return (
    <section className="border-b border-border bg-bg">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-balance font-serif text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          {copy.honest.title}
        </h2>

        <dl className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {copy.honest.items.map((item) => (
            <div key={item.q} className="border-l-2 border-border pl-4">
              <dt className="text-base font-semibold tracking-tight text-fg">{item.q}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
