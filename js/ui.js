/* UI controller: upload / camera, detection loop, readouts, ZIP. */

import { loadMP2 } from "./mp2-loader.js";
import {
  initMP2Detector,
  setConfidence,
  startDetect,
  stopDetect,
  detectOnce,
  detectorStatus
} from "./mp2-detector.js";
import { startRecording, stopRecording, isRecording } from "./recorder.js";
import {
  exportZip,
  recordFrame,
  frameCount,
  resetExportSession
} from "./exporter.js";
import {
  drawOverlay,
  hookSkeletonColor,
  fitCanvasToVideo,
  paintVideo
} from "./draw.js";
import { createSmoother } from "./smooth.js";
import { LM, computeFrame, createTracker } from "./pose-math.js";

const $ = (id) => document.getElementById(id);

const video = $("video");
const canvas = $("canvas");
const ctx = canvas.getContext("2d", { alpha: false }) || canvas.getContext("2d");
const logEl = $("log");
const diag = $("diag");
const mediaGrid = $("mediaGrid");
const stageStatus = $("stageStatus");
const stageStatusText = $("stageStatusText");
const spinner = $("spinner");
const embedHint = $("embedHint");
const zipLink = $("zipLink");

const fileInput = $("file");
const modelSel = $("modelSel");
const smoothSel = $("smoothSel");
const confSel = $("confSel");
const startBtn = $("startBtn");
const pauseBtn = $("pauseBtn");
const recToggle = $("recToggle");
const cameraBtn = $("cameraBtn");
const stopCameraBtn = $("stopCameraBtn");
const facingSel = $("facingSel");
const saveZipBtn = $("saveZipBtn");
const zipName = $("zipName");
const colorBtn = $("colorBtn");
const colorPicker = $("colorPicker");
const fullscreenBtn = $("fullscreenBtn");
const fsExitBtn = $("fsExitBtn");
const mirrorToggle = $("mirrorToggle");
const analysisToggle = $("analysisToggle");
const origToggle = $("origToggle");
const seek = $("seek");
const fpsOut = $("fps");
const framesOut = $("frames");
const tprog = $("tprog");

const smoother = createSmoother();
const tracker = createTracker();

let modelReady = false;
let modelLoading = false;
let loadToken = 0;
let detecting = false;
let exporting = false;
let openingCamera = false;
let objectUrl = null;
let logStarted = false;
let seeking = false;
let missWarned = false;
let frameCounter = 0;
let lastT = 0;
let fpsHist = [];
let lastHud = 0;
let lastHitAt = 0;
let previewId = 0;
let previewMode = "";
let stopChain = null;

video.playsInline = true;
video.muted = true;
video.controls = false;

function say(msg, cls = "") {
  if (!logStarted) {
    logEl.textContent = "";
    logStarted = true;
  }
  logEl.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
  if (cls === "err") setBadge(msg.slice(0, 48), "err");
}

function setBadge(text, cls = "") {
  diag.textContent = text;
  diag.className = "badge" + (cls ? " " + cls : "");
  diag.title = text;
}

function showStage(text, mode) {
  stageStatus.hidden = false;
  stageStatusText.textContent = text;
  spinner.hidden = mode !== "spin";
  stageStatus.classList.toggle("is-error", mode === "error");
}

function hideStage() {
  stageStatus.hidden = true;
}

function setText(id, text) {
  const el = $(id);
  if (el && el.textContent !== text) el.textContent = text;
}

function deg(v) {
  return v == null || !Number.isFinite(Number(v)) ? "–" : `${Math.round(Number(v))}°`;
}

function num(v, digits) {
  return v == null || !Number.isFinite(v) ? "–" : v.toFixed(digits);
}

function resetReadout() {
  for (const id of [
    "m-elbowL", "m-elbowR", "m-kneeL", "m-kneeR",
    "m-shoulderL", "m-shoulderR", "m-hipL", "m-hipR",
    "m-lean", "m-support", "m-rise", "m-path", "m-speed", "m-rate", "m-track"
  ]) setText(id, "–");
  $("m-support-wrap").classList.remove("is-in", "is-out");
}

function updateReadout(frame, snap) {
  if (frame?.display) {
    const d = frame.display;
    setText("m-elbowL", deg(d.elbowL));
    setText("m-elbowR", deg(d.elbowR));
    setText("m-kneeL", deg(d.kneeL));
    setText("m-kneeR", deg(d.kneeR));
    setText("m-shoulderL", deg(d.shoulderL));
    setText("m-shoulderR", deg(d.shoulderR));
    setText("m-hipL", deg(d.hipL));
    setText("m-hipR", deg(d.hipR));
    setText("m-lean", d.torsoLean == null ? "–" : `${d.torsoLean > 0 ? "+" : ""}${Math.round(d.torsoLean)}°`);
    const wrap = $("m-support-wrap");
    wrap.classList.remove("is-in", "is-out");
    if (frame.support?.inside === true) {
      setText("m-support", "內");
      wrap.classList.add("is-in");
    } else if (frame.support?.inside === false) {
      setText("m-support", "外");
      wrap.classList.add("is-out");
    } else {
      setText("m-support", "–");
    }
  }
  if (snap) {
    if (snap.tracking) {
      setText("m-rise", num(snap.rise, 1));
      setText("m-path", num(snap.path, 1));
      setText("m-speed", num(snap.speed, 1));
    }
    setText("m-rate", `${Math.round((snap.rate || 0) * 100)}%`);
    setText("m-track", snap.tracking ? "追蹤中" : "未偵測");
  }
}

function maybeHud(frame, snap) {
  const now = performance.now();
  if (now - lastHud < 100) return;
  lastHud = now;
  updateReadout(frame, snap);
}

function updateFPS(ts) {
  if (lastT) {
    const inst = 1000 / (ts - lastT);
    if (Number.isFinite(inst) && inst < 240) {
      fpsHist.push(inst);
      if (fpsHist.length > 20) fpsHist.shift();
    }
  }
  lastT = ts;
  if (fpsHist.length) {
    fpsOut.textContent = String(Math.round(fpsHist.reduce((a, b) => a + b, 0) / fpsHist.length));
  }
  framesOut.textContent = String(frameCounter);
}

function fmt(t) {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function updateClock() {
  const live = !!video.srcObject;
  const d = video.duration;
  if (live || !Number.isFinite(d) || d <= 0) {
    seek.disabled = true;
    tprog.textContent = live ? "即時" : "0:00 / 0:00";
    return;
  }
  seek.disabled = false;
  if (!seeking) seek.value = String(Math.round((video.currentTime / d) * 1000));
  tprog.textContent = `${fmt(video.currentTime)} / ${fmt(d)}`;
}

function updateButtons() {
  startBtn.disabled = !modelReady || !video.videoWidth || detecting || openingCamera;
  pauseBtn.disabled = !detecting;
  stopCameraBtn.disabled = !video.srcObject;
  saveZipBtn.disabled = exporting || frameCount() === 0;
  modelSel.disabled = modelLoading;
}

function paintCurrent() {
  if (!ctx || !video.videoWidth) return;
  fitCanvasToVideo(video, canvas);
  paintVideo(ctx, video, mirrorToggle.checked);
}

function stopPreview() {
  if (previewMode === "rvfc" && video.cancelVideoFrameCallback) {
    video.cancelVideoFrameCallback(previewId);
  } else if (previewMode === "raf") {
    cancelAnimationFrame(previewId);
  }
  previewId = 0;
  previewMode = "";
}

function startPreview() {
  stopPreview();
  const useRVFC = typeof video.requestVideoFrameCallback === "function";
  const tick = () => {
    if (detecting) return;
    paintCurrent();
    if (detecting) return;
    if (useRVFC) {
      previewMode = "rvfc";
      previewId = video.requestVideoFrameCallback(tick);
    } else {
      previewMode = "raf";
      previewId = requestAnimationFrame(tick);
    }
  };
  if (useRVFC) {
    previewMode = "rvfc";
    previewId = video.requestVideoFrameCallback(tick);
  } else {
    previewMode = "raf";
    previewId = requestAnimationFrame(tick);
  }
}

function hideZipLink() {
  zipLink.hidden = true;
  zipLink.removeAttribute("href");
}

function showZipLink(url, filename) {
  zipLink.hidden = false;
  zipLink.href = url;
  zipLink.download = filename;
}

function labelsFrom(display) {
  if (!display) return [];
  const pairs = [
    [LM.left_elbow, display.elbowL],
    [LM.right_elbow, display.elbowR],
    [LM.left_knee, display.kneeL],
    [LM.right_knee, display.kneeR]
  ];
  return pairs
    .filter(([, v]) => v != null && Number.isFinite(Number(v)))
    .map(([index, v]) => ({ index, text: `${Math.round(Number(v))}°` }));
}

function round(n, d) {
  if (!Number.isFinite(n)) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function packLm(lm, mirror, world) {
  if (!lm?.length) return null;
  return lm.map((p) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return [null, null, null, 0];
    const x = world ? (mirror ? -p.x : p.x) : (mirror ? 1 - p.x : p.x);
    return [
      round(x, 4),
      round(p.y, 4),
      round(p.z || 0, 4),
      round(p.visibility ?? p.presence ?? 0, 3)
    ];
  });
}

function maybeWarn(snap) {
  if (missWarned || !snap || snap.processed < 45 || snap.detected > 0) return;
  missWarned = true;
  say("未偵測到身體。可試 Model full／heavy，或把置信度調到寬鬆", "warn");
}

function handleFrame({ result, mediaTime }) {
  if (!detecting || !ctx) return;
  frameCounter++;
  updateFPS(performance.now());
  fitCanvasToVideo(video, canvas);
  const mirror = mirrorToggle.checked;
  const tSec = Number.isFinite(mediaTime) ? mediaTime : video.currentTime;
  const lm = result?.landmarks?.[0];
  const world = result?.worldLandmarks?.[0] || null;
  if (!lm) {
    const snap = tracker.push(null, tSec);
    if (performance.now() - lastHitAt > 220) paintVideo(ctx, video, mirror);
    maybeHud(null, snap);
    maybeWarn(snap);
    return;
  }
  lastHitAt = performance.now();
  paintVideo(ctx, video, mirror);

  const smoothed = smoother.apply(lm, world, tSec);
  const frame = computeFrame(smoothed.image, smoothed.world);
  const snap = tracker.push(frame, tSec);
  const show = analysisToggle.checked;
  drawOverlay(ctx, smoothed.image, {
    mirror,
    showAnalysis: show,
    trail: snap.trail,
    com: frame.com,
    support: frame.support,
    labels: show ? labelsFrom(frame.display) : []
  });

  const metrics = Object.assign({}, frame.metrics, { comSpeed: snap.speed });
  if (mirror && metrics.comX != null) metrics.comX = round(1 - metrics.comX, 4);
  recordFrame({
    t: Number.isFinite(tSec) ? +tSec.toFixed(3) : null,
    angles: frame.angles,
    metrics,
    landmarks: packLm(smoothed.image, mirror, false),
    worldLandmarks: packLm(smoothed.world, mirror, true)
  });
  maybeHud(frame, snap);
  maybeWarn(snap);
  if (saveZipBtn.disabled && !exporting && frameCount() > 0) saveZipBtn.disabled = false;
}

async function loadModel(type) {
  const token = ++loadToken;
  modelLoading = true;
  modelReady = false;
  updateButtons();
  showStage("模型載入中…", "spin");
  setBadge("載入中…");
  const slow = setTimeout(() => {
    if (token === loadToken) say("模型仍在下載…", "warn");
  }, 8000);
  try {
    await loadMP2();
    if (token !== loadToken) return;
    const info = await initMP2Detector(type, { confidence: Number(confSel.value) });
    if (!info || token !== loadToken) return;
    await setConfidence(Number(confSel.value));
    if (token !== loadToken) return;
    modelReady = true;
    smoother.reset();
    const badge = `${info.model} · ${info.delegate}`;
    setBadge(detecting ? `偵測中 · ${badge}` : badge, "ok");
    say(`模型載入成功 (${info.model} · ${info.delegate} · MediaPipe ${info.version})`, "ok");
    if (type === "heavy") say("heavy 模型較大，手機首次載入會慢一點", "warn");
    if (video.videoWidth) hideStage();
    else showStage("上傳影片或開攝像頭");
  } catch (err) {
    if (token !== loadToken) return;
    modelReady = false;
    const msg = err?.message || String(err);
    setBadge("模型失敗", "err");
    showStage("模型載入失敗。可按「自檢」重試。", "error");
    say("❌ 模型載入失敗：" + msg, "err");
  } finally {
    clearTimeout(slow);
    if (token === loadToken) {
      modelLoading = false;
      updateButtons();
    }
  }
}

function stopCameraTracks() {
  const stream = video.srcObject;
  if (!stream) return false;
  stream.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  return true;
}

async function openCamera() {
  if (openingCamera) return;
  if (!window.isSecureContext) {
    say("攝像頭需要 HTTPS", "err");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    embedHint.hidden = false;
    say("此環境不能開攝像頭。嵌入時請加上 allow=\"camera; fullscreen; autoplay\"。", "err");
    return;
  }

  openingCamera = true;
  updateButtons();
  if (detecting) await stopSession();
  stopCameraTracks();
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  video.removeAttribute("src");

  const facing = facingSel.value === "user" ? "user" : "environment";
  const attempts = [
    { video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: { facingMode: facing }, audio: false },
    { video: true, audio: false }
  ];
  let stream = null;
  let lastErr = null;
  for (const constraints of attempts) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  openingCamera = false;
  if (!stream) {
    const name = lastErr?.name || "";
    if (name === "NotAllowedError" || name === "SecurityError") embedHint.hidden = false;
    const msg = name === "NotAllowedError" || name === "SecurityError"
      ? "無法啟動攝像頭（權限被拒）。若此頁嵌在 Wix／iframe，請加上 allow=\"camera; fullscreen; autoplay\"。"
      : name === "NotFoundError"
        ? "找不到攝像頭"
        : (lastErr?.message || "無法啟動攝像頭");
    say("❌ " + msg, "err");
    updateButtons();
    return;
  }

  const track = stream.getVideoTracks()[0];
  const reported = track?.getSettings?.().facingMode;
  const actual = reported || facing;
  mirrorToggle.checked = actual === "user";
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    say("輕觸畫面以開始預覽", "warn");
  }
  say(`📷 攝像頭就緒（${actual === "user" ? "前鏡頭" : "後鏡頭"}）`, "ok");
  hideStage();
  updateButtons();
}

async function begin() {
  if (detecting || openingCamera) return;
  if (!modelReady) {
    say("模型載入中，請稍候", "warn");
    await loadModel(modelSel.value);
    if (!modelReady) return;
  }
  if (!video.videoWidth) {
    say("請先上傳影片或開攝像頭", "warn");
    return;
  }
  if (frameCount() > 0) say("上一段紀錄已清除", "warn");

  hideZipLink();
  resetExportSession();
  tracker.reset();
  smoother.setPreset(smoothSel.value);
  smoother.reset();
  missWarned = false;
  frameCounter = 0;
  lastT = 0;
  fpsHist = [];
  fpsOut.textContent = "0";
  framesOut.textContent = "0";
  resetReadout();
  lastHud = 0;
  lastHitAt = 0;

  detecting = true;
  stopPreview();
  updateButtons();
  hideStage();

  try {
    await video.play();
  } catch {
    say("輕觸畫面以播放影片", "warn");
  }

  if (recToggle.checked) {
    const rec = startRecording(canvas);
    if (rec.ok) say("🎥 Overlay 錄影開始", "ok");
    else say("無法錄影：" + rec.error + "。仍會輸出 poses.json / metrics.csv", "warn");
  }

  startDetect(video, {
    onFrame: handleFrame,
    onFallback() {
      setBadge("改用 CPU…", "warn");
      say("GPU 不可用，改用 CPU…", "warn");
    },
    onReady(info) {
      setBadge(`偵測中 · ${info.model} · ${info.delegate}`, "warn");
      say(`已改用 CPU（${info.model}）`, "warn");
      smoother.reset();
    },
    onError(err) {
      say("❌ 偵測錯誤：" + (err?.message || err), "err");
    }
  });

  const st = detectorStatus();
  setBadge(`偵測中 · ${st.model} · ${st.delegate}`, "ok");
  say(`▶️ 開始偵測（${st.frameClock}）`, "ok");
  updateButtons();
}

async function stopSessionInner() {
  const wasDetecting = detecting;
  if (!wasDetecting && !isRecording()) return;
  detecting = false;
  stopDetect();
  try {
    await stopRecording();
  } catch (err) {
    say("錄影停止失敗：" + (err?.message || err), "err");
  }
  if (video.srcObject) startPreview();
  else if (!video.ended && !video.paused) video.pause();

  if (wasDetecting) {
    const summary = tracker.summary();
    say("⏸ 偵測停止", "warn");
    if (summary.processedFrames) {
      const rate = Math.round((summary.detectionRate || 0) * 100);
      say(`本段 ${summary.detectedFrames}/${summary.processedFrames} 幀有姿態（${rate}%）`, "ok");
    }
    const st = detectorStatus();
    if (st.model) setBadge(`${st.model} · ${st.delegate}`, "ok");
  }
  updateButtons();
}

function stopSession() {
  if (stopChain) return stopChain;
  stopChain = stopSessionInner().finally(() => {
    stopChain = null;
  });
  return stopChain;
}

function enterFullscreen() {
  const target = mediaGrid;
  const req = target.requestFullscreen || target.webkitRequestFullscreen;
  if (!req) {
    document.body.classList.add("ios-fullscreen", "is-fullscreen");
    return;
  }
  Promise.resolve(req.call(target)).catch(() => {
    document.body.classList.add("ios-fullscreen", "is-fullscreen");
  });
}

function exitFullscreen() {
  document.body.classList.remove("ios-fullscreen", "is-fullscreen");
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = "";
  if (!file) return;
  if (detecting) await stopSession();
  stopCameraTracks();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  mirrorToggle.checked = false;
  video.pause();
  video.srcObject = null;
  video.src = objectUrl;
  say("正在讀取影片…");
  updateButtons();
});

video.addEventListener("loadedmetadata", () => {
  fitCanvasToVideo(video, canvas);
  mediaGrid.classList.toggle("portrait", video.videoHeight > video.videoWidth);
  paintCurrent();
  if (modelReady) hideStage();
  updateClock();
  updateButtons();
  if (!video.srcObject) {
    say("🎞️ 影片就緒", "ok");
    video.play().catch(() => say("輕觸畫面以播放影片", "warn"));
  }
});

video.addEventListener("resize", () => {
  if (!detecting) paintCurrent();
});

video.addEventListener("play", () => {
  if (!detecting) startPreview();
});

video.addEventListener("seeked", () => {
  if (!detecting) paintCurrent();
  updateClock();
});

video.addEventListener("timeupdate", updateClock);
video.addEventListener("ended", () => {
  updateClock();
  if (detecting) stopSession();
});

canvas.addEventListener("click", () => {
  if (video.srcObject || !video.currentSrc) return;
  if (video.paused) video.play().catch(() => {});
  else if (!detecting) video.pause();
});

cameraBtn.addEventListener("click", () => { openCamera(); });
stopCameraBtn.addEventListener("click", async () => {
  if (detecting) await stopSession();
  const had = stopCameraTracks();
  if (had) say("📴 攝像頭已關閉");
  updateButtons();
});
facingSel.addEventListener("change", () => {
  if (video.srcObject) openCamera();
});

modelSel.addEventListener("change", () => loadModel(modelSel.value));
smoothSel.addEventListener("change", () => {
  smoother.setPreset(smoothSel.value);
  say("平滑已更新");
});
confSel.addEventListener("change", async () => {
  try {
    await setConfidence(Number(confSel.value));
    say("置信度已更新");
  } catch (err) {
    say("置信度更新失敗：" + (err?.message || err), "err");
  }
});

mirrorToggle.addEventListener("change", () => {
  if (!detecting) paintCurrent();
});
origToggle.addEventListener("change", () => {
  mediaGrid.classList.toggle("show-orig", origToggle.checked);
  video.controls = origToggle.checked;
});

colorBtn.addEventListener("click", () => colorPicker.click());
colorPicker.addEventListener("input", () => {
  hookSkeletonColor(colorPicker.value);
  say("🎨 Skeleton color updated");
});

startBtn.addEventListener("click", () => {
  begin().catch((err) => say("❌ 無法開始：" + (err?.message || err), "err"));
});
pauseBtn.addEventListener("click", () => { stopSession(); });

saveZipBtn.addEventListener("click", async () => {
  if (exporting) return;
  exporting = true;
  saveZipBtn.disabled = true;
  try {
    if (detecting || isRecording()) await stopSession();
    if (!frameCount()) {
      say("沒有可匯出的幀", "warn");
      return;
    }
    const st = detectorStatus();
    const result = await exportZip({
      name: zipName.value,
      summary: tracker.summary(),
      meta: {
        model: st.model,
        delegate: st.delegate,
        version: st.version,
        smoothing: smoothSel.value,
        confidence: Number(confSel.value),
        mirrored: mirrorToggle.checked
      }
    });
    showZipLink(result.url, result.filename);
    say(result.video ? "📦 ZIP 已下載（含疊加影片）" : "📦 ZIP 已下載", "ok");
  } catch (err) {
    say("❌ 匯出失敗：" + (err?.message || err), "err");
  } finally {
    exporting = false;
    updateButtons();
  }
});

seek.addEventListener("pointerdown", () => { seeking = true; });
seek.addEventListener("input", () => {
  if (!Number.isFinite(video.duration) || video.duration <= 0) return;
  seeking = true;
  video.currentTime = (Number(seek.value) / 1000) * video.duration;
});
seek.addEventListener("change", () => { seeking = false; });
seek.addEventListener("pointerup", () => { seeking = false; });

fullscreenBtn.addEventListener("click", enterFullscreen);
fsExitBtn.addEventListener("click", exitFullscreen);
document.addEventListener("fullscreenchange", () => {
  const on = !!document.fullscreenElement;
  document.body.classList.toggle("is-fullscreen", on);
  if (!on) document.body.classList.remove("ios-fullscreen");
});

$("selftestBtn").addEventListener("click", async () => {
  say("自檢中…");
  await loadModel(modelSel.value);
  if (!modelReady) return;
  if (detecting) {
    say("模型已重新載入，偵測繼續", "ok");
    return;
  }
  if (!video.videoWidth) {
    say("核心與模型就緒。上傳影片後可再自檢姿態。", "ok");
    return;
  }
  try {
    const res = detectOnce(video);
    const n = res?.landmarks?.[0]?.length || 0;
    say(n ? `偵測到姿態（${n} 點）` : "這一幀未偵測到姿態", n ? "ok" : "warn");
  } catch (err) {
    say("❌ 自檢錯誤：" + (err?.message || err), "err");
  }
});

updateButtons();
resetReadout();
if (typeof JSZip === "undefined") say("JSZip 未能載入，Download ZIP 會失敗", "warn");
loadModel(modelSel.value);
