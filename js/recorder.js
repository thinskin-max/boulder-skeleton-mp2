/* ============================================================================
   Boulder Skeleton — MP2 Edition
   ui.js — UI events + module orchestration (corrected version)
============================================================================ */

import { loadMP2 } from "./mp2-loader.js";
import { initMP2Detector, startDetect, stopDetect } from "./mp2-detector.js";
import { Recorder } from "./recorder.js";
import { Exporter } from "./exporter.js";

/* DOM Helpers */
const $ = (id) => document.getElementById(id);

const vid = $("video");
const can = $("canvas");

const file = $("file");
const startBtn = $("startBtn");
const stopBtn = $("pauseBtn");
const modelSel = $("modelSel");
const recToggle = $("recToggle");

const diag = $("diag");
const log = $("log");

const fpsEl = $("fps");
const framesEl = $("frames");
const prog = $("prog");
const tprog = $("tprog");
const zipNameInput = $("zipName");

const cameraBtn = $("cameraBtn");
const stopCameraBtn = $("stopCameraBtn");
const saveZipBtn = $("saveZipBtn");

/* ============================================================================  
   Logging  
============================================================================ */
function say(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  log.textContent += line;
  log.scrollTop = log.scrollHeight;
  diag.textContent = msg;
}

/* ============================================================================  
   VIDEO FILE UPLOAD  
============================================================================ */
file.onchange = () => {
  const f = file.files[0];
  if (!f) return;

  vid.src = URL.createObjectURL(f);

  vid.onloadedmetadata = () => {
    fitCanvasToVideo();
    vid.play();
    say("🎞️ 影片已載入");
  };
};

/* Keep consistent with your earlier code */
function fitCanvasToVideo() {
  if (!vid.videoWidth || !vid.videoHeight) return;

  can.width = vid.videoWidth;
  can.height = vid.videoHeight;

  if (vid.videoHeight > vid.videoWidth) {
    document.body.classList.add("portrait");
    document.body.classList.remove("landscape");
  } else {
    document.body.classList.add("landscape");
    document.body.classList.remove("portrait");
  }
}

/* ============================================================================  
   CAMERA  
============================================================================ */
cameraBtn.onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    vid.srcObject = stream;

    vid.onloadedmetadata = () => {
      fitCanvasToVideo();
      vid.play();
      say("📷 攝影機已啟動");
    };
  } catch (e) {
    say("❌ 相機啟動失敗：" + e.message);
  }
};

stopCameraBtn.onclick = () => {
  if (vid.srcObject) {
    vid.srcObject.getTracks().forEach((t) => t.stop());
    vid.srcObject = null;
    say("📴 相機已關閉");
  }
};

/* ============================================================================  
   SELF TEST  
============================================================================ */
$("selftestBtn").onclick = async () => {
  log.textContent = "";
  say("自檢中…");

  try {
    await loadMP2();
    await initMP2Detector(modelSel.value);
    say("✅ MP2 模型載入成功");
  } catch (err) {
    say("❌ MP2 載入失敗：" + err.message);
  }
};

/* ============================================================================  
   START DETECTION  
============================================================================ */
startBtn.onclick = async () => {
  if (!vid.src && !vid.srcObject) {
    alert("請先載入影片或啟動相機");
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

    if (recToggle.checked) Recorder.start(can, vid);

    say("▶️ 開始偵測");
  } catch (e) {
    say("❌ 開始偵測錯誤：" + e.message);
  }
};

/* ============================================================================  
   STOP DETECTION  
============================================================================ */
stopBtn.onclick = async () => {
  stopDetect();
  await Recorder.stop();
  say("⏸ 偵測已停止");
};

/* ============================================================================  
   EXPORT ZIP  
============================================================================ */
saveZipBtn.onclick = () => {
  Exporter.export(zipNameInput.value, can);
};

