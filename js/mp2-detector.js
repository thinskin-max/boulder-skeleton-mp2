/* PoseLandmarker: GPU first, CPU fallback, one callback per video frame. */

import { loadMP2, MP_VERSION, MP_WASM_URL } from "./mp2-loader.js";

const LITE_URL = new URL("../models/pose_landmarker_lite.task", import.meta.url).href;
const LITE_REMOTE =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const FULL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const HEAVY_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task";

const state = {
  fileset: null,
  landmarker: null,
  delegate: null,
  model: null,
  confidence: 0.5,
  generation: 0,
  running: false,
  video: null,
  rvfcId: 0,
  rafId: 0,
  useRVFC: false,
  lastTs: 0,
  lastMedia: -1,
  fallbackOnce: false,
  lastErrorAt: 0
};

function pathsFor(model) {
  if (model === "full") return [FULL_URL];
  if (model === "heavy") return [HEAVY_URL];
  return [LITE_URL, LITE_REMOTE];
}

function nextTs() {
  const now = performance.now();
  state.lastTs = now <= state.lastTs ? state.lastTs + 1 : now;
  return state.lastTs;
}

async function createLandmarker(model, delegate, modelPath) {
  const { PoseLandmarker } = window.__mp2;
  return PoseLandmarker.createFromOptions(state.fileset, {
    baseOptions: {
      modelAssetPath: modelPath,
      delegate
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: state.confidence,
    minPosePresenceConfidence: state.confidence,
    minTrackingConfidence: state.confidence
  });
}

async function tryCreate(model, delegate, modelPath, ms) {
  let discarded = false;
  let timer;
  const created = createLandmarker(model, delegate, modelPath).then((lm) => {
    if (discarded) {
      try { lm.close(); } catch { /* late init */ }
      return null;
    }
    return lm;
  }, (err) => {
    if (discarded) return null;
    throw err;
  });
  try {
    const lm = await Promise.race([
      created,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          discarded = true;
          reject(new Error(`${delegate} 初始化逾時`));
        }, ms);
      })
    ]);
    if (!lm) throw new Error(`${delegate} 初始化失敗`);
    return lm;
  } finally {
    clearTimeout(timer);
  }
}

async function openLandmarker(model) {
  const paths = pathsFor(model);
  const errors = [];
  for (const modelPath of paths) {
    try {
      const lm = await tryCreate(model, "GPU", modelPath, 25000);
      return { lm, delegate: "GPU" };
    } catch (err) {
      errors.push(err);
    }
    try {
      const lm = await tryCreate(model, "CPU", modelPath, 60000);
      return { lm, delegate: "CPU" };
    } catch (err) {
      errors.push(err);
    }
  }
  const detail = errors.map(e => e?.message || String(e)).filter(Boolean).slice(-2).join(" | ");
  throw new Error(detail || "模型載入失敗");
}

function closeLandmarker() {
  const old = state.landmarker;
  state.landmarker = null;
  if (!old) return;
  try { old.close(); } catch { /* already closed */ }
}

export async function initMP2Detector(modelType = "lite", opts = {}) {
  const gen = ++state.generation;
  if (opts.confidence != null) state.confidence = clampConf(opts.confidence);
  await loadMP2();
  if (gen !== state.generation) return null;

  const { FilesetResolver, PoseLandmarker } = window.__mp2;
  if (!FilesetResolver || !PoseLandmarker) {
    throw new Error("MP 核心缺少 FilesetResolver / PoseLandmarker");
  }
  if (!state.fileset) {
    state.fileset = await FilesetResolver.forVisionTasks(MP_WASM_URL);
  }
  if (gen !== state.generation) return null;

  closeLandmarker();
  const opened = await openLandmarker(modelType);
  if (gen !== state.generation) {
    try { opened.lm.close(); } catch { /* ignore */ }
    return null;
  }
  state.landmarker = opened.lm;
  state.delegate = opened.delegate;
  state.model = modelType;
  state.lastTs = 0;
  state.fallbackOnce = false;
  return { model: modelType, delegate: opened.delegate, version: MP_VERSION };
}

function clampConf(c) {
  const v = Number(c);
  if (!Number.isFinite(v)) return 0.5;
  return Math.min(0.9, Math.max(0.1, v));
}

export async function setConfidence(c) {
  state.confidence = clampConf(c);
  if (!state.landmarker) return;
  await state.landmarker.setOptions({
    minPoseDetectionConfidence: state.confidence,
    minPosePresenceConfidence: state.confidence,
    minTrackingConfidence: state.confidence
  });
}

export function detectorStatus() {
  return {
    model: state.model,
    delegate: state.delegate,
    ready: !!state.landmarker,
    version: MP_VERSION,
    confidence: state.confidence,
    frameClock: state.useRVFC ? "requestVideoFrameCallback" : "requestAnimationFrame"
  };
}

export function detectOnce(video) {
  if (!state.landmarker) throw new Error("模型尚未載入");
  if (!video?.videoWidth) throw new Error("沒有畫面");
  return state.landmarker.detectForVideo(video, nextTs());
}

async function fallbackToCpu(hooks) {
  const gen = state.generation;
  const model = state.model || "lite";
  try {
    const lm = await createLandmarker(model, "CPU", pathsFor(model)[0]);
    if (gen !== state.generation) {
      try { lm.close(); } catch { /* ignore */ }
      return;
    }
    closeLandmarker();
    state.landmarker = lm;
    state.delegate = "CPU";
    state.lastTs = 0;
    hooks.onReady?.({ model, delegate: "CPU", fallback: true, version: MP_VERSION });
  } catch (err) {
    hooks.onError?.(err);
  }
}

function reportError(hooks, err) {
  const now = performance.now();
  if (now - state.lastErrorAt < 2000) return;
  state.lastErrorAt = now;
  hooks.onError?.(err);
}

export function startDetect(video, hooks) {
  if (!state.landmarker) throw new Error("模型尚未載入");
  stopDetect();
  state.running = true;
  state.video = video;
  state.useRVFC = typeof video.requestVideoFrameCallback === "function";
  state.lastMedia = -1;

  const step = (mediaTime) => {
    if (!state.running || !state.landmarker) return;
    if (video.readyState < 2 || !video.videoWidth) return;
    if (!state.useRVFC && !video.srcObject && mediaTime === state.lastMedia) return;
    state.lastMedia = mediaTime;
    let result = null;
    try {
      result = state.landmarker.detectForVideo(video, nextTs());
    } catch (err) {
      if (state.delegate === "GPU" && !state.fallbackOnce) {
        state.fallbackOnce = true;
        const broken = state.landmarker;
        state.landmarker = null;
        try { broken?.close(); } catch { /* GPU graph is unusable */ }
        hooks.onFallback?.(err);
        fallbackToCpu(hooks);
      } else {
        reportError(hooks, err);
      }
      return;
    }
    hooks.onFrame?.({ result, mediaTime });
  };

  let sawFrame = false;
  const loop = (now, meta) => {
    if (!state.running) return;
    sawFrame = true;
    const mediaTime = meta && typeof meta.mediaTime === "number" ? meta.mediaTime : video.currentTime;
    try {
      step(mediaTime);
    } catch (err) {
      reportError(hooks, err);
    }
    if (!state.running) return;
    if (state.useRVFC) state.rvfcId = video.requestVideoFrameCallback(loop);
    else state.rafId = requestAnimationFrame(loop);
  };

  if (state.useRVFC) {
    state.rvfcId = video.requestVideoFrameCallback(loop);
    // Covered or background video elements sometimes never present a frame.
    setTimeout(() => {
      if (!state.running || sawFrame || !state.useRVFC) return;
      state.useRVFC = false;
      if (state.video && state.rvfcId && state.video.cancelVideoFrameCallback) {
        state.video.cancelVideoFrameCallback(state.rvfcId);
      }
      state.rvfcId = 0;
      state.rafId = requestAnimationFrame(loop);
    }, 500);
  } else {
    state.rafId = requestAnimationFrame(loop);
  }
}

export function stopDetect() {
  state.running = false;
  const video = state.video;
  if (video && state.rvfcId && video.cancelVideoFrameCallback) {
    video.cancelVideoFrameCallback(state.rvfcId);
  }
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rvfcId = 0;
  state.rafId = 0;
}
