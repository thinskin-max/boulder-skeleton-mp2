export let MP2 = {
  ready: false,
  FilesetResolver: null,
  PoseLandmarker: null
};

function waitForVision(maxTries = 30, interval = 100) {
  return new Promise((resolve, reject) => {
    let c = 0;
    const timer = setInterval(() => {
      c++;
      if (window._mp2_ready && window.vision) {
        clearInterval(timer);
        resolve(true);
      }
      if (c >= maxTries) {
        clearInterval(timer);
        reject(new Error("vision 未成功載入"));
      }
    }, interval);
  });
}

export async function loadMP2() {
  if (MP2.ready) return MP2;

  await waitForVision();

  MP2.FilesetResolver = window.vision.FilesetResolver;
  MP2.PoseLandmarker  = window.vision.PoseLandmarker;

  if (!MP2.FilesetResolver || !MP2.PoseLandmarker) {
    throw new Error("MediaPipe 主要 API 缺失");
  }

  MP2.ready = true;
  console.log("🔥 MP2 Ready");
  return MP2;
}
