from pydantic import BaseModel, Field

from app.models.enums import Skill, Variant


class BandCalculatorRequest(BaseModel):
    listening: float = Field(ge=0, le=9)
    reading: float = Field(ge=0, le=9)
    writing: float = Field(ge=0, le=9)
    speaking: float = Field(ge=0, le=9)


class BandCalculatorResponse(BaseModel):
    overall: float
    average: float
    explanation: str


class RawToBandRequest(BaseModel):
    skill: Skill
    variant: Variant = Variant.ACADEMIC
    raw_score: int = Field(ge=0, le=40)


class RawToBandResponse(BaseModel):
    raw_score: int
    band: float
