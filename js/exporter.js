/* ============================================================================
   Boulder Skeleton — MP2 Edition
   exporter.js — ZIP Export (overlay + original + poses.json + metrics.csv)
   依賴：
   - Recorder.stop()
   - poseLog (從 mp2-detector.js）
============================================================================ */

import JSZip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";
import { Recorder } from "./recorder.js";

/* Export Object */
export const Exporter = {
  exportZip
};

/* ============================================================================
   exportZip()
   - 將錄影 + JSON + CSV 全部打包成 ZIP
   - 呼叫方式：await Exporter.exportZip(poseLog, zipName, canvasSize)
============================================================================ */
async function exportZip(poseLog, zipName, canvasSize) {
  console.log("📦 Exporter: 開始產生 ZIP…");

  /* -------------------------------------------------------------
     1) 停止錄影（若沒有錄影，Recorder.stop() 會回傳 null）
  ------------------------------------------------------------- */
  const { overlay, original } = await Recorder.stop();


  /* -------------------------------------------------------------
     2) 正常化 ZIP 名稱
  ------------------------------------------------------------- */
  let base = (zipName || "").trim();
  base = base
    .replace(/\s+/g, "_")
    .replace(/[^0-9A-Za-z_\-\u4e00-\u9fa5]/g, "");

  if (!base) base = "boulder_skeleton_" + Date.now();

  const zipFilename      = base + ".zip";
  const overlayFilename  = base + "_overlay.mp4";
  const originalFilename = base + "_original.mp4";

  const zip = new JSZip();


  /* -------------------------------------------------------------
     3) Overlay 錄影（canvas）
  ------------------------------------------------------------- */
  if (overlay) {
    zip.file(overlayFilename, overlay);
    console.log("🎥 overlay OK:", overlayFilename);
  } else {
    console.warn("⚠️ overlay 無法錄製");
  }


  /* -------------------------------------------------------------
     4) 原影片錄影（video）
  ------------------------------------------------------------- */
  if (original) {
    zip.file(originalFilename, original);
    console.log("🎞️ original OK:", originalFilename);
  } else {
    console.warn("⚠️ original 無法錄製");
  }


  /* -------------------------------------------------------------
     5) poses.json（骨架軌跡）
  ------------------------------------------------------------- */
  const posesJson = {
    meta: {
      createdAt: new Date().toISOString(),
      width: canvasSize.width,
      height: canvasSize.height,
      note: "MP2 PoseLandmarker data"
    },
    frames: poseLog
  };

  zip.file("poses.json", JSON.stringify(posesJson, null, 2));


  /* -------------------------------------------------------------
     6) metrics.csv
  ------------------------------------------------------------- */
  const csvHeader = "t,elbowL,elbowR,kneeL,kneeR,baseL,baseR\n";

  const csvBody = poseLog
    .map(r => {
      const a = r.angles || {};
      return [
        r.t ?? "",
        a.elbowL ?? "",
        a.elbowR ?? "",
        a.kneeL ?? "",
        a.kneeR ?? "",
        a.baseL ?? "",
        a.baseR ?? ""
      ].join(",");
    })
    .join("\n");

  zip.file("metrics.csv", csvHeader + csvBody);


  /* -------------------------------------------------------------
     7) 產生 zip blob
  ------------------------------------------------------------- */
  console.log("📦 Zip 產生中…");

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);

  /* -------------------------------------------------------------
     8) 觸發下載
  ------------------------------------------------------------- */
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 2000);

  console.log("✅ ZIP 已下載：", zipFilename);
}
