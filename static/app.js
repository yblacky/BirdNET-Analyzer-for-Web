const state = {
        file: null,
        audioBuffer: null,
        objectUrl: null,
        audioDuration: 0,
        detections: [],
        languages: [],
        lang: "en_uk",
      };

      const el = {
        audioFile: document.getElementById("audioFile"),
        language: document.getElementById("language"),
        recordingDate: document.getElementById("recordingDate"),
        week: document.getElementById("week"),
        lat: document.getElementById("lat"),
        lon: document.getElementById("lon"),
        analyzeBtn: document.getElementById("analyzeBtn"),
        status: document.getElementById("status"),
        audioPlayer: document.getElementById("audioPlayer"),
        waveCanvas: document.getElementById("waveCanvas"),
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
      };

      const ctx = el.waveCanvas.getContext("2d");

      async function init() {
        await loadLanguages();
        bindEvents();
        updateTimeMode();
        updateGeoMode();
      }

      async function loadLanguages() {
        try {
          const res = await fetch("/api/meta/languages");
          const data = await res.json();

          state.languages = data.languages || ["en_uk"];
          state.lang = data.default || "en_uk";

          el.language.innerHTML = "";

          for (const lang of state.languages) {
            const option = document.createElement("option");
            option.value = lang;
            option.textContent = lang;
            if (lang === state.lang) option.selected = true;
            el.language.appendChild(option);
          }
        } catch {
          el.language.innerHTML = `<option value="en_uk">en_uk</option>`;
        }
      }

      function bindEvents() {
        el.audioFile.addEventListener("change", onFileSelected);
        el.analyzeBtn.addEventListener("click", analyze);
        el.audioPlayer.addEventListener("timeupdate", redrawWaveform);
        el.audioPlayer.addEventListener("seeked", redrawWaveform);

        el.timeMode.addEventListener("change", updateTimeMode);
        el.geoMode.addEventListener("change", updateGeoMode);

        el.language.addEventListener("change", () => {
          state.lang = el.language.value;
        });

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
        });

        el.fileBtn.addEventListener("click", () => {
          el.audioFile.click();
        });

        document.addEventListener("keydown", (e) => {
          if (e.code === "Space") {
            if (document.activeElement.tagName === "INPUT") return;

            e.preventDefault();

            if (el.audioPlayer.paused) {
              el.audioPlayer.play();
            } else {
              el.audioPlayer.pause();
            }
          }
        });

        el.waveCanvas.addEventListener("click", (e) => {
          if (!state.audioDuration) return;

          const rect = el.waveCanvas.getBoundingClientRect();
          const x = e.clientX - rect.left;

          const ratio = x / rect.width;
          const time = ratio * state.audioDuration;

          el.audioPlayer.currentTime = time;
        });
      }

      function updateTimeMode() {
        const mode = el.timeMode.value;

        if (mode === "none") {
          el.dateField.style.display = "none";
          el.weekField.style.display = "none";
        }

        if (mode === "date") {
          el.dateField.style.display = "block";
          el.weekField.style.display = "none";
        }

        if (mode === "week") {
          el.dateField.style.display = "none";
          el.weekField.style.display = "block";
        }
      }

      function updateGeoMode() {
        const mode = el.geoMode.value;

        if (mode === "none") {
          el.geoFields.style.display = "none";
        }

        if (mode === "manual") {
          el.geoFields.style.display = "block";
          el.lat.disabled = false;
          el.lon.disabled = false;
        }

        if (mode === "auto") {
          el.geoFields.style.display = "block";
          el.lat.disabled = true;
          el.lon.disabled = true;

          el.lat.value = "";
          el.lon.value = "";
        }
      }

      async function onFileSelected(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        state.file = file;
        el.fileName.textContent = file.name;
        state.detections = [];
        renderResults([]);

        setStatus("Loading file ...");

        if (state.objectUrl) {
          URL.revokeObjectURL(state.objectUrl);
        }

        state.objectUrl = URL.createObjectURL(file);
        el.audioPlayer.src = state.objectUrl;

        const inferredDate = inferRecordingDate(file);

        if (inferredDate) {
          el.recordingDate.value = inferredDate;
        }

        try {
          state.audioBuffer = await decodeAudio(file);
          state.audioDuration = state.audioBuffer.duration;

          drawWaveformBase();

          setStatus(
            `Loaded file: ${file.name} (${formatTime(state.audioDuration)})`,
          );
        } catch (err) {
          console.error(err);
          setStatus("Can't decode audio file.", true);
        }
      }

      function inferRecordingDate(file) {
        if (!file?.lastModified) return "";
        const date = new Date(file.lastModified);
        return toDateInputValue(date);
      }

      async function decodeAudio(file) {
        const audioCtx = new AudioContext();
        const arr = await file.arrayBuffer();
        const buffer = await audioCtx.decodeAudioData(arr.slice(0));
        await audioCtx.close();
        return buffer;
      }

      function toDateInputValue(date) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      }

      function getIsoWeek(dateString) {
        const date = new Date(dateString + "T12:00:00");
        const target = new Date(date.valueOf());

        const dayNr = (date.getDay() + 6) % 7;
        target.setDate(target.getDate() - dayNr + 3);

        const firstThursday = new Date(target.getFullYear(), 0, 4);
        const firstDayNr = (firstThursday.getDay() + 6) % 7;
        firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3);

        return 1 + Math.round((target - firstThursday) / 604800000);
      }

      async function analyze() {
        if (!state.file) {
          setStatus("Please select an audio file.", true);
          return;
        }

        // TIME VALIDATION
        if (el.timeMode.value === "date" && !el.recordingDate.value) {
          setStatus("Date is required.", true);
          el.analyzeBtn.disabled = false;
          return;
        }

        if (el.timeMode.value === "week" && !el.week.value) {
          setStatus("Calendar week is required.", true);
          el.analyzeBtn.disabled = false;
          return;
        }

        // GEO VALIDATION
        if (el.geoMode.value === "manual") {
          if (!el.lat.value || !el.lon.value) {
            setStatus("Latitude and longitude are required.", true);
            el.analyzeBtn.disabled = false;
            return;
          }
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
            setStatus("Geolocation denied or failed.", true);
            el.analyzeBtn.disabled = false;
            return;
          }
        }

        el.analyzeBtn.disabled = true;
        setStatus("Analyzing ...");

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

            if (Number.isFinite(latValue)) form.append("lat", latValue);
            if (Number.isFinite(lonValue)) form.append("lon", lonValue);
          }

          const res = await fetch("/api/analyze", {
            method: "POST",
            body: form,
          });

          const data = await res.json();

          el.rawJson.textContent = JSON.stringify(data, null, 2);

          if (!res.ok) {
            throw new Error(data.detail || "Analysis failed");
          }

          state.detections = data.detections || [];

          renderResults(state.detections);
          redrawWaveform();

          const count = state.detections.length;
          const uniqueSpecies = new Set(
            state.detections.map((d) => d.species_localized || d.species_en),
          ).size;

          el.resultsMeta.textContent = `${count} Hits · ${uniqueSpecies} Species`;

          setStatus("Analysis completet.");
        } catch (err) {
          console.error(err);
          setStatus(err.message || "Analysis failed.", true);
        } finally {
          el.analyzeBtn.disabled = false;
        }
      }

      function setStatus(message, isError = false) {
        el.status.textContent = message;
        el.status.className = isError ? "status error" : "status";
      }

      function renderResults(detections) {
        if (!detections.length) {
          el.results.innerHTML = `<div class="empty">No results.</div>`;
          return;
        }

        el.results.innerHTML = detections
          .map((d, index) => {
            const localized = escapeHtml(d.species_localized || d.species_en);
            const english = escapeHtml(d.species_en || "");
            const scientific = escapeHtml(d.scientific_name || "");
            const conf = Number(d.confidence * 100 || 0).toFixed(2);
            const start = Number(d.start || 0);
            const end = Number(d.end || 0);

            return `
<div class="result-item" data-index="${index}">
  <div class="result-main">
    <div>
      <div class="species">
        ${localized}
        ${localized !== english ? `<span class="pill">${english}</span>` : ""}
      </div>
      <div class="species-sub">${scientific}</div>
    </div>
    <div class="confidence">${conf}%</div>
  </div>
  <div class="timing">${formatTime(start)} – ${formatTime(end)}</div>
</div>`;
          })
          .join("");

        [...el.results.querySelectorAll(".result-item")].forEach((item) => {
          item.addEventListener("click", () => {
            const index = Number(item.dataset.index);
            const det = state.detections[index];

            el.audioPlayer.currentTime = det.start || 0;
            el.audioPlayer.play().catch(() => {});
            redrawWaveform();
          });
        });
      }

      function escapeHtml(str) {
        return String(str)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
      }

      function formatTime(seconds) {
        const s = Math.max(0, Number(seconds));
        const mm = Math.floor(s / 60);
        const ss = Math.floor(s % 60);
        return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
      }

      function drawWaveformBase() {
        if (!state.audioBuffer) return;

        const data = state.audioBuffer.getChannelData(0);
        const width = el.waveCanvas.width;
        const height = el.waveCanvas.height;

        const centerY = height / 2;
        const step = Math.ceil(data.length / width);

        ctx.clearRect(0, 0, width, height);

        ctx.fillStyle = "#101010";
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = "#8a8a8a";

        for (let x = 0; x < width; x++) {
          let min = 1;
          let max = -1;

          const start = x * step;
          const end = Math.min(start + step, data.length);

          for (let i = start; i < end; i++) {
            const sample = data[i];
            if (sample < min) min = sample;
            if (sample > max) max = sample;
          }

          const y = (1 + min) * centerY;
          const h = Math.max(1, (max - min) * centerY);

          ctx.fillRect(x, y, 1, h);
        }

        drawDetectionOverlay();
        drawPlayhead();
      }

      function redrawWaveform() {
        drawWaveformBase();
      }

      function drawDetectionOverlay() {
        if (!state.audioDuration) return;

        const width = el.waveCanvas.width;
        const height = el.waveCanvas.height;

        for (const d of state.detections) {
          const startX = (d.start / state.audioDuration) * width;
          const endX = (d.end / state.audioDuration) * width;

          ctx.fillStyle = "rgba(121,194,123,0.28)";
          ctx.fillRect(startX, 0, endX - startX, height);
        }
      }

      function drawPlayhead() {
        if (!state.audioDuration) return;

        const width = el.waveCanvas.width;
        const height = el.waveCanvas.height;

        const current = el.audioPlayer.currentTime;
        const x = (current / state.audioDuration) * width;

        ctx.strokeStyle = "#5ea8ff";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      init();