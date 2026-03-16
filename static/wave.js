import { inferno, turbo, viridis, magma } from "./js-colormaps.js";

function colormap(v) {
  return inferno(v);
}

export function createVisualizer({ audioElement, spectrogramCanvas, timelineCanvas }) {

  const spectCtx = spectrogramCanvas.getContext("2d");
  const timelineCtx = timelineCanvas.getContext("2d");

  const spectrogramBaseCanvas = document.createElement("canvas");
  const timelineBaseCanvas = document.createElement("canvas");

  let audioBuffer = null;
  let detections = [];
  let duration = 0;

  const FFT_SIZE = 2048;
  const HOP = 256;
  const BINS = FFT_SIZE / 2;

  const MIN_FREQ = 150;
  const MAX_FREQ = 12000;

  const hann = new Float32Array(FFT_SIZE);
  const real = new Float32Array(FFT_SIZE);
  const imag = new Float32Array(FFT_SIZE);

  const sinTable = new Float32Array(FFT_SIZE);
  const cosTable = new Float32Array(FFT_SIZE);

  const cmap = new Array(256);

  for (let i = 0; i < 256; i++) {
    cmap[i] = colormap(i / 255);
  }

  for (let i = 0; i < FFT_SIZE; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
    sinTable[i] = Math.sin(-2 * Math.PI * i / FFT_SIZE);
    cosTable[i] = Math.cos(-2 * Math.PI * i / FFT_SIZE);
  }

  function hzToMel(hz){
    return 1127 * Math.log(1 + hz/700);
  }

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
    ctx.fillRect(0,0,width,height);

    if (!audioBuffer) return;

    const data = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    const frameCount = Math.max(1, Math.ceil(Math.max(1, data.length - FFT_SIZE) / HOP) + 1);

    const img = ctx.createImageData(width,height);
    const pixels = img.data;

    const stepX = width / frameCount;

    const melMin = hzToMel(MIN_FREQ);
    const melMax = hzToMel(MAX_FREQ);
    const melSpan = melMax - melMin;

    let globalMax = -Infinity;

    const columns = new Array(frameCount);

    for (let frame = 0; frame < frameCount; frame++) {
      const start = frame * HOP;

      for (let i = 0; i < FFT_SIZE; i++) {
        const sample = data[start + i] || 0;
        real[i] = sample * hann[i];
        imag[i] = 0;
      }

      fftIterative(real, imag, cosTable, sinTable);

      const column = new Float32Array(BINS);

      for (let bin = 0; bin < BINS; bin++) {
        const mag2 = real[bin] * real[bin] + imag[bin] * imag[bin];
        const db = 10 * Math.log10(mag2 + 1e-12);

        column[bin] = db;

        if(db>globalMax) globalMax=db;
      }

      columns[frame] = column;
    }

    const maxDb = globalMax;
    const dynamicRange = 70;
    const minDb = maxDb - dynamicRange;

    for (let frame = 0; frame < frameCount; frame++) {

      const column = columns[frame];

      const x0 = Math.max(0, Math.floor(frame * stepX));
      const x1 = Math.min(width, Math.max(x0 + 1, Math.floor((frame + 1) * stepX)));

      for (let y = 0; y < height; y++) {

        const mel = melMin + (1 - y / height) * melSpan

        const hz = 700 * (Math.exp(mel / 1127) - 1)

        if (hz < MIN_FREQ || hz > MAX_FREQ) continue

        const db = sampleSpectrum(column, hz, sampleRate)

        if (db <= minDb) continue

        let norm = (db - minDb) / dynamicRange
        if (norm > 1) norm = 1
        if (norm <= 0) continue

        norm = Math.log1p(9 * norm) / Math.log1p(9)
        norm = Math.pow(norm, 0.85)

        const color = cmap[(norm * 255) | 0];

        for (let x = x0; x < x1; x++) {

          const idx = (y * width + x) * 4

          pixels[idx] = color[0]
          pixels[idx + 1] = color[1]
          pixels[idx + 2] = color[2]
          pixels[idx + 3] = 255
        }
      }

    }

    ctx.putImageData(img,0,0);
  }

  function sampleSpectrum(column, freq, sampleRate) {

    const bin = Math.min((freq * FFT_SIZE) / sampleRate, BINS - 1);

    const i0 = Math.floor(bin)
    const i1 = Math.min(i0 + 1, BINS - 1)

    const t = bin - i0

    const v0 = column[i0] ?? -120
    const v1 = column[i1] ?? -120

    return v0 * (1 - t) + v1 * t
  }

  function renderTimelineBase() {
    const ctx = timelineBaseCanvas.getContext("2d");
    const width = timelineBaseCanvas.width;
    const height = timelineBaseCanvas.height;

    ctx.fillStyle = "#101010";
    ctx.fillRect(0, 0, width, height);

    if (audioBuffer) {
      const data = audioBuffer.getChannelData(0);
      const center = height / 2;
      const step = Math.ceil(data.length / width);

      ctx.fillStyle = "#8a8a8a";

      for (let x = 0; x < width; x++) {
        let min = 1;
        let max = -1;

        const start = x * step;
        const end = Math.min(start + step, data.length);

        for (let i = start; i < end; i++) {
          const s = data[i];
          if (s < min) min = s;
          if (s > max) max = s;
        }

        const y = (1 + min) * center;
        const h = Math.max(1, (max - min) * center);

        ctx.fillRect(x, y, 1, h);
      }
    }

    if (duration > 0) {
      for (const d of detections) {
        const startX = (d.start / duration) * width;
        const endX = (d.end / duration) * width;

        ctx.fillStyle = "rgba(121,194,123,0.25)";
        ctx.fillRect(startX, 0, Math.max(2, endX - startX), height);
      }
    }
  }

  function redrawSpectrogram(){

    const w=spectrogramCanvas.width;
    const h=spectrogramCanvas.height;

    spectCtx.clearRect(0,0,w,h);
    spectCtx.drawImage(spectrogramBaseCanvas,0,0);

    drawPlayhead(spectCtx,w,h);
  }

  function redrawTimeline(){

    const w=timelineCanvas.width;
    const h=timelineCanvas.height;

    timelineCtx.clearRect(0,0,w,h);
    timelineCtx.drawImage(timelineBaseCanvas,0,0);

    drawPlayhead(timelineCtx,w,h);
  }

  function drawPlayhead(ctx,w,h){
    if(!duration)return;

    const x = (audioElement.currentTime / duration) * w;

    ctx.strokeStyle="#5ea8ff";
    ctx.lineWidth=2;

    ctx.beginPath();
    ctx.moveTo(x,0);
    ctx.lineTo(x,h);
    ctx.stroke();
  }

  function redraw(){

    redrawSpectrogram();
    redrawTimeline();
  }

  function seekFromCanvasClick(canvas,event){

    if(!duration)return;

    const rect=canvas.getBoundingClientRect();
    const x=event.clientX-rect.left;

    audioElement.currentTime=(x/rect.width)*duration;

    redraw();
  }

  spectrogramCanvas.addEventListener("click",e=>seekFromCanvasClick(spectrogramCanvas,e));
  timelineCanvas.addEventListener("click",e=>seekFromCanvasClick(timelineCanvas,e));

  audioElement.addEventListener("timeupdate",redraw);
  audioElement.addEventListener("seeked",redraw);
  audioElement.addEventListener("play",redraw);
  audioElement.addEventListener("pause",redraw);

  window.addEventListener("resize",resizeCanvases);

  resizeCanvases();

  return {

    setAudioBuffer(buf){
      audioBuffer = buf||null;
      renderSpectrogramBase();
      renderTimelineBase();
      redraw();
    },

    setData(nextDetections,nextDuration){
      detections=Array.isArray(nextDetections)?nextDetections:[];
      duration=Number(nextDuration||0);

      renderTimelineBase();
      redraw();
    },

    redraw(){ redraw(); },

    reset(){

      audioBuffer=null;
      detections=[];
      duration=0;

      renderSpectrogramBase();
      renderTimelineBase();
      redraw();
    }
  };
}

function fftIterative(real,imag,cosTable,sinTable){

  const n=real.length;
  let j=0;

  for(let i=1;i<n;i++){

    let bit=n>>1;

    while(j&bit){
      j^=bit;
      bit>>=1;
    }

    j|=bit;

    if(i<j){

      [real[i],real[j]]=[real[j],real[i]];
      [imag[i],imag[j]]=[imag[j],imag[i]];
    }
  }

  for(let len=2;len<=n;len<<=1){

    const half=len>>1;
    const step=n/len;

    for(let i=0;i<n;i+=len){

      for(let k=0;k<half;k++){

        const idx=k*step;

        const cos=cosTable[idx];
        const sin=sinTable[idx];

        const tre=real[i+k+half]*cos - imag[i+k+half]*sin;
        const tim=real[i+k+half]*sin + imag[i+k+half]*cos;

        real[i+k+half]=real[i+k]-tre;
        imag[i+k+half]=imag[i+k]-tim;

        real[i+k]+=tre;
        imag[i+k]+=tim;
      }
    }
  }
}
