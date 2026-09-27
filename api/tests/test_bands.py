"""Band conversion tests: every table boundary, both sides, plus official rounding.

The expected rows below are transcribed independently from plan.md §7 so that a
typo in ``band_data`` fails a test instead of quietly changing someone's band.
"""

import pytest
from sqlalchemy import select

from app.models.enums import Skill, Variant
from app.models.test import BandTable
from app.services.scoring import overall_band, raw_to_band, seed_band_tables
from app.services.scoring.band_data import (
    ACADEMIC_READING_TABLE,
    GENERAL_READING_TABLE,
    LISTENING_TABLE,
    MAX_RAW_SCORE,
    SEED_TABLES,
    band_from_rows,
    seed_rows,
)
from app.services.scoring.bands import BandTableMissing, band_table_rows

# ------------------------------------------------------ the tables in plan.md

PLAN_LISTENING = [
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
]

PLAN_ACADEMIC_READING = [
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
]


@pytest.mark.parametrize(("raw_min", "raw_max", "band"), PLAN_LISTENING)
def test_listening_table_matches_the_plan(raw_min, raw_max, band):
    assert band_from_rows(LISTENING_TABLE, raw_min) == band
    assert band_from_rows(LISTENING_TABLE, raw_max) == band


@pytest.mark.parametrize(("raw_min", "raw_max", "band"), PLAN_ACADEMIC_READING)
def test_academic_reading_table_matches_the_plan(raw_min, raw_max, band):
    assert band_from_rows(ACADEMIC_READING_TABLE, raw_min) == band
    assert band_from_rows(ACADEMIC_READING_TABLE, raw_max) == band


ALL_TABLES = [
    ("listening", LISTENING_TABLE),
    ("academic_reading", ACADEMIC_READING_TABLE),
    ("general_reading", GENERAL_READING_TABLE),
]


@pytest.mark.parametrize(("name", "table"), ALL_TABLES)
def test_every_raw_score_maps_to_exactly_one_band(name, table):
    for raw in range(0, MAX_RAW_SCORE + 1):
        matches = [row for row in table if row[0] <= raw <= row[1]]
        assert len(matches) == 1, f"{name}: raw {raw} matched {len(matches)} rows"


@pytest.mark.parametrize(("name", "table"), ALL_TABLES)
def test_table_is_ordered_and_contiguous(name, table):
    assert table[0][1] == MAX_RAW_SCORE
    assert table[-1][0] == 0
    for upper, lower in zip(table, table[1:], strict=False):
        assert upper[0] == lower[1] + 1, f"{name}: gap or overlap between {upper} and {lower}"
        assert upper[2] > lower[2], f"{name}: bands must fall as the raw score falls"


@pytest.mark.parametrize(("name", "table"), ALL_TABLES)
def test_both_sides_of_every_boundary(name, table):
    """One mark below a boundary must give a lower band, one above a higher one."""
    for raw_min, raw_max, band in table:
        assert band_from_rows(table, raw_min) == band
        assert band_from_rows(table, raw_max) == band
        if raw_min > 0:
            below = band_from_rows(table, raw_min - 1)
            assert below is not None and below < band
        if raw_max < MAX_RAW_SCORE:
            above = band_from_rows(table, raw_max + 1)
            assert above is not None and above > band


@pytest.mark.parametrize(("name", "table"), ALL_TABLES)
def test_zero_and_forty(name, table):
    assert band_from_rows(table, 0) == 0.0
    assert band_from_rows(table, MAX_RAW_SCORE) == 9.0


def test_band_from_rows_returns_none_outside_the_table():
    assert band_from_rows([(10, 20, 5.0)], 21) is None


def test_general_reading_is_harder_than_academic():
    """The same band needs more correct answers in General Training."""
    for band in (5.0, 6.0, 7.0):
        academic = min(r[0] for r in ACADEMIC_READING_TABLE if r[2] == band)
        general = min(r[0] for r in GENERAL_READING_TABLE if r[2] == band)
        assert general > academic


@pytest.mark.parametrize(
    ("skill", "variant", "expected"),
    [
        (Skill.LISTENING, Variant.ACADEMIC, LISTENING_TABLE),
        (Skill.LISTENING, Variant.GENERAL, LISTENING_TABLE),
        (Skill.READING, Variant.ACADEMIC, ACADEMIC_READING_TABLE),
        (Skill.READING, Variant.GENERAL, GENERAL_READING_TABLE),
        (Skill.WRITING, Variant.ACADEMIC, None),
        (Skill.SPEAKING, Variant.ACADEMIC, None),
    ],
)
def test_seed_rows(skill, variant, expected):
    assert seed_rows(skill, variant) == expected


# ------------------------------------------------------------------- seeding


def test_seed_band_tables_populates_the_database(db):
    inserted = seed_band_tables(db)
    expected = sum(len(rows) for rows in SEED_TABLES.values())
    assert inserted == expected
    assert db.scalar(select(BandTable).where(BandTable.raw_min == 39)) is not None


def test_seed_band_tables_is_idempotent(db):
    first = seed_band_tables(db)
    before = len(db.scalars(select(BandTable)).all())
    second = seed_band_tables(db)
    after = len(db.scalars(select(BandTable)).all())
    assert first > 0
    assert second == 0
    assert before == after


def test_seed_band_tables_repairs_a_drifted_row(db):
    seed_band_tables(db)
    row = db.scalar(
        select(BandTable).where(
            BandTable.skill == Skill.LISTENING,
            BandTable.variant == Variant.ACADEMIC,
            BandTable.raw_min == 39,
        )
    )
    row.band = 3.0
    row.raw_max = 39
    db.commit()

    changed = seed_band_tables(db)
    assert changed == 1
    db.refresh(row)
    assert row.band == 9.0
    assert row.raw_max == 40


# ---------------------------------------------------------------- raw_to_band


@pytest.mark.parametrize(
    ("skill", "variant", "raw", "band"),
    [
        (Skill.LISTENING, Variant.ACADEMIC, 40, 9.0),
        (Skill.LISTENING, Variant.ACADEMIC, 39, 9.0),
        (Skill.LISTENING, Variant.ACADEMIC, 38, 8.5),
        (Skill.LISTENING, Variant.ACADEMIC, 30, 7.0),
        (Skill.LISTENING, Variant.ACADEMIC, 29, 6.5),
        (Skill.LISTENING, Variant.ACADEMIC, 0, 0.0),
        (Skill.LISTENING, Variant.GENERAL, 30, 7.0),
        (Skill.READING, Variant.ACADEMIC, 30, 7.0),
        (Skill.READING, Variant.ACADEMIC, 29, 6.5),
        (Skill.READING, Variant.ACADEMIC, 8, 3.5),
        (Skill.READING, Variant.ACADEMIC, 40, 9.0),
        (Skill.READING, Variant.ACADEMIC, 0, 0.0),
        (Skill.READING, Variant.GENERAL, 30, 6.0),
        (Skill.READING, Variant.GENERAL, 40, 9.0),
        (Skill.READING, Variant.GENERAL, 0, 0.0),
    ],
)
def test_raw_to_band_without_seeding_uses_the_fallback(db, skill, variant, raw, band):
    assert raw_to_band(db, skill, variant, raw) == band


@pytest.mark.parametrize(
    ("skill", "variant", "raw", "band"),
    [
        (Skill.LISTENING, Variant.ACADEMIC, 40, 9.0),
        (Skill.LISTENING, Variant.ACADEMIC, 23, 6.0),
        (Skill.READING, Variant.ACADEMIC, 27, 6.5),
        (Skill.READING, Variant.GENERAL, 15, 4.0),
    ],
)
def test_raw_to_band_after_seeding_reads_the_database(db, skill, variant, raw, band):
    seed_band_tables(db)
    assert raw_to_band(db, skill, variant, raw) == band


def test_database_rows_win_over_the_seed_data(db):
    """The whole point of storing the tables as data: fix a row without a deploy."""
    db.add(
        BandTable(
            skill=Skill.LISTENING,
            variant=Variant.ACADEMIC,
            raw_min=0,
            raw_max=40,
            band=4.0,
        )
    )
    db.commit()
    assert raw_to_band(db, Skill.LISTENING, Variant.ACADEMIC, 40) == 4.0


@pytest.mark.parametrize("raw", [-5, -1, 41, 999])
def test_raw_to_band_clamps_out_of_range_scores(db, raw):
    band = raw_to_band(db, Skill.LISTENING, Variant.ACADEMIC, raw)
    assert band in (0.0, 9.0)


@pytest.mark.parametrize("skill", [Skill.WRITING, Skill.SPEAKING])
def test_raw_to_band_has_no_table_for_writing_or_speaking(db, skill):
    with pytest.raises(BandTableMissing):
        raw_to_band(db, skill, Variant.ACADEMIC, 20)


def test_raw_to_band_raises_when_the_database_table_has_a_gap(db):
    db.add(
        BandTable(
            skill=Skill.READING,
            variant=Variant.GENERAL,
            raw_min=0,
            raw_max=10,
            band=3.0,
        )
    )
    db.commit()
    with pytest.raises(BandTableMissing):
        raw_to_band(db, Skill.READING, Variant.GENERAL, 40)


def test_band_table_rows_are_ordered_high_to_low(db):
    rows = band_table_rows(db, Skill.LISTENING, Variant.ACADEMIC)
    assert rows[0][0] > rows[-1][0]
    assert rows[0] == (39, 40, 9.0)
    seed_band_tables(db)
    assert band_table_rows(db, Skill.LISTENING, Variant.ACADEMIC) == rows


def test_band_table_rows_raises_for_a_skill_without_a_table(db):
    with pytest.raises(BandTableMissing):
        band_table_rows(db, Skill.WRITING, Variant.ACADEMIC)


# --------------------------------------------------------------- overall band


@pytest.mark.parametrize(
    ("bands", "expected"),
    [
        # the worked example from plan.md §7
        ((6.5, 6.5, 5.0, 7.0), 6.5),
        # .25 rounds up to the next half band
        ((6.0, 6.0, 6.5, 6.5), 6.5),
        ((4.0, 4.0, 4.0, 5.0), 4.5),
        # .75 rounds up to the next whole band
        ((6.5, 6.5, 7.0, 7.0), 7.0),
        ((5.5, 6.0, 6.0, 6.0), 6.0),
        # .125 / .375 / .625 / .875 round to the nearer half
        ((6.0, 6.0, 6.0, 6.5), 6.0),
        ((6.0, 6.5, 6.5, 6.5), 6.5),
        ((6.5, 6.5, 6.5, 7.0), 6.5),
        ((6.5, 7.0, 7.0, 7.0), 7.0),
        # exact values pass through
        ((6.0, 6.0, 6.0, 6.0), 6.0),
        ((6.5, 6.5, 6.5, 6.5), 6.5),
        ((0.0, 0.0, 0.0, 0.0), 0.0),
        ((9.0, 9.0, 9.0, 9.0), 9.0),
        ((8.5, 9.0, 9.0, 9.0), 9.0),
        # a mixed, realistic profile
        ((5.5, 6.0, 6.5, 7.0), 6.5),
        ((4.5, 5.0, 5.0, 5.5), 5.0),
        ((7.5, 8.0, 6.5, 7.0), 7.5),
    ],
)
def test_overall_band_rounding(bands, expected):
    assert overall_band(*bands) == expected


def test_overall_band_is_order_independent():
    assert overall_band(6.5, 5.0, 7.0, 6.5) == overall_band(5.0, 6.5, 6.5, 7.0)


@pytest.mark.parametrize(
    ("bands", "expected"),
    [
        ((6.3, 6.3, 6.3, 6.3), 6.5),  # nearest half of 6.3 is 6.5
        ((6.2, 6.2, 6.2, 6.2), 6.0),
    ],
)
def test_overall_band_tolerates_non_half_inputs(bands, expected):
    assert overall_band(*bands) == expected


def test_overall_band_is_clamped_to_the_scale():
    assert overall_band(9.0, 9.0, 9.0, 9.0) <= 9.0
    assert overall_band(0.0, 0.0, 0.0, 0.0) >= 0.0
