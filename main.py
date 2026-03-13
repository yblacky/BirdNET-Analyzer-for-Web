from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import tempfile
from pathlib import Path
import logging
import subprocess
import shutil

from analyzeresponsedto import AnalyzeResponse
from birdnet_engine import analyze_audio
from translations import (
    get_supported_languages,
    load_language_map,
    translate_detection_names,
)

logger = logging.getLogger(__name__)

app = FastAPI(title="BirdNET Local Web UI")

# Change in production: Restrict origins to trusted domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

SUPPORTED_EXT = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"}


def ensure_ffmpeg():
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is not installed or not found in PATH")


def convert_audio(input_path: Path, output_path: Path):
    result = subprocess.run(
        [
            "ffmpeg",
            "-i",
            str(input_path),
            "-ar",
            "48000",
            "-ac",
            "1",
            "-y",
            str(output_path),
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr.strip()}")

@app.on_event("startup")
async def startup():
    ensure_ffmpeg()


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/api/meta/languages")
async def api_languages():
    return {
        "languages": get_supported_languages(),
        "default": "en_uk",
    }

@app.get("/api/meta/translations/{lang}")
async def api_translations(lang: str):
    try:
        translation_map = load_language_map(lang)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Language '{lang}' not found"
        )

    return {
        "lang": lang,
        "count": len(translation_map),
        "translations": translation_map,
    }


@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(
    file: UploadFile = File(...),
    lat: float | None = Form(None),
    lon: float | None = Form(None),
    week: int | None = Form(None),
    lang: str = Form("en_uk"),
):
    logger.info("Analyzing file %s with lang=%s lat=%s lon=%s week=%s", file.filename, lang, lat, lon, week)
    suffix = Path(file.filename or "").suffix.lower()

    if suffix not in SUPPORTED_EXT:
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    if week is not None and not (1 <= week <= 53):
        raise HTTPException(status_code=400, detail="week must be between 1 and 53")
    
    if lang not in get_supported_languages():
        raise HTTPException(400, f"Language '{lang}' not supported")

    if lat is not None and not (-90 <= lat <= 90):
        raise HTTPException(status_code=400, detail="lat must be between -90 and 90")

    if lon is not None and not (-180 <= lon <= 180):
        raise HTTPException(status_code=400, detail="lon must be between -180 and 180")

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)

        input_file = tmpdir_path / f"upload{suffix}"
        wav_file = tmpdir_path / "audio.wav"

        with open(input_file, "wb") as f:
            f.write(await file.read())

        try:
            convert_audio(input_file, wav_file)
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        try:
            detections = await run_in_threadpool(
                analyze_audio,
                str(wav_file),
                lat,
                lon,
                week,
            )
        except Exception as exc:
            logger.exception("BirdNET analyze failed")
            raise HTTPException(status_code=500, detail=f"BirdNET analyze failed: {exc}") from exc

        localized = translate_detection_names(detections, lang)

        return {
            "meta": {
                "filename": file.filename,
                "lat": lat,
                "lon": lon,
                "week": week,
                "lang": lang,
            },
            "detections": localized,
        }