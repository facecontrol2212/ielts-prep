'use client'

import { ChevronDown, LogOut, Menu, User as UserIcon, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type JSX, useEffect, useRef, useState } from 'react'

import { useCopy } from '@/components/marketing/locale'
import { Button } from '@/components/ui'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

import { BrandLink } from './brand'
import { LangToggle } from './lang-toggle'
import { ThemeToggle } from './theme-toggle'

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').concat(parts[1]?.[0] ?? '').toUpperCase()
}

/** The signed-in top nav. Rendered by the app shell on every page behind the login wall. */
export function AppNav(): JSX.Element {
  const copy = useCopy()
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMenuOpen(false)
    setProfileOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!profileOpen) return
    const onPointer = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [profileOpen])

  const links = [
    { href: '/dashboard', label: copy.nav.dashboard },
    { href: '/tests', label: copy.nav.tests },
    { href: '/speaking', label: copy.nav.speaking },
    { href: '/results', label: copy.nav.results },
  ]

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`)

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <BrandLink href={user ? '/dashboard' : '/'} />

        {user && (
          <nav aria-label={copy.nav.menu} className="ml-6 hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive(link.href)
                    ? 'bg-primary-soft text-primary'
                    : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />

          {user ? (
            <div ref={profileRef} className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setProfileOpen((v) => !v)}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                aria-controls="profile-menu"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface pl-1.5 pr-2 text-sm font-medium text-fg hover:bg-surface-2"
              >
                <span
                  aria-hidden
                  className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[0.65rem] font-bold text-primary-fg"
                >
                  {initials(user.full_name, user.email)}
                </span>
                <span className="max-w-[9rem] truncate">{user.full_name || user.email}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
              </button>

              <div
                id="profile-menu"
                role="menu"
                hidden={!profileOpen}
                className="absolute right-0 top-11 w-64 rounded-xl border border-border bg-surface p-2 shadow-pop"
              >
                <p className="truncate px-2 pb-2 pt-1 text-xs text-muted">{user.email}</p>
                <Link
                  href="/profile"
                  role="menuitem"
                  className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-fg hover:bg-surface-2"
                >
                  <UserIcon className="h-4 w-4 text-muted" aria-hidden />
                  {copy.nav.profile}
                </Link>
                <div className="my-1 flex items-center justify-between gap-2 border-t border-border px-2 pt-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">
                    {copy.nav.language}
                  </span>
                  <LangToggle />
                </div>
                <div className="mb-1 flex items-center justify-between gap-2 px-2 pb-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">
                    {copy.nav.theme}
                  </span>
                  <ThemeToggle />
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={logout}
                  className="flex w-full items-center gap-2 rounded-lg border-t border-border px-2 py-2 text-sm text-danger hover:bg-danger/10"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  {copy.nav.logout}
                </button>
              </div>
            </div>
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
            aria-expanded={menuOpen}
            aria-controls="app-menu"
            aria-label={menuOpen ? copy.nav.closeMenu : copy.nav.openMenu}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? (
              <X className="h-4 w-4" aria-hidden />
            ) : (
              <Menu className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      </div>

      <div id="app-menu" hidden={!menuOpen} className="border-t border-border bg-surface md:hidden">
        <nav aria-label={copy.nav.menu} className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
          {user ? (
            <>
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive(link.href) ? 'page' : undefined}
                  className={cn(
                    'rounded-lg px-3 py-2.5 text-sm font-medium',
                    isActive(link.href) ? 'bg-primary-soft text-primary' : 'text-fg hover:bg-surface-2',
                  )}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/profile"
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-fg hover:bg-surface-2"
              >
                {copy.nav.profile}
              </Link>
              <div className="mt-2 flex items-center justify-between border-t border-border px-3 pt-3">
                <span className="truncate text-xs text-muted">{user.email}</span>
                <div className="flex items-center gap-2">
                  <LangToggle />
                  <ThemeToggle className="sm:hidden" />
                </div>
              </div>
              <Button variant="outline" className="mt-2 w-full" onClick={logout}>
                <LogOut className="h-4 w-4" aria-hidden />
                {copy.nav.logout}
              </Button>
            </>
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
        </nav>
      </div>
    </header>
  )
}
