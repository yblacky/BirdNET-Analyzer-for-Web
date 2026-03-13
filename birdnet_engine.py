import tempfile
from pathlib import Path
import csv
from typing import Any

from birdnet_analyzer.analyze import analyze


def analyze_audio(audio_path: str, lat=None, lon=None, week=None):

    with tempfile.TemporaryDirectory() as tmpdir:

        kwargs = {}

        if lat is not None:
            kwargs["lat"] = lat
        if lon is not None:
            kwargs["lon"] = lon
        if week is not None:
            kwargs["week"] = week

        analyze(
            audio_input=audio_path,
            output=tmpdir,

            **kwargs,

            min_conf=0.5, # Adjust this threshold as needed

            merge_consecutive=True,
            rtype="table"
        )

        files = list(Path(tmpdir).glob("*.selection.table.txt"))
        
        if not files:
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

        return merge_detections(results)


def merge_detections(detections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not detections:
        return []

    detections = sorted(detections, key=lambda d: d["start"])
    merged = [detections[0].copy()]

    for detection in detections[1:]:
        last = merged[-1]

        same_species = detection["species"] == last["species"]

        gap_tolerance = 1.0  # seconds
        close_enough = abs(detection["start"] - last["end"]) <= gap_tolerance

        if same_species and close_enough:
            last["end"] = detection["end"]
            last["confidence"] = max(last["confidence"], detection["confidence"])
        else:
            merged.append(detection.copy())

    return merged