"""users routes. See docs/api-contract.md for the endpoints this module owns.

Every endpoint here is scoped to the caller: there is no path parameter for a user
id, so one account can never address another's data.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import Row, func, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbSession
from app.models.attempt import Attempt
from app.models.enums import AttemptStatus, Skill
from app.models.test import Test
from app.models.user import User
from app.schemas.attempt import AttemptHistoryItem, DashboardStats, TypeScore
from app.schemas.auth import UserOut, UserUpdate
from app.schemas.common import Page

router = APIRouter()

#: How many of the worst-performing question types /users/me/stats reports.
WEAKEST_TYPE_LIMIT = 5


@router.get("/me", response_model=UserOut)
def read_me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_me(data: UserUpdate, user: CurrentUser, db: DbSession) -> User:
    """Partial update. Fields the client did not send are left untouched.

    ``exclude_unset`` is what makes this a PATCH rather than a PUT: sending
    ``{"full_name": null}`` clears the name, sending ``{}`` changes nothing.
    """
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


# ------------------------------------------------------------------ helpers


def _attempt_dt(attempt: Attempt) -> datetime:
    """Best available "when did this happen" stamp, always timezone-aware.

    SQLite returns naive datetimes even for ``DateTime(timezone=True)`` columns,
    so everything is normalised to UTC before it is compared or formatted.
    """
    raw = attempt.scored_at or attempt.submitted_at or attempt.started_at or attempt.created_at
    if raw is None:  # pragma: no cover - all four are effectively never null
        return datetime.now(UTC)
    return raw if raw.tzinfo is not None else raw.replace(tzinfo=UTC)


def _streak_days(days: Iterable[date], today: date) -> int:
    """Consecutive calendar days with activity, ending today or yesterday.

    A streak that ended two or more days ago is over and counts as 0. Allowing
    "yesterday" means the counter does not reset at midnight before the user has
    had a chance to practise.
    """
    active = set(days)
    if not active:
        return 0
    cursor = today if today in active else today - timedelta(days=1)
    if cursor not in active:
        return 0
    streak = 0
    while cursor in active:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _iter_type_rows(breakdown: Any) -> Iterable[tuple[str, int, int]]:
    """Yield ``(type, correct, total)`` from whatever shape a breakdown has.

    The breakdown JSON is written by the scoring engine, which this module does not
    own, so every access is defensive: an unexpected shape yields nothing rather
    than turning the dashboard into a 500.
    """
    if isinstance(breakdown, dict):
        source = breakdown.get("by_type", breakdown.get("types"))
    elif isinstance(breakdown, list):
        source = breakdown
    else:
        return

    if isinstance(source, dict):
        source = [
            {"type": key, **value} if isinstance(value, dict) else {"type": key, "correct": value}
            for key, value in source.items()
        ]
    if not isinstance(source, list):
        return

    for entry in source:
        if not isinstance(entry, dict):
            continue
        name = entry.get("type") or entry.get("question_type") or entry.get("name")
        if not isinstance(name, str):
            continue
        try:
            correct = int(entry.get("correct", 0) or 0)
            total = int(entry.get("total", 0) or 0)
        except (TypeError, ValueError):
            continue
        if total > 0:
            yield name, max(correct, 0), total


def _weakest_types(attempts: Sequence[Attempt]) -> list[TypeScore]:
    totals: dict[str, list[int]] = {}
    for attempt in attempts:
        try:
            rows = list(_iter_type_rows(attempt.breakdown))
        except Exception:  # pragma: no cover - belt and braces around foreign JSON
            continue
        for name, correct, total in rows:
            bucket = totals.setdefault(name, [0, 0])
            bucket[0] += correct
            bucket[1] += total

    scored = [
        TypeScore(type=name, correct=correct, total=total)
        for name, (correct, total) in totals.items()
    ]
    scored.sort(key=lambda t: (t.correct / t.total, -t.total, t.type))
    return scored[:WEAKEST_TYPE_LIMIT]


def _user_attempt_rows(db: Session, user: User, skill: Skill | None = None) -> Sequence[Row[Any]]:
    stmt = (
        select(Attempt, Test.skill, Test.title)
        .join(Test, Test.id == Attempt.test_id)
        .where(Attempt.user_id == user.id)
    )
    if skill is not None:
        stmt = stmt.where(Test.skill == skill)
    return db.execute(stmt).all()


# ------------------------------------------------------------------ endpoints


@router.get("/me/stats", response_model=DashboardStats)
def read_my_stats(user: CurrentUser, db: DbSession) -> DashboardStats:
    """Dashboard numbers, derived entirely from this user's attempts.

    A brand-new account gets zeros and empty collections, never an error.
    """
    rows = _user_attempt_rows(db, user)

    scored: list[tuple[Attempt, str]] = [
        (attempt, str(skill))
        for attempt, skill, _title in rows
        if attempt.status == AttemptStatus.SCORED
    ]
    scored.sort(key=lambda pair: _attempt_dt(pair[0]))  # oldest first

    best_band: dict[str, float] = {}
    latest_band: dict[str, float] = {}
    band_history: list[dict[str, Any]] = []

    for attempt, skill in scored:
        if attempt.band is None:
            continue
        band = float(attempt.band)
        when = _attempt_dt(attempt)
        band_history.append({"date": when.date().isoformat(), "skill": skill, "band": band})
        best_band[skill] = max(best_band.get(skill, band), band)
        latest_band[skill] = band  # scored is oldest-first, so the last write wins

    return DashboardStats(
        attempts_total=len(rows),
        tests_completed=len(scored),
        current_streak_days=_streak_days(
            (_attempt_dt(attempt).date() for attempt, _ in scored),
            datetime.now(UTC).date(),
        ),
        best_band=best_band,
        latest_band=latest_band,
        band_history=band_history,
        weakest_types=_weakest_types([attempt for attempt, _ in scored]),
    )


@router.get("/me/attempts", response_model=Page[AttemptHistoryItem])
def list_my_attempts(
    user: CurrentUser,
    db: DbSession,
    skill: Skill | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[AttemptHistoryItem]:
    """The user's attempt history, newest first, optionally filtered by skill."""
    filters = [Attempt.user_id == user.id]
    if skill is not None:
        filters.append(Test.skill == skill)

    total = (
        db.scalar(
            select(func.count())
            .select_from(Attempt)
            .join(Test, Test.id == Attempt.test_id)
            .where(*filters)
        )
        or 0
    )

    rows = db.execute(
        select(Attempt, Test.skill, Test.title)
        .join(Test, Test.id == Attempt.test_id)
        .where(*filters)
        .order_by(Attempt.started_at.desc(), Attempt.created_at.desc(), Attempt.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    items = [
        AttemptHistoryItem(
            id=attempt.id,
            test_id=attempt.test_id,
            test_title=title,
            skill=skill_value,
            status=attempt.status,
            band=attempt.band,
            raw_score=attempt.raw_score,
            submitted_at=attempt.submitted_at,
        )
        for attempt, skill_value, title in rows
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)
