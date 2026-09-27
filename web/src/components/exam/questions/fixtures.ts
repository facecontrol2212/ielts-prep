import type {
  AttemptSession,
  Option,
  Question,
  QuestionGroup,
  QuestionType,
  Section,
} from '@/types/api'

/**
 * A realistic AttemptSession, shaped like the payload `GET /attempts/{id}` returns.
 *
 * Shared by every renderer test so that a change to the API contract breaks one file and
 * not twenty. The numbers run 1–40 like a real paper.
 */

let seq = 0
const uid = (prefix: string) => `${prefix}-${(seq += 1).toString().padStart(4, '0')}`

export function makeOptions(labels: string[], texts?: string[]): Option[] {
  return labels.map((label, i) => ({ label, text: texts?.[i] ?? `Option ${label}` }))
}

export function makeQuestion(
  number: number,
  type: QuestionType,
  overrides: Partial<Question> = {},
): Question {
  return {
    id: uid('q'),
    number,
    type,
    prompt: `Prompt for question ${number}`,
    options: null,
    word_limit: null,
    allow_number: false,
    ...overrides,
  }
}

export function makeGroup(
  type: QuestionType,
  numbers: number[],
  overrides: Partial<QuestionGroup> = {},
): QuestionGroup {
  const { questions, ...rest } = overrides
  return {
    id: uid('g'),
    order: 1,
    type,
    instructions: `Instructions for ${type}`,
    word_limit: null,
    allow_number: false,
    options: null,
    select_count: null,
    content_html: null,
    image_url: null,
    questions: questions ?? numbers.map((n) => makeQuestion(n, type)),
    ...rest,
  }
}

export function makeSection(order: number, groups: QuestionGroup[], overrides: Partial<Section> = {}): Section {
  const numbers = groups.flatMap((g) => g.questions.map((q) => q.number))
  return {
    id: uid('s'),
    order,
    title: `Passage ${order}`,
    instructions: null,
    passage_html: null,
    audio_url: null,
    prompt_html: null,
    image_url: null,
    min_words: null,
    start_question: numbers.length ? Math.min(...numbers) : null,
    end_question: numbers.length ? Math.max(...numbers) : null,
    groups,
    ...overrides,
  }
}

export interface SessionOptions {
  skill?: 'reading' | 'listening'
  sections?: Section[]
  secondsRemaining?: number
  transferSeconds?: number
  status?: AttemptSession['attempt']['status']
  answers?: AttemptSession['answers']
}

export function makeSession(options: SessionOptions = {}): AttemptSession {
  const skill = options.skill ?? 'reading'
  const sections = options.sections ?? [defaultReadingSection()]
  const questionCount = sections.flatMap((s) => s.groups).flatMap((g) => g.questions).length
  return {
    attempt: {
      id: 'attempt-1111-2222-3333',
      test_id: 'test-aaaa-bbbb',
      status: options.status ?? 'in_progress',
      started_at: '2026-09-27T09:00:00Z',
      expires_at: '2026-09-27T10:00:00Z',
      submitted_at: null,
      seconds_remaining: options.secondsRemaining ?? 3600,
    },
    test: {
      id: 'test-aaaa-bbbb',
      slug: skill === 'listening' ? 'listening-practice-01' : 'academic-reading-01',
      skill,
      variant: 'academic',
      title: skill === 'listening' ? 'Listening practice test 1' : 'Academic Reading test 1',
      description: null,
      difficulty: 3,
      duration_seconds: skill === 'listening' ? 1800 : 3600,
      question_count: questionCount,
      transfer_seconds: options.transferSeconds ?? (skill === 'listening' ? 120 : 0),
      sections,
    },
    answers: options.answers ?? [],
  }
}

function defaultReadingSection(): Section {
  return makeSection(
    1,
    [
      makeGroup('true_false_not_given', [1, 2, 3]),
      makeGroup('short_answer', [4, 5], { word_limit: 3, allow_number: true }),
    ],
    {
      passage_html:
        '<p>Sea otters keep kelp forests alive by eating the urchins that graze them.</p>' +
        '<p>Where otters vanished, the forests followed within a decade.</p>',
    },
  )
}

/** Every renderer at once — one section holding one group of each supported type. */
export function makeAllTypesSession(): AttemptSession {
  const section = makeSection(1, [
    makeGroup('multiple_choice', [1], {
      options: makeOptions(['A', 'B', 'C', 'D']),
    }),
    makeGroup('multiple_choice_multi', [2, 3], {
      select_count: 2,
      options: makeOptions(['A', 'B', 'C', 'D', 'E']),
    }),
    makeGroup('true_false_not_given', [4, 5]),
    makeGroup('yes_no_not_given', [6]),
    makeGroup('matching_headings', [7, 8], { options: makeOptions(['i', 'ii', 'iii']) }),
    makeGroup('matching_information', [9], { options: makeOptions(['A', 'B', 'C']) }),
    makeGroup('matching_features', [10], { options: makeOptions(['A', 'B']) }),
    makeGroup('matching_sentence_endings', [11], { options: makeOptions(['A', 'B']) }),
    makeGroup('sentence_completion', [12], {
      word_limit: 2,
      content_html: '<p>The otters eat [[12]] every day.</p>',
    }),
    makeGroup('summary_completion', [13], {
      word_limit: 1,
      content_html: '<p>Kelp forests shelter [[13]].</p>',
    }),
    makeGroup('note_completion', [14], {
      word_limit: 2,
      content_html: '<ul><li>Depth: [[14]]</li></ul>',
    }),
    makeGroup('table_completion', [15, 16], {
      word_limit: 2,
      allow_number: true,
      content_html:
        '<table><tbody><tr><td>Year</td><td>[[15]]</td></tr><tr><td>Count</td><td>[[16]]</td></tr></tbody></table>',
    }),
    makeGroup('flow_chart_completion', [17], {
      word_limit: 2,
      content_html: '<p>Survey → [[17]] → Report</p>',
    }),
    makeGroup('form_completion', [18], {
      word_limit: 1,
      content_html: '<p>Name: [[18]]</p>',
    }),
    makeGroup('diagram_labelling', [19], { image_url: '/diagram.png', word_limit: 2 }),
    makeGroup('map_labelling', [20], {
      image_url: '/map.png',
      options: makeOptions(['A', 'B', 'C']),
    }),
    makeGroup('short_answer', [21], { word_limit: 3, allow_number: true }),
  ])
  return makeSession({ sections: [section] })
}
