import { createJob, getAppConfig, getJob, getLanguages } from "./api.js";
import { bindFileDropAndSelect, getIsoWeek, prepareSelectedFile } from "./audio.js";
import {
  bindConfidenceLabel,
  bindExportButtons,
  el,
  formatTime,
  getConfidenceThreshold,
  renderResults,
  setAudioMeta,
  setLanguages,
  setProgress,
  setRawJson,
  setResultsMeta,
  setStatus,
  setSupportedFormats,
  setVisualizerLoading,
  updateGeoMode,
  updateTimeMode,
} from "./ui.js";
import { createVisualizer } from "./wave.js";

const state = {
  file: null,
  objectUrl: null,
  audioDuration: 0,
  detections: [],
  rawResult: null,
  pollIntervalMs: 1000,
};

const visualizer = createVisualizer({
  audioElement: el.audioPlayer,
  spectrogramCanvas: el.spectrogramCanvas,
  timelineCanvas: el.timelineCanvas,
});

async function init() {
  await loadMeta();
  bindEvents();
  updateTimeMode();
  updateGeoMode();
  setProgress(0, "idle");
  setAudioMeta("");
}

async function loadMeta() {
  const [langData, configData] = await Promise.all([getLanguages(), getAppConfig()]);

  setLanguages(langData.languages || ["en_uk"], langData.default || "en_uk");
  setSupportedFormats(configData.extensions || [], configData.upload_limit_mb || 0);
  state.pollIntervalMs = configData.poll_interval_ms || 1000;
}

function bindEvents() {
  bindFileDropAndSelect({
    fileInput: el.audioFile,
    fileBtn: el.fileBtn,
    dropZone: el.dropZone,
    onFile: handleSelectedFile,
  });

  el.analyzeBtn.addEventListener("click", analyze);
  el.timeMode.addEventListener("change", updateTimeMode);
  el.geoMode.addEventListener("change", updateGeoMode);

  el.playToggle.addEventListener("click", () => {
    if (el.audioPlayer.paused) {
      el.audioPlayer.play();
    } else {
      el.audioPlayer.pause();
    }
  });

  el.audioPlayer.addEventListener("play", () => {
    el.playToggle.textContent = "❚❚";
  });

  el.audioPlayer.addEventListener("pause", () => {
    el.playToggle.textContent = "▶";
  });

  el.audioPlayer.addEventListener("timeupdate", () => {
    const t = el.audioPlayer.currentTime;
    const d = el.audioPlayer.duration || 1;
    el.seekBar.value = (t / d) * 100;
    el.currentTime.textContent = formatTime(t);
  });

  el.seekBar.addEventListener("input", () => {
    const d = el.audioPlayer.duration || 1;
    el.audioPlayer.currentTime = (el.seekBar.value / 100) * d;
    visualizer.redrawTimeline();
  });

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space") return;

    const tag = document.activeElement?.tagName;
    if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag)) return;

    e.preventDefault();

    if (el.audioPlayer.paused) {
      el.audioPlayer.play();
    } else {
      el.audioPlayer.pause();
    }
  });

  bindConfidenceLabel(applyFilters);
  bindExportButtons(() => getFilteredDetections());
}

async function handleSelectedFile(file) {
  state.file = file;
  state.detections = [];
  state.rawResult = null;
  el.fileName.textContent = file.name;

  setStatus("Loading audio file...");
  setRawJson({});
  renderResults([], onDetectionSelect);
  setResultsMeta([], 0);
  setProgress(0, "idle");
  setAudioMeta("");
  setVisualizerLoading(true, "Decoding and rendering audio...");

  try {
    const prepared = await prepareSelectedFile(file, el.audioPlayer, state.objectUrl);
    state.objectUrl = prepared.objectUrl;
    state.audioDuration = prepared.duration;

    if (prepared.inferredDate) {
      el.recordingDate.value = prepared.inferredDate;
    }

    visualizer.setAudioBuffer(prepared.audioBuffer);
    visualizer.setData([], state.audioDuration);

    setAudioMeta(`${formatTime(state.audioDuration)} · ${file.name}`);
    setStatus(`Loaded file: ${file.name}`);
  } catch (err) {
    console.error(err);
    visualizer.reset();
    setStatus("Unable to decode audio file.", true);
  } finally {
    setVisualizerLoading(false);
  }
}

async function analyze() {
  if (!state.file) {
    setStatus("Please select an audio file.", true);
    return;
  }

  if (el.timeMode.value === "date" && !el.recordingDate.value) {
    setStatus("Recording date is required.", true);
    return;
  }

  if (el.timeMode.value === "week" && !el.week.value) {
    setStatus("Calendar week is required.", true);
    return;
  }

  if (el.geoMode.value === "manual" && (!el.lat.value || !el.lon.value)) {
    setStatus("Latitude and longitude are required.", true);
    return;
  }

  if (el.geoMode.value === "auto") {
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      el.lat.value = pos.coords.latitude.toFixed(6);
      el.lon.value = pos.coords.longitude.toFixed(6);
    } catch {
      setStatus("Geolocation access failed or was denied.", true);
      return;
    }
  }

  el.analyzeBtn.disabled = true;
  setStatus("Uploading file and starting analysis...");
  setProgress(5, "queued");

  try {
    const form = new FormData();
    form.append("file", state.file);
    form.append("lang", el.language.value);

    let weekValue = null;

    if (el.timeMode.value === "date" && el.recordingDate.value) {
      weekValue = getIsoWeek(el.recordingDate.value);
    }

    if (el.timeMode.value === "week" && el.week.value) {
      weekValue = Number(el.week.value);
    }

    if (Number.isFinite(weekValue)) {
      form.append("week", String(weekValue));
    }

    if (el.geoMode.value !== "none") {
      const latValue = Number(el.lat.value);
      const lonValue = Number(el.lon.value);

      if (Number.isFinite(latValue)) form.append("lat", String(latValue));
      if (Number.isFinite(lonValue)) form.append("lon", String(lonValue));
    }

    const { job_id } = await createJob(form);
    setStatus("Analysis in progress...");
    await pollJob(job_id);
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Analysis failed.", true);
    setProgress(100, "failed");
  } finally {
    el.analyzeBtn.disabled = false;
  }
}

async function pollJob(jobId) {
  while (true) {
    const job = await getJob(jobId);
    setProgress(job.progress, job.stage);

    if (job.status === "done") {
      state.rawResult = job.result;
      state.detections = job.result?.detections || [];
      setRawJson(job);
      applyFilters();
      visualizer.setData(getFilteredDetections(), state.audioDuration);
      setStatus("Analysis completed.");
      return;
    }

    if (job.status === "error") {
      setRawJson(job);
      throw new Error(job.error || "Analysis failed");
    }

    await sleep(state.pollIntervalMs);
  }
}

function getFilteredDetections() {
  const threshold = getConfidenceThreshold();
  return state.detections.filter((d) => Number(d.confidence || 0) >= threshold);
}

function applyFilters() {
  const filtered = getFilteredDetections();
  renderResults(filtered, onDetectionSelect);
  setResultsMeta(filtered, state.detections.length);
  visualizer.setData(filtered, state.audioDuration);
}

function onDetectionSelect(det) {
  el.audioPlayer.currentTime = Number(det.start || 0);
  el.audioPlayer.play().catch(() => {});
  visualizer.redrawTimeline();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

init().catch((err) => {
  console.error(err);
  setStatus(err.message || "Initialization failed.", true);
});