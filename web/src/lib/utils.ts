import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 3725 -> "1:02:05", 125 -> "2:05". The exam clock never shows a leading zero hour. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** IELTS word count: hyphenated compounds and numbers with separators count as one word. */
export function countWords(text: string): number {
  const cleaned = text
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}'\-/,.]+/gu, ' ')
    .trim()
  if (!cleaned) return 0
  return cleaned.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length
}

export function bandColor(band: number): string {
  if (band >= 7.5) return 'text-success'
  if (band >= 6) return 'text-primary'
  if (band >= 5) return 'text-warning'
  return 'text-danger'
}

export function skillLabel(skill: string): string {
  return skill.charAt(0).toUpperCase() + skill.slice(1)
}

/** "sentence_completion" -> "Sentence completion" */
export function humanizeType(type: string): string {
  const s = type.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
