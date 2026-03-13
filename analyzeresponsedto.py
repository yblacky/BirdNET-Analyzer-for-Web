from typing import Literal
from pydantic import BaseModel, Field


class AnalyzeMeta(BaseModel):
    filename: str | None = None
    lat: float | None = None
    lon: float | None = None
    week: int | None = None
    lang: str


class Detection(BaseModel):
    species: str
    species_code: str
    confidence: float
    start: float
    end: float
    species_localized: str | None = None
    scientific_name: str | None = None


class AnalyzeResponse(BaseModel):
    meta: AnalyzeMeta
    detections: list[Detection] = Field(default_factory=list)


class JobCreatedResponse(BaseModel):
    job_id: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: Literal["queued", "processing", "done", "error"]
    stage: str
    progress: int
    result: AnalyzeResponse | None = None
    error: str | None = None