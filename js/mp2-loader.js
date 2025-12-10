/* ============================================================================
   mp2-loader.js — Load MediaPipe Tasks Vision (Lite Runtime)
   For GitHub Pages — No WASM folder, no worker, pure JS bundle only.
   ============================================================================ */

/*
   You chose:
   Q1 = Lite Runtime
   Q2 = Lite Model
   Q3 = Yes (use hosted bundle)
   Q4 = Single-page

   Therefore we load the official bundle from jsDelivr:
*/
const MP2_BUNDLE_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.6/vision_bundle.js";

/* 
   Global registry — This module populates:
   window.__mp2.FilesetResolver
   window.__mp2.PoseLandmarker
*/
window.__mp2 = {
  loaded: false,
  FilesetResolver: null,
  PoseLandmarker: null
};

/* ============================================================================
   loadMP2() — dynamically load the bundle if not loaded yet
   ============================================================================ */
export async function loadMP2() {
  if (window.__mp2.loaded) return true;

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = MP2_BUNDLE_URL;
    script.async = true;

    script.onload = () => {
      try {
        if (!window.vision) {
          reject(new Error("MediaPipe vision_bundle.js loaded, but vision global missing"));
          return;
        }

        window.__mp2.FilesetResolver = window.vision.FilesetResolver;
        window.__mp2.PoseLandmarker = window.vision.PoseLandmarker;
        window.__mp2.loaded = true;

        resolve(true);
      } catch (err) {
        reject(err);
      }
    };

    script.onerror = () => {
      reject(new Error("Failed to load MediaPipe vision_bundle.js"));
    };

    document.head.appendChild(script);
  });
}
