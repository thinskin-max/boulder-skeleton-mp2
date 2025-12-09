/* ============================================================================
   ui.js — Main UI Controller for Boulder Skeleton MP2 Edition
============================================================================ */

import { loadMP2 } from "./mp2-loader.js";
import { initMP2Detector, startDetect, stopDetect } from "./mp2-detector.js";
import { startRecording, stopRecording } from "./recorder.js";
import { exportZip } from "./exporter.js";
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

/* runtime */
let detector = null;
let detecting = false;
let mp2Loaded = false;

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
   SELF TEST — load MP2 + model
============================================================================ */
$("selftestBtn").onclick = async () => {
  log.textContent = "";
  say("自檢中…");

  try {
    await loadMP2();
    mp2Loaded = true;
    say("🧠 MP2 核心載入成功", "ok");

    detector = await initMP2Detector(modelSel.value);
    say("模型載入成功", "ok");
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
   CAMERA
============================================================================ */
cameraBtn.onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
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
   START DETECTION
============================================================================ */
startBtn.onclick = async () => {
  if (!mp2Loaded) {
    say("⚠️ MP2 尚未載入，請先按『自檢』", "warn");
    return;
  }

  if (!detector) detector = await initMP2Detector(modelSel.value);

  detecting = true;

  if (recToggle.checked) {
    startRecording(canvas, video);
    say("🎥 錄影中…");
  }

  startDetect(video, canvas, {
    draw: lm => drawSkeleton(canvas.getContext("2d"), lm)
  });

  say("▶️ 開始偵測", "ok");
};

/* ============================================================================
   STOP DETECTION
============================================================================ */
pauseBtn.onclick = async () => {
  detecting = false;
  stopDetect();
  say("⏸ 已停止偵測", "warn");

  await stopRecording();
};

/* ============================================================================
   EXPORT ZIP
============================================================================ */
saveZipBtn.onclick = async () => {
  const name = zipName.value.trim();
  await exportZip(name, canvas);
  say("📦 ZIP 已下載", "ok");
};

/* ============================================================================
   MODEL CHANGE
============================================================================ */
modelSel.onchange = async () => {
  say("重新載入模型…");
  detector = await initMP2Detector(modelSel.value);
  say("✨ 模型已切換", "ok");
};

/* ============================================================================
   AUTO SELFTEST ON LOAD
============================================================================ */
setTimeout(() => $("selftestBtn").click(), 500);
