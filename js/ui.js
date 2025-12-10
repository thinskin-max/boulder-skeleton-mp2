/* ============================================================================
   ui.js — Main UI Controller for Boulder Skeleton MP2 Lite Edition
============================================================================ */

import { loadMP2 } from "./mp2-loader.js";
import { initMP2Detector, startDetect, stopDetect } from "./mp2-detector.js";
import { startRecording, stopRecording } from "./recorder.js";
import { exportZip, recordFrame } from "./exporter.js";
import { drawSkeleton, hookSkeletonColor, fitCanvasToVideo } from "./draw.js";

/* DOM refs */
const $ = id => document.getElementById(id);

const video = $("video");
const canvas = $("canvas");
const log = $("log");
const diag = $("diag");

const fileInput = $("file");
const modelSel = $("modelSel");
const startBtn = $("startBtn");
const pauseBtn = $("pauseBtn");
const recToggle = $("recToggle");

const cameraBtn = $("cameraBtn");
const stopCameraBtn = $("stopCameraBtn");

const saveZipBtn = $("saveZipBtn");
const zipName = $("zipName");

const colorBtn = $("colorBtn");
const colorPicker = $("colorPicker");

const fpsOut = $("fps");
const framesOut = $("frames");

/* Runtime state */
let detector = null;
let mp2Loaded = false;
let detecting = false;

let frameCounter = 0;
let lastT = 0;
let fpsHist = [];

/* ============================================================================
   Logging
============================================================================ */
function say(msg, cls = "") {
  const t = `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  log.textContent += t;
  log.scrollTop = log.scrollHeight;

  diag.textContent = msg;
  diag.className = "badge " + cls;
}

/* ============================================================================
   SELF TEST — load MP2 & load model
============================================================================ */
$("selftestBtn").onclick = async () => {
  log.textContent = "";
  say("自檢中…");

  try {
    await loadMP2();
    mp2Loaded = true;
    say("🧠 MP2 Lite 核心載入成功", "ok");

    detector = await initMP2Detector("lite");
    say("模型載入成功 (lite)", "ok");
  } catch (err) {
    say("❌ 自檢錯誤：" + err.message, "err");
  }
};

/* ============================================================================
   VIDEO UPLOAD
============================================================================ */
fileInput.onchange = () => {
  const f = fileInput.files[0];
  if (!f) return;

  video.src = URL.createObjectURL(f);
  video.onloadedmetadata = () => {
    fitCanvasToVideo(video, canvas);
    video.play();
    say("🎞️ 影片就緒", "ok");
  };
};

/* ============================================================================
   CAMERA (PC)
============================================================================ */
cameraBtn.onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false
    });

    video.srcObject = stream;
    video.onloadedmetadata = () => {
      fitCanvasToVideo(video, canvas);
      video.play();
      say("📷 攝像頭就緒", "ok");
    };
  } catch (err) {
    say("❌ 無法啟動攝像頭：" + err.message, "err");
  }
};

stopCameraBtn.onclick = () => {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    say("📴 攝像頭已關閉");
  }
};

/* ============================================================================
   COLOR PICKER
============================================================================ */
colorBtn.onclick = () => colorPicker.click();
colorPicker.onchange = e => {
  hookSkeletonColor(e.target.value);
  say("🎨 Skeleton color updated");
};

/* ============================================================================
   FPS counter
============================================================================ */
function updateFPS(ts) {
  if (lastT) {
    const inst = 1000 / (ts - lastT);
    fpsHist.push(inst);
    if (fpsHist.length > 20) fpsHist.shift();
  }
  lastT = ts;

  if (fpsHist.length) {
    fpsOut.textContent = Math.round(
      fpsHist.reduce((a, b) => a + b, 0) / fpsHist.length
    );
  }
}

/* ============================================================================
   START DETECTION
============================================================================ */
startBtn.onclick = async () => {
  if (!mp2Loaded) {
    say("⚠️ MP2 尚未載入，請按『自檢』", "warn");
    return;
  }

  if (!detector) detector = await initMP2Detector("lite");

  detecting = true;

  if (recToggle.checked) {
    startRecording(canvas, video);
    say("🎥 Overlay 錄影開始", "ok");
  }

  /* detection loop */
  startDetect(video, canvas, {
    draw: (ctx, lm) => {
      drawSkeleton(ctx, lm);

      /* 角度、base area 計算由 draw.js 產生 */
      const metrics = window.__metrics || {}; // draw.js 會更新這個 global

      recordFrame({
        t: +video.currentTime.toFixed(3),
        angles: metrics
      });
    }
  });

  say("▶️ 開始偵測", "ok");
};

/* ============================================================================
   STOP DETECTION
============================================================================ */
pauseBtn.onclick = async () => {
  detecting = false;

  stopDetect();
  say("⏸ 偵測停止", "warn");

  await stopRecording();
};

/* ============================================================================
   ZIP EXPORT
============================================================================ */
saveZipBtn.onclick = async () => {
  const name = zipName.value.trim() || "";
  await exportZip(name, canvas);
  say("📦 ZIP 已下載", "ok");
};

/* ============================================================================
   AUTO SELFTEST ON LOAD
============================================================================ */
setTimeout(() => $("selftestBtn").click(), 500);
