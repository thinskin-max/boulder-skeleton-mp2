/* Skeleton, support polygon, center-of-mass trail, joint readouts. */

import { LM } from "./pose-math.js";

let SK_COLOR = "#FFD72D";

export function hookSkeletonColor(c) {
  if (typeof c === "string" && c) SK_COLOR = c;
}

export function skeletonColor() {
  return SK_COLOR;
}

const BONES = [
  ["left_shoulder", "right_shoulder"],
  ["left_hip", "right_hip"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["left_wrist", "left_index"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["right_wrist", "right_index"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["left_ankle", "left_foot_index"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
  ["right_ankle", "right_foot_index"],
  ["left_ear", "nose"],
  ["right_ear", "nose"]
];

const JOINTS = [
  "nose",
  "left_shoulder", "right_shoulder",
  "left_elbow", "right_elbow",
  "left_wrist", "right_wrist",
  "left_hip", "right_hip",
  "left_knee", "right_knee",
  "left_ankle", "right_ankle"
];

const VIS = 0.45;

export function fitCanvasToVideo(video, canvas) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return false;
  const scale = Math.min(1, 1280 / Math.max(vw, vh));
  let w = Math.max(2, Math.round(vw * scale));
  let h = Math.max(2, Math.round(vh * scale));
  if (w % 2) w -= 1;
  if (h % 2) h -= 1;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  return false;
}

export function paintVideo(ctx, video, mirror) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (!w || !h || !video.videoWidth) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  if (mirror) {
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(video, 0, 0, w, h);
  }
}

function pointVis(p) {
  const v = p?.visibility ?? p?.presence;
  return typeof v === "number" ? v : 0;
}

function toPx(p, w, h, mirror) {
  return {
    x: (mirror ? 1 - p.x : p.x) * w,
    y: p.y * h,
    v: pointVis(p)
  };
}

function line(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function haloText(ctx, text, x, y) {
  ctx.lineWidth = Math.max(3, ctx.canvas.width / 280);
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}

export function drawOverlay(ctx, image, view) {
  if (!image?.length) return;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const mirror = !!view.mirror;
  const pts = image.map(p => p ? toPx(p, w, h, mirror) : null);

  if (view.showAnalysis && view.support?.hull?.length) {
    const hull = view.support.hull.map(p => ({
      x: (mirror ? 1 - p.x : p.x) * w,
      y: p.y * h
    }));
    const outside = view.support.inside === false;
    ctx.beginPath();
    hull.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (hull.length >= 3) ctx.closePath();
    ctx.fillStyle = outside ? "rgba(255,180,40,0.22)" : "rgba(10,255,255,0.16)";
    ctx.strokeStyle = outside ? "#ffb428" : "#0affff";
    ctx.lineWidth = Math.max(2, w / 320);
    if (hull.length >= 3) ctx.fill();
    ctx.stroke();
  }

  if (view.showAnalysis && view.trail?.length > 1) {
    ctx.lineWidth = Math.max(2, w / 300);
    ctx.strokeStyle = "#0affff";
    ctx.lineCap = "round";
    const n = view.trail.length;
    for (let i = 1; i < n; i++) {
      const a = view.trail[i - 1];
      const b = view.trail[i];
      ctx.globalAlpha = 0.15 + 0.75 * (i / n);
      ctx.beginPath();
      ctx.moveTo((mirror ? 1 - a.x : a.x) * w, a.y * h);
      ctx.lineTo((mirror ? 1 - b.x : b.x) * w, b.y * h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = SK_COLOR;
  ctx.fillStyle = SK_COLOR;
  ctx.lineWidth = Math.max(2.5, w / 220);

  for (const [aName, bName] of BONES) {
    const a = pts[LM[aName]];
    const b = pts[LM[bName]];
    if (!a || !b || a.v < VIS || b.v < VIS) continue;
    ctx.globalAlpha = 0.35 + 0.65 * Math.min(a.v, b.v);
    line(ctx, a, b);
  }

  const ls = pts[LM.left_shoulder];
  const rs = pts[LM.right_shoulder];
  const lh = pts[LM.left_hip];
  const rh = pts[LM.right_hip];
  if (ls && rs && lh && rh && [ls, rs, lh, rh].every(p => p.v >= VIS)) {
    ctx.globalAlpha = 0.9;
    line(ctx, { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 }, { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 });
  }

  const radius = Math.max(3, w / 180);
  for (const name of JOINTS) {
    const p = pts[LM[name]];
    if (!p || p.v < VIS) continue;
    ctx.globalAlpha = 0.4 + 0.6 * p.v;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (!view.showAnalysis) return;

  if (view.com) {
    const x = (mirror ? 1 - view.com.x : view.com.x) * w;
    const y = view.com.y * h;
    const outside = view.support?.inside === false;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.7, 0, Math.PI * 2);
    ctx.fillStyle = outside ? "#ffb428" : "#0affff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = "#081018";
    ctx.fill();
  }

  if (view.labels?.length) {
    const fontPx = Math.max(13, Math.min(28, Math.round(w * 0.026)));
    ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
    ctx.textBaseline = "bottom";
    for (const label of view.labels) {
      const p = pts[label.index];
      if (!p || p.v < VIS) continue;
      const x = Math.min(w - 8, Math.max(8, p.x + radius + 4));
      const y = Math.min(h - 6, Math.max(fontPx, p.y - radius));
      haloText(ctx, label.text, x, y);
    }
  }
}
