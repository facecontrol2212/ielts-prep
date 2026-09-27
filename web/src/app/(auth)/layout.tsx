import Link from 'next/link'

import { BrandLink, LangToggle, ThemeToggle } from '@/components/layout'
import { dictionary } from '@/components/marketing/copy'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <BrandLink />
          <div className="ml-auto flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:py-16">
        {children}
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 text-center text-xs text-muted sm:px-6">
          <Link href="/" className="hover:text-fg">
            ← {dictionary.en.brand.name}
          </Link>
        </div>
      </footer>
    </div>
  )
}
