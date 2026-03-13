export function createVisualizer({ audioElement, spectrogramCanvas, timelineCanvas }) {
  const spectCtx = spectrogramCanvas.getContext("2d");
  const timelineCtx = timelineCanvas.getContext("2d");

  const spectrogramBaseCanvas = document.createElement("canvas");
  const timelineBaseCanvas = document.createElement("canvas");

  let audioBuffer = null;
  let detections = [];
  let duration = 0;

  function resizeCanvases() {
    const spectRect = spectrogramCanvas.getBoundingClientRect();
    spectrogramCanvas.width = Math.max(300, Math.floor(spectRect.width));
    spectrogramCanvas.height = 260;

    const timelineRect = timelineCanvas.getBoundingClientRect();
    timelineCanvas.width = Math.max(300, Math.floor(timelineRect.width));
    timelineCanvas.height = 72;

    spectrogramBaseCanvas.width = spectrogramCanvas.width;
    spectrogramBaseCanvas.height = spectrogramCanvas.height;

    timelineBaseCanvas.width = timelineCanvas.width;
    timelineBaseCanvas.height = timelineCanvas.height;

    renderSpectrogramBase();
    renderTimelineBase();
    redraw();
  }

function renderSpectrogramBase() {
  const ctx = spectrogramBaseCanvas.getContext("2d");

  const width = spectrogramBaseCanvas.width;
  const height = spectrogramBaseCanvas.height;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);

  if (!audioBuffer) return;

  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  const FFT_SIZE = 2048;
  const HOP = 256;

  const MIN_DB = -85;
  const MAX_DB = -20;

  const minFreq = 800;
  const maxFreq = 12000;

  const bins = FFT_SIZE / 2;

  const hann = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  }

  const real = new Float32Array(FFT_SIZE);
  const imag = new Float32Array(FFT_SIZE);

  const frames = Math.floor((data.length - FFT_SIZE) / HOP);
  const stepX = width / frames;

  for (let frame = 0; frame < frames; frame++) {

    const start = frame * HOP;

    for (let i = 0; i < FFT_SIZE; i++) {
      real[i] = data[start + i] * hann[i];
      imag[i] = 0;
    }

    fft(real, imag);

    for (let bin = 1; bin < bins; bin++) {

      const freq = (bin * sampleRate) / FFT_SIZE;
      if (freq < minFreq || freq > maxFreq) continue;

      const mag = Math.sqrt(real[bin] * real[bin] + imag[bin] * imag[bin]);
      const db = 20 * Math.log10(mag + 1e-10);

      if (db < MIN_DB) continue;

      let norm = (db - MIN_DB) / (MAX_DB - MIN_DB);
      norm = Math.max(0, Math.min(1, norm));

      norm = Math.pow(norm, 0.6);

      const logPos =
        (Math.log(freq) - Math.log(minFreq)) /
        (Math.log(maxFreq) - Math.log(minFreq));

      const y = height - logPos * height;

      const nextFreq = ((bin + 1) * sampleRate) / FFT_SIZE;

      const logPos2 =
        (Math.log(nextFreq) - Math.log(minFreq)) /
        (Math.log(maxFreq) - Math.log(minFreq));

      const y2 = height - logPos2 * height;

      const pixelHeight = Math.max(1, y - y2);
      const pixelWidth = Math.ceil(stepX);

      ctx.fillStyle = inferno(norm);
      ctx.fillRect(frame * stepX, y, pixelWidth, pixelHeight);
    }
  }
}

  function renderTimelineBase() {
    const ctx = timelineBaseCanvas.getContext("2d");
    const width = timelineBaseCanvas.width;
    const height = timelineBaseCanvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#101010";
    ctx.fillRect(0, 0, width, height);

    if (audioBuffer) {
      const data = audioBuffer.getChannelData(0);
      const centerY = height / 2;
      const step = Math.ceil(data.length / width);

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
    }

    if (duration > 0) {
      for (const d of detections) {
        const startX = (Number(d.start || 0) / duration) * width;
        const endX = (Number(d.end || 0) / duration) * width;

        ctx.fillStyle = "rgba(121,194,123,0.28)";
        ctx.fillRect(startX, 0, Math.max(2, endX - startX), height);
      }
    }
  }

  function redrawSpectrogram() {
    const width = spectrogramCanvas.width;
    const height = spectrogramCanvas.height;

    spectCtx.clearRect(0, 0, width, height);
    spectCtx.drawImage(spectrogramBaseCanvas, 0, 0);

    drawPlayhead(spectCtx, width, height);
  }

  function redrawTimeline() {
    const width = timelineCanvas.width;
    const height = timelineCanvas.height;

    timelineCtx.clearRect(0, 0, width, height);
    timelineCtx.drawImage(timelineBaseCanvas, 0, 0);

    drawPlayhead(timelineCtx, width, height);
  }

  function drawPlayhead(ctx, width, height) {
    if (!duration) return;

    const current = audioElement.currentTime || 0;
    const x = (current / duration) * width;

    ctx.strokeStyle = "#5ea8ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  function redraw() {
    redrawSpectrogram();
    redrawTimeline();
  }

  function seekFromCanvasClick(canvas, event) {
    if (!duration) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const ratio = x / rect.width;

    audioElement.currentTime = ratio * duration;
    redraw();
  }

  spectrogramCanvas.addEventListener("click", (e) => seekFromCanvasClick(spectrogramCanvas, e));
  timelineCanvas.addEventListener("click", (e) => seekFromCanvasClick(timelineCanvas, e));

  audioElement.addEventListener("timeupdate", redraw);
  audioElement.addEventListener("seeked", redraw);
  audioElement.addEventListener("play", redraw);
  audioElement.addEventListener("pause", redraw);

  window.addEventListener("resize", resizeCanvases);

  resizeCanvases();

  return {
    setAudioBuffer(nextAudioBuffer) {
      audioBuffer = nextAudioBuffer || null;
      renderSpectrogramBase();
      renderTimelineBase();
      redraw();
    },

    setData(nextDetections, nextDuration) {
      detections = Array.isArray(nextDetections) ? nextDetections : [];
      duration = Number(nextDuration || 0);
      renderTimelineBase();
      redraw();
    },

    redraw() {
      redraw();
    },

    reset() {
      audioBuffer = null;
      detections = [];
      duration = 0;
      renderSpectrogramBase();
      renderTimelineBase();
      redraw();
    },
  };
}

function inferno(v) {

  const colormap = [
    [0,0,4],[31,12,72],[85,15,109],[136,34,106],
    [186,54,85],[227,89,51],[249,140,10],[249,201,50],[252,255,164]
  ]

  v = Math.max(0, Math.min(1, v))

  const i = Math.floor(v * (colormap.length - 1))
  const t = v * (colormap.length - 1) - i

  const c1 = colormap[i]
  const c2 = colormap[i + 1] || c1

  const r = Math.floor(c1[0] + (c2[0] - c1[0]) * t)
  const g = Math.floor(c1[1] + (c2[1] - c1[1]) * t)
  const b = Math.floor(c1[2] + (c2[2] - c1[2]) * t)

  return `rgb(${r},${g},${b})`
}

function fft(real, imag) {
  const n = real.length
  if (n <= 1) return

  const half = n / 2

  const evenReal = new Float32Array(half)
  const evenImag = new Float32Array(half)
  const oddReal = new Float32Array(half)
  const oddImag = new Float32Array(half)

  for (let i = 0; i < half; i++) {
    evenReal[i] = real[i * 2]
    evenImag[i] = imag[i * 2]
    oddReal[i] = real[i * 2 + 1]
    oddImag[i] = imag[i * 2 + 1]
  }

  fft(evenReal, evenImag)
  fft(oddReal, oddImag)

  for (let k = 0; k < half; k++) {
    const angle = (-2 * Math.PI * k) / n

    const cos = Math.cos(angle)
    const sin = Math.sin(angle)

    const tre = cos * oddReal[k] - sin * oddImag[k]
    const tim = sin * oddReal[k] + cos * oddImag[k]

    real[k] = evenReal[k] + tre
    imag[k] = evenImag[k] + tim

    real[k + half] = evenReal[k] - tre
    imag[k + half] = evenImag[k] - tim
  }
}