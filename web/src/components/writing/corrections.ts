import type { Correction } from '@/types/api'

/**
 * Turns the model's `{offset, length}` corrections into a render plan over the student's own text.
 *
 * The model is not a trusted source of offsets. A hallucinated range, a stale offset after the
 * text was re-saved, or two overlapping suggestions must never scramble the essay on screen —
 * the essay is the student's work and it is the one thing that has to survive intact. So every
 * correction is validated against the text before it is allowed to render, and anything that
 * does not fit is dropped and counted rather than forced in.
 */

export type DropReason =
  /** offset/length is not a non-negative integer */
  | 'invalid'
  /** length 0 — there is nothing to mark */
  | 'empty'
  /** the range runs past the end of the text */
  | 'out_of_range'
  /** `original` is not what the text actually says at that offset */
  | 'text_mismatch'
  /** a longer, earlier correction already claimed these characters */
  | 'overlap'

export interface TextSegment {
  kind: 'text'
  key: string
  text: string
}

export interface MarkSegment {
  kind: 'mark'
  key: string
  text: string
  correction: Correction
  /** 1-based position among the applied corrections, for the numbered list beside the essay. */
  index: number
}

export type Segment = TextSegment | MarkSegment

export interface DroppedCorrection {
  correction: Correction
  reason: DropReason
}

export interface CorrectionLayout {
  segments: Segment[]
  applied: MarkSegment[]
  dropped: DroppedCorrection[]
}

/** Typographic quotes get normalised in editors; that alone should not void a correction. */
function normalize(value: string): string {
  return value.replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"')
}

export function layoutCorrections(
  text: string,
  corrections: readonly Correction[] | null | undefined,
): CorrectionLayout {
  const dropped: DroppedCorrection[] = []
  const candidates: Correction[] = []

  for (const correction of corrections ?? []) {
    const { offset, length } = correction
    if (
      !Number.isInteger(offset) ||
      !Number.isInteger(length) ||
      offset < 0 ||
      length < 0 ||
      offset > text.length
    ) {
      dropped.push({ correction, reason: offset > text.length ? 'out_of_range' : 'invalid' })
      continue
    }
    if (length === 0) {
      dropped.push({ correction, reason: 'empty' })
      continue
    }
    if (offset + length > text.length) {
      dropped.push({ correction, reason: 'out_of_range' })
      continue
    }
    if (normalize(text.slice(offset, offset + length)) !== normalize(correction.original ?? '')) {
      dropped.push({ correction, reason: 'text_mismatch' })
      continue
    }
    candidates.push(correction)
  }

  // Earliest first; on a tie the longer span wins, so a whole-clause rewrite is not shredded
  // by a single-word note nested inside it.
  candidates.sort((a, b) => a.offset - b.offset || b.length - a.length)

  const applied: MarkSegment[] = []
  const segments: Segment[] = []
  let cursor = 0

  for (const correction of candidates) {
    if (correction.offset < cursor) {
      dropped.push({ correction, reason: 'overlap' })
      continue
    }
    if (correction.offset > cursor) {
      segments.push({
        kind: 'text',
        key: `t${cursor}`,
        text: text.slice(cursor, correction.offset),
      })
    }
    const end = correction.offset + correction.length
    const mark: MarkSegment = {
      kind: 'mark',
      key: `m${correction.offset}-${correction.length}`,
      text: text.slice(correction.offset, end),
      correction,
      index: applied.length + 1,
    }
    applied.push(mark)
    segments.push(mark)
    cursor = end
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', key: `t${cursor}`, text: text.slice(cursor) })
  }
  if (segments.length === 0) {
    segments.push({ kind: 'text', key: 't0', text })
  }

  return { segments, applied, dropped }
}

export type Issue = Correction['issue']

export const ISSUE_ORDER: Issue[] = [
  'grammar',
  'vocabulary',
  'cohesion',
  'spelling',
  'punctuation',
  'register',
]

interface IssueStyle {
  label: string
  /** Mark styling. Colour alone never carries the meaning — the underline style differs too. */
  mark: string
  chip: string
  dot: string
}

export const ISSUE_STYLES: Record<Issue, IssueStyle> = {
  grammar: {
    label: 'Grammar',
    mark: 'bg-danger/10 decoration-danger decoration-solid',
    chip: 'bg-danger/10 text-danger',
    dot: 'bg-danger',
  },
  spelling: {
    label: 'Spelling',
    mark: 'bg-warning/10 decoration-warning decoration-wavy',
    chip: 'bg-warning/10 text-warning',
    dot: 'bg-warning',
  },
  vocabulary: {
    label: 'Vocabulary',
    mark: 'bg-primary/10 decoration-primary decoration-solid',
    chip: 'bg-primary-soft text-primary',
    dot: 'bg-primary',
  },
  cohesion: {
    label: 'Cohesion',
    mark: 'bg-accent/10 decoration-accent decoration-dashed',
    chip: 'bg-accent/10 text-accent',
    dot: 'bg-accent',
  },
  punctuation: {
    label: 'Punctuation',
    mark: 'bg-surface-2 decoration-muted decoration-dotted',
    chip: 'bg-surface-2 text-muted',
    dot: 'bg-muted',
  },
  register: {
    label: 'Register',
    mark: 'bg-success/10 decoration-success decoration-double',
    chip: 'bg-success/10 text-success',
    dot: 'bg-success',
  },
}

export function issueStyle(issue: Issue): IssueStyle {
  return ISSUE_STYLES[issue] ?? ISSUE_STYLES.grammar
}

export function countByIssue(marks: readonly MarkSegment[]): { issue: Issue; count: number }[] {
  const counts = new Map<Issue, number>()
  for (const mark of marks) {
    counts.set(mark.correction.issue, (counts.get(mark.correction.issue) ?? 0) + 1)
  }
  return ISSUE_ORDER.filter((issue) => counts.has(issue)).map((issue) => ({
    issue,
    count: counts.get(issue) ?? 0,
  }))
}
