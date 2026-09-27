'use client'

import { AlertOctagon, ArrowRight, Check, Ruler } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { WritingFeedback } from '@/types/api'

/**
 * Two scannable columns rather than a page of prose: a student reads feedback the morning of a
 * lesson, on a phone, in about ninety seconds. Strengths are there so the report is worth
 * finishing; improvements are numbered because they are a to-do list, not observations.
 */
export function StrengthsAndImprovements({ feedback }: { feedback: WritingFeedback }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section
        aria-labelledby="strengths-title"
        className="rounded-2xl border border-success/30 bg-success/5 p-5"
      >
        <h2 id="strengths-title" className="text-sm font-semibold uppercase tracking-wider text-success">
          What is working
        </h2>
        {feedback.strengths.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No strengths were recorded for this task.</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {feedback.strengths.map((item, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-fg">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="improvements-title"
        className="rounded-2xl border border-border bg-surface p-5 shadow-card"
      >
        <h2
          id="improvements-title"
          className="text-sm font-semibold uppercase tracking-wider text-muted"
        >
          Do these next
        </h2>
        {feedback.improvements.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No improvements were recorded for this task.</p>
        ) : (
          <ol className="mt-3 space-y-2.5">
            {feedback.improvements.map((item, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-fg">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary"
                >
                  {i + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

/**
 * Both flags cap the score regardless of how good the English is, so they sit above the bands.
 * A student who does not understand why a well-written essay scored 5.0 stops trusting the tool.
 */
export function ScoreCapFlags({
  feedback,
  wordCount,
  minWords,
}: {
  feedback: WritingFeedback
  wordCount: number
  minWords: number
}) {
  if (!feedback.off_topic && !feedback.under_length_penalty) return null

  return (
    <div className="space-y-3" data-testid="score-caps">
      {feedback.off_topic && (
        <Flag
          icon={<AlertOctagon className="h-5 w-5" aria-hidden />}
          title="Off topic — this caps your band"
          body="This answer does not address the question that was asked. In the real test an off-topic answer is capped at band 4 for Task Achievement or Task Response, however strong the English is. Re-read the prompt and underline exactly what it asks you to do before you write."
        />
      )}
      {feedback.under_length_penalty && (
        <Flag
          icon={<Ruler className="h-5 w-5" aria-hidden />}
          title={`Under length — ${wordCount} of ${minWords} words`}
          body={`The examiner applies a length penalty below ${minWords} words before judging quality. Writing ${minWords - wordCount} more words on your weakest paragraph is the single cheapest half-band you can buy.`}
        />
      )}
    </div>
  )
}

function Flag({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-xl border-l-4 border-l-danger border-y border-r border-y-danger/30 border-r-danger/30 bg-danger/5 p-4"
    >
      <span className="mt-0.5 shrink-0 text-danger">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-fg">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
      </div>
    </div>
  )
}

/**
 * One paragraph, rewritten. Before and after side by side, because the lesson is in the
 * difference — a rewrite on its own just reads like better writing happening to someone else.
 */
export function ImprovedParagraph({
  original,
  improved,
}: {
  original: string | null
  improved: string | null
}) {
  if (!improved) return null

  return (
    <section
      aria-labelledby="rewrite-title"
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
    >
      <div className="border-b border-border px-5 py-4">
        <h2 id="rewrite-title" className="text-base font-semibold tracking-tight">
          One paragraph, rewritten
        </h2>
        <p className="text-sm text-muted">
          The same ideas at a higher band. Read what changed, not just what it says.
        </p>
      </div>

      <div className={cn('grid gap-px bg-border', original && 'md:grid-cols-2')}>
        {original && <RewriteColumn label="Yours" tone="muted" text={original} />}
        <RewriteColumn label="Rewritten" tone="success" text={improved} />
      </div>

      {!original && (
        <p className="border-t border-border px-5 py-3 text-xs text-muted">
          We could not match this rewrite to a single paragraph in your answer — compare it
          against the marked-up text above.
        </p>
      )}
    </section>
  )
}

function RewriteColumn({
  label,
  tone,
  text,
}: {
  label: string
  tone: 'muted' | 'success'
  text: string | null
}) {
  return (
    <div className="bg-surface p-5">
      <p
        className={cn(
          'mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider',
          tone === 'success' ? 'text-success' : 'text-muted',
        )}
      >
        {tone === 'success' && <ArrowRight className="h-3.5 w-3.5" aria-hidden />}
        {label}
      </p>
      <p
        className={cn(
          'whitespace-pre-wrap font-serif text-[0.9375rem] leading-relaxed',
          tone === 'success' ? 'text-fg' : 'text-muted',
        )}
      >
        {text ?? 'Not available.'}
      </p>
    </div>
  )
}
