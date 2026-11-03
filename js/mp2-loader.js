/* MediaPipe Tasks Vision loader. One classic script, cached across model switches. */

export const MP_VERSION = "1.2.0";

export const MP_BUNDLE_URL =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.js`;

export const MP_WASM_URL =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;

window.__mp2 = window.__mp2 || {
  loaded: false,
  FilesetResolver: null,
  PoseLandmarker: null
};

let pending = null;

function adopt(ns) {
  if (!ns?.FilesetResolver || !ns?.PoseLandmarker) {
    throw new Error("MediaPipe 已載入，但 PoseLandmarker 不存在");
  }
  window.__mp2.FilesetResolver = ns.FilesetResolver;
  window.__mp2.PoseLandmarker = ns.PoseLandmarker;
  window.__mp2.loaded = true;
}

export function loadMP2() {
  if (window.__mp2.loaded) return Promise.resolve(true);
  if (pending) return pending;

  pending = new Promise((resolve, reject) => {
    const existing = window.Vision || window.vision;
    if (existing?.FilesetResolver && existing?.PoseLandmarker) {
      try {
        adopt(existing);
        resolve(true);
      } catch (err) {
        pending = null;
        reject(err);
      }
      return;
    }

    const script = document.createElement("script");
    script.src = MP_BUNDLE_URL;
    script.async = true;
    script.onload = () => {
      try {
        adopt(window.Vision || window.vision);
        resolve(true);
      } catch (err) {
        pending = null;
        reject(err);
      }
    };
    script.onerror = () => {
      pending = null;
      reject(new Error("無法載入 MediaPipe（請檢查網絡）"));
    };
    document.head.appendChild(script);
  });

  return pending;
}
