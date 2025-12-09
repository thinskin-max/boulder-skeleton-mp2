/* ============================================================================
   mp2-detector.js — MediaPipe 2 Pose Detection
============================================================================ */

import { loadMP2 } from "./mp2-loader.js";

let detector = null;
let running = false;
let rafId = null;

export async function initMP2Detector(modelType = "full") {
  const vision = await loadMP2();
  const { FilesetResolver, PoseLandmarker } = vision;

  const resolver = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
  );

  detector = await PoseLandmarker.createFromOptions(resolver, {
    baseOptions: { modelAssetPath: modelFile(modelType) },
    runningMode: "video",
    numPoses: 1
  });

  return detector;
}

function modelFile(type) {
  return {
    lite:  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/pose_landmarker_lite.task",
    full:  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/pose_landmarker_full.task",
    heavy: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/pose_landmarker_heavy.task"
  }[type];
}

/* ============================================================================
   Main detection loop
============================================================================ */
export function startDetect(video, canvas, ui) {
  const ctx = canvas.getContext("2d");
  running = true;

  function loop(ts) {
    if (!running) return;

    if (video.readyState >= 2) {
      const res = detector.detectForVideo(video, ts);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (res.landmarks && res.landmarks[0]) {
        const lm = res.landmarks[0];
        ui.draw(lm);
      }
    }

    rafId = requestAnimationFrame(loop);
  }

  loop();
}

export function stopDetect() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
}
