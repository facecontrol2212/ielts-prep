/**
 * Band arithmetic for the public tools.
 *
 * This mirrors api/app/services/scoring/bands.py and band_data.py so the
 * calculator answers instantly on a slow connection. The API stays
 * authoritative: the calculator cross-checks against POST /api/score/overall
 * and tells the student when the two disagree.
 */

export interface BandRow {
  /** Lowest raw score in this band, inclusive. */
  raw_min: number
  /** Highest raw score in this band, inclusive. */
  raw_max: number
  band: number
}

export const MAX_RAW_SCORE = 40

/** Every value a skill band can take: 0 to 9 in half steps. */
export const BAND_STEPS: readonly number[] = Array.from({ length: 19 }, (_, i) => i / 2)

/** plan.md §7 — indicative until verified against official Cambridge material. */
export const LISTENING_TABLE: readonly BandRow[] = [
  { raw_min: 39, raw_max: 40, band: 9 },
  { raw_min: 37, raw_max: 38, band: 8.5 },
  { raw_min: 35, raw_max: 36, band: 8 },
  { raw_min: 32, raw_max: 34, band: 7.5 },
  { raw_min: 30, raw_max: 31, band: 7 },
  { raw_min: 26, raw_max: 29, band: 6.5 },
  { raw_min: 23, raw_max: 25, band: 6 },
  { raw_min: 18, raw_max: 22, band: 5.5 },
  { raw_min: 16, raw_max: 17, band: 5 },
  { raw_min: 13, raw_max: 15, band: 4.5 },
  { raw_min: 11, raw_max: 12, band: 4 },
  { raw_min: 8, raw_max: 10, band: 3.5 },
  { raw_min: 6, raw_max: 7, band: 3 },
  { raw_min: 4, raw_max: 5, band: 2.5 },
  { raw_min: 3, raw_max: 3, band: 2 },
  { raw_min: 2, raw_max: 2, band: 1.5 },
  { raw_min: 1, raw_max: 1, band: 1 },
  { raw_min: 0, raw_max: 0, band: 0 },
]

export const ACADEMIC_READING_TABLE: readonly BandRow[] = [
  { raw_min: 39, raw_max: 40, band: 9 },
  { raw_min: 37, raw_max: 38, band: 8.5 },
  { raw_min: 35, raw_max: 36, band: 8 },
  { raw_min: 33, raw_max: 34, band: 7.5 },
  { raw_min: 30, raw_max: 32, band: 7 },
  { raw_min: 27, raw_max: 29, band: 6.5 },
  { raw_min: 23, raw_max: 26, band: 6 },
  { raw_min: 19, raw_max: 22, band: 5.5 },
  { raw_min: 15, raw_max: 18, band: 5 },
  { raw_min: 13, raw_max: 14, band: 4.5 },
  { raw_min: 10, raw_max: 12, band: 4 },
  { raw_min: 8, raw_max: 9, band: 3.5 },
  { raw_min: 6, raw_max: 7, band: 3 },
  { raw_min: 4, raw_max: 5, band: 2.5 },
  { raw_min: 3, raw_max: 3, band: 2 },
  { raw_min: 2, raw_max: 2, band: 1.5 },
  { raw_min: 1, raw_max: 1, band: 1 },
  { raw_min: 0, raw_max: 0, band: 0 },
]

/**
 * The official overall-band rule: average the four skills, then move to the
 * nearest half band with ties going up (.25 up to the next half, .75 up to the
 * next whole).
 *
 * Done in eighths of a band, because four half-band scores always average to a
 * whole number of eighths — which keeps float error out of the boundary cases.
 */
export function overallBand(
  listening: number,
  reading: number,
  writing: number,
  speaking: number,
): number {
  const total = listening + reading + writing + speaking
  const eighths = Math.round(total * 2)
  const halfBands = Math.floor((eighths + 2) / 4)
  return Math.max(0, Math.min(9, halfBands / 2))
}

export function bandAverage(
  listening: number,
  reading: number,
  writing: number,
  speaking: number,
): number {
  return (listening + reading + writing + speaking) / 4
}

/** 6.5 -> "6.5", 7 -> "7.0". Bands are always written to one decimal place. */
export function formatBand(band: number): string {
  return band.toFixed(1)
}

/** Drops trailing zeros for running text: 6.25 -> "6.25", 6 -> "6". */
export function formatAverage(value: number): string {
  return String(Number(value.toFixed(3)))
}

export function rowForRaw(rows: readonly BandRow[], raw: number): BandRow | null {
  return rows.find((row) => raw >= row.raw_min && raw <= row.raw_max) ?? null
}

export function bandFromRaw(rows: readonly BandRow[], raw: number): number {
  return rowForRaw(rows, raw)?.band ?? 0
}

/**
 * One plain sentence explaining which way the average moved and why.
 * Deliberately close to the API's own wording so the two never contradict.
 */
export function explainOverall(bands: {
  listening: number
  reading: number
  writing: number
  speaking: number
}): string {
  const { listening, reading, writing, speaking } = bands
  const average = bandAverage(listening, reading, writing, speaking)
  const overall = overallBand(listening, reading, writing, speaking)
  const parts = [listening, reading, writing, speaking].map(formatAverage).join(', ')
  const movement =
    overall > average
      ? `rounds up to ${formatBand(overall)}`
      : overall < average
        ? `rounds down to ${formatBand(overall)}`
        : `is already a valid band: ${formatBand(overall)}`
  return `The average of ${parts} is ${formatAverage(average)}, which ${movement}.`
}
