'use client'

import { Moon, Sun } from 'lucide-react'

import { useCopy } from '@/components/marketing/locale'
import { cn } from '@/lib/utils'

import { useTheme } from './theme'

export function ThemeToggle({ className }: { className?: string }) {
  const copy = useCopy()
  const { resolved, toggle } = useTheme()
  const target = resolved === 'dark' ? copy.nav.themeLight : copy.nav.themeDark

  return (
    <button
      type="button"
      onClick={toggle}
      title={`${copy.nav.theme}: ${target}`}
      aria-label={`${copy.nav.theme}: ${target}`}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border',
        'bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-fg',
        className,
      )}
    >
      {resolved === 'dark' ? (
        <Sun className="h-4 w-4" aria-hidden />
      ) : (
        <Moon className="h-4 w-4" aria-hidden />
      )}
    </button>
  )
}
