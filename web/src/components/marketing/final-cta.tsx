'use client'

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

import { useCopy } from '@/components/marketing/locale'
import { Button } from '@/components/ui'
import { useAuth } from '@/hooks/use-auth'

export function FinalCta() {
  const copy = useCopy()
  const { user } = useAuth()

  return (
    <section className="bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="rounded-2xl border border-border bg-primary px-6 py-10 sm:px-10 sm:py-12">
          <div className="max-w-2xl">
            <h2 className="text-balance font-serif text-3xl font-semibold tracking-tight text-primary-fg sm:text-4xl">
              {copy.finalCta.title}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-primary-fg/80">{copy.finalCta.body}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href={user ? '/dashboard' : '/register'}>
                <Button size="lg" variant="accent" className="w-full sm:w-auto">
                  {user ? copy.hero.ctaPrimarySignedIn : copy.finalCta.button}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </Link>
              {!user && (
                <Link href="/login">
                  <Button
                    size="lg"
                    variant="ghost"
                    className="w-full text-primary-fg hover:bg-primary-fg/10 sm:w-auto"
                  >
                    {copy.finalCta.secondary}
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
