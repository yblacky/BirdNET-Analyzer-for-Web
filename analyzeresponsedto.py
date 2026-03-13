from pydantic import BaseModel

class Detection(BaseModel):
    species: str
    species_code: str
    confidence: float
    start: float
    end: float
    species_localized: str | None = None
    scientific_name: str | None = None

class AnalyzeResponse(BaseModel):
    meta: dict
    detections: list[Detection]