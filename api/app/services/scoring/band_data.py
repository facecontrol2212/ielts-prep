"""Raw score -> band conversion tables (plan.md §7).

These are the **seed** tables. At runtime the conversion reads the
``band_tables`` table in the database so a correction never needs a deploy;
this module is what seeds it, and what the engine falls back to when the table
has not been seeded yet (fresh dev DB, tests, the public band calculator).

Rows in plan.md §7 stop at band 4.0 (Listening) / 3.5 (Academic Reading). The
rows below that are the usual published continuation and are marked
``indicative`` -- they must be verified against official Cambridge material
and recorded in ``docs/band-tables.md`` before launch.

Invariant enforced by the tests: for every table the ranges are contiguous,
non-overlapping and cover every raw score from 0 to 40.
"""

from __future__ import annotations

from app.models.enums import Skill, Variant

__all__ = [
    "ACADEMIC_READING_TABLE",
    "GENERAL_READING_TABLE",
    "LISTENING_TABLE",
    "MAX_RAW_SCORE",
    "SEED_TABLES",
    "band_from_rows",
    "seed_rows",
]

#: (raw_min, raw_max, band), inclusive on both ends.
BandRow = tuple[int, int, float]

MAX_RAW_SCORE = 40

LISTENING_TABLE: tuple[BandRow, ...] = (
    (39, 40, 9.0),
    (37, 38, 8.5),
    (35, 36, 8.0),
    (32, 34, 7.5),
    (30, 31, 7.0),
    (26, 29, 6.5),
    (23, 25, 6.0),
    (18, 22, 5.5),
    (16, 17, 5.0),
    (13, 15, 4.5),
    (11, 12, 4.0),
    # indicative continuation below the plan's table
    (8, 10, 3.5),
    (6, 7, 3.0),
    (4, 5, 2.5),
    (3, 3, 2.0),
    (2, 2, 1.5),
    (1, 1, 1.0),
    (0, 0, 0.0),
)

ACADEMIC_READING_TABLE: tuple[BandRow, ...] = (
    (39, 40, 9.0),
    (37, 38, 8.5),
    (35, 36, 8.0),
    (33, 34, 7.5),
    (30, 32, 7.0),
    (27, 29, 6.5),
    (23, 26, 6.0),
    (19, 22, 5.5),
    (15, 18, 5.0),
    (13, 14, 4.5),
    (10, 12, 4.0),
    (8, 9, 3.5),
    # indicative continuation below the plan's table
    (6, 7, 3.0),
    (4, 5, 2.5),
    (3, 3, 2.0),
    (2, 2, 1.5),
    (1, 1, 1.0),
    (0, 0, 0.0),
)

#: General Training reading is marked harder: the same band needs more answers.
#: Transcribed from docs/band-tables.md, which is the record of record for these rows.
GENERAL_READING_TABLE: tuple[BandRow, ...] = (
    (40, 40, 9.0),
    (39, 39, 8.5),
    (37, 38, 8.0),
    (36, 36, 7.5),
    (34, 35, 7.0),
    (32, 33, 6.5),
    (30, 31, 6.0),
    (27, 29, 5.5),
    (23, 26, 5.0),
    (19, 22, 4.5),
    (15, 18, 4.0),
    (12, 14, 3.5),
    (9, 11, 3.0),
    (6, 8, 2.5),
    (3, 5, 2.0),
    (1, 2, 1.0),
    (0, 0, 0.0),
)

#: Listening uses one table for both variants; reading does not.
SEED_TABLES: dict[tuple[Skill, Variant], tuple[BandRow, ...]] = {
    (Skill.LISTENING, Variant.ACADEMIC): LISTENING_TABLE,
    (Skill.LISTENING, Variant.GENERAL): LISTENING_TABLE,
    (Skill.READING, Variant.ACADEMIC): ACADEMIC_READING_TABLE,
    (Skill.READING, Variant.GENERAL): GENERAL_READING_TABLE,
}


def seed_rows(skill: Skill, variant: Variant) -> tuple[BandRow, ...] | None:
    """Seed rows for a skill/variant pair, or ``None`` when there is no table.

    Writing and Speaking are not marked out of 40, so they have no table.
    """
    return SEED_TABLES.get((Skill(skill), Variant(variant)))


def band_from_rows(rows: tuple[BandRow, ...] | list[BandRow], raw: int) -> float | None:
    """Find the band whose raw range contains ``raw``; ``None`` if no row does."""
    for raw_min, raw_max, band in rows:
        if raw_min <= raw <= raw_max:
            return float(band)
    return None
