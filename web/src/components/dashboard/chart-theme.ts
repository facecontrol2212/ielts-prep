'use client'

import { useEffect, useState } from 'react'

import type { Skill } from '@/types/api'

/**
 * Chart colour.
 *
 * The app's semantic tokens (primary, accent, success…) are chosen for UI meaning, not for
 * separability under colour-vision deficiency, so series colour comes from the data-viz
 * reference palette instead. Everything that is *not* a data mark — axes, gridlines, labels,
 * surfaces — still reads the app's own tokens, so charts re-theme with the rest of the product.
 *
 * Validated with the data-viz `validate_palette.js` against THIS app's chart surfaces
 * (light `#ffffff`, dark `#0f172a`), four slots, adjacent pairs:
 *   light — lightness PASS · chroma PASS · CVD ΔE 9.1 PASS · normal-vision ΔE 22.9 PASS
 *           · contrast WARN (aqua 2.82:1, yellow 2.17:1, both under 3:1)
 *   dark  — all five checks PASS
 * The light-mode contrast WARN obliges relief, so every chart drawn with this palette ships
 * visible direct labels *and* a table view. Do not add a fifth slot without re-running the
 * validator: slot 5 would put yellow next to another warm hue.
 */
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'] as const
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500'] as const

/** Colour follows the entity, never its rank — Reading stays orange however many skills show. */
const SKILL_SLOT: Record<Skill, 0 | 1 | 2 | 3> = {
  listening: 0,
  reading: 1,
  writing: 2,
  speaking: 3,
}

export interface ChartTheme {
  isDark: boolean
  /** The four categorical slots, in fixed order. */
  series: readonly string[]
  /** Chart surface — marks and rings are drawn against this. */
  surface: string
  /** Hairline gridline, one step off the surface. */
  grid: string
  /** Axis rule and tick text. */
  axis: string
  /** Primary ink for values. */
  ink: string
  /** Secondary ink for labels and legends. */
  inkMuted: string
}

function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!raw) return fallback
  // Tokens are stored as bare channels ("226 232 240") so Tailwind can add an alpha.
  return /^[\d\s.]+$/.test(raw) ? `rgb(${raw})` : raw
}

function detectDark(): boolean {
  if (typeof document === 'undefined') return false
  const stamped = document.documentElement.getAttribute('data-theme')
  if (stamped === 'dark') return true
  if (stamped === 'light') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

const LIGHT_FALLBACK: ChartTheme = {
  isDark: false,
  series: SERIES_LIGHT,
  surface: 'rgb(255 255 255)',
  grid: 'rgb(226 232 240)',
  axis: 'rgb(100 116 139)',
  ink: 'rgb(15 23 42)',
  inkMuted: 'rgb(100 116 139)',
}

function resolve(isDark: boolean): ChartTheme {
  return {
    isDark,
    series: isDark ? SERIES_DARK : SERIES_LIGHT,
    surface: readToken('--surface', LIGHT_FALLBACK.surface),
    grid: readToken('--border', LIGHT_FALLBACK.grid),
    axis: readToken('--muted', LIGHT_FALLBACK.axis),
    ink: readToken('--fg', LIGHT_FALLBACK.ink),
    inkMuted: readToken('--muted', LIGHT_FALLBACK.inkMuted),
  }
}

/**
 * Resolves the chart palette for the theme the page is actually rendering in, and
 * re-resolves when the viewer flips the OS setting or the in-app theme stamp.
 */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(LIGHT_FALLBACK)

  useEffect(() => {
    const sync = () => setTheme(resolve(detectDark()))
    sync()

    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    media?.addEventListener?.('change', sync)
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      media?.removeEventListener?.('change', sync)
      observer.disconnect()
    }
  }, [])

  return theme
}

export function seriesColorFor(skill: Skill, theme: ChartTheme): string {
  return theme.series[SKILL_SLOT[skill]] ?? theme.series[0]
}

/** A static (non-hook) read, for CSS `color` values in list rows rendered outside a chart. */
export function skillSlot(skill: Skill): number {
  return SKILL_SLOT[skill]
}
