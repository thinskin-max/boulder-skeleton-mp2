/* Record the overlay canvas. Stop is safe to call twice and keeps the blob. */

let recorder = null;
let chunks = [];
let recording = false;
let mime = "";
let lastBlob = null;

function pickBestMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const list = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    "video/mp4;codecs=h264",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm"
  ];
  for (const type of list) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      /* keep looking */
    }
  }
  return "";
}

export function extensionForMime(type) {
  if ((type || "").includes("mp4")) return "mp4";
  return "webm";
}

export function isRecording() {
  return recording;
}

export function recordedBlob() {
  return lastBlob;
}

export function resetRecording() {
  lastBlob = null;
  if (!recording) chunks = [];
}

export function startRecording(canvas) {
  if (recording) return { ok: true, mime };
  if (!canvas?.captureStream || typeof MediaRecorder === "undefined") {
    return { ok: false, error: "此瀏覽器無法錄製疊加影片" };
  }

  chunks = [];
  lastBlob = null;
  mime = pickBestMime();
  let stream;
  try {
    stream = canvas.captureStream(30);
  } catch (err) {
    return { ok: false, error: err.message || "無法擷取畫面" };
  }

  try {
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  } catch (err) {
    recorder = null;
    return { ok: false, error: err.message || "無法建立錄影" };
  }

  mime = recorder.mimeType || mime || "video/webm";
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  recorder.start(200);
  recording = true;
  return { ok: true, mime };
}

export function stopRecording() {
  return new Promise((resolve) => {
    if (!recording || !recorder) {
      resolve(lastBlob);
      return;
    }
    const rec = recorder;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      const parts = chunks.splice(0, chunks.length);
      if (parts.length) lastBlob = new Blob(parts, { type: mime || "video/webm" });
      recording = false;
      recorder = null;
      resolve(lastBlob);
    };
    rec.onstop = finish;
    const timer = setTimeout(finish, 2000);
    const wrapped = rec.onstop;
    rec.onstop = () => {
      clearTimeout(timer);
      wrapped();
    };
    try {
      if (rec.state === "recording" && typeof rec.requestData === "function") rec.requestData();
      rec.stop();
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}
