'use client'

import { ChevronLeft, ChevronRight, Shuffle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { CueCard, QuestionCard } from '@/components/speaking/cue-card'
import { ModelAnswer } from '@/components/speaking/model-answer'
import { RecorderPanel } from '@/components/speaking/recorder-panel'
import { Button, Skeleton } from '@/components/ui'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Page, SpeakingQuestion } from '@/types/api'

type Part = SpeakingQuestion['part']

const PARTS: { value: Part; label: string; blurb: string }[] = [
  { value: 'part_1', label: 'Part 1', blurb: 'Familiar topics · 4–5 minutes' },
  { value: 'part_2', label: 'Part 2', blurb: 'Cue card · 1 min prep, 2 min talk' },
  { value: 'part_3', label: 'Part 3', blurb: 'Discussion · 4–5 minutes' },
]

const ALL_TOPICS = '__all__'

export function SpeakingPractice() {
  const [part, setPart] = useState<Part>('part_1')
  const [topic, setTopic] = useState<string>(ALL_TOPICS)
  const [topics, setTopics] = useState<string[]>([])
  const [questions, setQuestions] = useState<SpeakingQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .get<string[]>('/speaking/topics')
      .then((rows) => {
        if (!cancelled) setTopics(rows)
      })
      .catch(() => {
        if (!cancelled) setTopics([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ part, page_size: '100' })
    if (topic !== ALL_TOPICS) params.set('topic', topic)
    try {
      const page = await api.get<Page<SpeakingQuestion>>(`/speaking/questions?${params}`)
      setQuestions(page.items)
      setIndex(0)
    } catch {
      setQuestions([])
      setError('We could not load the question bank. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [part, topic])

  useEffect(() => {
    void load()
  }, [load])

  const current = questions[index] ?? null

  const shuffle = useCallback(() => {
    if (questions.length < 2) return
    let next = index
    while (next === index) next = Math.floor(Math.random() * questions.length)
    setIndex(next)
  }, [index, questions.length])

  const topicOptions = useMemo(() => [ALL_TOPICS, ...topics], [topics])

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Speaking practice</h1>
        <p className="mt-1 text-sm text-muted">
          Real examiner questions with a timer and a recorder. There is no AI score for speaking
          yet — listen back to your own take, which is the part most students skip.
        </p>
      </header>

      <nav aria-label="Speaking parts" className="mt-5 grid grid-cols-3 gap-2">
        {PARTS.map((p) => {
          const selected = p.value === part
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setPart(p.value)}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-left transition-colors',
                selected
                  ? 'border-primary bg-primary-soft'
                  : 'border-border bg-surface hover:bg-surface-2',
              )}
            >
              <span
                className={cn(
                  'block text-sm font-semibold',
                  selected ? 'text-primary' : 'text-fg',
                )}
              >
                {p.label}
              </span>
              <span className="mt-0.5 block text-[0.6875rem] leading-tight text-muted">
                {p.blurb}
              </span>
            </button>
          )
        })}
      </nav>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="speaking-topic" className="block text-xs font-medium text-muted">
            Topic
          </label>
          <select
            id="speaking-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg"
          >
            {topicOptions.map((value) => (
              <option key={value} value={value}>
                {value === ALL_TOPICS ? 'All topics' : value}
              </option>
            ))}
          </select>
        </div>
        <Button variant="outline" onClick={shuffle} disabled={questions.length < 2}>
          <Shuffle className="h-4 w-4" aria-hidden />
          Random
        </Button>
      </div>

      <div className="mt-5 space-y-4">
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <div role="alert" className="rounded-xl bg-danger/10 p-4">
            <p className="text-sm text-fg">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : !current ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            No questions yet for this part{topic !== ALL_TOPICS ? ` and topic` : ''}. Try another
            filter.
          </p>
        ) : (
          <>
            {part === 'part_2' ? (
              <CueCard question={current} />
            ) : (
              <QuestionCard question={current} index={index} total={questions.length} />
            )}

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Previous
              </Button>
              <p className="flex-1 text-center text-xs tabular-nums text-muted">
                {index + 1} / {questions.length}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
                disabled={index >= questions.length - 1}
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>

            <ModelAnswer question={current} />

            {/* Last on the page so its sticky control bar stays pinned for the whole scroll. */}
            <RecorderPanel question={current} longTurn={part === 'part_2'} />
          </>
        )}
      </div>
    </div>
  )
}
