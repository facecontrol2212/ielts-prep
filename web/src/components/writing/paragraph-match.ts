/**
 * `WritingFeedback.improved_paragraph` is a rewrite with no pointer back to which paragraph it
 * replaced (see the report: the schema should carry an offset). To show a real before/after we
 * have to find the original ourselves — by word overlap, which is reliable because a rewrite
 * keeps the content words and changes the structure around them.
 *
 * When nothing matches well enough we return null and the UI shows the rewrite alone rather
 * than pairing it with the wrong paragraph.
 */

const MIN_SIMILARITY = 0.2

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}']+/u)
      .filter((w) => w.length > 3),
  )
}

export function splitParagraphs(text: string): string[] {
  const byBlankLine = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (byBlankLine.length > 1) return byBlankLine
  return text
    .split(/\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function findOriginalParagraph(text: string, improved: string | null): string | null {
  if (!improved || !text.trim()) return null
  const target = words(improved)
  if (target.size === 0) return null

  let best: { paragraph: string; score: number } | null = null
  for (const paragraph of splitParagraphs(text)) {
    const candidate = words(paragraph)
    if (candidate.size === 0) continue
    let shared = 0
    for (const w of candidate) if (target.has(w)) shared += 1
    const score = shared / Math.min(candidate.size, target.size)
    if (!best || score > best.score) best = { paragraph, score }
  }

  return best && best.score >= MIN_SIMILARITY ? best.paragraph : null
}
