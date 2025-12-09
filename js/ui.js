/* ============================================================================
   Boulder Skeleton — MP2 Edition
   ui.js — 所有 UI event handling + 模組整合點
============================================================================ */

import { loadMP2 } from "./mp2-loader.js";
import { initMP2Detector, startDetect, stopDetect } from "./mp2-detector.js";
import { Recorder } from "./recorder.js";
import { Exporter } from "./exporter.js";


/* DOM Shortcuts */
const $ = id => document.getElementById(id);

/* UI Elements */
const fileInput      = $("file");
const modelSel       = $("modelSel");
const startBtn       = $("startBtn");
const stopBtn        = $("pauseBtn");
const recToggle      = $("recToggle");
const saveZipBtn     = $("saveZipBtn");
const zipNameInput   = $("zipName");

const cameraBtn      = $("cameraBtn");
const stopCameraBtn  = $("stopCameraBtn");

const fullscreenBtn  = $("fullscreenBtn");
const fsExitBtn      = $("fsExitBtn");

const logBox         = $("log");
const diag           = $("diag");

const videoEl        = $("video");
const canvasEl       = $("canvas");
const mediaGrid      = $("mediaGrid");


/* ============================================================================
   LOGGING SYSTEM（與 HTML 中相同格式）
============================================================================ */
function say(msg, cls = "") {
  const time = new Date().toLocaleTimeString();
  const line = `[${time}] ${msg}\n`;
  logBox.textContent += line;
  logBox.scrollTop = logBox.scrollHeight;

  diag.textContent = msg;
  diag.className = "badge " + cls;
}


/* ============================================================================
   影片上載
============================================================================ */
fileInput.onchange = () => {
  const f = fileInput.files[0];
  if (!f) return;

  const url = URL.createObjectURL(f);
  videoEl.src = url;

  videoEl.onloadedmetadata = () => {
    Detector.fitCanvas(videoEl, canvasEl);
    videoEl.play().catch(() => {});
    say("🎞️ 影片已載入", "ok");
  };
};


/* ============================================================================
   模型切換（lite / full / heavy）
============================================================================ */
modelSel.onchange = async () => {
  say(`🔄 模型切換至 ${modelSel.value}…`, "warn");
  await Detector.reloadModel(modelSel.value);
  say(`✨ 模型已載入：${modelSel.value}`, "ok");
};


/* ============================================================================
   START — 開始 MP2 偵測
============================================================================ */
startBtn.onclick = async () => {
  if (!videoEl.src && !videoEl.srcObject) {
    alert("請先載入影片或開啟攝像頭");
    return;
  }

  say("🚀 準備載入 MP2 核心…", "warn");

  await loadMP2(); // 確保 MP2 Loader 完全 ready
  await Detector.init(modelSel.value);

  say("▶️ 開始偵測", "ok");

  // 開始錄影（可能會被 recToggle 控制）
  Recorder.start(canvasEl, videoEl, recToggle.checked);

  // 啟動偵測 loop
  Detector.start(videoEl, canvasEl);
};


/* ============================================================================
   STOP — 停止偵測 + 停止錄影
============================================================================ */
stopBtn.onclick = async () => {
  say("⏸ 停止偵測", "warn");

  Detector.stop();
  await Recorder.stop();

  saveZipBtn.disabled = false;
};


/* ============================================================================
   ZIP 輸出
============================================================================ */
saveZipBtn.onclick = async () => {
  say("📦 打包 ZIP…", "warn");

  const poseLog  = Detector.poseLog;
  const zipName  = zipNameInput.value;
  const size     = { width: canvasEl.width, height: canvasEl.height };

  await Exporter.exportZip(poseLog, zipName, size);

  say("✅ ZIP 完成", "ok");
};


/* ============================================================================
   CAMERA（開）
============================================================================ */
cameraBtn.onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    videoEl.srcObject = stream;

    videoEl.onloadedmetadata = () => {
      Detector.fitCanvas(videoEl, canvasEl);
      videoEl.play();
      say("📷 攝像頭已啟用", "ok");
    };
  } catch (err) {
    say("❌ 相機不可用：" + err.message, "err");
  }
};


/* ============================================================================
   CAMERA（關）
============================================================================ */
stopCameraBtn.onclick = () => {
  if (videoEl.srcObject) {
    videoEl.srcObject.getTracks().forEach(t => t.stop());
    videoEl.srcObject = null;
    say("📴 攝像頭已關閉", "warn");
  } else {
    say("⚠️ 沒有攝像頭運行", "warn");
  }
};


/* ============================================================================
   FULLSCREEN（Desktop + iOS 模擬）
============================================================================ */
fullscreenBtn.onclick = () => {
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isIOS) {
    if (!document.body.classList.contains("ios-fullscreen")) {
      enterIOS();
    } else {
      exitIOS();
    }
    return;
  }

  // Desktop fullscreen
  const req  = mediaGrid.requestFullscreen || mediaGrid.webkitRequestFullscreen;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;

  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    req && req.call(mediaGrid);
  } else {
    exit && exit.call(document);
  }
};

fsExitBtn.onclick = () => exitIOS();


/* ============================================================================
   iOS fullscreen helper
============================================================================ */
function enterIOS() {
  document.body.classList.add("ios-fullscreen");
  window.scrollTo(0, 0);
}

function exitIOS() {
  document.body.classList.remove("ios-fullscreen");
}


/* ============================================================================
   自檢（載入 MP2 + 初始化模型）
============================================================================ */
$("selftestBtn").onclick = async () => {
  logBox.textContent = "";
  say("自檢中…", "warn");

  try {
    await loadMP2();
    await Detector.init(modelSel.value);

    say("✅ MP2 模型載入成功", "ok");
  } catch (err) {
    say("❌ 自檢失敗：" + err.message, "err");
  }
};

