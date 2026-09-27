"""Band conversion: raw score -> band, and four skill bands -> overall band.

The conversion tables live in the database (``band_tables``) so a wrong row can
be fixed with an UPDATE instead of a deploy. :func:`seed_band_tables` puts the
tables from :mod:`app.services.scoring.band_data` there, idempotently, and
every lookup falls back to the seed data when the table has not been seeded.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.models.enums import Skill, Variant
from app.models.test import BandTable
from app.services.scoring.band_data import (
    MAX_RAW_SCORE,
    SEED_TABLES,
    BandRow,
    band_from_rows,
    seed_rows,
)

if TYPE_CHECKING:  # pragma: no cover - typing only
    from sqlalchemy.orm import Session

__all__ = [
    "BandTableMissing",
    "band_table_rows",
    "overall_band",
    "raw_to_band",
    "seed_band_tables",
]


#: guards the .25/.75 ties against binary-float noise
_TIE_EPSILON = 1e-9


class BandTableMissing(LookupError):
    """No conversion table exists for this skill/variant (e.g. Writing)."""


def seed_band_tables(db: "Session") -> int:
    """Populate ``band_tables`` from the seed data. Idempotent.

    A row is keyed by ``(skill, variant, raw_min)``; an existing row is updated
    in place when its range or band drifts from the seed, so re-running this
    never duplicates and never silently leaves stale data behind. Returns the
    number of rows inserted or updated.
    """
    changed = 0
    for (skill, variant), rows in SEED_TABLES.items():
        existing = {
            row.raw_min: row
            for row in db.scalars(
                select(BandTable).where(BandTable.skill == skill, BandTable.variant == variant)
            )
        }
        for raw_min, raw_max, band in rows:
            current = existing.get(raw_min)
            if current is None:
                db.add(
                    BandTable(
                        skill=skill,
                        variant=variant,
                        raw_min=raw_min,
                        raw_max=raw_max,
                        band=band,
                    )
                )
                changed += 1
            elif current.raw_max != raw_max or current.band != band:
                current.raw_max = raw_max
                current.band = band
                changed += 1
    db.commit()
    return changed


def band_table_rows(db: "Session", skill: Skill, variant: Variant) -> list[BandRow]:
    """Rows for a skill/variant, highest raw score first.

    Reads the database; falls back to the seed data when the table is empty.
    Raises :class:`BandTableMissing` when neither has a table.
    """
    rows: list[BandRow] = [
        (row.raw_min, row.raw_max, float(row.band))
        for row in db.scalars(
            select(BandTable)
            .where(BandTable.skill == skill, BandTable.variant == variant)
            .order_by(BandTable.raw_min.desc())
        )
    ]
    if rows:
        return rows
    seeded = seed_rows(skill, variant)
    if seeded is None:
        raise BandTableMissing(f"no band table for {skill}/{variant}")
    return sorted(seeded, key=lambda row: row[0], reverse=True)


def raw_to_band(db: "Session", skill: Skill, variant: Variant, raw: int) -> float:
    """Convert a raw score out of 40 to an IELTS band.

    Scores outside 0..40 are clamped: a raw score can never be negative and a
    test never has more than 40 questions, so an out-of-range value is a bug
    upstream, not a reason to fail a student's result page.
    """
    clamped = max(0, min(MAX_RAW_SCORE, int(raw)))
    rows = band_table_rows(db, skill, variant)
    band = band_from_rows(rows, clamped)
    if band is None:
        raise BandTableMissing(f"band table for {skill}/{variant} has no row for raw {clamped}")
    return band


def overall_band(listening: float, reading: float, writing: float, speaking: float) -> float:
    """Average the four skill bands and apply official IELTS rounding.

    The average is rounded to the nearest half band, with a tie going **up**:
    a fraction of ``.25`` rounds up to the next half band and ``.75`` rounds up
    to the next whole band, anything else rounds to the nearer half.

        6.5 + 6.5 + 5.0 + 7.0 = 25 / 4 = 6.25 -> 6.5

    Half bands average to exact binary fractions, so the only float risk is in
    the tie itself; the epsilon keeps a ``.25`` that arrived as ``.2499999``
    rounding up where it should.
    """
    average = (listening + reading + writing + speaking) / 4
    half_bands = math.floor(average * 2 + 0.5 + _TIE_EPSILON)
    return float(max(0.0, min(9.0, half_bands / 2)))
