"""The public /api/score endpoints from docs/api-contract.md. No auth anywhere."""

import pytest

from app.models.enums import Skill, Variant
from app.models.test import BandTable
from app.services.scoring import seed_band_tables

OVERALL = "/api/score/overall"
RAW_TO_BAND = "/api/score/raw-to-band"
TABLE = "/api/score/table"


# ------------------------------------------------------------ POST /overall


@pytest.mark.parametrize(
    ("bands", "expected"),
    [
        ((6.5, 6.5, 5.0, 7.0), 6.5),  # the worked example from plan.md §7
        ((6.0, 6.0, 6.5, 6.5), 6.5),
        ((6.5, 6.5, 7.0, 7.0), 7.0),
        ((6.0, 6.0, 6.0, 6.0), 6.0),
        ((9.0, 9.0, 9.0, 9.0), 9.0),
        ((0.0, 0.0, 0.0, 0.0), 0.0),
    ],
)
def test_overall_band_endpoint(client, bands, expected):
    listening, reading, writing, speaking = bands
    r = client.post(
        OVERALL,
        json={
            "listening": listening,
            "reading": reading,
            "writing": writing,
            "speaking": speaking,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["overall"] == expected
    assert body["average"] == pytest.approx(sum(bands) / 4)
    assert body["explanation"]


@pytest.mark.parametrize(
    ("bands", "fragment"),
    [
        ((6.5, 6.5, 5.0, 7.0), "rounds up to 6.5"),
        ((6.0, 6.0, 6.0, 6.5), "rounds down to 6"),
        ((6.0, 6.0, 6.0, 6.0), "already a valid band"),
    ],
)
def test_overall_band_explains_the_rounding(client, bands, fragment):
    listening, reading, writing, speaking = bands
    r = client.post(
        OVERALL,
        json={
            "listening": listening,
            "reading": reading,
            "writing": writing,
            "speaking": speaking,
        },
    )
    assert fragment in r.json()["explanation"]


def test_overall_band_needs_no_authentication(client):
    r = client.post(
        OVERALL,
        json={"listening": 6.0, "reading": 6.0, "writing": 6.0, "speaking": 6.0},
    )
    assert r.status_code == 200


@pytest.mark.parametrize(
    "payload",
    [
        {"listening": 10, "reading": 6, "writing": 6, "speaking": 6},  # above the scale
        {"listening": -1, "reading": 6, "writing": 6, "speaking": 6},  # below it
        {"listening": 6, "reading": 6, "writing": 6},  # missing a skill
        {"listening": "six", "reading": 6, "writing": 6, "speaking": 6},
    ],
)
def test_overall_band_rejects_invalid_input(client, payload):
    assert client.post(OVERALL, json=payload).status_code == 422


# ------------------------------------------------------- POST /raw-to-band


@pytest.mark.parametrize(
    ("skill", "variant", "raw", "band"),
    [
        (Skill.LISTENING, Variant.ACADEMIC, 40, 9.0),
        (Skill.LISTENING, Variant.ACADEMIC, 30, 7.0),
        (Skill.LISTENING, Variant.ACADEMIC, 0, 0.0),
        (Skill.READING, Variant.ACADEMIC, 30, 7.0),
        (Skill.READING, Variant.GENERAL, 30, 6.0),
        (Skill.READING, Variant.ACADEMIC, 40, 9.0),
    ],
)
def test_raw_to_band_endpoint(client, skill, variant, raw, band):
    r = client.post(
        RAW_TO_BAND,
        json={"skill": skill.value, "variant": variant.value, "raw_score": raw},
    )
    assert r.status_code == 200
    assert r.json() == {"raw_score": raw, "band": band}


def test_raw_to_band_defaults_to_the_academic_variant(client):
    r = client.post(RAW_TO_BAND, json={"skill": "reading", "raw_score": 30})
    assert r.json()["band"] == 7.0


def test_raw_to_band_reads_the_database_once_seeded(client, db):
    seed_band_tables(db)
    r = client.post(RAW_TO_BAND, json={"skill": "listening", "raw_score": 23})
    assert r.json()["band"] == 6.0


def test_raw_to_band_reflects_a_corrected_row(client, db):
    db.add(
        BandTable(
            skill=Skill.LISTENING,
            variant=Variant.ACADEMIC,
            raw_min=0,
            raw_max=40,
            band=5.0,
        )
    )
    db.commit()
    r = client.post(RAW_TO_BAND, json={"skill": "listening", "raw_score": 40})
    assert r.json()["band"] == 5.0


@pytest.mark.parametrize("skill", ["writing", "speaking"])
def test_raw_to_band_404s_for_a_skill_without_a_table(client, skill):
    r = client.post(RAW_TO_BAND, json={"skill": skill, "raw_score": 20})
    assert r.status_code == 404
    assert "not found" in r.json()["detail"]


@pytest.mark.parametrize(
    "payload",
    [
        {"skill": "reading", "raw_score": 41},
        {"skill": "reading", "raw_score": -1},
        {"skill": "singing", "raw_score": 20},
        {"skill": "reading", "variant": "hybrid", "raw_score": 20},
        {"raw_score": 20},
    ],
)
def test_raw_to_band_rejects_invalid_input(client, payload):
    assert client.post(RAW_TO_BAND, json=payload).status_code == 422


# ------------------------------------------------------------- GET /table


@pytest.mark.parametrize(
    ("skill", "variant"),
    [
        ("listening", "academic"),
        ("listening", "general"),
        ("reading", "academic"),
        ("reading", "general"),
    ],
)
def test_band_table_endpoint(client, skill, variant):
    r = client.get(TABLE, params={"skill": skill, "variant": variant})
    assert r.status_code == 200
    rows = r.json()
    assert rows[0]["raw_max"] == 40
    assert rows[0]["band"] == 9.0
    assert rows[-1]["raw_min"] == 0
    # highest raw score first, contiguous, covering 0..40
    covered = set()
    for row in rows:
        assert row["raw_min"] <= row["raw_max"]
        covered.update(range(row["raw_min"], row["raw_max"] + 1))
    assert covered == set(range(0, 41))


def test_band_table_defaults_to_academic(client):
    academic = client.get(TABLE, params={"skill": "reading", "variant": "academic"}).json()
    default = client.get(TABLE, params={"skill": "reading"}).json()
    assert default == academic


def test_band_table_serves_the_database_once_seeded(client, db):
    before = client.get(TABLE, params={"skill": "listening"}).json()
    seed_band_tables(db)
    after = client.get(TABLE, params={"skill": "listening"}).json()
    assert before == after


def test_band_table_404s_for_a_skill_without_a_table(client):
    r = client.get(TABLE, params={"skill": "writing"})
    assert r.status_code == 404


@pytest.mark.parametrize(
    "params",
    [{}, {"skill": "singing"}, {"skill": "reading", "variant": "hybrid"}],
)
def test_band_table_rejects_invalid_query(client, params):
    assert client.get(TABLE, params=params).status_code == 422


def test_score_endpoints_are_in_the_openapi_schema(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/score/overall" in paths
    assert "/api/score/raw-to-band" in paths
    assert "/api/score/table" in paths
