/* ============================================================================
   exporter.js — ZIP Export
============================================================================ */

import { stopRecording } from "./recorder.js";

export async function exportZip(name, canvas) {
  const zip = new JSZip();
  const { overlay, original } = await stopRecording();

  const base = name || `boulder_${Date.now()}`;

  if (overlay) zip.file(base + "_overlay.mp4", overlay);
  if (original) zip.file(base + "_original.mp4", original);

  const blob = await zip.generateAsync({ type: "blob" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = base + ".zip";
  a.click();
}
