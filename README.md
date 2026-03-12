# BirdNET-Analyzer-for-Web

Minimal web interface for the BirdNET Analyzer.
Upload an audio file, optionally filter by **date / week** and **geolocation**, and visualize detections on a waveform.

The interface sends audio to a local BirdNET Analyzer instance and displays the results.

---

## Requirements

You need a running **BirdNET Analyzer**.

Repository:
https://github.com/birdnet-team/BirdNET-Analyzer

Follow the installation instructions there first.

Structure:

```
project/
├ birdnet-analyzer-for-web/           # This repository
└ BirdNET-Analyzer/                   # https://github.com/birdnet-team/BirdNET-Analyzer
```

Then execute: `pip install -e ../BirdNET-Analyzer`

FFmpeg must be installed and available in PATH.

---

## Labels

Bird species names come from the BirdNET label files. Put your needed language labels into the /labels directory.

Available labels:
https://github.com/georg95/birdnet-web/tree/main/models/birdnet/labels

The **en_uk.txt** label file is required due it's the default language.

---

## Features

- audio upload
- waveform visualization
- detection overlay
- species list with timestamps
- optional:
  - date / ISO week filter
  - geolocation filter
- multilingual species names

---

## API expectation

The UI expects a BirdNET Analyzer backend exposing:

- POST /api/analyze
- GET /api/meta/languages

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

Bird detection and inference are handled entirely by the Analyzer.
