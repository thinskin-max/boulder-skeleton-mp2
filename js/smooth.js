/* One Euro filter for normalized pose landmarks (Casiez et al.). */

export const SMOOTH_PRESETS = {
  light: { minCutoff: 1.5, beta: 0.9, dCutoff: 1.0 },
  normal: { minCutoff: 0.9, beta: 0.45, dCutoff: 1.0 },
  strong: { minCutoff: 0.45, beta: 0.2, dCutoff: 1.0 }
};

class LowPass {
  constructor() {
    this.hat = null;
  }
  filter(x, alpha) {
    if (this.hat == null || !Number.isFinite(this.hat)) {
      this.hat = x;
      return x;
    }
    this.hat = alpha * x + (1 - alpha) * this.hat;
    return this.hat;
  }
  reset() {
    this.hat = null;
  }
}

class OneEuro {
  constructor(cfg) {
    this.cfg = cfg;
    this.x = new LowPass();
    this.dx = new LowPass();
    this.lastT = null;
  }
  reset() {
    this.x.reset();
    this.dx.reset();
    this.lastT = null;
  }
  peek() {
    return this.x.hat;
  }
  alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(value, t) {
    if (!Number.isFinite(value)) return this.peek() ?? value;
    if (this.lastT == null) {
      this.lastT = t;
      this.dx.filter(0, 1);
      return this.x.filter(value, 1);
    }
    let dt = t - this.lastT;
    if (!(dt > 0)) dt = 1e-3;
    this.lastT = t;
    const prev = this.x.hat ?? value;
    const edx = this.dx.filter((value - prev) / dt, this.alpha(this.cfg.dCutoff, dt));
    const cutoff = this.cfg.minCutoff + this.cfg.beta * Math.abs(edx);
    return this.x.filter(value, this.alpha(cutoff, dt));
  }
}

const AXES = ["ix", "iy", "iz", "wx", "wy", "wz"];

export function createSmoother() {
  let preset = "normal";
  let bank = null;
  let lastT = null;

  function cfg() {
    return SMOOTH_PRESETS[preset] || SMOOTH_PRESETS.normal;
  }

  function ensure(n) {
    if (bank && bank.length === n) return;
    const c = cfg();
    bank = Array.from({ length: n }, () => {
      const row = {};
      for (const key of AXES) row[key] = new OneEuro(c);
      return row;
    });
  }

  return {
    preset() {
      return preset;
    },
    setPreset(name) {
      const next = name === "off" ? "off" : (SMOOTH_PRESETS[name] ? name : "normal");
      if (next === preset) return;
      preset = next;
      bank = null;
      lastT = null;
    },
    reset() {
      bank = null;
      lastT = null;
    },
    apply(image, world, t) {
      if (!image?.length) return { image: image || null, world: world || null };
      if (preset === "off") return { image, world: world || null };
      if (!Number.isFinite(t)) t = lastT == null ? 0 : lastT + 1e-3;
      if (lastT != null && (t < lastT || t - lastT > 0.5)) {
        bank = null;
      }
      lastT = t;
      ensure(image.length);

      const outI = new Array(image.length);
      const outW = world?.length === image.length ? new Array(world.length) : null;

      for (let i = 0; i < image.length; i++) {
        const p = image[i];
        const v = p.visibility ?? p.presence ?? 0;
        const f = bank[i];
        const heldX = f.ix.peek();
        const heldY = f.iy.peek();

        if (v < 0.2 && heldX != null && heldY != null) {
          outI[i] = {
            x: heldX,
            y: heldY,
            z: f.iz.peek() ?? p.z ?? 0,
            visibility: p.visibility,
            presence: p.presence
          };
        } else {
          if (heldX != null && Math.hypot(p.x - heldX, p.y - (heldY ?? p.y)) > 0.18) {
            f.ix.reset();
            f.iy.reset();
            f.iz.reset();
          }
          outI[i] = {
            x: f.ix.filter(p.x, t),
            y: f.iy.filter(p.y, t),
            z: f.iz.filter(p.z || 0, t),
            visibility: p.visibility,
            presence: p.presence
          };
        }

        if (!outW) continue;
        const w = world[i];
        if (!w) {
          outW[i] = w;
          continue;
        }
        const wx = f.wx.peek();
        const wy = f.wy.peek();
        if (v < 0.2 && wx != null && wy != null) {
          outW[i] = {
            x: wx,
            y: wy,
            z: f.wz.peek() ?? w.z ?? 0,
            visibility: w.visibility,
            presence: w.presence
          };
        } else {
          if (wx != null && Math.hypot(w.x - wx, w.y - (wy ?? w.y), (w.z || 0) - (f.wz.peek() || 0)) > 0.45) {
            f.wx.reset();
            f.wy.reset();
            f.wz.reset();
          }
          outW[i] = {
            x: f.wx.filter(w.x, t),
            y: f.wy.filter(w.y, t),
            z: f.wz.filter(w.z || 0, t),
            visibility: w.visibility,
            presence: w.presence
          };
        }
      }

      return { image: outI, world: outW };
    }
  };
}
