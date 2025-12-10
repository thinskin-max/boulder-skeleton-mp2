/* ============================================================================
   exporter.js — ZIP Exporter for Boulder Skeleton MP2 Edition
   Exports:
     • overlay video (blob)
     • poses.json (landmarks timeline)
     • metrics.csv (angles, base area)
============================================================================ */

/* JSZip is loaded via CDN inside index.html */
import { stopRecording } from "./recorder.js";

/* Runtime stash */
let poseLog = [];

/* ============================================================================
   recordFrame(data)
   Called every frame by ui.js
============================================================================ */
export function recordFrame(frameData) {
  poseLog.push(frameData);
}

/* ============================================================================
   exportZip()
============================================================================ */
export async function exportZip(customName, canvas) {
  const blob = await stopRecording(); // overlay only

  /* ---- ZIP filename (date + time) ---- */
  const now = new Date();
  let base = customName || timestamp(now);

  const zip = new JSZip();

  /* ---- overlay.mp4 ---- */
  if (blob) {
    zip.file(`${base}_overlay.mp4`, blob);
  }

  /* ---- poses.json ---- */
  zip.file(
    "poses.json",
    JSON.stringify({ createdAt: now.toISOString(), frames: poseLog }, null, 2)
  );

  /* ---- metrics.csv ---- */
  zip.file("metrics.csv", buildCSV());

  /* ---- generate ZIP ---- */
  const out = await zip.generateAsync({ type: "blob" });
  triggerDownload(out, `${base}.zip`);

  /* clear memory */
  poseLog = [];
}

/* ============================================================================
   buildCSV()
============================================================================ */
function buildCSV() {
  const header = "t,elbowL,elbowR,kneeL,kneeR,baseL,baseR\n";

  const lines = poseLog.map(f => {
    const a = f.angles || {};
    return [
      f.t ?? "",
      a.elbowL ?? "",
      a.elbowR ?? "",
      a.kneeL ?? "",
      a.kneeR ?? "",
      a.baseL ?? "",
      a.baseR ?? ""
    ].join(",");
  });

  return header + lines.join("\n");
}

/* ============================================================================
   triggerDownload()
============================================================================ */
function triggerDownload(blob, filename) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ============================================================================
   timestamp(now)  →  "2025-01-01_23-58-09"
============================================================================ */
function timestamp(d) {
  const pad = n => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}
