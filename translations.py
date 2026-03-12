from functools import lru_cache
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
LABELS_DIR = BASE_DIR / "labels"


def get_supported_languages() -> list[str]:
    if not LABELS_DIR.exists():
        return ["en_uk"]

    langs = sorted(p.stem for p in LABELS_DIR.glob("*.txt"))
    return langs or ["en_uk"]


@lru_cache(maxsize=1)
def load_english_to_scientific():

    mapper = {}

    with open(LABELS_DIR / "en_uk.txt", encoding="utf8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            scientific, english = line.split("_", 1)
            mapper[english] = scientific

    return mapper


@lru_cache(maxsize=32)
def load_language_map(lang: str):

    mapping = {}

    with open(LABELS_DIR / f"{lang}.txt", encoding="utf8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            scientific, name = line.split("_", 1)
            mapping[scientific] = name

    return mapping


def translate_detection_names(detections: list[dict], lang: str):

    english_to_scientific = load_english_to_scientific()
    lang_map = load_language_map(lang)

    localized = []

    for item in detections:

        english = item.get("species")

        scientific = english_to_scientific.get(english)

        localized_name = lang_map.get(scientific, english)

        enriched = {
            **item,
            "species_en": english,
            "species_localized": localized_name,
        }

        localized.append(enriched)

    return localized