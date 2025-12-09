/* ============================================================================
   Boulder Skeleton — MP2 Edition
   recorder.js — Dual Recording System (Overlay + Original)
   專用於 GitHub Pages / localhost / iPhone Safari / Desktop Chrome
============================================================================ */

/* ---------------------------------------------------------------------------
   Export Object
--------------------------------------------------------------------------- */
export const Recorder = {
  enabled: false,          // recToggle 有冇開
  recording: false,        // 是否正在錄影

  overlay: {
    rec: null,
    chunks: [],
    mime: ""
  },

  original: {
    rec: null,
    chunks: [],
    mime: ""
  },

  start,
  stop,
  pickBestMime,
  buildOverlayStream,
  buildOriginalStream
};


/* ============================================================================
   選擇最佳 MIME（mp4 → webm → fallback）
   Chrome / Edge / Safari 都會不同行為
============================================================================ */
function pickBestMime() {
  const candidates = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',  // iPhone Safari 最穩
    'video/mp4;codecs=h264',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8'
  ];

  if (!window.MediaRecorder) return "";

  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }

  return ""; // 交俾 recorder 自己 fallback
}


/* ============================================================================
   建立 Overlay Stream（Canvas → Video）
============================================================================ */
function buildOverlayStream(canvas, fps = 30) {
  try {
    return canvas.captureStream(fps);
  } catch (err) {
    console.error("❌ overlay captureStream error:", err);
    return null;
  }
}


/* ============================================================================
   建立 Original Stream（Video → Video + Audio）
============================================================================ */
function buildOriginalStream(video) {
  let stream = null;

  if (video.srcObject instanceof MediaStream) {
    // 攝像頭模式
    stream = video.srcObject;
  } else if (typeof video.captureStream === "function") {
    try { stream = video.captureStream(); }
    catch { stream = null; }
  } else if (typeof video.mozCaptureStream === "function") {
    try { stream = video.mozCaptureStream(); }
    catch { stream = null; }
  }

  if (!stream) {
    console.warn("⚠️ Original video source 不支援 captureStream");
    return null;
  }

  return stream;
}


/* ============================================================================
   開始錄影（Overlay + Original）
============================================================================ */
function start(canvas, video, enableRecording) {
  Recorder.enabled = enableRecording;

  if (!enableRecording) return; // overlay toggle 未開

  if (Recorder.recording) return;
  Recorder.recording = true;

  console.log("🎬 Recorder Start");


  /* ---------------------------------------------------------
     Overlay Recorder
  --------------------------------------------------------- */
  const oMime = pickBestMime();
  Recorder.overlay.mime = oMime;
  Recorder.overlay.chunks = [];

  const overlayStream = buildOverlayStream(canvas, 30);

  if (overlayStream) {
    try {
      Recorder.overlay.rec = new MediaRecorder(overlayStream, { mimeType: oMime });

      Recorder.overlay.rec.ondataavailable = (e) => {
        if (e.data && e.data.size) Recorder.overlay.chunks.push(e.data);
      };

      Recorder.overlay.rec.start();
      console.log("🎥 Overlay recording started:", oMime);
    } catch (err) {
      console.error("❌ overlay recorder init error:", err);
      Recorder.overlay.rec = null;
    }
  }


  /* ---------------------------------------------------------
     Original Recorder（原影片）
  --------------------------------------------------------- */
  const vStream = buildOriginalStream(video);

  const vMime = pickBestMime();
  Recorder.original.mime = vMime;
  Recorder.original.chunks = [];

  if (vStream) {
    try {
      Recorder.original.rec = new MediaRecorder(vStream, { mimeType: vMime });

      Recorder.original.rec.ondataavailable = (e) => {
        if (e.data && e.data.size) Recorder.original.chunks.push(e.data);
      };

      Recorder.original.rec.start();
      console.log("🎞️ Original recording started:", vMime);
    } catch (err) {
      console.error("❌ original recorder init error:", err);
      Recorder.original.rec = null;
    }
  } else {
    console.warn("⚠️ original stream 無法建立（可能無音訊或裝置不支援）");
  }
}


/* ============================================================================
   停止錄影 → 回傳 { overlayBlob, originalBlob }
============================================================================ */
async function stop() {
  if (!Recorder.recording) {
    return { overlay: null, original: null };
  }

  Recorder.recording = false;

  const stopOne = (rec, chunks, mime) =>
    new Promise((res) => {
      if (!rec) return res(null);

      rec.onstop = () => {
        try {
          const blob = new Blob(chunks, { type: mime || "video/webm" });
          res(blob);
        } catch {
          res(null);
        }
      };

      try {
        rec.stop();
      } catch {
        res(null);
      }
    });

  const overlayBlob = await stopOne(
    Recorder.overlay.rec,
    Recorder.overlay.chunks,
    Recorder.overlay.mime
  );

  const originalBlob = await stopOne(
    Recorder.original.rec,
    Recorder.original.chunks,
    Recorder.original.mime
  );

  Recorder.overlay.rec = null;
  Recorder.original.rec = null;

  Recorder.overlay.chunks = [];
  Recorder.original.chunks = [];

  console.log("⏹️ Recorder stopped");

  return { overlay: overlayBlob, original: originalBlob };
}
