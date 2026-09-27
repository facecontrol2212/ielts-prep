/**
 * Mirrors api/app/schemas/*.py. Keep in sync by hand — there is no codegen step in v1.
 * If you change something here, say so in your report so the backend schema is updated too.
 */

export type Skill = 'listening' | 'reading' | 'writing' | 'speaking'
export type Variant = 'academic' | 'general'
export type Locale = 'uz' | 'en' | 'ru'
export type AttemptStatus = 'in_progress' | 'submitted' | 'scored' | 'abandoned' | 'expired'

export type QuestionType =
  | 'multiple_choice'
  | 'multiple_choice_multi'
  | 'true_false_not_given'
  | 'yes_no_not_given'
  | 'matching_headings'
  | 'matching_information'
  | 'matching_features'
  | 'matching_sentence_endings'
  | 'sentence_completion'
  | 'summary_completion'
  | 'note_completion'
  | 'table_completion'
  | 'flow_chart_completion'
  | 'form_completion'
  | 'diagram_labelling'
  | 'map_labelling'
  | 'short_answer'

export interface User {
  id: string
  email: string
  full_name: string | null
  locale: Locale
  target_band: number | null
  exam_date: string | null
  is_verified: boolean
  is_admin: boolean
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface Option {
  label: string
  text: string
}

export interface Question {
  id: string
  number: number
  type: QuestionType
  prompt: string
  options?: Option[] | null
  word_limit?: number | null
  allow_number?: boolean
}

export interface QuestionGroup {
  id: string
  order: number
  type: QuestionType
  instructions: string
  word_limit: number | null
  allow_number: boolean
  options: Option[] | null
  select_count: number | null
  content_html: string | null
  image_url: string | null
  questions: Question[]
}

export interface Section {
  id: string
  order: number
  title: string
  instructions: string | null
  passage_html: string | null
  audio_url: string | null
  prompt_html: string | null
  image_url: string | null
  min_words: number | null
  start_question: number | null
  end_question: number | null
  groups: QuestionGroup[]
}

export interface TestSummary {
  id: string
  slug: string
  skill: Skill
  variant: Variant
  title: string
  description: string | null
  difficulty: number
  duration_seconds: number
  question_count: number
}

export interface TestDetail extends TestSummary {
  transfer_seconds: number
  sections: Section[]
}

/** A student answer. `string` for text and single options, `string[]` for multi-select. */
export type AnswerValue = string | string[] | null

export interface Answer {
  question_id: string
  value: AnswerValue
  is_flagged: boolean
}

export interface Attempt {
  id: string
  test_id: string
  status: AttemptStatus
  started_at: string
  expires_at: string
  submitted_at: string | null
  seconds_remaining: number
}

export interface AttemptSession {
  attempt: Attempt
  test: TestDetail
  answers: Answer[]
}

export interface QuestionReview {
  question_id: string
  number: number
  type: QuestionType
  prompt: string
  your_answer: AnswerValue
  correct_answers: string[]
  is_correct: boolean
  reason: 'wrong' | 'blank' | 'spelling' | 'over_word_limit' | null
  explanation: string | null
  evidence: string | null
  audio_timestamp: number | null
}

export interface SectionScore {
  section_order: number
  title: string
  correct: number
  total: number
}

export interface TypeScore {
  type: string
  correct: number
  total: number
}

export interface AttemptResult {
  attempt_id: string
  skill: Skill
  test_title: string
  status: AttemptStatus
  raw_score: number
  total_questions: number
  band: number
  submitted_at: string | null
  duration_seconds: number | null
  sections: SectionScore[]
  by_type: TypeScore[]
  review: QuestionReview[]
}

export interface AttemptHistoryItem {
  id: string
  test_id: string
  test_title: string
  skill: Skill
  status: AttemptStatus
  band: number | null
  raw_score: number | null
  submitted_at: string | null
}

export interface DashboardStats {
  attempts_total: number
  tests_completed: number
  current_streak_days: number
  best_band: Partial<Record<Skill, number>>
  latest_band: Partial<Record<Skill, number>>
  band_history: { date: string; skill: Skill; band: number }[]
  weakest_types: TypeScore[]
}

export interface Correction {
  offset: number
  length: number
  original: string
  suggestion: string
  issue: 'grammar' | 'vocabulary' | 'cohesion' | 'spelling' | 'punctuation' | 'register'
  explanation: string
}

export interface WritingFeedback {
  band_task: number
  band_coherence: number
  band_lexical: number
  band_grammar: number
  band_overall: number
  strengths: string[]
  improvements: string[]
  corrections: Correction[]
  improved_paragraph: string | null
  off_topic: boolean
  under_length_penalty: boolean
}

export interface WritingSubmission {
  id: string
  task_number: number
  text: string
  word_count: number
  band_task: number | null
  band_coherence: number | null
  band_lexical: number | null
  band_grammar: number | null
  band_overall: number | null
  feedback: WritingFeedback | null
  graded_at: string | null
  grading_error: string | null
}

export interface SpeakingQuestion {
  id: string
  part: 'part_1' | 'part_2' | 'part_3'
  topic: string
  question: string
  cue_points: string[] | null
  model_answer: string | null
  useful_phrases: { phrase: string; use: string }[] | null
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}
