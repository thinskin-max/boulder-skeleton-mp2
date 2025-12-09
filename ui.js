/* ============================================================================
   Boulder Skeleton — MP2 Edition
   ui.js — 所有 UI event handling + 模組整合點
============================================================================ */

import { loadMP2 } from "./mp2-loader.js";
import { initMP2Detector, startDetect, stopDetect } from "./mp2-detector.js";
import { startRecording, stopRecording } from "./recorder.js";
import { exportZip } from "./exporter.js";
import { fitCanvasToVideo, hookSkeletonColor } from "./draw.js";

const $ = (id) => document.getElementById(id);

const vid = $("video");
const can = $("canvas");

const file = $("file");
const startBtn = $("startBtn");
const pauseBtn = $("pauseBtn");
const saveZipBtn = $("saveZipBtn");
const recToggle = $("recToggle");
const cameraBtn = $("cameraBtn");
const stopCameraBtn = $("stopCameraBtn");
const modelSel = $("modelSel");

const diag = $("diag");
const log = $("log");
const fpsEl = $("fps");
const framesEl = $("frames");
const prog = $("prog");
const tprog = $("tprog");
const zipNameInput = $("zipName");

function say(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  log.textContent += line;
  log.scrollTop = log.scrollHeight;
  diag.textContent = msg;
}

/* ============================================================
   FILE UPLOAD
============================================================ */
file.onchange = () => {
  const f = file.files[0];
  if (!f) return;

  vid.src = URL.createObjectURL(f);

  vid.onloadedmetadata = () => {
    fitCanvasToVideo(vid, can);
    vid.play();
    say("🎞️ 影片就緒");
  };
};

/* ============================================================
   CAMERA
============================================================ */
cameraBtn.onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    vid.srcObject = stream;

    vid.onloadedmetadata = () => {
      fitCanvasToVideo(vid, can);
      vid.play();
      say("📷 攝像頭就緒（含音訊）");
    };
  } catch (e) {
    say("❌ 相機不可用：" + e.message);
  }
};

stopCameraBtn.onclick = () => {
  if (vid.srcObject) {
    vid.srcObject.getTracks().forEach((t) => t.stop());
    vid.srcObject = null;
    say("📴 攝像頭已關閉");
  }
};

/* ============================================================
   SELFTEST
============================================================ */
$("selftestBtn").onclick = async () => {
  log.textContent = "";
  say("自檢中…");

  try {
    await loadMP2();
    await initMP2Detector(modelSel.value);
    say("✅ MP2 模型載入成功");
  } catch (e) {
    say("❌ MP2 載入錯誤：" + e.message);
  }
};

/* ============================================================
   START
============================================================ */
startBtn.onclick = async () => {
  if (!vid.src && !vid.srcObject) {
    alert("請先載入影片或開攝像頭");
    return;
  }

  try {
    await loadMP2();
    await initMP2Detector(modelSel.value);

    startDetect(vid, can, {
      rec: recToggle.checked,
      fpsEl,
      framesEl,
      prog,
      tprog,
      say,
    });

    if (recToggle.checked) startRecording(can, vid);
    say("▶️ 開始");
  } catch (e) {
    say("❌ start 錯誤：" + e.message);
  }
};

/* ============================================================
   STOP
============================================================ */
pauseBtn.onclick = async () => {
  stopDetect();
  await stopRecording();
  say("⏸ 停止");
};

/* ============================================================
   ZIP Export
============================================================ */
saveZipBtn.onclick = () => {
  exportZip(zipNameInput.value, can);
};
