'use client'

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useChartTheme, seriesColorFor, type ChartTheme } from '@/components/dashboard/chart-theme'
import { formatBand, formatShortDate, SKILL_ORDER } from '@/components/dashboard/format'
import { Card } from '@/components/ui'
import { cn, skillLabel } from '@/lib/utils'
import type { DashboardStats, Skill } from '@/types/api'

type HistoryPoint = DashboardStats['band_history'][number]
type Row = { t: number } & Partial<Record<Skill, number>>

interface DotRenderProps {
  cx?: number
  cy?: number
  index?: number
  value?: number
}

/** Pivot `[{date, skill, band}]` into one row per date with a column per skill. */
function toRows(history: HistoryPoint[]): { rows: Row[]; skills: Skill[] } {
  const byTime = new Map<number, Row>()
  const seen = new Set<Skill>()

  for (const point of history) {
    const t = new Date(point.date).getTime()
    if (Number.isNaN(t)) continue
    seen.add(point.skill)
    const row = byTime.get(t) ?? { t }
    // Two sittings of the same skill on one day: the later band wins the point.
    row[point.skill] = point.band
    byTime.set(t, row)
  }

  return {
    rows: [...byTime.values()].sort((a, b) => a.t - b.t),
    skills: SKILL_ORDER.filter((s) => seen.has(s)),
  }
}

function lastIndexWithValue(rows: Row[], skill: Skill): number {
  for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i][skill] != null) return i
  return -1
}

function makeDot(
  skill: Skill,
  color: string,
  theme: ChartTheme,
  lastIndex: number,
  lastRowIndex: number,
) {
  return function SeriesDot(props: DotRenderProps) {
    const { cx, cy, index, value } = props
    if (cx == null || cy == null || value == null) return <g />
    const isEnd = index === lastIndex
    return (
      <g>
        {/* 2px surface ring keeps the marker legible where lines cross */}
        <circle cx={cx} cy={cy} r={4} fill={color} stroke={theme.surface} strokeWidth={2} />
        {isEnd && (
          <text
            x={cx}
            y={cy - 12}
            textAnchor={index === lastRowIndex ? 'end' : 'middle'}
            fontSize={11}
            fontWeight={600}
            fill={theme.ink}
          >
            {formatBand(value)}
          </text>
        )}
      </g>
    )
  }
}

function ChartTooltip({
  active,
  payload,
  label,
  theme,
}: {
  active?: boolean
  payload?: { dataKey?: string | number; value?: number; color?: string }[]
  label?: string | number
  theme: ChartTheme
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-pop">
      <p className="mb-1 text-xs text-muted">{formatShortDate(Number(label))}</p>
      <ul className="space-y-0.5">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="h-0.5 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color ?? theme.ink }}
            />
            <span className="font-semibold tabular-nums text-fg">
              {entry.value == null ? '—' : formatBand(entry.value)}
            </span>
            <span className="text-muted">{skillLabel(String(entry.dataKey))}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Band over time, one line per skill.
 *
 * Form: a trend across dates with the series' identity as the point → multi-line,
 * categorical colour (never more than four skills, so never past slot 4).
 * Relief for the light-mode contrast WARN on the aqua and yellow slots: the endpoint of
 * every line is directly labelled, and the same numbers are one click away as a table.
 *
 * The caller decides whether there is anything to plot — this never renders an empty chart.
 */
export function BandHistoryChart({
  history,
  targetBand,
}: {
  history: HistoryPoint[]
  targetBand?: number | null
}) {
  const theme = useChartTheme()
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const { rows, skills } = useMemo(() => toRows(history), [history])

  const bands = history.map((h) => h.band)
  const lowest = Math.min(...bands, targetBand ?? 9)
  const yMin = Math.max(0, Math.floor(lowest) - 1)
  const yTicks: number[] = []
  for (let t = yMin; t <= 9; t += 1) yTicks.push(t)

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 p-5 pb-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Band history</h2>
          <p className="text-sm text-muted">
            Every scored sitting, newest on the right.
            {targetBand != null && ` The line across is your target, band ${formatBand(targetBand)}.`}
          </p>
        </div>
        <div className="no-print inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Band history view">
          {(['chart', 'table'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                view === v ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {skills.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-1">
          {skills.map((skill) => (
            <li key={skill} className="flex items-center gap-1.5 text-xs text-muted">
              <span
                aria-hidden
                className="h-0.5 w-4 rounded-full"
                style={{ backgroundColor: seriesColorFor(skill, theme) }}
              />
              {skillLabel(skill)}
            </li>
          ))}
        </ul>
      )}

      {view === 'chart' ? (
        <div className="h-64 w-full px-1 pb-3 sm:h-72" data-testid="band-history-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 22, right: 18, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={theme.grid} strokeWidth={1} vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                ticks={rows.map((r) => r.t)}
                tickFormatter={(value: number) => formatShortDate(value)}
                tick={{ fill: theme.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: theme.grid }}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                domain={[yMin, 9]}
                ticks={yTicks}
                width={26}
                tick={{ fill: theme.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ stroke: theme.grid, strokeWidth: 1 }}
                content={<ChartTooltip theme={theme} />}
              />
              {targetBand != null && (
                <ReferenceLine
                  y={targetBand}
                  stroke={theme.inkMuted}
                  strokeWidth={1}
                  label={{
                    value: `Target ${formatBand(targetBand)}`,
                    position: 'insideTopRight',
                    fill: theme.inkMuted,
                    fontSize: 11,
                  }}
                />
              )}
              {skills.map((skill) => {
                const color = seriesColorFor(skill, theme)
                return (
                  <Line
                    key={skill}
                    type="linear"
                    dataKey={skill}
                    name={skillLabel(skill)}
                    stroke={color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    connectNulls
                    isAnimationActive={false}
                    activeDot={{ r: 5, stroke: theme.surface, strokeWidth: 2 }}
                    dot={makeDot(
                      skill,
                      color,
                      theme,
                      lastIndexWithValue(rows, skill),
                      rows.length - 1,
                    )}
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full min-w-[20rem] text-sm">
            <caption className="sr-only">Band by skill and date</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Date
                </th>
                {skills.map((skill) => (
                  <th key={skill} scope="col" className="py-2 pr-3 text-right font-medium">
                    {skillLabel(skill)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.t} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal text-muted">
                    {formatShortDate(row.t)}
                  </th>
                  {skills.map((skill) => (
                    <td key={skill} className="py-2 pr-3 text-right tabular-nums">
                      {row[skill] == null ? '—' : formatBand(row[skill] as number)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
