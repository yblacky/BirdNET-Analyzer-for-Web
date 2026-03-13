# BirdNET-Analyzer-for-Web

Minimal web interface for the **BirdNET Analyzer**.
Upload an audio file, optionally filter by **date / week** and **geolocation**, and visualizing detected bird species together with their timestamps and spectrogram.

The interface sends audio to a local BirdNET Analyzer instance and displays the results in a modern browser UI.

This project does **not perform bird detection itself**.  
All inference is handled by the BirdNET Analyzer.

---

# Overview

The system consists of three layers:

```
Audio File
   │
   ▼
Web UI (upload + visualization)
   │
   ▼
FastAPI backend
   │
   ▼
BirdNET Analyzer
   │
   ▼
Detection results
```

Processing pipeline:

```
Upload
   │
FFmpeg normalization
   │
BirdNET inference
   │
Detection merging
   │
Localization of species names
   │
Result visualization
```

---

## Requirements

You need a working **BirdNET Analyzer** installation.

Repository:
https://github.com/birdnet-team/BirdNET-Analyzer

Follow the installation instructions there first.

### Recommended structure:

```
project/
├ birdnet-analyzer-for-web/               # This repository
└ BirdNET-Analyzer/                       # Official BirdNET repository
```

Install BirdNET as editable dependency:
`pip install -e ../BirdNET-Analyzer`

---

## FFmpeg

Audio conversion requires **FFmpeg**.

Install FFmpeg and ensure it is available in your PATH.

Example:
`ffmpeg -version`

---

## Labels

Bird species names come from the BirdNET label files. Place label files in the `/labels` directory.

Available labels:
https://github.com/georg95/birdnet-web/tree/main/models/birdnet/labels

The **en_uk.txt** label file is required due it's the default language.

---

# Features

### Audio analysis

- audio upload
- automatic audio conversion via FFmpeg
- BirdNET inference
- species detection with confidence score

### Visualization

- spectrogram rendering
- waveform timeline
- detection overlays
- interactive playhead

### Result display

- species list with timestamps
- localized species names
- scientific names
- confidence scores
- clickable detections

### Filtering

Optional environmental filters:

- recording date
- ISO calendar week
- geolocation (latitude / longitude)

These filters significantly improve prediction quality.

### Additional features

- Wikipedia species images
- JSON export
- CSV export
- drag & drop upload
- progress indicator

---

## BirdNET configuration

Two analysis profiles are used.

### With geolocation

When latitude and longitude are available:

```
geo_min_confidence = 0.4
geo_sensitivity = 1.3
```

This allows the model to detect weaker signals because geographic priors reduce unlikely species.

### Without geolocation

When no location data is available:

```
nogeo_min_confidence = 0.6
nogeo_sensitivity = 1.1
```

Higher confidence reduces false positives.

---

# Frontend

The frontend is a lightweight modular JavaScript application.

Main modules:

```
static/
├ app.js
├ ui.js
├ visualizer.js
├ wiki.js
├ styles.css
```

Responsibilities:

| File          | Purpose                             |
| ------------- | ----------------------------------- |
| app.js        | application bootstrap               |
| ui.js         | UI rendering and event handling     |
| visualizer.js | spectrogram and waveform rendering  |
| wiki.js       | Wikipedia species image integration |
| styles.css    | UI styling                          |

---

## Spectrogram

Audio visualization is generated in the browser.

Processing pipeline:

```
Audio Buffer
│
▼
FFT analysis
│
▼
frequency energy mapping
│
▼
canvas rendering
```

Typical parameters:

```
FFT size: 2048
hop size: 256
```

This provides a good balance between time and frequency resolution.

---

## Species images

Species images are loaded from Wikipedia using the scientific name.

Example:
`Fulica atra`

The frontend calls the Wikipedia API:
`https://en.wikipedia.org/w/api.php?action=query&prop=pageimages|pageprops&format=json&piprop=thumbnail&titles=Fulica%20atra&pithumbsize=300&redirects`

Images are cached to avoid repeated API requests.

---

## API expectation

The UI expects a backend providing the following endpoints:

- GET / # For static Website
- POST /api/analyze
- GET /api/meta/languages
- GET /api/meta/translations/{lang}
- GET /api/meta/config
- GET /api/jobs
- GET /api/jobs/{job_id}

---

## Run

Example using a simple Python server:

`uvicorn main:app --reload --port 9050`

Then open:

`http://localhost:9050`

The UI will call the BirdNET Analyzer running on the same host.

---

## Notes

This project is only a **frontend helper for BirdNET Analyzer**.

All machine learning inference and bird detection logic are handled entirely by BirdNET.
