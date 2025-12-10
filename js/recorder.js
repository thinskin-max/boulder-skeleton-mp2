/* ============================================================================
   recorder.js — Overlay Recording for Boulder Skeleton MP2 Edition
   GitHub Pages Compatible (Lite Runtime)
============================================================================ */

let recorder = null;
let chunks = [];
let recording = false;
let mime = "";

/* ============================================================================
   pickBestMime()
============================================================================ */
function pickBestMime() {
  const list = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    "video/mp4;codecs=h264",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8"
  ];

  if (!window.MediaRecorder) return "";

  for (const t of list) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

/* ============================================================================
   startRecording(canvas, video)
   Only records overlay (canvas)
============================================================================ */
export function startRecording(canvas, video) {
  if (recording) return;
  recording = true;
  chunks = [];

  mime = pickBestMime();

  const stream = canvas.captureStream(30); // overlay only

  try {
    recorder = new MediaRecorder(stream, { mimeType: mime });
  } catch (err) {
    console.error("Recorder init error:", err);
    recording = false;
    return;
  }

  recorder.ondataavailable = e => {
    if (e.data && e.data.size) chunks.push(e.data);
  };

  recorder.start();
  console.log("🎥 Overlay recording started:", mime);
}

/* ============================================================================
   stopRecording()
   Returns: Blob (video file)
============================================================================ */
export function stopRecording() {
  return new Promise(resolve => {
    if (!recording || !recorder) {
      resolve(null);
      return;
    }

    recorder.onstop = () => {
      try {
        const blob = new Blob(chunks, { type: mime || "video/webm" });
        resolve(blob);
      } catch (err) {
        console.error("Recorder stop error:", err);
        resolve(null);
      }
    };

    try {
      recorder.stop();
    } catch (err) {
      console.error("Recorder stop() failed:", err);
      resolve(null);
    }

    recording = false;
    recorder = null;
    chunks = [];
  });
}
