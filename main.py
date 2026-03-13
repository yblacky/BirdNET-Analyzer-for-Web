import asyncio
import logging
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from analyzeresponsedto import AnalyzeMeta, AnalyzeResponse, JobCreatedResponse, JobStatusResponse
from birdnet_engine import analyze_audio
from config import settings
from translations import (
    get_supported_languages,
    load_language_map,
    translate_detection_names,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)

logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
SUPPORTED_EXT = set(settings.allowed_extensions)

JOBS: dict[str, dict] = {}


def ensure_ffmpeg() -> None:
    if shutil.which(settings.ffmpeg_binary) is None:
        raise RuntimeError(f"{settings.ffmpeg_binary} is not installed or not found in PATH")


def convert_audio(input_path: Path, output_path: Path):
    logger.info("Converting audio %s -> %s", input_path.name, output_path.name)

    result = subprocess.run(
        [
            settings.ffmpeg_binary,
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(input_path),
            "-vn",
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
        logger.error("ffmpeg failed: %s", result.stderr.strip())
        raise RuntimeError(f"ffmpeg failed: {result.stderr.strip()}")

    logger.info("Audio conversion finished")

async def save_upload_file(upload_file: UploadFile, destination: Path) -> int:
    size = 0

    with open(destination, "wb") as f:
        while True:
            chunk = await upload_file.read(1024 * 1024)
            if not chunk:
                break

            size += len(chunk)
            if size > settings.max_upload_size_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=f"Upload too large. Max {settings.max_upload_size_mb} MB",
                )

            f.write(chunk)

    await upload_file.close()
    return size


def validate_inputs(
    file_name: str | None,
    lat: float | None,
    lon: float | None,
    week: int | None,
    lang: str,
) -> str:
    suffix = Path(file_name or "").suffix.lower()

    if suffix not in SUPPORTED_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format. Allowed: {', '.join(sorted(SUPPORTED_EXT))}",
        )

    if week is not None and not (1 <= week <= 53):
        raise HTTPException(status_code=400, detail="week must be between 1 and 53")

    if lang not in get_supported_languages():
        raise HTTPException(status_code=400, detail=f"Language '{lang}' not supported")

    if lat is not None and not (-90 <= lat <= 90):
        raise HTTPException(status_code=400, detail="lat must be between -90 and 90")

    if lon is not None and not (-180 <= lon <= 180):
        raise HTTPException(status_code=400, detail="lon must be between -180 and 180")

    return suffix


def update_job(job_id: str, **changes) -> None:
    JOBS[job_id].update(changes)
    logger.info("Job %s update: %s", job_id, changes)


async def process_job(
    job_id: str,
    job_dir: Path,
    input_file: Path,
    original_filename: str | None,
    lat: float | None,
    lon: float | None,
    week: int | None,
    lang: str,
) -> None:
    started = time.perf_counter()
    wav_file = job_dir / "audio.wav"

    try:
        update_job(job_id, status="processing", stage="converting", progress=15)
        await run_in_threadpool(convert_audio, input_file, wav_file)

        update_job(job_id, stage="analyzing", progress=45)
        detections = await run_in_threadpool(
            analyze_audio,
            str(wav_file),
            lat,
            lon,
            week,
        )

        update_job(job_id, stage="localizing", progress=85)
        localized = await run_in_threadpool(translate_detection_names, detections, lang)

        result = AnalyzeResponse(
            meta=AnalyzeMeta(
                filename=original_filename,
                lat=lat,
                lon=lon,
                week=week,
                lang=lang,
            ),
            detections=localized,
        )

        duration = time.perf_counter() - started
        logger.info("Job %s finished in %.2fs with %s detections", job_id, duration, len(localized))

        update_job(
            job_id,
            status="done",
            stage="finished",
            progress=100,
            result=result.model_dump(),
            error=None,
        )
    except Exception as exc:
        logger.exception("Job %s failed", job_id)
        update_job(
            job_id,
            status="error",
            stage="failed",
            progress=100,
            error=str(exc),
        )
    finally:
        shutil.rmtree(job_dir, ignore_errors=True)


@app.on_event("startup")
async def startup() -> None:
    ensure_ffmpeg()
    logger.info("App started")
    logger.info("Supported extensions: %s", sorted(SUPPORTED_EXT))
    logger.info(
        "BirdNET config: overlap=%s merge_consecutive=%s batch_size=%s threads=%s",
        settings.overlap,
        settings.merge_consecutive,
        settings.batch_size,
        settings.threads,
    )


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/api/meta/languages")
async def api_languages():
    return {
        "languages": get_supported_languages(),
        "default": settings.default_language,
    }


@app.get("/api/meta/config")
async def api_config():
    return {
        "extensions": sorted(SUPPORTED_EXT),
        "upload_limit_mb": settings.max_upload_size_mb,
        "poll_interval_ms": settings.poll_interval_ms,
        "default_language": settings.default_language,
    }


@app.get("/api/meta/translations/{lang}")
async def api_translations(lang: str):
    try:
        translation_map = load_language_map(lang)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Language '{lang}' not found")

    return {
        "lang": lang,
        "count": len(translation_map),
        "translations": translation_map,
    }


@app.post("/api/jobs", response_model=JobCreatedResponse)
async def create_job(
    file: UploadFile = File(...),
    lat: float | None = Form(None),
    lon: float | None = Form(None),
    week: int | None = Form(None),
    lang: str = Form(settings.default_language),
):
    suffix = validate_inputs(file.filename, lat, lon, week, lang)

    job_id = uuid4().hex
    job_dir = Path(tempfile.mkdtemp(prefix=f"birdnet_{job_id}_"))
    input_file = job_dir / f"upload{suffix}"

    logger.info(
        "Creating job %s for file=%s lang=%s lat=%s lon=%s week=%s",
        job_id,
        file.filename,
        lang,
        lat,
        lon,
        week,
    )

    saved_size = await save_upload_file(file, input_file)
    logger.info("Job %s upload saved (%s bytes)", job_id, saved_size)

    JOBS[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "stage": "queued",
        "progress": 5,
        "result": None,
        "error": None,
    }

    asyncio.create_task(
        process_job(
            job_id=job_id,
            job_dir=job_dir,
            input_file=input_file,
            original_filename=file.filename,
            lat=lat,
            lon=lon,
            week=week,
            lang=lang,
        )
    )

    return {"job_id": job_id}


@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job