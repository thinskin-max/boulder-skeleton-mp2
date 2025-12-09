/* ============================================================================
   mp2-loader.js — FIXED for GitHub Pages
   - 不再使用 import
   - 強制用動態 <script> 方式載入 vision_bundle.js
   - 確保 window.vision 可用
============================================================================ */

export function loadMP2() {
  return new Promise((resolve, reject) => {

    // 已載入？
    if (window.vision) {
      resolve();
      return;
    }

    // 檢查是否已經有 script 在 loading
    if (document.getElementById("mp2-script")) {
      // 如果正在 load，但 vision 還未 ready → 等待
      const timer = setInterval(() => {
        if (window.vision) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
      return;
    }

    // ⭐ 走保險路線：用 script tag 動態載入（GitHub Pages 最安全方式）
    const s = document.createElement("script");
    s.id = "mp2-script";
    s.src =
      "https://storage.googleapis.com/mediapipe-tasks/vision/0.10.6/vision_bundle.js";
    s.crossOrigin = "anonymous";

    s.onload = () => {
      // vision_bundle.js 會建立 window.vision
      if (window.vision) {
        resolve();
      } else {
        reject(new Error("vision_bundle.js 載入後仍沒有 window.vision"));
      }
    };

    s.onerror = () => reject(new Error("無法載入 vision_bundle.js"));

    document.head.appendChild(s);
  });
}
