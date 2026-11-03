/* ZIP: overlay video, poses.json, metrics.csv. Original columns stay first. */

import { stopRecording, extensionForMime, resetRecording } from "./recorder.js";

const CSV_HEADER = [
  "t", "elbowL", "elbowR", "kneeL", "kneeR", "baseL", "baseR",
  "shoulderL", "shoulderR", "hipL", "hipR",
  "elbowL3d", "elbowR3d", "kneeL3d", "kneeR3d",
  "shoulderL3d", "shoulderR3d", "hipL3d", "hipR3d",
  "torsoLean", "comX", "comY", "comSpeed", "supportArea", "comInside", "poseVisibility", "torso"
];

let poseLog = [];
let lastZipUrl = null;

export function resetLog() {
  poseLog = [];
}

export function frameCount() {
  return poseLog.length;
}

export function recordFrame(frameData) {
  poseLog.push(frameData);
}

export function revokeZipUrl() {
  if (!lastZipUrl) return;
  URL.revokeObjectURL(lastZipUrl);
  lastZipUrl = null;
}

function cell(value, digits) {
  if (value == null || value === "") return "";
  const n = typeof value === "boolean" ? (value ? 1 : 0) : Number(value);
  if (!Number.isFinite(n)) return "";
  return digits == null ? String(n) : n.toFixed(digits);
}

export function buildMetricsCsv(frames = poseLog) {
  const lines = frames.map((f) => {
    const a = f.angles || {};
    const m = f.metrics || {};
    return [
      cell(f.t, 3),
      cell(a.elbowL, 1),
      cell(a.elbowR, 1),
      cell(a.kneeL, 1),
      cell(a.kneeR, 1),
      cell(a.baseL, 6),
      cell(a.baseR, 6),
      cell(m.shoulderL, 1),
      cell(m.shoulderR, 1),
      cell(m.hipL, 1),
      cell(m.hipR, 1),
      cell(m.elbowL3d, 1),
      cell(m.elbowR3d, 1),
      cell(m.kneeL3d, 1),
      cell(m.kneeR3d, 1),
      cell(m.shoulderL3d, 1),
      cell(m.shoulderR3d, 1),
      cell(m.hipL3d, 1),
      cell(m.hipR3d, 1),
      cell(m.torsoLean, 1),
      cell(m.comX, 4),
      cell(m.comY, 4),
      cell(m.comSpeed, 3),
      cell(m.supportArea, 5),
      m.comInside == null ? "" : (m.comInside ? "1" : "0"),
      cell(m.poseVisibility, 3),
      cell(m.torso, 4)
    ].join(",");
  });
  return CSV_HEADER.join(",") + "\n" + lines.join("\n");
}

function safeName(customName, now) {
  const raw = (customName || "").trim();
  const base = raw
    ? raw.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").slice(0, 80)
    : timestamp(now);
  return base || timestamp(now);
}

function timestamp(d) {
  const pad = (n) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function exportZip({ name, summary, meta } = {}) {
  if (typeof JSZip === "undefined") {
    throw new Error("JSZip 尚未載入");
  }

  const blob = await stopRecording();
  const now = new Date();
  const base = safeName(name, now);
  const ext = extensionForMime(blob?.type);
  const zip = new JSZip();

  if (blob && blob.size) {
    zip.file(`${base}_overlay.${ext}`, blob, { compression: "STORE" });
  }

  const payload = {
    schema: 2,
    createdAt: now.toISOString(),
    model: meta?.model || null,
    delegate: meta?.delegate || null,
    mpVersion: meta?.version || null,
    smoothing: meta?.smoothing || null,
    confidence: meta?.confidence ?? null,
    mirrored: !!meta?.mirrored,
    coords: "landmarks are normalized image coordinates matching the overlay video (origin top-left, y down). When mirrored is true, image x was flipped to match that video and world x was negated. worldLandmarks are meters, hip-centered. Angles are degrees. comSpeed is body-heights per second, using torso length as the body scale. Legacy angles/baseL/baseR stay in image-plane units.",
    summary: summary || null,
    frames: poseLog
  };
  const pretty = poseLog.length <= 400;
  zip.file("poses.json", JSON.stringify(payload, null, pretty ? 2 : 0), { compression: "DEFLATE" });
  zip.file("metrics.csv", buildMetricsCsv(), { compression: "DEFLATE" });

  const out = await zip.generateAsync({ type: "blob" });
  revokeZipUrl();
  lastZipUrl = URL.createObjectURL(out);
  const filename = `${base}.zip`;
  triggerDownload(lastZipUrl, filename);
  return { filename, url: lastZipUrl, video: !!(blob && blob.size), frames: poseLog.length };
}

export function resetExportSession() {
  resetLog();
  resetRecording();
  revokeZipUrl();
}
