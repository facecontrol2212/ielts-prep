'use client'

import Link from 'next/link'
import type { JSX } from 'react'

import { useCopy } from '@/components/marketing/locale'

import { BrandMark } from './brand'
import { LangToggle } from './lang-toggle'

export function SiteFooter(): JSX.Element {
  const copy = useCopy()
  const year = new Date().getFullYear()

  const columns = [
    {
      title: copy.footer.product,
      links: [
        { href: '/#skills', label: copy.footer.skills },
        { href: '/#scoring', label: copy.footer.scoring },
      ],
    },
    {
      title: copy.footer.tools,
      links: [{ href: '/calculator', label: copy.footer.calculator }],
    },
    {
      title: copy.footer.account,
      links: [
        { href: '/login', label: copy.footer.login },
        { href: '/register', label: copy.footer.register },
        { href: '/forgot-password', label: copy.footer.forgot },
      ],
    },
  ]

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <BrandMark className="h-7 w-7 text-primary" />
              <span className="text-base font-semibold tracking-tight">{copy.brand.name}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">{copy.footer.blurb}</p>
            <div className="mt-5">
              <LangToggle />
            </div>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                {column.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded text-sm text-fg/80 transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {copy.brand.name}. {copy.footer.madeFor}
          </p>
          <p>{copy.footer.rights}</p>
        </div>
      </div>
    </footer>
  )
}
