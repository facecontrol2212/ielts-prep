import Link from 'next/link'

import { dictionary } from '@/components/marketing/copy'
import { cn } from '@/lib/utils'

/**
 * Three rising bars inside a rounded square: a band going up, which is the one
 * thing the whole product is for. Drawn with currentColor so it inherits the
 * theme instead of carrying its own palette.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('h-8 w-8', className)}
      role="img"
      aria-hidden
      focusable="false"
    >
      <rect x="0" y="0" width="32" height="32" rx="9" fill="currentColor" />
      <rect x="7" y="18" width="4.5" height="7" rx="1.5" fill="rgb(var(--primary-fg))" />
      <rect x="13.75" y="13" width="4.5" height="12" rx="1.5" fill="rgb(var(--primary-fg))" />
      <rect x="20.5" y="7" width="4.5" height="18" rx="1.5" fill="rgb(var(--primary-fg))" />
    </svg>
  )
}

export function BrandLink({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn('inline-flex items-center gap-2.5 rounded-lg text-fg', className)}
    >
      <BrandMark className="text-primary" />
      <span className="text-base font-semibold tracking-tight">{dictionary.en.brand.name}</span>
    </Link>
  )
}
