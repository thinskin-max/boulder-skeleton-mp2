/* ============================================================================
   Boulder Skeleton — MP2 Edition
   draw.js — Skeleton Overlay Renderer
   - 支援 33 Landmark（MediaPipe）
   - 支援自訂 pelvis_center / spine_mid
============================================================================ */

export const Drawer = {
  color: "#FFD72D",
  pointSize: 5,
  lineWidth: 3,

  setColor,
  draw
};


/* 設定骨架顏色 ============================================================= */
function setColor(c) {
  Drawer.color = c;
}


/* 主繪圖函式 =============================================================== */
function draw(ctx, keypoints) {
  if (!ctx || !keypoints || keypoints.length === 0) return;

  ctx.lineWidth = Drawer.lineWidth;
  ctx.strokeStyle = Drawer.color;
  ctx.fillStyle = Drawer.color;

  /* -------------------------------------------------------------
     1) Landmark map（方便查找）
  ------------------------------------------------------------- */
  const by = Object.fromEntries(keypoints.map(p => [p.name, p]));

  /* -------------------------------------------------------------
     2) 自訂 Landmark：pelvis_center / spine_mid
  ------------------------------------------------------------- */
  const LHIP = by.left_hip;
  const RHIP = by.right_hip;
  const LSHO = by.left_shoulder;
  const RSHO = by.right_shoulder;

  let pelvis_center = null;
  let shoulder_center = null;
  let spine_mid = null;

  if (LHIP && RHIP) {
    pelvis_center = midPoint(LHIP, RHIP);
    pelvis_center.name = "pelvis_center";
    keypoints.push(pelvis_center);
  }

  if (LSHO && RSHO) {
    shoulder_center = midPoint(LSHO, RSHO);
    shoulder_center.name = "shoulder_center";
    keypoints.push(shoulder_center);
  }

  if (pelvis_center && shoulder_center) {
    spine_mid = midPoint(pelvis_center, shoulder_center);
    spine_mid.name = "spine_mid";
    keypoints.push(spine_mid);
  }


  /* -------------------------------------------------------------
     3) Skeleton Connection Layout（MP2 33點）
     - 依照 BlazePose / MediaPipe Pose 標準骨架結構
  ------------------------------------------------------------- */
  const edges = [
    // Torso
    ["left_shoulder", "right_shoulder"],
    ["left_shoulder", "left_hip"],
    ["right_shoulder", "right_hip"],
    ["left_hip", "right_hip"],

    // Arms
    ["left_shoulder", "left_elbow"],
    ["left_elbow", "left_wrist"],
    ["right_shoulder", "right_elbow"],
    ["right_elbow", "right_wrist"],

    // Legs
    ["left_hip", "left_knee"],
    ["left_knee", "left_ankle"],
    ["right_hip", "right_knee"],
    ["right_knee", "right_ankle"],

    // Feet (sub landmarks)
    ["left_ankle", "left_heel"],
    ["left_heel", "left_foot_index"],
    ["right_ankle", "right_heel"],
    ["right_heel", "right_foot_index"],

    // 自訂 Backbone
    ["pelvis_center", "spine_mid"],
    ["spine_mid", "shoulder_center"]
  ];


  /* -------------------------------------------------------------
     4) 畫線段（骨架）
  ------------------------------------------------------------- */
  ctx.beginPath();

  for (const [a, b] of edges) {
    const p1 = by[a];
    const p2 = by[b];
    if (!p1 || !p2) continue;

    if (p1.score < 0.2 || p2.score < 0.2) continue;

    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
  }
  ctx.stroke();


  /* -------------------------------------------------------------
     5) 畫點（關節）
  ------------------------------------------------------------- */
  for (const p of keypoints) {
    if (!p || p.score < 0.2) continue;

    ctx.beginPath();
    ctx.arc(p.x, p.y, Drawer.pointSize, 0, Math.PI * 2);
    ctx.fill();
  }
}


/* 工具：取得兩點中點 ====================================================== */
function midPoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    score: Math.min(a.score, b.score)
  };
}
