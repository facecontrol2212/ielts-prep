"""score routes. See docs/api-contract.md for the endpoints this module owns.

Public: no authentication. Nothing here touches an attempt or an answer key —
these are the band calculator and the published conversion tables.
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.api.deps import DbSession
from app.core.errors import NotFound
from app.models.enums import Skill, Variant
from app.schemas.score import (
    BandCalculatorRequest,
    BandCalculatorResponse,
    RawToBandRequest,
    RawToBandResponse,
)
from app.services.scoring.bands import BandTableMissing, band_table_rows, overall_band, raw_to_band

router = APIRouter()


class BandTableRowOut(BaseModel):
    """One row of a published raw-score -> band table."""

    raw_min: int
    raw_max: int
    band: float


def _format_band(value: float) -> str:
    return f"{value:g}" if value % 1 else f"{value:.1f}"


@router.post("/overall", response_model=BandCalculatorResponse)
def calculate_overall(payload: BandCalculatorRequest) -> BandCalculatorResponse:
    """Four skill bands -> overall band, with official IELTS rounding."""
    average = (payload.listening + payload.reading + payload.writing + payload.speaking) / 4
    overall = overall_band(payload.listening, payload.reading, payload.writing, payload.speaking)
    parts = ", ".join(
        _format_band(v)
        for v in (payload.listening, payload.reading, payload.writing, payload.speaking)
    )
    if overall > average:
        movement = f"rounds up to {_format_band(overall)}"
    elif overall < average:
        movement = f"rounds down to {_format_band(overall)}"
    else:
        movement = f"is already a valid band: {_format_band(overall)}"
    explanation = f"The average of {parts} is {average:g}, which {movement}."
    return BandCalculatorResponse(overall=overall, average=average, explanation=explanation)


@router.post("/raw-to-band", response_model=RawToBandResponse)
def convert_raw_to_band(payload: RawToBandRequest, db: DbSession) -> RawToBandResponse:
    """Raw score out of 40 -> band, for Listening or Reading."""
    try:
        band = raw_to_band(db, payload.skill, payload.variant, payload.raw_score)
    except BandTableMissing as exc:
        raise NotFound(f"Band table for {payload.skill}/{payload.variant}") from exc
    return RawToBandResponse(raw_score=payload.raw_score, band=band)


@router.get("/table", response_model=list[BandTableRowOut])
def get_band_table(
    db: DbSession,
    skill: Skill = Query(..., description="listening or reading"),
    variant: Variant = Query(Variant.ACADEMIC),
) -> list[BandTableRowOut]:
    """The published conversion table, highest raw score first."""
    try:
        rows = band_table_rows(db, skill, variant)
    except BandTableMissing as exc:
        raise NotFound(f"Band table for {skill}/{variant}") from exc
    return [
        BandTableRowOut(raw_min=raw_min, raw_max=raw_max, band=band)
        for raw_min, raw_max, band in rows
    ]
