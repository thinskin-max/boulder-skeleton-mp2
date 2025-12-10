/* ============================================================================
   mp2-detector.js — MediaPipe PoseLandmarker (Lite Runtime)
   Compatible with GitHub Pages (no wasm folder needed)
============================================================================ */

import { loadMP2 } from "./mp2-loader.js";

/* Model URLs (Lite chosen by you) */
const MODEL_LITE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.6/pose_landmarker_lite.task";

/* Runtime state */
let landmarker = null;
let running = false;
let rafId = null;

/* ============================================================================
   initMP2Detector(modelType)
   modelType = "lite" (your choice)
============================================================================ */
export async function initMP2Detector(modelType = "lite") {
  await loadMP2();

  const { FilesetResolver, PoseLandmarker } = window.__mp2;

  if (!FilesetResolver || !PoseLandmarker)
    throw new Error("MP2 core missing — FilesetResolver / PoseLandmarker not ready");

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.6/wasm"
  );

  landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_LITE
    },
    runningMode: "video",
    numPoses: 1,
    minPoseDetectionConfidence: 0.4,
    minPosePresenceConfidence: 0.4,
    minTrackingConfidence: 0.4
  });

  return landmarker;
}

/* ============================================================================
   startDetect(video, canvas, { draw })
   The UI injects draw(ctx, landmarks)
============================================================================ */
export function startDetect(video, canvas, { draw }) {
  if (!landmarker) throw new Error("Detector not initialized — call initMP2Detector() first");

  const ctx = canvas.getContext("2d");
  running = true;

  function loop(t) {
    if (!running) return;

    if (video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const res = landmarker.detectForVideo(video, performance.now());
      const lm = res && res.landmarks && res.landmarks[0];

      if (lm) {
        draw(ctx, lm);
      }
    }

    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);
}

/* ============================================================================
   stopDetect()
============================================================================ */
export function stopDetect() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}
