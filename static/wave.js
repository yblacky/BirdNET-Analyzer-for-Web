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

  const MIN_DB = -90;
  const MAX_DB = -25;

  const MIN_FREQ = 800;
  const MAX_FREQ = 12000;

  const hann = new Float32Array(FFT_SIZE);
  const real = new Float32Array(FFT_SIZE);
  const imag = new Float32Array(FFT_SIZE);

  const sinTable = new Float32Array(FFT_SIZE);
  const cosTable = new Float32Array(FFT_SIZE);

  for (let i = 0; i < FFT_SIZE; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
    sinTable[i] = Math.sin(-2 * Math.PI * i / FFT_SIZE);
    cosTable[i] = Math.cos(-2 * Math.PI * i / FFT_SIZE);
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

    const frames = Math.max(1, Math.floor((data.length - FFT_SIZE) / HOP));
    const stepX = width / frames;

    for (let frame = 0; frame < frames; frame++) {

      const start = frame * HOP;

      for (let i = 0; i < FFT_SIZE; i++) {
        real[i] = data[start + i] * hann[i];
        imag[i] = 0;
      }

      fftIterative(real, imag);

      for (let bin = 2; bin < BINS; bin++) {

        const freq = (bin * sampleRate) / FFT_SIZE;

        if (freq < MIN_FREQ || freq > MAX_FREQ) continue;

        const mag2 = real[bin]*real[bin] + imag[bin]*imag[bin];

        const db = 10 * Math.log10(mag2 + 1e-12);

        if (db < MIN_DB) continue;

        let norm = (db - MIN_DB) / (MAX_DB - MIN_DB);

        norm = Math.max(0, Math.min(1, norm));

        norm = Math.pow(norm, 0.75);

        const logPos =
          (Math.log(freq) - Math.log(MIN_FREQ)) /
          (Math.log(MAX_FREQ) - Math.log(MIN_FREQ));

        const y = height - logPos * height;

        const nextFreq = ((bin+1)*sampleRate)/FFT_SIZE;

        const logPos2 =
          (Math.log(nextFreq) - Math.log(MIN_FREQ)) /
          (Math.log(MAX_FREQ) - Math.log(MIN_FREQ));

        const y2 = height - logPos2 * height;

        const pixelHeight = Math.max(1, y - y2);
        const pixelWidth = Math.ceil(stepX);

        ctx.fillStyle = inferno(norm);
        ctx.fillRect(frame*stepX, y, pixelWidth, pixelHeight);
      }
    }
  }

  function renderTimelineBase() {

    const ctx = timelineBaseCanvas.getContext("2d");
    const width = timelineBaseCanvas.width;
    const height = timelineBaseCanvas.height;

    ctx.fillStyle = "#101010";
    ctx.fillRect(0,0,width,height);

    if (audioBuffer) {

      const data = audioBuffer.getChannelData(0);
      const center = height/2;
      const step = Math.ceil(data.length/width);

      ctx.fillStyle = "#8a8a8a";

      for (let x=0;x<width;x++) {

        let min=1;
        let max=-1;

        const start = x*step;
        const end = Math.min(start+step,data.length);

        for (let i=start;i<end;i++) {

          const s=data[i];
          if(s<min)min=s;
          if(s>max)max=s;
        }

        const y=(1+min)*center;
        const h=Math.max(1,(max-min)*center);

        ctx.fillRect(x,y,1,h);
      }
    }

    if(duration>0){

      for(const d of detections){

        const startX=(d.start/duration)*width;
        const endX=(d.end/duration)*width;

        ctx.fillStyle="rgba(121,194,123,0.25)";
        ctx.fillRect(startX,0,Math.max(2,endX-startX),height);
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

    const x=(audioElement.currentTime/duration)*w;

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

      audioBuffer=buf||null;

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

function inferno(v){

  const map=[
    [0,0,4],[30,8,60],[60,10,100],[90,20,120],
    [140,30,110],[190,60,80],[230,110,40],[250,180,30]
  ];

  v=Math.max(0,Math.min(1,v));

  const i=Math.floor(v*(map.length-1));
  const t=v*(map.length-1)-i;

  const a=map[i];
  const b=map[i+1]||a;

  const r=a[0]+(b[0]-a[0])*t;
  const g=a[1]+(b[1]-a[1])*t;
  const b2=a[2]+(b[2]-a[2])*t;

  return `rgb(${r|0},${g|0},${b2|0})`;
}

function fftIterative(real,imag){

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

        const cos=Math.cos(-2*Math.PI*k/len);
        const sin=Math.sin(-2*Math.PI*k/len);

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