# IELTS Prep Platform — Plan

> **Status:** planning · **Owner:** Shahzod · **Last updated:** 2026-09-27
> **Working name:** `ielts-prep` (placeholder — brand name TBD)
> This file is the single source of truth. Every milestone below is a checkbox; we tick them as we ship.

---

## 1. What we are building

A free IELTS preparation platform for Uzbek learners, inspired by [millatedu.uz](https://millatedu.uz/)
but **IELTS-first** instead of general-English-first.

The core promise: **take a real, timed, full-length IELTS mock test in the browser, get an
instant band score, and see your progress over time.**

### Reference: what millatedu.uz does
| Area | millatedu.uz | Us |
|---|---|---|
| Positioning | General English, IELTS is one section | IELTS is the whole product |
| Listening/Reading | Practice materials | Full timed mock tests, auto-scored, band conversion |
| Writing | Prompts + model answers | Prompts + timed editor + **AI band feedback** |
| Speaking | Questions + model answers + AI coach | v2 (model answers + self-recording in v1) |
| Accounts | Optional; recordings stay in browser | Account required → real progress history |
| Extras | Stories, typing, dictionary, Speaking Spin | Vocabulary + band calculator; rest is backlog |

### Target user
Uzbek students (16–30) preparing for IELTS Academic, targeting band 6.0–7.5.
Primarily mobile, often on slow connections. UI in **Uzbek + English** (Russian later).

---

## 2. Decisions locked in

| Decision | Choice | Rationale |
|---|---|---|
| **Stack** | Next.js (TS) + FastAPI (Python) + Postgres | Next.js for the exam UI; FastAPI for scoring + AI; Postgres for everything durable |
| **MVP core** | Listening + Reading, auto-scored | Deterministic, no AI cost, highest value per hour of work |
| **AI in v1** | Writing only | Claude grades Task 1/Task 2 against the 4 official band descriptors |
| **Speaking in v1** | No AI | Questions + model answers + browser-local recording. AI examiner is v2 |
| **Access** | Free, account required | Everything free; registration unlocks progress history and analytics |
| **Payments** | None in v1 | No Payme/Click integration until there is demand |
| **Exam variant** | Academic first | General Training reading tables added later (same engine, different conversion table) |

### Non-goals for v1 (explicitly out of scope)
- Payments / subscriptions / promo codes
- Teacher or school dashboards (B2B)
- Live classes, video lessons, chat
- Mobile apps (the web app is responsive; that is enough)
- Speaking AI evaluation
- General Training variant

---

## 3. Feature scope

### v1 — MVP (the thing we actually build first)
- [ ] **Auth**: email + password, email verification, password reset. Telegram login as a second option.
- [ ] **Listening test**: 4 sections, 40 questions, single continuous audio, one-time playback,
      30 min + 2 min transfer time, autosave, auto-submit on timeout.
- [ ] **Reading test (Academic)**: 3 passages, 40 questions, 60 min, split-pane passage/questions,
      highlighting, autosave, auto-submit.
- [ ] **Answer-checking engine**: all IELTS question types, alternative answers, spelling variants,
      word-limit enforcement (see §6).
- [ ] **Band conversion**: raw score → band for Listening and Academic Reading (see §7).
- [ ] **Results page**: band, raw score, per-section breakdown, per-question review with the correct
      answer and the location of the answer in the audio transcript / passage.
- [ ] **Writing test**: Task 1 + Task 2, 60 min, word counter, timer, autosave.
- [ ] **AI writing feedback**: band per criterion (Task Achievement, Coherence & Cohesion,
      Lexical Resource, Grammatical Range & Accuracy) + overall band + inline corrections + rewrite suggestions.
- [ ] **Speaking practice (no AI)**: Parts 1/2/3 question bank, cue card with 1-min prep timer,
      browser recording stored locally (IndexedDB), model answers + useful phrases.
- [ ] **Dashboard**: band history chart per skill, tests taken, weakest question types, streak.
- [ ] **Band calculator**: standalone public tool (4 skill bands → overall, with correct rounding).
- [ ] **Admin/content panel**: create tests, upload audio, define questions + answer keys, publish/unpublish.
- [ ] **i18n**: Uzbek + English UI.

### v2 — next
- [ ] Speaking AI examiner (ASR → Claude feedback on fluency, lexis, grammar, pronunciation)
- [ ] Full mock exam mode (all 4 sections back-to-back under exam conditions, one overall band)
- [ ] Vocabulary trainer (spaced repetition, IELTS word lists by topic + Academic Word List)
- [ ] General Training variant (reading + letter writing task 1)
- [ ] Leaderboards / public results page
- [ ] Telegram bot: daily word, daily question, result notifications

### Backlog (do **not** build without asking)
- Payments / freemium tiers
- Teacher & school dashboards, assigned homework, class analytics
- Reading stories library (millatedu's "Read Up")
- Typing practice, dictionary, "Speaking Spin"
- Mobile apps

---

## 4. Architecture

```
ielts-prep/
├── plan.md                  ← this file, source of truth
├── docs/
│   ├── adr/                 ← architecture decision records
│   ├── content-authoring.md ← how a test gets into the system
│   └── band-tables.md       ← official conversion tables + sources
├── web/                     ← Next.js 15 (App Router, TS, Tailwind, shadcn/ui)
│   ├── app/(marketing)/     ← landing, about, band calculator
│   ├── app/(auth)/          ← login, register, reset
│   ├── app/(app)/           ← dashboard, tests, results, profile
│   └── app/exam/            ← the distraction-free exam runner (own layout, no nav)
├── api/                     ← FastAPI
│   ├── app/routers/         ← auth, tests, attempts, scoring, writing, admin
│   ├── app/services/        ← scoring engine, band conversion, AI grading
│   ├── app/models/          ← SQLAlchemy models
│   └── alembic/             ← migrations
├── infra/
│   ├── docker-compose.yml   ← postgres, redis, api, web, minio
│   └── nginx/
└── content/                 ← test content as JSON + audio, version-controlled
```

**Runtime pieces**
- Postgres — users, tests, questions, attempts, answers, scores
- Redis — sessions, rate limiting, exam-timer server-side state
- S3-compatible storage (MinIO in dev) — listening audio, later speaking recordings
- Claude API (Sonnet 5) — writing evaluation only in v1

**Why this split:** the exam runner is a heavy stateful UI (timers, audio, autosave) that belongs in
Next.js; scoring, band conversion and AI grading are pure Python that must never run on the client.

### Critical rule: **the client never sees the answer key**
Answers are submitted to the API, scored server-side, and only returned after the attempt is finalised.
Timers are validated server-side (`started_at` + `duration`) — a client clock is a suggestion, not a fact.

---

## 5. Data model (first pass)

```
users            id, email, password_hash, full_name, locale, target_band, exam_date,
                 is_verified, is_admin, created_at
tests            id, skill(listening|reading|writing|speaking), variant(academic|general),
                 title, difficulty, duration_seconds, is_published, created_by, created_at
sections         id, test_id, order, title, instructions, audio_url, passage_html,
                 start_question, end_question
questions        id, section_id, number, type, prompt, options(jsonb), word_limit,
                 group_id, metadata(jsonb)
answer_keys      id, question_id, accepted(jsonb: ["colour","color"]), match_mode, explanation
attempts         id, user_id, test_id, status(in_progress|submitted|scored|abandoned),
                 started_at, expires_at, submitted_at, raw_score, band, meta(jsonb)
attempt_answers  id, attempt_id, question_id, value, is_correct, checked_at
writing_subs     id, attempt_id, task_number, prompt_id, text, word_count,
                 ai_bands(jsonb), ai_feedback(jsonb), model, tokens_used, created_at
speaking_qs      id, part(1|2|3), topic, question, model_answer, useful_phrases(jsonb)
vocab_items      id, word, definition, uz, ru, example, topic, level     -- v2
```

Indexes that matter: `attempts(user_id, created_at desc)`, `attempt_answers(attempt_id)`,
`questions(section_id, number)`.

---

## 6. Answer-checking engine (the heart of v1)

**Question types to support**
| Type | Scoring |
|---|---|
| Multiple choice (one answer) | exact option match |
| Multiple choice (multi-answer) | set comparison, partial credit per official rules |
| True / False / Not Given · Yes / No / Not Given | exact enum match |
| Matching headings / features / sentence endings | exact option match |
| Sentence, summary, note, table, flow-chart, form completion | normalised text match |
| Plan / map / diagram labelling | exact option or normalised text |
| Short answer | normalised text match |

**Normalisation pipeline for text answers**
1. Trim, collapse internal whitespace, lowercase
2. Strip surrounding punctuation and quotes
3. Optional leading article (`a`/`an`/`the`) ignored when the key allows it
4. Number ↔ word equivalence (`5` = `five`, `1990s` = `1990's`)
5. British/American variants matched from the key's `accepted` list (`colour` / `color`)
6. Hyphen/space tolerance (`air-conditioning` = `air conditioning`)
7. **Word-limit rule**: if the instruction says "NO MORE THAN TWO WORDS AND/OR A NUMBER",
   an answer exceeding the limit is **wrong even if it contains the right words** — this is real
   IELTS behaviour and students must learn it
8. Spelling must be exact otherwise (IELTS marks misspellings wrong) — but we *flag* near-misses in the
   review screen as "you had the right idea, spelling cost you the mark"

This engine gets an exhaustive unit-test suite. It is the one piece where a bug quietly destroys trust.

---

## 7. Band conversion

Raw score out of 40 → band. **Indicative tables** (must be verified against official Cambridge
materials before launch and recorded in `docs/band-tables.md` with sources):

**Listening**
| Raw | Band | | Raw | Band |
|---|---|---|---|---|
| 39–40 | 9.0 | | 23–25 | 6.0 |
| 37–38 | 8.5 | | 18–22 | 5.5 |
| 35–36 | 8.0 | | 16–17 | 5.0 |
| 32–34 | 7.5 | | 13–15 | 4.5 |
| 30–31 | 7.0 | | 11–12 | 4.0 |
| 26–29 | 6.5 | | | |

**Academic Reading**
| Raw | Band | | Raw | Band |
|---|---|---|---|---|
| 39–40 | 9.0 | | 23–26 | 6.0 |
| 37–38 | 8.5 | | 19–22 | 5.5 |
| 35–36 | 8.0 | | 15–18 | 5.0 |
| 33–34 | 7.5 | | 13–14 | 4.5 |
| 30–32 | 7.0 | | 10–12 | 4.0 |
| 27–29 | 6.5 | | 8–9 | 3.5 |

Tables live in the **database**, not in code, so they can be corrected without a deploy.

**Overall band rounding:** average the four skill bands, then
`.25 → round up to the next half`, `.75 → round up to the next whole`, otherwise round down.
(6.5 + 6.5 + 5.0 + 7.0 = 25 / 4 = 6.25 → **6.5**)

---

## 8. AI writing evaluation

- **Model:** `claude-sonnet-5` (upgrade to Opus for appeals/re-grades if quality demands it)
- **Input:** task type (1 or 2), the prompt, any chart/image description, the student's text, word count
- **Output:** strict JSON — band per criterion, overall band, 2–3 strengths, 3–5 concrete
  improvements, inline corrections (`{offset, length, issue, suggestion, why}`), an improved rewrite
  of one weak paragraph
- **Grounding:** the official public band descriptors are embedded in the system prompt so the model
  scores against real criteria, not vibes
- **Guardrails:** under-length penalty applied deterministically in code (under 150/250 words), not left
  to the model; off-topic detection; cap of N submissions/day per user; all responses cached by text hash
- **Cost control:** log `tokens_used` per submission from day one so we know the unit economics

---

## 9. Content pipeline (the real bottleneck)

Software is the easy half. **A platform with three mock tests is worthless.** Plan for content:

- [ ] Define the authoring format: one JSON file per test + audio files, in `content/`, version-controlled
- [ ] Build an importer: `python -m app.cli import content/listening/test-01.json`
- [ ] Build the admin UI on top of the same validation as the importer
- [ ] Source/author the first batch: **6 Listening + 6 Reading + 10 Writing prompts** before launch
- [ ] Transcripts for every listening test (needed for the answer-review screen)
- [ ] Legal check: use openly licensed or originally authored material — Cambridge books are copyrighted

---

## 10. Milestones

### M0 — Foundations (week 1)
- [x] Repo scaffolding: `web/`, `api/`, `infra/docker-compose.yml`, `make up` / `scripts/dev.sh`
- [x] Postgres + Alembic + all 13 models, initial migration applied, `alembic check` clean
- [x] CI: GitHub Actions running ruff, pytest+coverage, tsc, vitest, next build
- [x] Shared contracts: `docs/api-contract.md`, pydantic schemas, `web/src/types/api.ts`
- [x] Auth end-to-end: register, verify, login, refresh rotation, reset — 106 tests green
- [x] Password reset revokes every token issued before it (`password_changed_at` + sub-second `iat_f`)
- [x] Design system: semantic colour tokens, light/dark, UI primitives, exam-specific tokens
- [x] Exam shell: status bar with server-anchored clock, question palette, submit dialog, autosave hook

> Note: containers bind host ports **5433** (postgres) and **6380** (redis) — 5432 and 6379 were
> already taken on the dev machine.

### M1 — Reading (week 2–3)
- [ ] Content schema + importer + first real reading test in the DB
- [ ] Exam runner UI: split pane, timer, palette, flag-for-review, autosave every 10s
- [ ] Scoring engine + all reading question types + unit tests
- [ ] Band conversion + results page with per-question review

### M2 — Listening (week 4)
- [ ] Audio player: single play-through, no seek, section markers, pre-load
- [ ] Listening runner (reuses the exam shell) + 2-minute transfer phase
- [ ] Transcript-linked answer review

### M3 — Writing + AI (week 5)
- [ ] Writing runner: two tasks, word count, timer, autosave
- [ ] Claude grading service, JSON schema, retries, caching, cost logging
- [ ] Feedback UI: criterion bands, inline corrections, improved rewrite

### M4 — Speaking (no AI) + Dashboard (week 6)
- [ ] Speaking question bank, cue cards, prep timer, local recording + playback
- [ ] Dashboard: band history chart, weakest question types, streak
- [ ] Public band calculator

### M5 — Launch (week 7)
- [ ] Admin panel for content
- [ ] Uzbek translation pass
- [ ] Seed content: 6 listening + 6 reading + 10 writing prompts
- [ ] Analytics, error tracking (Sentry), backups, deploy
- [ ] Beta with 20 real students, fix what breaks

---

## 11. Quality bar

- Exam UI must work on a 360px phone screen and survive a refresh mid-test without data loss
- Autosave every 10s + on every answer change; resume an in-progress attempt exactly where it was
- Timer is authoritative on the server; closing the tab does not pause the exam
- Answer-checking engine: 100% branch coverage, table-driven tests per question type
- Listening audio pre-loads before the timer starts; a stalled load pauses the test, not the student

---

## 12. Open questions

1. **Brand name and domain** — `ielts-prep` is a placeholder.
2. **Content source** — author our own tests, license them, or partner with a teacher/centre?
   This decides the launch date more than any code does.
3. **Russian UI** — v1 or later?
4. **Telegram login** — worth it in v1 for Uzbek users, or is email enough?
5. **Hosting** — VPS in the region (latency + audio bandwidth) or Vercel + a managed Postgres?

---

## 13. Change log

- **2026-09-27** — Plan created. Locked: Next.js + FastAPI + Postgres; MVP = auto-scored
  Listening + Reading; AI for Writing only; free with required account.
- **2026-09-27** — M0 foundations built. Work split across parallel agents by owned directory,
  against a written API contract. Backend: scoring engine, auth, attempts, AI grader, content
  importer. Frontend: marketing/auth, exam runner, writing/speaking, dashboard/results.
