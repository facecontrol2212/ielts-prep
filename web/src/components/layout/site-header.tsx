'use client'

import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type JSX, useEffect, useState } from 'react'

import { useCopy } from '@/components/marketing/locale'
import { Button } from '@/components/ui'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

import { BrandLink } from './brand'
import { LangToggle } from './lang-toggle'
import { ThemeToggle } from './theme-toggle'

/** The public header: landing page, calculator, auth pages. */
export function SiteHeader(): JSX.Element {
  const copy = useCopy()
  const { user } = useAuth()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const links = [
    { href: '/#skills', label: copy.nav.skills },
    { href: '/#scoring', label: copy.nav.scoring },
    { href: '/calculator', label: copy.nav.calculator },
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <BrandLink />

        <nav aria-label={copy.nav.menu} className="ml-6 hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg',
                pathname === link.href && 'text-fg',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LangToggle className="hidden sm:inline-flex" />
          <ThemeToggle />

          {user ? (
            <Link href="/dashboard" className="hidden md:inline-flex">
              <Button size="sm">{copy.nav.dashboard}</Button>
            </Link>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  {copy.nav.login}
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm">{copy.nav.register}</Button>
              </Link>
            </div>
          )}

          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:bg-surface-2 hover:text-fg md:hidden"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? copy.nav.closeMenu : copy.nav.openMenu}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>

      <div
        id="site-menu"
        hidden={!open}
        className="border-t border-border bg-surface md:hidden"
      >
        <nav aria-label={copy.nav.menu} className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-fg hover:bg-surface-2"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
            {user ? (
              <Link href="/dashboard">
                <Button className="w-full">{copy.nav.dashboard}</Button>
              </Link>
            ) : (
              <>
                <Link href="/register">
                  <Button className="w-full">{copy.nav.register}</Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline" className="w-full">
                    {copy.nav.login}
                  </Button>
                </Link>
              </>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                {copy.nav.language}
              </span>
              <LangToggle />
            </div>
          </div>
        </nav>
      </div>
    </header>
  )
}
