# API Contract

Base URL: `/api`. Auth: `Authorization: Bearer <access_token>`.
All bodies are JSON. All timestamps are ISO-8601 UTC. All ids are UUIDv4.

**Hard rule:** no endpoint reachable by a student may ever serialise `AnswerKey.accepted`
before the owning attempt reaches status `scored`. The `QuestionOut` schema has no answer field —
keep it that way.

---

## Owner map (who implements what)

| Module | Files | Agent |
|---|---|---|
| Scoring engine | `app/services/scoring/*` | A |
| Auth & users | `app/routers/auth.py`, `app/routers/users.py`, `app/services/auth_service.py` | B |
| Tests & attempts | `app/routers/tests.py`, `app/routers/attempts.py`, `app/services/attempt_service.py` | C |
| AI writing | `app/services/ai/*`, `app/routers/writing.py` | D |
| Content importer | `app/cli.py`, `app/services/importer.py`, `content/*` | E |
| Score utilities | `app/routers/score.py` | A |
| Speaking bank | `app/routers/speaking.py` | E |

Shared, already written, **do not modify**: `app/core/*`, `app/models/*`, `app/schemas/*`,
`app/api/deps.py`, `tests/conftest.py`. Need a change there? Say so in your report instead.

---

## auth

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| POST | `/auth/register` | `RegisterRequest` | `TokenPair` | creates user, issues an email-verification token |
| POST | `/auth/login` | `LoginRequest` | `TokenPair` | 401 on bad credentials; same message for unknown email and wrong password |
| POST | `/auth/refresh` | `RefreshRequest` | `TokenPair` | rotates the refresh token |
| POST | `/auth/verify-email` | `VerifyEmailRequest` | `Message` | one-shot token |
| POST | `/auth/forgot-password` | `ForgotPasswordRequest` | `Message` | always 200, never reveals whether the email exists |
| POST | `/auth/reset-password` | `ResetPasswordRequest` | `Message` | invalidates the token after use |

## users

| Method | Path | Returns |
|---|---|---|
| GET | `/users/me` | `UserOut` |
| PATCH | `/users/me` | `UserOut` (body `UserUpdate`) |
| GET | `/users/me/stats` | `DashboardStats` |
| GET | `/users/me/attempts` | `Page[AttemptHistoryItem]` (`?skill=&page=&page_size=`) |

## tests

| Method | Path | Returns | Notes |
|---|---|---|---|
| GET | `/tests` | `Page[TestSummary]` | `?skill=&variant=&difficulty=`; published only |
| GET | `/tests/{slug}` | `TestSummary` | metadata only — **never** the questions |

## attempts

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| POST | `/attempts` | `AttemptStart` | `AttemptSession` | 409 if the user already has an in-progress attempt on that test; returns the full exam payload and sets `expires_at = now + duration + transfer` |
| GET | `/attempts/{id}` | — | `AttemptSession` | resume: replays saved answers. 403 if not the owner |
| PATCH | `/attempts/{id}/answers` | `AnswerBatch` | `{"saved": n, "seconds_remaining": n}` | idempotent upsert per question; 409 once the attempt is past `in_progress`; accepts saves up to 30s past `expires_at` (clock skew grace) |
| POST | `/attempts/{id}/submit` | — | `AttemptResult` | scores synchronously, sets `status=scored` |
| GET | `/attempts/{id}/result` | — | `AttemptResult` | 409 unless `scored` |
| DELETE | `/attempts/{id}` | — | `Message` | marks `abandoned` |

**Expiry:** any read or write on an `in_progress` attempt whose `expires_at` has passed must
first auto-submit and score it (`auto_submitted=True`), then answer from the scored state.

## writing

| Method | Path | Body | Returns |
|---|---|---|---|
| PUT | `/writing/attempts/{attempt_id}/draft` | `WritingDraft` | `WritingSubmissionOut` |
| POST | `/writing/attempts/{attempt_id}/grade` | — | `list[WritingSubmissionOut]` |
| GET | `/writing/attempts/{attempt_id}` | — | `list[WritingSubmissionOut]` |

Grading is rate-limited per user per day (`settings.writing_submissions_per_day`); 429 when exceeded.

## score (public, no auth)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/score/overall` | `BandCalculatorRequest` | `BandCalculatorResponse` |
| POST | `/score/raw-to-band` | `RawToBandRequest` | `RawToBandResponse` |
| GET | `/score/table?skill=&variant=` | — | `list[{raw_min, raw_max, band}]` |

## speaking (auth)

| Method | Path | Returns |
|---|---|---|
| GET | `/speaking/questions?part=&topic=` | `Page[SpeakingQuestionOut]` |
| GET | `/speaking/questions/random?part=` | `SpeakingQuestionOut` |
| GET | `/speaking/topics` | `list[str]` |

Recordings stay in the browser (IndexedDB) in v1 — no upload endpoint.

## admin (auth + `is_admin`)

| Method | Path | Notes |
|---|---|---|
| POST | `/admin/tests/import` | import a content JSON document |
| PATCH | `/admin/tests/{id}/publish` | toggle `is_published` |
| GET | `/admin/stats` | counts of users, attempts, tests |

---

## Error shape

FastAPI default: `{"detail": "..."}`. Use `app.core.errors.NotFound/Forbidden/Conflict`.
Validation errors stay as FastAPI's 422.

## Scoring engine interface (Agent A owns; C and the frontend depend on it)

```python
# app/services/scoring/__init__.py
def check_answer(question: Question, key: AnswerKey, value: Any) -> AnswerCheck: ...
def score_attempt(db: Session, attempt: Attempt) -> AttemptResult: ...
def raw_to_band(db: Session, skill: Skill, variant: Variant, raw: int) -> float: ...
def overall_band(listening: float, reading: float, writing: float, speaking: float) -> float: ...

@dataclass(frozen=True)
class AnswerCheck:
    is_correct: bool
    reason: str | None  # "wrong" | "blank" | "spelling" | "over_word_limit" | None when correct
    matched: str | None
```
