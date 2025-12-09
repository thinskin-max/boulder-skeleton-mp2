/* ============================================================================
   mp2-loader.js — MediaPipe 2 Loader
============================================================================ */

export async function loadMP2() {
  return new Promise((resolve, reject) => {
    let tries = 0;

    function check() {
      if (window._mp2_ready && window.vision) {
        resolve(window.vision);
      } else if (tries > 50) {
        reject(new Error("MediaPipe vision_bundle.js 無法載入"));
      } else {
        tries++;
        setTimeout(check, 100);
      }
    }

    check();
  });
}
