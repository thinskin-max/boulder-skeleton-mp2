/* ============================================================================
   Boulder Skeleton — MP2 Edition
   MediaPipe 2 PoseLandmarker Detection Core
   專用於 GitHub Pages, localhost, Safari, Chrome

   依賴：
   - mp2-loader.js (loadMP2)
============================================================================ */

import { loadMP2 } from "./mp2-loader.js";

export let mp2Model = null;       // PoseLandmarker instance
export let mp2Ready = false;      // 已初始化？
export let mp2Running = false;    // detection loop on/off
export let mp2ModelType = "full"; // current model selection
export let mp2RunningMode = "video";

let rafId = null;

/* ============================================================================ 
   Landmark 名稱（MediaPipe 2 → BlazePose v33 對應）
============================================================================ */
const LM_NAMES = [
  "nose","left_eye_inner","left_eye","left_eye_outer",
  "right_eye_inner","right_eye","right_eye_outer",
  "left_ear","right_ear","mouth_left","mouth_right",
  "left_shoulder","right_shoulder",
  "left_elbow","right_elbow",
  "left_wrist","right_wrist",
  "left_pinky","right_pinky",
  "left_index","right_index",
  "left_thumb","right_thumb",
  "left_hip","right_hip",
  "left_knee","right_knee",
  "left_ankle","right_ankle",
  "left_heel","right_heel",
  "left_foot_index","right_foot_index"
];

/* ============================================================================ 
   MediaPipe 2 model CDN
============================================================================ */
const MP2_MODEL = {
  lite:  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/pose_landmarker_lite.task",
  full:  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/pose_landmarker_full.task",
  heavy: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/pose_landmarker_heavy.task"
};

/* ============================================================================ 
   初始化 PoseLandmarker
============================================================================ */
export async function initMP2Model(type = "full") {
  mp2ModelType = type;

  const MP2 = await loadMP2();
  const { FilesetResolver, PoseLandmarker } = MP2;

  // 安全檢查
  if (!FilesetResolver || !PoseLandmarker) {
    throw new Error("MP2 Loader 已載入但 API 缺失");
  }

  // 生成 vision wasm loader
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
  );

  // 建立 Landmarker
  mp2Model = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MP2_MODEL[type] },
    runningMode: mp2RunningMode,
    numPoses: 1,
    minPoseDetectionConfidence: 0.4,
    minPosePresenceConfidence: 0.4,
    minTrackingConfidence: 0.4
  });

  mp2Ready = true;
  console.log(`✅ MP2 Model Ready (${type})`);
  return true;
}

/* ============================================================================ 
   detectForVideo wrapper
============================================================================ */
function detect(video) {
  if (!mp2Ready || !mp2Model) return null;

  const ts = performance.now();
  try {
    const r = mp2Model.detectForVideo(video, ts);
    return r?.landmarks?.[0] ?? null;
  } catch (err) {
    console.error("❌ detectForVideo error:", err);
    return null;
  }
}

/* ============================================================================ 
   Convert MediaPipe landmarks → internal keypoint format
============================================================================ */
function convertLandmarks(lm, width, height) {
  if (!lm) return [];

  const out = [];
  for (let i = 0; i < lm.length; i++) {
    const p = lm[i];
    out.push({
      x: p.x * width,
      y: p.y * height,
      score: p.visibility ?? 0,
      name: LM_NAMES[i] || `landmark_${i}`
    });
  }
  return out;
}

/* ============================================================================ 
   Metrics (角度 / base area)
============================================================================ */
function angle(a, b, c) {
  if (!a || !b || !c) return null;
  const ab = [a.x - b.x, a.y - b.y];
  const cb = [c.x - b.x, c.y - b.y];
  const dot = ab[0]*cb[0] + ab[1]*cb[1];
  const mab = Math.hypot(...ab);
  const mcb = Math.hypot(...cb);
  if (!mab || !mcb) return null;
  return +(Math.acos(Math.min(1, Math.max(-1, dot / (mab*mcb)))) * 180 / Math.PI).toFixed(1);
}

function tri(a, b, c) {
  if (!a || !b || !c) return null;
  return Math.abs((a.x*(b.y-c.y) + b.x*(c.y-a.y) + c.x*(a.y-b.y)) / 2);
}

function summarize(by) {
  return {
    elbowL: angle(by.left_shoulder, by.left_elbow, by.left_wrist),
    elbowR: angle(by.right_shoulder, by.right_elbow, by.right_wrist),
    kneeL:  angle(by.left_hip, by.left_knee, by.left_ankle),
    kneeR:  angle(by.right_hip, by.right_knee, by.right_ankle),
    baseL:  tri(by.left_shoulder, by.left_hip, by.left_ankle),
    baseR:  tri(by.right_shoulder, by.right_hip, by.right_ankle),
  };
}

/* ============================================================================ 
   FPS（rolling average）
============================================================================ */
let fpsHist = [];
let lastT = 0;

function updateFPS(ts, fpsEl) {
  if (lastT) {
    const inst = 1000 / (ts - lastT);
    fpsHist.push(inst);
    if (fpsHist.length > 30) fpsHist.shift();
  }
  lastT = ts;

  if (fpsEl) {
    fpsEl.textContent = fpsHist.length
      ? Math.round(fpsHist.reduce((a,b)=>a+b,0) / fpsHist.length)
      : 0;
  }
}

/* ============================================================================ 
   主 Detection Loop
   callback(data):
       {
         k: keypoints,
         metrics: {...},
         time: video.currentTime
       }
============================================================================ */
export function startDetectionLoop(video, canvas, ctx, callback, fpsEl=null, framesEl=null) {
  if (!mp2Ready || !mp2Model) {
    throw new Error("MP2 model not ready. 請先 initMP2Model()");
  }

  mp2Running = true;
  let frames = 0;

  const loop = (ts) => {
    if (!mp2Running) return;

    // draw original
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // detection
    const lm = detect(video);
    let data = null;

    if (lm) {
      const k = convertLandmarks(lm, canvas.width, canvas.height);
      const by = Object.fromEntries(k.map(p => [p.name, p]));
      const metrics = summarize(by);

      data = {
        k,
        metrics,
        time: +video.currentTime.toFixed(3)
      };
    }

    // 回傳 data（UI / Recorder / Exporter 會用）
    if (callback) callback(data);

    // FPS / Frame count
    updateFPS(ts, fpsEl);
    frames++;
    if (framesEl) framesEl.textContent = frames;

    rafId = requestAnimationFrame(loop);
  };

  rafId = requestAnimationFrame(loop);
}

/* ============================================================================ 
   停止 detection
============================================================================ */
export function stopDetection() {
  mp2Running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  console.log("🛑 MP2 detection loop stopped");
}
