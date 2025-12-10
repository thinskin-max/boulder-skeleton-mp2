/* ============================================================================
   draw.js — Skeleton overlay + Metrics calculator
   Boulder Skeleton MP2 Lite Edition
============================================================================ */

/* ========== Skeleton color (UI can modify) ========== */
let SK_COLOR = "#FFD72D";

export function hookSkeletonColor(c) {
  SK_COLOR = c;
}

/* ========== MP2 Landmarks (standard order) ========== */
const LM = {
  nose: 0,
  left_eye_inner: 1,
  left_eye: 2,
  left_eye_outer: 3,
  right_eye_inner: 4,
  right_eye: 5,
  right_eye_outer: 6,
  left_ear: 7,
  right_ear: 8,
  mouth_left: 9,
  mouth_right: 10,
  left_shoulder: 11,
  right_shoulder: 12,
  left_elbow: 13,
  right_elbow: 14,
  left_wrist: 15,
  right_wrist: 16,
  left_pinky: 17,
  right_pinky: 18,
  left_index: 19,
  right_index: 20,
  left_thumb: 21,
  right_thumb: 22,
  left_hip: 23,
  right_hip: 24,
  left_knee: 25,
  right_knee: 26,
  left_ankle: 27,
  right_ankle: 28,
  left_heel: 29,
  right_heel: 30,
  left_foot_index: 31,
  right_foot_index: 32
};

/* ============================================================================
   Utility — convert MP2 lm[] to {name: {x,y}}
============================================================================ */
function named(lm) {
  const o = {};
  for (const key in LM) {
    const p = lm[LM[key]];
    o[key] = { x: p.x, y: p.y };
  }
  return o;
}

/* ============================================================================
   Line helper
============================================================================ */
function L(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

/* ============================================================================
   Angle calculation
============================================================================ */
function angle(a, b, c) {
  if (!a || !b || !c) return null;
  const ab = [a.x - b.x, a.y - b.y];
  const cb = [c.x - b.x, c.y - b.y];
  const dot = ab[0] * cb[0] + ab[1] * cb[1];
  const mab = Math.hypot(...ab);
  const mcb = Math.hypot(...cb);
  if (!mab || !mcb) return null;
  const v = dot / (mab * mcb);
  return +(Math.acos(Math.min(1, Math.max(-1, v))) * 180 / Math.PI).toFixed(1);
}

/* ============================================================================
   Base area (triangle area)
============================================================================ */
function tri(a, b, c) {
  if (!a || !b || !c) return null;
  return Math.abs(
    (a.x * (b.y - c.y) +
     b.x * (c.y - a.y) +
     c.x * (a.y - b.y)) / 2
  );
}

/* ============================================================================
   drawSkeleton(ctx, lm)
   And compute metrics → written to window.__metrics
============================================================================ */
export function drawSkeleton(ctx, lm) {
  if (!lm) return;

  const k = named(lm);

  ctx.lineWidth = 3;
  ctx.strokeStyle = SK_COLOR;

  /* ------------------ Torso core landmarks ------------------ */
  const pelvis_center = {
    x: (k.left_hip.x + k.right_hip.x) / 2,
    y: (k.left_hip.y + k.right_hip.y) / 2
  };

  const shoulder_center = {
    x: (k.left_shoulder.x + k.right_shoulder.x) / 2,
    y: (k.left_shoulder.y + k.right_shoulder.y) / 2
  };

  const spine_mid = {
    x: (pelvis_center.x + shoulder_center.x) / 2,
    y: (pelvis_center.y + shoulder_center.y) / 2
  };

  /* ------------------ Skeleton lines ------------------ */

  // Torso
  L(ctx, k.left_shoulder, k.right_shoulder);
  L(ctx, k.left_hip, k.right_hip);
  L(ctx, shoulder_center, spine_mid);
  L(ctx, spine_mid, pelvis_center);

  // Arms
  L(ctx, k.left_shoulder, k.left_elbow);
  L(ctx, k.left_elbow, k.left_wrist);

  L(ctx, k.right_shoulder, k.right_elbow);
  L(ctx, k.right_elbow, k.right_wrist);

  // Legs
  L(ctx, k.left_hip, k.left_knee);
  L(ctx, k.left_knee, k.left_ankle);

  L(ctx, k.right_hip, k.right_knee);
  L(ctx, k.right_knee, k.right_ankle);

  // Feet
  L(ctx, k.left_ankle, k.left_foot_index);
  L(ctx, k.right_ankle, k.right_foot_index);

  /* ------------------ Metrics ------------------ */

  const metrics = {
    elbowL: angle(k.left_shoulder, k.left_elbow, k.left_wrist),
    elbowR: angle(k.right_shoulder, k.right_elbow, k.right_wrist),
    kneeL: angle(k.left_hip, k.left_knee, k.left_ankle),
    kneeR: angle(k.right_hip, k.right_knee, k.right_ankle),
    baseL: tri(k.left_shoulder, k.left_hip, k.left_ankle),
    baseR: tri(k.right_shoulder, k.right_hip, k.right_ankle)
  };

  window.__metrics = metrics; // used by ui.js
}

/* ============================================================================
   fitCanvasToVideo()
============================================================================ */
export function fitCanvasToVideo(video, canvas) {
  if (!video.videoWidth) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}
