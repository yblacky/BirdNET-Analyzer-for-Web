import csv
import inspect
import logging
import tempfile
from pathlib import Path
from typing import Any

from birdnet_analyzer.analyze import analyze

from config import settings

logger = logging.getLogger(__name__)


def analyze_audio(audio_path: str, lat=None, lon=None, week=None) -> list[dict[str, Any]]:
    with tempfile.TemporaryDirectory() as tmpdir:

        profile = settings.birdnet_params(lat, lon)

        logger.info(
            "BirdNET profile=%s",
            "geo" if lat is not None and lon is not None else "no-geo",
        )

        candidate_kwargs: dict[str, Any] = {
            "audio_input": audio_path,
            "output": tmpdir,
            "rtype": "table",

            **profile,

            "overlap": settings.overlap,
            "merge_consecutive": settings.merge_consecutive,
            "batch_size": settings.batch_size,
            "threads": settings.threads,
            "lat": lat,
            "lon": lon,
            "week": week,
            "locale": settings.locale,
        }

        supported_params = set(inspect.signature(analyze).parameters.keys())
        analyze_kwargs = {
            key: value
            for key, value in candidate_kwargs.items()
            if key in supported_params and value is not None
        }

        ignored = sorted(
            key
            for key, value in candidate_kwargs.items()
            if key not in analyze_kwargs and value is not None
        )

        logger.info("BirdNET call kwargs=%s", analyze_kwargs)
        if ignored:
            logger.info("BirdNET ignored unsupported kwargs=%s", ignored)

        analyze(**analyze_kwargs)

        files = list(Path(tmpdir).glob("*.selection.table.txt"))
        if not files:
            logger.warning("BirdNET produced no selection table for %s", audio_path)
            return []

        result_file = files[0]
        results: list[dict[str, Any]] = []

        with open(result_file, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f, delimiter="\t")

            for row in reader:

                common_name = (row.get("Common Name") or "").strip()
                species_code = (row.get("Species Code") or "").strip()
                
                confidence_raw = row.get("Confidence")
                start_raw = row.get("Begin Time (s)")
                end_raw = row.get("End Time (s)")

                if not common_name or common_name.lower() == "nocall":
                    continue

                try:
                    confidence = float(confidence_raw)
                    start = float(start_raw)
                    end = float(end_raw)
                except (TypeError, ValueError):
                    logger.debug("Skipping invalid BirdNET row: %s", row)
                    continue

                results.append(
                    {
                        "species": common_name,
                        "species_code": species_code,
                        "confidence": confidence,
                        "start": start,
                        "end": end,
                    }
                )

        logger.info("BirdNET raw detections=%s", len(results))
        merged = merge_detections(results)
        logger.info("BirdNET merged detections=%s", len(merged))
        return merged


def merge_detections(detections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not detections:
        return []

    detections = sorted(detections, key=lambda d: d["start"])
    merged = [detections[0].copy()]

    for detection in detections[1:]:
        last = merged[-1]

        same_species = (
            detection.get("species_code") == last.get("species_code")
            or detection.get("species") == last.get("species")
        )

        gap = float(detection["start"]) - float(last["end"])
        close_enough = gap <= settings.merge_gap_tolerance_seconds

        if same_species and close_enough:
            last["end"] = max(last["end"], detection["end"])
            last["confidence"] = max(last["confidence"], detection["confidence"])
        else:
            merged.append(detection.copy())

    return merged