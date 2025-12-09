/* ============================================================================
   recorder.js — Dual Recorder
============================================================================ */

let overlayRecorder = null;
let originalRecorder = null;

let overlayChunks = [];
let originalChunks = [];

export function startRecording(canvas, video) {
  overlayChunks = [];
  originalChunks = [];

  const overlayStream = canvas.captureStream(30);
  const originalStream = video.captureStream?.() ?? null;

  overlayRecorder = new MediaRecorder(overlayStream, { mimeType: pick() });
  originalRecorder = originalStream
    ? new MediaRecorder(originalStream, { mimeType: pick() })
    : null;

  overlayRecorder.ondataavailable = e => overlayChunks.push(e.data);
  overlayRecorder.start();

  if (originalRecorder) {
    originalRecorder.ondataavailable = e => originalChunks.push(e.data);
    originalRecorder.start();
  }
}

export async function stopRecording() {
  const stop = recorder =>
    new Promise(res => {
      if (!recorder) return res(null);
      recorder.onstop = () =>
        res(new Blob(recorder === overlayRecorder ? overlayChunks : originalChunks));
      recorder.stop();
    });

  const overlay = await stop(overlayRecorder);
  const original = await stop(originalRecorder);

  overlayRecorder = originalRecorder = null;
  overlayChunks = originalChunks = [];

  return { overlay, original };
}

function pick() {
  const c = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8"
  ];
  return c.find(x => MediaRecorder.isTypeSupported(x)) ?? "";
}
