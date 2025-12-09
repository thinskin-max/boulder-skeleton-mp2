/* ============================================================================
   draw.js — draw skeleton landmarks
============================================================================ */

let COLOR = "#FFD72D";

export function hookSkeletonColor(c) {
  COLOR = c;
}

export function drawSkeleton(ctx, lm) {
  ctx.fillStyle = COLOR;
  ctx.strokeStyle = COLOR;
  ctx.lineWidth = 3;

  for (const p of lm) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function fitCanvasToVideo(video, canvas) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}
