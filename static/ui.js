import { getSpeciesImage } from "./wiki.js";

export const el = {
  audioFile: document.getElementById("audioFile"),
  language: document.getElementById("language"),
  recordingDate: document.getElementById("recordingDate"),
  week: document.getElementById("week"),
  lat: document.getElementById("lat"),
  lon: document.getElementById("lon"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  status: document.getElementById("status"),
  audioPlayer: document.getElementById("audioPlayer"),
  results: document.getElementById("results"),
  resultsMeta: document.getElementById("resultsMeta"),
  timeMode: document.getElementById("timeMode"),
  dateField: document.getElementById("dateField"),
  weekField: document.getElementById("weekField"),
  geoMode: document.getElementById("geoMode"),
  geoFields: document.getElementById("geoFields"),
  rawJson: document.getElementById("rawJson"),
  playToggle: document.getElementById("playToggle"),
  seekBar: document.getElementById("seekBar"),
  currentTime: document.getElementById("currentTime"),
  fileBtn: document.getElementById("fileBtn"),
  fileName: document.getElementById("fileName"),
  dropZone: document.getElementById("dropZone"),
  supportedFormats: document.getElementById("supportedFormats"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  progressStage: document.getElementById("progressStage"),
  progressValue: document.getElementById("progressValue"),
  progressFill: document.getElementById("progressFill"),
  spectrogramCanvas: document.getElementById("spectrogramCanvas"),
  timelineCanvas: document.getElementById("timelineCanvas"),
  freqAxisCanvas: document.getElementById("freqAxisCanvas"),
  visualizerLoading: document.getElementById("visualizerLoading"),
  audioMeta: document.getElementById("audioMeta"),
};

export function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.className = isError ? "status error" : "status";
}

export function setProgress(progress, stage) {
  const safeProgress = Math.max(0, Math.min(100, Number(progress || 0)));
  el.progressFill.style.width = `${safeProgress}%`;
  el.progressValue.textContent = `${safeProgress}%`;
  el.progressStage.textContent = formatStage(stage);
}

export function setSupportedFormats(extensions, maxUploadMb) {
  el.supportedFormats.textContent = `Formats: ${extensions.join(", ")} · Max ${maxUploadMb} MB`;
}

export function setLanguages(languages, selected) {
  el.language.innerHTML = "";

  for (const lang of languages) {
    const option = document.createElement("option");
    option.value = lang;
    option.textContent = lang;
    option.selected = lang === selected;
    el.language.appendChild(option);
  }
}

export function updateTimeMode() {
  const mode = el.timeMode.value;
  el.dateField.classList.toggle("hidden", mode !== "date");
  el.weekField.classList.toggle("hidden", mode !== "week");
}

export function updateGeoMode() {
  const mode = el.geoMode.value;
  const isAuto = mode === "auto";

  el.geoFields.classList.toggle("hidden", mode === "none");
  el.lat.disabled = isAuto;
  el.lon.disabled = isAuto;

  if (mode === "none") {
    el.lat.value = "";
    el.lon.value = "";
  }
}

export function setVisualizerLoading(isLoading, message = "Rendering audio view...") {
  if (!el.visualizerLoading) return;

  const textEl = el.visualizerLoading.querySelector(".visualizer-loading-text");
  if (textEl) {
    textEl.textContent = message;
  }

  el.visualizerLoading.classList.toggle("hidden", !isLoading);
}

export function setAudioMeta(text = "") {
  el.audioMeta.textContent = text;
}

export async function renderResults(detections, onSelect) {
  if (!detections.length) {
    el.resultsMeta.textContent = "";
    el.results.innerHTML = `<div class="empty">No results.</div>`;
    return;
  }

  el.results.innerHTML = detections
    .map((d, index) => {
      const localized = escapeHtml(d.species_localized || d.species || "");
      const english = escapeHtml(d.species || "");
      const scientific = escapeHtml(d.scientific_name || "");
      const conf = Number((d.confidence || 0) * 100).toFixed(2);
      const start = Number(d.start || 0);
      const end = Number(d.end || 0);

      return `
        <div class="result-item" data-index="${index}">
          <div class="result-main">
            <img class="species-img" data-img="${index}" />
            <div class="result-text">
              <div class="species-row">
                <div class="species">${localized}</div>
                ${localized !== english ? `<span class="pill">${english}</span>` : ""}
              </div>
              <div class="species-sub">${scientific || "—"}</div>
            </div>

            <div class="confidence-box">
              <div class="confidence-value">${conf}%</div>
              <div class="confidence-bar">
                <div class="confidence-fill" style="width:${conf}%"></div>
              </div>
            </div>
          </div>

          <div class="timing">${formatTime(start)} – ${formatTime(end)}</div>
        </div>
      `;
    })
    .join("");

  [...el.results.querySelectorAll(".result-item")].forEach((item) => {
    item.addEventListener("click", () => {
      const index = Number(item.dataset.index);
      onSelect?.(detections[index]);
    });
  });

  for (const item of el.results.querySelectorAll(".result-item")) {
    const index = Number(item.dataset.index);
    const det = detections[index];

    const img = item.querySelector(".species-img");

    const query = det.scientific_name || det.species;

    await getSpeciesImage(query).then((url) => {
      if (url && img) {
        img.src = url;
        img.classList.add("loaded");
      }
    });
  }
}

export function setResultsMeta(filteredDetections, totalDetections) {
  const uniqueSpecies = new Set(
    filteredDetections.map(
      (d) => d.species_localized || d.species || d.scientific_name || "unknown",
    ),
  ).size;

  el.resultsMeta.textContent = `${filteredDetections.length} detections · ${uniqueSpecies} species · ${totalDetections} total`;
}

export function setRawJson(value) {
  el.rawJson.textContent = JSON.stringify(value, null, 2);
}

export function bindExportButtons(getDetections) {
  el.exportJsonBtn.addEventListener("click", () => {
    const detections = getDetections();
    const blob = new Blob([JSON.stringify(detections, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, "birdnet-results.json");
  });

  el.exportCsvBtn.addEventListener("click", () => {
    const detections = getDetections();
    const csv = toCsv(detections);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, "birdnet-results.csv");
  });
}

function toCsv(rows) {
  const headers = [
    "species_localized",
    "species",
    "scientific_name",
    "species_code",
    "confidence",
    "start",
    "end",
  ];

  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => escape(row[key])).join(",")),
  ].join("\n");
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatStage(stage) {
  switch (stage) {
    case "queued":
      return "Queued";
    case "converting":
      return "Converting Audio";
    case "analyzing":
      return "Analyzing";
    case "localizing":
      return "Localizing Labels";
    case "finished":
      return "Finished";
    case "failed":
      return "Failed";
    default:
      return "Idle";
  }
}

export function formatTime(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}