/* Climbing pose measures. Legacy 2D fields stay compatible with the old ZIP. */

export const LM = {
  nose: 0,
  left_eye_inner: 1,
  left_eye: 2,
  left_eye_outer: 3,
  right_eye_inner: 4,
  right_eye: 5,
  right_eye_outer: 6,
  left_ear: 7,
  right_ear: 8,
  mouth_left: 9,
  mouth_right: 10,
  left_shoulder: 11,
  right_shoulder: 12,
  left_elbow: 13,
  right_elbow: 14,
  left_wrist: 15,
  right_wrist: 16,
  left_pinky: 17,
  right_pinky: 18,
  left_index: 19,
  right_index: 20,
  left_thumb: 21,
  right_thumb: 22,
  left_hip: 23,
  right_hip: 24,
  left_knee: 25,
  right_knee: 26,
  left_ankle: 27,
  right_ankle: 28,
  left_heel: 29,
  right_heel: 30,
  left_foot_index: 31,
  right_foot_index: 32
};

/* Approximate segment masses (sum to 1). Ratios are proximal → distal. */
const MASS = {
  head: 0.081,
  trunk: 0.497,
  upperArm: 0.028,
  forearm: 0.016,
  hand: 0.006,
  thigh: 0.100,
  shank: 0.0465,
  foot: 0.0145
};

const MIN_SEG = 0.35;
const TRAIL_MAX = 120;

export function vis(p) {
  if (!p) return 0;
  const v = p.visibility ?? p.presence;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function named(lm) {
  const o = {};
  for (const key in LM) {
    const p = lm?.[LM[key]];
    o[key] = p && Number.isFinite(p.x) && Number.isFinite(p.y)
      ? { x: p.x, y: p.y, z: p.z || 0, v: vis(p) }
      : null;
  }
  return o;
}

function lerp(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * t
  };
}

function mid(a, b) {
  return lerp(a, b, 0.5);
}

export function angle2(a, b, c) {
  if (!a || !b || !c) return null;
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const mab = Math.hypot(abx, aby);
  const mcb = Math.hypot(cbx, cby);
  if (!mab || !mcb) return null;
  const cos = Math.min(1, Math.max(-1, (abx * cbx + aby * cby) / (mab * mcb)));
  return +(Math.acos(cos) * 180 / Math.PI).toFixed(1);
}

export function angle3(a, b, c) {
  if (!a || !b || !c) return null;
  const ab = [a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)];
  const cb = [c.x - b.x, c.y - b.y, (c.z || 0) - (b.z || 0)];
  const mab = Math.hypot(...ab);
  const mcb = Math.hypot(...cb);
  if (!mab || !mcb) return null;
  const cos = Math.min(1, Math.max(-1, (ab[0] * cb[0] + ab[1] * cb[1] + ab[2] * cb[2]) / (mab * mcb)));
  return +(Math.acos(cos) * 180 / Math.PI).toFixed(1);
}

/* Same triangle area the original metrics.csv called baseL / baseR. */
export function triArea(a, b, c) {
  if (!a || !b || !c) return null;
  return Math.abs(
    (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2
  );
}

function confident(p, min = MIN_SEG) {
  return !!(p && p.v >= min);
}

function segPoint(a, b, t, min = MIN_SEG) {
  if (!confident(a, min) || !confident(b, min)) return null;
  const p = lerp(a, b, t);
  p.v = Math.min(a.v, b.v);
  return p;
}

function torsoLean(shoulder, hip) {
  if (!shoulder || !hip) return null;
  const dx = shoulder.x - hip.x;
  const dy = shoulder.y - hip.y;
  if (!dx && !dy) return null;
  return +(Math.atan2(dx, -dy) * 180 / Math.PI).toFixed(1);
}

function centerOfMass(k) {
  const parts = [];
  const add = (mass, p) => {
    if (p) parts.push({ mass, x: p.x, y: p.y });
  };

  const ears = segPoint(k.left_ear, k.right_ear, 0.5, 0.3);
  add(MASS.head, ears || (confident(k.nose, 0.3) ? k.nose : null));

  const shoulder = segPoint(k.left_shoulder, k.right_shoulder, 0.5);
  const hip = segPoint(k.left_hip, k.right_hip, 0.5);
  add(MASS.trunk, segPoint(shoulder, hip, 0.5));

  const limbs = [
    [MASS.upperArm, "left_shoulder", "left_elbow", 0.436],
    [MASS.upperArm, "right_shoulder", "right_elbow", 0.436],
    [MASS.forearm, "left_elbow", "left_wrist", 0.43],
    [MASS.forearm, "right_elbow", "right_wrist", 0.43],
    [MASS.hand, "left_wrist", "left_index", 0.5, "left_wrist"],
    [MASS.hand, "right_wrist", "right_index", 0.5, "right_wrist"],
    [MASS.thigh, "left_hip", "left_knee", 0.433],
    [MASS.thigh, "right_hip", "right_knee", 0.433],
    [MASS.shank, "left_knee", "left_ankle", 0.433],
    [MASS.shank, "right_knee", "right_ankle", 0.433],
    [MASS.foot, "left_heel", "left_foot_index", 0.5, "left_ankle"],
    [MASS.foot, "right_heel", "right_foot_index", 0.5, "right_ankle"]
  ];
  for (const [mass, a, b, t, fallback] of limbs) {
    add(mass, segPoint(k[a], k[b], t) || (fallback && confident(k[fallback]) ? k[fallback] : null));
  }

  if (!parts.length) return null;
  let x = 0;
  let y = 0;
  let m = 0;
  for (const p of parts) {
    x += p.x * p.mass;
    y += p.y * p.mass;
    m += p.mass;
  }
  if (m < 0.2) return null;
  return { x: x / m, y: y / m };
}

function convexHull(points) {
  const uniq = [];
  for (const p of points) {
    if (!uniq.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 1e-4)) uniq.push(p);
  }
  if (uniq.length < 3) return uniq.slice();
  const pts = uniq.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function shoelace(poly) {
  if (!poly || poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function pointInPoly(p, poly) {
  if (!p || !poly || poly.length < 3) return null;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const hit = ((a.y > p.y) !== (b.y > p.y))
      && (p.x < (b.x - a.x) * (p.y - a.y) / ((b.y - a.y) || 1e-12) + a.x);
    if (hit) inside = !inside;
  }
  return inside;
}

function baseOfSupport(k, com) {
  const names = ["left_wrist", "right_wrist", "left_ankle", "right_ankle"];
  const contacts = [];
  for (const name of names) {
    const p = k[name];
    if (confident(p, 0.45)) contacts.push({ x: p.x, y: p.y });
  }
  const hull = convexHull(contacts);
  const area = shoelace(hull);
  const inside = pointInPoly(com, hull);
  return {
    area: hull.length >= 3 ? area : null,
    inside,
    hull
  };
}

function meanVis(k, names) {
  let s = 0;
  let n = 0;
  for (const name of names) {
    if (!k[name]) continue;
    s += k[name].v;
    n++;
  }
  return n ? s / n : 0;
}

function shown(angle, a, b, c) {
  if (angle == null) return null;
  if (!confident(a, 0.35) || !confident(b, 0.35) || !confident(c, 0.35)) return null;
  return angle;
}

function torsoLength(k) {
  const shoulder = segPoint(k.left_shoulder, k.right_shoulder, 0.5, 0.4);
  const hip = segPoint(k.left_hip, k.right_hip, 0.5, 0.4);
  if (shoulder && hip) {
    const d = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y);
    if (d > 0.02) return d;
  }
  if (confident(k.left_shoulder, 0.4) && confident(k.right_shoulder, 0.4)) {
    const d = Math.hypot(k.left_shoulder.x - k.right_shoulder.x, k.left_shoulder.y - k.right_shoulder.y);
    if (d > 0.02) return d;
  }
  return null;
}

export function computeFrame(image, world) {
  const empty = {
    angles: { elbowL: null, elbowR: null, kneeL: null, kneeR: null, baseL: null, baseR: null },
    metrics: {},
    display: {},
    com: null,
    support: { area: null, inside: null, hull: [] },
    torso: null
  };
  if (!image || image.length < 33) return empty;

  const k = named(image);
  const w = world && world.length >= 33 ? named(world) : null;

  const angles = {
    elbowL: angle2(k.left_shoulder, k.left_elbow, k.left_wrist),
    elbowR: angle2(k.right_shoulder, k.right_elbow, k.right_wrist),
    kneeL: angle2(k.left_hip, k.left_knee, k.left_ankle),
    kneeR: angle2(k.right_hip, k.right_knee, k.right_ankle),
    baseL: triArea(k.left_shoulder, k.left_hip, k.left_ankle),
    baseR: triArea(k.right_shoulder, k.right_hip, k.right_ankle)
  };

  const shoulderL = angle2(k.left_elbow, k.left_shoulder, k.left_hip);
  const shoulderR = angle2(k.right_elbow, k.right_shoulder, k.right_hip);
  const hipL = angle2(k.left_shoulder, k.left_hip, k.left_knee);
  const hipR = angle2(k.right_shoulder, k.right_hip, k.right_knee);

  const elbowL3d = w ? angle3if(k, w, "left_shoulder", "left_elbow", "left_wrist") : null;
  const elbowR3d = w ? angle3if(k, w, "right_shoulder", "right_elbow", "right_wrist") : null;
  const kneeL3d = w ? angle3if(k, w, "left_hip", "left_knee", "left_ankle") : null;
  const kneeR3d = w ? angle3if(k, w, "right_hip", "right_knee", "right_ankle") : null;
  const shoulderL3d = w ? angle3if(k, w, "left_elbow", "left_shoulder", "left_hip") : null;
  const shoulderR3d = w ? angle3if(k, w, "right_elbow", "right_shoulder", "right_hip") : null;
  const hipL3d = w ? angle3if(k, w, "left_shoulder", "left_hip", "left_knee") : null;
  const hipR3d = w ? angle3if(k, w, "right_shoulder", "right_hip", "right_knee") : null;

  const shoulder = segPoint(k.left_shoulder, k.right_shoulder, 0.5, 0.35);
  const hip = segPoint(k.left_hip, k.right_hip, 0.5, 0.35);
  const lean = torsoLean(shoulder, hip);
  const com = centerOfMass(k);
  const support = baseOfSupport(k, com);
  const torso = torsoLength(k);
  const poseVisibility = meanVis(k, [
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle"
  ]);

  const display = {
    elbowL: shown(elbowL3d ?? angles.elbowL, k.left_shoulder, k.left_elbow, k.left_wrist),
    elbowR: shown(elbowR3d ?? angles.elbowR, k.right_shoulder, k.right_elbow, k.right_wrist),
    kneeL: shown(kneeL3d ?? angles.kneeL, k.left_hip, k.left_knee, k.left_ankle),
    kneeR: shown(kneeR3d ?? angles.kneeR, k.right_hip, k.right_knee, k.right_ankle),
    shoulderL: shown(shoulderL3d ?? shoulderL, k.left_elbow, k.left_shoulder, k.left_hip),
    shoulderR: shown(shoulderR3d ?? shoulderR, k.right_elbow, k.right_shoulder, k.right_hip),
    hipL: shown(hipL3d ?? hipL, k.left_shoulder, k.left_hip, k.left_knee),
    hipR: shown(hipR3d ?? hipR, k.right_shoulder, k.right_hip, k.right_knee),
    torsoLean: shoulder && hip && shoulder.v >= 0.35 && hip.v >= 0.35 ? lean : null
  };

  return {
    angles,
    metrics: {
      shoulderL, shoulderR, hipL, hipR,
      elbowL3d, elbowR3d, kneeL3d, kneeR3d,
      shoulderL3d, shoulderR3d, hipL3d, hipR3d,
      torsoLean: lean,
      comX: com ? com.x : null,
      comY: com ? com.y : null,
      supportArea: support.area,
      comInside: support.inside,
      poseVisibility,
      torso
    },
    display,
    com,
    support,
    torso
  };
}

function angle3if(k, w, a, b, c) {
  if (!confident(k[a], 0.3) || !confident(k[b], 0.3) || !confident(k[c], 0.3)) return null;
  return angle3(w[a], w[b], w[c]);
}

function median(values) {
  if (!values.length) return null;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function freshState() {
  return {
    processed: 0,
    detected: 0,
    pathPx: 0,
    peak: 0,
    outsideT: 0,
    startY: null,
    minY: null,
    prev: null,
    firstT: null,
    lastT: null,
    torsos: [],
    trail: [],
    inside: null,
    speed: null
  };
}

export function createTracker() {
  let state = freshState();

  function scale() {
    return median(state.torsos);
  }

  function snapshot(tracking) {
    const sc = scale();
    return {
      tracking,
      speed: state.speed,
      path: sc ? state.pathPx / sc : null,
      rise: sc != null && state.startY != null && state.minY != null
        ? Math.max(0, state.startY - state.minY) / sc
        : null,
      rate: state.processed ? state.detected / state.processed : 0,
      trail: state.trail,
      inside: state.inside,
      detected: state.detected,
      processed: state.processed
    };
  }

  return {
    reset() {
      state = freshState();
    },
    push(frame, t) {
      state.processed++;
      if (Number.isFinite(t)) {
        if (state.firstT == null) state.firstT = t;
        state.lastT = t;
      }
      if (!frame?.com || !Number.isFinite(t)) {
        state.inside = null;
        return snapshot(false);
      }

      state.detected++;
      if (frame.torso && frame.torso > 0.02) {
        state.torsos.push(frame.torso);
        if (state.torsos.length > 30) state.torsos.shift();
      }
      const sc = scale();
      if (state.prev) {
        const dt = t - state.prev.t;
        if (dt > 0 && dt < 0.5) {
          const dist = Math.hypot(frame.com.x - state.prev.x, frame.com.y - state.prev.y);
          // Large jumps are detection pops, not body movement.
          if (dist >= 0.0008 && dist <= 0.12) {
            state.pathPx += dist;
            if (sc) {
              const speed = dist / dt / sc;
              state.speed = speed;
              if (speed > state.peak) state.peak = speed;
            }
          } else if (dist > 0.12) {
            state.speed = 0;
          }
          if (frame.support?.inside === false) state.outsideT += dt;
        }
      }
      if (state.startY == null) state.startY = frame.com.y;
      if (state.minY == null || frame.com.y < state.minY) state.minY = frame.com.y;
      state.prev = { x: frame.com.x, y: frame.com.y, t };
      state.inside = frame.support?.inside ?? null;
      state.trail.push({ x: frame.com.x, y: frame.com.y });
      if (state.trail.length > TRAIL_MAX) state.trail.shift();
      return snapshot(true);
    },
    summary() {
      const sc = scale();
      const dur = state.firstT != null && state.lastT != null
        ? Math.max(0, state.lastT - state.firstT)
        : 0;
      const round = (n, d) => n == null || !Number.isFinite(n) ? null : +n.toFixed(d);
      return {
        processedFrames: state.processed,
        detectedFrames: state.detected,
        durationSec: round(dur, 3),
        detectionRate: state.processed ? round(state.detected / state.processed, 3) : 0,
        comPathBodyHeights: sc ? round(state.pathPx / sc, 3) : null,
        verticalRiseBodyHeights: sc != null && state.startY != null && state.minY != null
          ? round(Math.max(0, state.startY - state.minY) / sc, 3)
          : null,
        peakComSpeedBodyHeightsPerSec: round(state.peak, 3),
        timeOutsideSupportSec: round(state.outsideT, 3),
        torsoScale: sc ? round(sc, 4) : null
      };
    }
  };
}
