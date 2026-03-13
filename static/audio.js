export async function prepareSelectedFile(file, audioElement, previousObjectUrl = null) {
  if (previousObjectUrl) {
    URL.revokeObjectURL(previousObjectUrl);
  }

  const objectUrl = URL.createObjectURL(file);
  audioElement.src = objectUrl;

  const inferredDate = inferRecordingDate(file);
  const audioBuffer = await decodeAudio(file);

  return {
    objectUrl,
    inferredDate,
    duration: audioBuffer.duration,
    audioBuffer,
  };
}

export function bindFileDropAndSelect({ fileInput, fileBtn, dropZone, onFile }) {
  fileBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) onFile(file);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("is-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("is-over");
    });
  });

  dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) onFile(file);
  });
}

export function inferRecordingDate(file) {
  if (!file?.lastModified) return "";
  return toDateInputValue(new Date(file.lastModified));
}

function toDateInputValue(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function decodeAudio(file) {
  const audioCtx = new AudioContext();
  const arr = await file.arrayBuffer();
  const buffer = await audioCtx.decodeAudioData(arr.slice(0));
  await audioCtx.close();
  return buffer;
}

export function getIsoWeek(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const target = new Date(date.valueOf());

  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);

  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3);

  return 1 + Math.round((target - firstThursday) / 604800000);
}