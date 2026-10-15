/* ══ Erfaring story ═══════════════════════════
   The four projects told as one scroll. A swarm of fireflies drifts over
   the opening scene; as each chapter comes up they gather into a picture
   of that project, then scatter and gather again for the next:

     Kartverket NRL   a database, with obstacle masts reporting into it
     Atlas            terrain seen from above, a route running across it
     LuksusEiendom    a house, and the listings it becomes
     AI Lab           a network, with signals passing through it

   Built to cost little. Every shape is made once, here, from a handful of
   lines and surfaces, so nothing is downloaded but Three.js itself. All
   the fireflies are one draw call: each carries its place in every shape,
   and the graphics card moves it between them. The scroll position is
   read inside the render loop, not from a scroll listener, and eased so a
   wheel's steps never show. No lights, no post-processing, no shadows.

   It follows assets/perf.js: fewer fireflies, fewer pixels or half the
   frame rate on a machine that falls behind. With reduced motion asked
   for, the shapes change by fading instead of flying, nothing drifts, and
   a frame is only drawn when something has changed. While the story is
   running the Unicorn scene behind it is held still (erfaring.js), so only
   one of the two is ever being drawn. */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Matrix3,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three';

const root = document.documentElement;
const canvas = document.querySelector('.erf-story');
const chapters = [...document.querySelectorAll('[data-chapter]')];
const epilog = document.querySelector('.erf-epilog');
const progressBar = document.querySelector('.erf-progress');
const railLinks = [...document.querySelectorAll('[data-rail]')];
const perf = window.__perf;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

const LAST = 5;          // the swarm, four projects, and the swarm again
const WIDE = 900;        // from here the text and the picture stand side by side
const SHAPE_W = 5.8;     // the space every project shape is built to fill
const SHAPE_H = 3.6;

/* ── Budget ─────────────────────────────── */
function pointBudget() {
  const tier = perf ? perf.tier : 'normal';
  if (tier === 'lowest') return 2400;
  if (perf?.lite) return 3600;
  if (Math.min(window.innerWidth, window.innerHeight) < 600) return 4800;
  return tier === 'fine' ? 11000 : 8000;
}

function pixelRatio() {
  const tier = perf ? perf.tier : 'normal';
  const cap = tier === 'fine' ? 2 : perf?.lite ? 1 : 1.5;
  return Math.min(window.devicePixelRatio || 1, cap);
}

/* ── Shapes ─────────────────────────────── */

// Seeded (mulberry32), so every visit draws the same pictures.
function random(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const along = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const pick = (list, r) => list[Math.floor(r() * list.length)];

// A point on one of the twelve edges of a box.
function boxEdge(r, min, max) {
  const edge = Math.floor(r() * 12);
  const axis = Math.floor(edge / 4);
  const [u, v] = [0, 1, 2].filter(a => a !== axis);
  const p = [0, 0, 0];
  p[axis] = lerp(min[axis], max[axis], r());
  p[u] = edge & 1 ? max[u] : min[u];
  p[v] = edge & 2 ? max[v] : min[v];
  return p;
}

// Every point is x, y, z and a glow: 0 to 1 as it stands, or 2 + t for a
// point t of the way along a path, which a pulse then runs down.
function build(count, parts, seed) {
  const r = random(seed);
  const out = new Float32Array(count * 4);
  const total = parts.reduce((sum, part) => sum + part.weight, 0);
  for (let i = 0; i < count; i++) {
    // Parts are dealt out along a golden-ratio sequence rather than in
    // blocks, so any first slice of the points, which is all a slower
    // machine draws, still holds every part in proportion.
    let at = (((i + 0.5) * 0.6180339887) % 1) * total;
    let part = parts[parts.length - 1];
    for (const candidate of parts) {
      if (at < candidate.weight) { part = candidate; break; }
      at -= candidate.weight;
    }
    out.set(part.point(r), i * 4);
  }
  return out;
}

// The opening and closing swarm: fireflies through the whole view, a few
// of them lit.
function swarm() {
  return [{
    weight: 1,
    point: r => [lerp(-8, 8, r()), lerp(-4.6, 4.6, r()), lerp(-7, 2.5, r()), r() < 0.14 ? 1 : 0]
  }];
}

// Kartverket NRL: three database platters, a ring of obstacle masts with
// their lights lit, and reports arcing from each mast into the store.
function kartverket() {
  const radius = 1.05;
  const platters = [0.95, 0.15, -0.65];
  const ground = -1.45;
  const masts = [0, 1, 2, 3, 4, 5].map(i => {
    const a = (i / 6) * TAU + 0.35;
    return [Math.cos(a) * 2.35, Math.sin(a) * 1.5, 1.25 + ((i * 7) % 5) * 0.28];
  });
  return [
    { weight: 0.2, point: r => {
      const a = r() * TAU;
      return [Math.cos(a) * radius, pick(platters, r) + (r() < 0.55 ? 0.25 : -0.25), Math.sin(a) * radius, 0.15];
    } },
    { weight: 0.22, point: r => {
      const a = r() * TAU;
      return [Math.cos(a) * radius, pick(platters, r) + (r() - 0.5) * 0.5, Math.sin(a) * radius, 0];
    } },
    { weight: 0.08, point: r => {
      const a = r() * TAU;
      const d = Math.sqrt(r()) * radius;
      return [Math.cos(a) * d, 1.2, Math.sin(a) * d, 0.05];
    } },
    { weight: 0.13, point: r => {
      const [x, z, h] = pick(masts, r);
      return [x, ground + r() * h, z, 0];
    } },
    { weight: 0.05, point: r => {
      const [x, z, h] = pick(masts, r);
      return [x + (r() - 0.5) * 0.1, ground + h + (r() - 0.5) * 0.1, z + (r() - 0.5) * 0.1, 1];
    } },
    { weight: 0.12, point: r => {
      const [x, z, h] = pick(masts, r);
      const t = r();
      const length = Math.hypot(x, z);
      const p = along([x, ground + h, z], [(x / length) * radius, 1.0, (z / length) * radius], t);
      p[1] += Math.sin(t * Math.PI) * 0.35;
      return [...p, 2 + t];
    } },
    { weight: 0.12, point: r => {
      const a = r() * TAU;
      return [Math.cos(a) * 2.35, ground, Math.sin(a) * 1.5, 0];
    } },
    { weight: 0.08, point: r => {
      const a = r() * TAU;
      const d = 1.3 + r() * 2.2;
      return [Math.cos(a) * d, lerp(-1.4, 1.8, r()), Math.sin(a) * d * 0.7, 0];
    } }
  ];
}

// Atlas: a gridded terrain tipped toward the viewer, contour lines, a
// cluster of buildings, a route across it with a pulse travelling down
// it, and resource pins standing along the way.
function atlas() {
  const height = (x, z) =>
    0.34 * Math.sin(1.05 * x + 0.4) * Math.cos(0.95 * z - 0.3) +
    0.16 * Math.sin(2.2 * x + 1.6 * z) +
    0.08 * Math.cos(3.3 * z - 1.8 * x);
  const tilt = 0.95;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const place = (x, y, z, glow) => [x, (y - 0.25) * ct - z * st, (y - 0.25) * st + z * ct, glow];
  const route = [[-2.4, 1.3], [-1.5, 0.6], [-0.6, 0.85], [0.2, 0.15], [0.9, -0.35], [1.6, -0.2], [2.4, -1.1]];
  const routeAt = t => {
    const s = Math.min(route.length - 1.0001, t * (route.length - 1));
    const i = Math.floor(s);
    return [lerp(route[i][0], route[i + 1][0], s - i), lerp(route[i][1], route[i + 1][1], s - i)];
  };
  const city = Array.from({ length: 8 }, (_, i) => ({
    x: 0.5 + (i % 4) * 0.32,
    z: -1.0 + Math.floor(i / 4) * 0.36,
    w: 0.11 + ((i * 5) % 3) * 0.03,
    h: 0.28 + ((i * 7) % 5) * 0.14
  }));
  const pins = [0.12, 0.38, 0.62, 0.9];
  return [
    { weight: 0.56, point: r => {
      let x = lerp(-2.6, 2.6, r());
      let z = lerp(-1.8, 1.8, r());
      if (r() < 0.5) x = Math.round(x / 0.3) * 0.3;
      else z = Math.round(z / 0.3) * 0.3;
      return place(x, height(x, z), z, 0.04);
    } },
    { weight: 0.08, point: r => {
      for (let tries = 0; tries < 60; tries++) {
        const x = lerp(-2.6, 2.6, r());
        const z = lerp(-1.8, 1.8, r());
        const h = height(x, z);
        if (Math.abs(h - 0.18) < 0.02 || Math.abs(h + 0.12) < 0.02) return place(x, h + 0.01, z, 0.3);
      }
      return place(0, height(0, 0), 0, 0.04);
    } },
    { weight: 0.16, point: r => {
      const b = pick(city, r);
      const base = height(b.x, b.z);
      const p = boxEdge(r, [b.x - b.w, base, b.z - b.w], [b.x + b.w, base + b.h, b.z + b.w]);
      return place(p[0], p[1], p[2], p[1] > base + b.h - 0.001 ? 0.55 : 0.15);
    } },
    { weight: 0.13, point: r => {
      const t = r();
      const [x, z] = routeAt(t);
      return place(x, height(x, z) + 0.05, z, 2 + t);
    } },
    { weight: 0.05, point: r => {
      const [x, z] = routeAt(pick(pins, r));
      const base = height(x, z);
      const up = r();
      if (up < 0.7) return place(x, base + (up / 0.7) * 0.42, z, 0.2);
      return place(x + (r() - 0.5) * 0.07, base + 0.45 + (r() - 0.5) * 0.07, z + (r() - 0.5) * 0.07, 1);
    } },
    { weight: 0.02, point: r => {
      const x = lerp(-2.6, 2.6, r());
      const z = lerp(-1.8, 1.8, r());
      return place(x, height(x, z) + 0.15 + r() * 0.9, z, 0);
    } }
  ];
}

// LuksusEiendom: a house with its windows lit, and beside it the listings
// it turns into, each a card with a picture and lines of text.
function luksuseiendom() {
  const min = [-2.1, -1.35, -0.75];
  const max = [-0.5, -0.05, 0.75];
  const middle = (min[0] + max[0]) / 2;
  const ridge = 0.75;
  const eave = 0.83;
  const windows = [
    { c: [-1.75, -0.55, 0.76], w: 0.36, h: 0.38, face: 'z' },
    { c: [-0.85, -0.55, 0.76], w: 0.36, h: 0.38, face: 'z' },
    { c: [-0.49, -0.6, 0.3], w: 0.32, h: 0.34, face: 'x' },
    { c: [-0.49, -0.6, -0.35], w: 0.32, h: 0.34, face: 'x' }
  ];
  const cards = [0, 1, 2, 3].map(i => [0.62 + (i % 2) * 1.32, 0.72 - Math.floor(i / 2) * 1.02, 0.35 - (i % 2) * 0.25]);
  const cardW = 1.15;
  const cardH = 0.78;
  const onCard = (card, u, v) => [card[0] + u, card[1] + v, card[2] - u * 0.18];
  return [
    { weight: 0.12, point: r => [...boxEdge(r, min, max), 0.12] },
    { weight: 0.1, point: r => {
      const side = Math.floor(r() * 4);
      const y = lerp(min[1], max[1], r());
      if (side < 2) return [lerp(min[0], max[0], r()), y, side ? max[2] : min[2], 0];
      return [side === 2 ? min[0] : max[0], y, lerp(min[2], max[2], r()), 0];
    } },
    // The roof runs front to back, so its gable faces the viewer.
    { weight: 0.12, point: r => {
      const t = r();
      return [lerp(r() < 0.5 ? min[0] - 0.08 : max[0] + 0.08, middle, t), lerp(max[1], ridge, t), lerp(-eave, eave, r()), 0.08];
    } },
    { weight: 0.05, point: r => {
      const edge = r();
      if (edge < 0.3) return [middle, ridge, lerp(-eave, eave, r()), 0.3];
      const t = r();
      return [lerp(edge < 0.65 ? min[0] - 0.08 : max[0] + 0.08, middle, t), lerp(max[1], ridge, t), eave, 0.3];
    } },
    { weight: 0.07, point: r => {
      const w = pick(windows, r);
      const a = (r() - 0.5) * w.w;
      const b = (r() - 0.5) * w.h;
      return w.face === 'z' ? [w.c[0] + a, w.c[1] + b, w.c[2], 1] : [w.c[0], w.c[1] + b, w.c[2] + a, 1];
    } },
    { weight: 0.03, point: r => [-1.3 + (r() - 0.5) * 0.3, -1.35 + r() * 0.65, 0.76, 0.45] },
    { weight: 0.13, point: r => {
      const card = pick(cards, r);
      const t = r() * 2 * (cardW + cardH);
      let u;
      let v;
      if (t < cardW) { u = t - cardW / 2; v = cardH / 2; }
      else if (t < cardW + cardH) { u = cardW / 2; v = cardH / 2 - (t - cardW); }
      else if (t < 2 * cardW + cardH) { u = cardW / 2 - (t - cardW - cardH); v = -cardH / 2; }
      else { u = -cardW / 2; v = -cardH / 2 + (t - 2 * cardW - cardH); }
      return [...onCard(card, u, v), 0.18];
    } },
    { weight: 0.1, point: r => {
      const card = pick(cards, r);
      return [...onCard(card, -cardW / 2 + 0.06 + r() * cardW * 0.4, (r() - 0.5) * (cardH - 0.16)), 0.4];
    } },
    { weight: 0.08, point: r => {
      const card = pick(cards, r);
      const line = Math.floor(r() * 3);
      const start = -cardW / 2 + cardW * 0.54;
      const end = cardW / 2 - 0.08 - (line === 2 ? 0.2 : 0);
      return [...onCard(card, lerp(start, end, r()), 0.18 - line * 0.18), 0.1];
    } },
    { weight: 0.04, point: r => [lerp(-2.6, 2.8, r()), lerp(-1.6, 1.6, r()), lerp(-1.2, 1.2, r()), 0] }
  ];
}

// AI Lab: a small network, layer to layer, with signals running forward
// through it and the outputs lit.
function aiLab() {
  const sizes = [4, 6, 6, 3];
  const xs = [-2.25, -0.75, 0.75, 2.25];
  const layers = sizes.map((n, l) => Array.from({ length: n }, (_, i) =>
    [xs[l], (i - (n - 1) / 2) * (n > 4 ? 0.58 : 0.72), Math.sin(i * 1.7 + l) * 0.35]));
  const links = [];
  layers.slice(0, -1).forEach((layer, l) => layer.forEach(a => layers[l + 1].forEach(b => links.push([a, b, l]))));
  const nodes = layers.flat();
  const onSphere = (centre, radius, r) => {
    const u = r() * 2 - 1;
    const a = r() * TAU;
    const s = Math.sqrt(1 - u * u);
    return [centre[0] + Math.cos(a) * s * radius, centre[1] + Math.sin(a) * s * radius, centre[2] + u * radius];
  };
  return [
    { weight: 0.24, point: r => [...onSphere(pick(nodes, r), 0.13, r), 0.55] },
    { weight: 0.6, point: r => {
      const [a, b, l] = pick(links, r);
      const t = r();
      // One pulse crosses the whole network, layer by layer.
      return [...along(a, b, t), 2 + (l + t) / (sizes.length - 1)];
    } },
    { weight: 0.06, point: r => [...onSphere(pick(layers[3], r), 0.2 + r() * 0.08, r), 1] },
    { weight: 0.1, point: r => [...onSphere([0, 0, 0], 2.9 + r() * 0.3, r), 0] }
  ];
}

/* ── Shaders ────────────────────────────── */
const vertexShader = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;
  uniform float uMotion;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uFormScale;
  uniform vec3 uOffset;
  uniform mat3 uSpin;
  uniform vec2 uPointer;
  uniform float uPointerForce;
  uniform float uAspect;
  uniform float uBurst;
  uniform vec3 uBase;
  uniform vec3 uWarm;

  attribute vec4 aT0;
  attribute vec4 aT1;
  attribute vec4 aT2;
  attribute vec4 aT3;
  attribute vec4 aT4;
  attribute vec4 aSeed;

  varying vec3 vColor;
  varying float vAlpha;

  const float TAU = 6.28318530718;

  vec4 shapeAt(float k) {
    if (k < 0.5) return aT0;
    if (k < 1.5) return aT1;
    if (k < 2.5) return aT2;
    if (k < 3.5) return aT3;
    if (k < 4.5) return aT4;
    return aT0;
  }

  // The swarm fills the view as it is; each project is turned, scaled and
  // set beside its text.
  vec3 placeAt(vec4 shape, float k) {
    if (k < 0.5 || k > 4.5) return shape.xyz;
    return uSpin * shape.xyz * uFormScale + uOffset;
  }

  // 0 to 1 as given, or a pulse running down a path (2 + t).
  float glowOf(float g) {
    if (g < 1.5) return g;
    float wave = fract(g - 2.0 - uTime * 0.32);
    return 0.2 + 0.8 * smoothstep(0.84, 1.0, wave) * uMotion + 0.25 * (1.0 - uMotion);
  }

  void main() {
    float p = clamp(uProgress, 0.0, 5.0);
    float k = min(floor(p), 4.0);
    float f = p - k;

    // Each firefly sets off at its own moment and flies a curve. With
    // reduced motion the shapes swap at the midpoint instead, unseen.
    float delay = aSeed.x * 0.4;
    float fe = mix(step(0.5, f), smoothstep(delay, delay + 0.6, f), uMotion);
    vec4 shapeA = shapeAt(k);
    vec4 shapeB = shapeAt(k + 1.0);
    vec3 pos = mix(placeAt(shapeA, k), placeAt(shapeB, k + 1.0), fe);

    vec3 dir = normalize(vec3(sin(aSeed.w * TAU), 0.35 + cos(aSeed.w * TAU) * 0.6, sin(aSeed.z * TAU)));
    pos += dir * sin(fe * 3.14159265) * 0.9 * uMotion;

    float swarm = (k < 0.5 ? 1.0 - fe : 0.0) + (k > 3.5 ? fe : 0.0);
    vec3 drift = vec3(
      sin(uTime * 0.43 + aSeed.z * TAU),
      sin(uTime * 0.37 + aSeed.w * TAU + 1.3),
      cos(uTime * 0.41 + aSeed.x * TAU));
    pos += drift * mix(0.025, 0.3, swarm) * uMotion;
    pos += dir * uBurst * (0.5 + aSeed.y * 1.5);

    // Fireflies give way around the cursor.
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vec4 clip = projectionMatrix * mv;
    vec2 away = clip.xy / clip.w - uPointer;
    away.x *= uAspect;
    float pushed = smoothstep(0.28, 0.0, length(away)) * uPointerForce;
    mv.xy += normalize(away + vec2(0.0001)) * pushed * 0.05 * -mv.z;
    gl_Position = projectionMatrix * mv;

    float glow = clamp(glowOf(mix(shapeA.w, shapeB.w, step(0.5, fe))), 0.0, 1.0);
    float twinkle = mix(1.0, 0.62 + 0.38 * sin(uTime * (1.2 + aSeed.y * 2.2) + aSeed.z * TAU), max(swarm, step(0.95, glow)) * uMotion);
    float shrink = mix(max(uFormScale, 0.6), 1.0, swarm);
    gl_PointSize = uSize * (0.6 + aSeed.y * 0.8) * (1.0 + glow * 0.9 + pushed * 0.8) * shrink * uPixelRatio * (10.0 / -mv.z);

    vColor = mix(uBase, uWarm, glow);
    float fade = mix(abs(f - 0.5) * 2.0, 1.0, uMotion);
    vAlpha = (0.5 + 0.5 * glow) * twinkle * fade;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, a * a * vAlpha);
  }
`;

/* ── Story ──────────────────────────────── */
function start() {
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  } catch (error) {
    root.classList.remove('has-story');
    console.warn('The Erfaring story needs WebGL; showing the text alone.', error);
    return;
  }
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 60);
  camera.position.set(0, 0, 10);

  const count = pointBudget();
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  [swarm(), kartverket(), atlas(), luksuseiendom(), aiLab()].forEach((parts, k) => {
    geometry.setAttribute(`aT${k}`, new BufferAttribute(build(count, parts, 101 + k * 7919), 4));
  });
  const seeds = new Float32Array(count * 4);
  const r = random(7);
  for (let i = 0; i < seeds.length; i++) seeds[i] = r();
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 4));

  // The site's mint and the warm light of a firefly, as plain sRGB numbers:
  // the shader writes them out unconverted.
  const uniforms = {
    uProgress: { value: 0 },
    uTime: { value: 0 },
    uMotion: { value: reducedMotion.matches ? 0 : 1 },
    uSize: { value: 3.1 },
    uPixelRatio: { value: 1 },
    uFormScale: { value: 1 },
    uOffset: { value: new Vector3() },
    uSpin: { value: new Matrix3() },
    uPointer: { value: new Vector2(9, 9) },
    uPointerForce: { value: 0 },
    uAspect: { value: 1 },
    uBurst: { value: 0 },
    uBase: { value: new Vector3(0.66, 0.9, 0.76) },
    uWarm: { value: new Vector3(1.0, 0.86, 0.58) }
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;   // the real positions only exist in the shader
  scene.add(points);

  /* Scroll position to story position. Each chapter's shape stands while
     its text is in view and changes while the text changes, so the
     picture always belongs to what is being read. */
  let keys = [[0, 0]];
  function measure() {
    const vh = window.innerHeight;
    const y = window.scrollY;
    const wide = window.innerWidth >= WIDE;
    const top = element => element.getBoundingClientRect().top + y;
    keys = [[0, 0], [vh * 0.15, 0]];
    chapters.forEach((chapter, i) => {
      // Wide, the text is a window-high sticky box: it is centred from the
      // moment the chapter's top reaches the top of the window until its
      // bottom reaches the bottom. Narrow, the picture stands alone at the
      // chapter's top and the text card follows it up.
      const start = top(chapter);
      const formed = start - vh * (wide ? 0.2 : 0.1);
      const leaving = Math.max(formed, start + chapter.offsetHeight - vh * (wide ? 1 : 0.75));
      keys.push([formed, i + 1], [leaving, i + 1]);
    });
    keys.push([top(epilog) - vh * 0.4, LAST]);
  }

  function progressAt(y) {
    if (y <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (y < keys[i][0]) {
        const [y0, p0] = keys[i - 1];
        const [y1, p1] = keys[i];
        return p0 + (p1 - p0) * ((y - y0) / Math.max(1, y1 - y0));
      }
    }
    return LAST;
  }

  /* Size and placement. Wide, the picture stands in the space right of
     the text, clear of the chapter list; narrow, it sits above the text,
     which scrolls up beneath it. The swarm always fills the whole view. */
  const view = { width: 0, height: 0, ratio: 0 };
  function layout() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = pixelRatio();
    if (!width || !height) return;
    if (width !== view.width || height !== view.height || ratio !== view.ratio) {
      Object.assign(view, { width, height, ratio });
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      uniforms.uAspect.value = camera.aspect;
      uniforms.uPixelRatio.value = ratio;

      const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
      const halfW = halfH * camera.aspect;
      if (width >= WIDE) {
        const left = -halfW + 2 * halfW * 0.44;
        const right = -halfW + 2 * halfW * 0.86;
        uniforms.uFormScale.value = Math.min(1.1, (right - left) / SHAPE_W, (2 * halfH * 0.78) / SHAPE_H);
        uniforms.uOffset.value.set((left + right) / 2, 0, 0);
      } else {
        uniforms.uFormScale.value = Math.min(1, (2 * halfW * 0.9) / SHAPE_W, (2 * halfH * 0.42) / SHAPE_H);
        uniforms.uOffset.value.set(0, halfH * 0.42, 0);
      }
    }
    measure();
    dirty = true;
  }

  /* Interaction: on a mouse, the picture leans toward the cursor and the
     fireflies part around it; a click anywhere that is not a link scatters
     them for a moment. */
  const pointer = new Vector2(9, 9);
  const pointerTarget = new Vector2(9, 9);
  let burst = 0;

  window.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    pointerTarget.set((event.clientX / window.innerWidth) * 2 - 1, 1 - (event.clientY / window.innerHeight) * 2);
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => pointerTarget.set(9, 9));
  document.addEventListener('click', event => {
    if (reducedMotion.matches || event.target.closest('a, button, input, textarea, select, label, summary')) return;
    burst = Math.min(1.2, burst + 1);
  });

  /* Page state follows the story, written only when it changes. */
  let shownChapter = -1;
  let storyActive = false;
  let inChapters = false;
  let shownProgress = -1;
  function syncPage(p) {
    const chapter = p >= 0.5 && p < LAST - 0.5 ? Math.round(p) : 0;
    if (chapter !== shownChapter) {
      shownChapter = chapter;
      railLinks.forEach(link => {
        if (Number(link.dataset.rail) === chapter) link.setAttribute('aria-current', 'step');
        else link.removeAttribute('aria-current');
      });
    }
    const nowInChapters = p >= 0.5 && p < LAST - 0.4;
    if (nowInChapters !== inChapters) {
      inChapters = nowInChapters;
      root.classList.toggle('is-in-chapters', inChapters);
    }
    // A little slack either way, so the Unicorn scene is not paused and
    // resumed over and over at the boundary.
    const nowActive = storyActive ? p > 0.15 : p > 0.3;
    if (nowActive !== storyActive) {
      storyActive = nowActive;
      root.classList.toggle('is-story-active', storyActive);
      window.dispatchEvent(new CustomEvent('erfaring:story', { detail: { active: storyActive } }));
    }
    if (progressBar && Math.abs(p - shownProgress) > 0.002) {
      shownProgress = p;
      progressBar.style.transform = `scaleX(${(p / LAST).toFixed(4)})`;
    }
  }

  /* The loop. */
  const spin = uniforms.uSpin.value;
  let progress = progressAt(window.scrollY);
  let time = 0;
  let last = performance.now();
  let lastDrawn = 0;
  let lean = 0;
  let tilt = 0;
  let dirty = true;
  let lost = false;
  let shown = false;

  function frame(now) {
    requestAnimationFrame(frame);
    if (lost) return;
    // Half the frame rate on a machine that falls behind.
    if (perf?.lite && now - lastDrawn < 31) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const still = reducedMotion.matches;
    const target = progressAt(window.scrollY);
    const before = progress;
    progress = still ? target : progress + (target - progress) * (1 - Math.exp(-dt * 4));
    if (Math.abs(target - progress) < 0.0005) progress = target;
    syncPage(progress);

    const ease = 1 - Math.exp(-dt * 6);
    const tracking = finePointer.matches && !still && pointerTarget.x < 5;
    if (tracking) pointer.lerp(pointerTarget, ease);
    uniforms.uPointer.value.copy(pointer);
    uniforms.uPointerForce.value += ((tracking ? 1 : 0) - uniforms.uPointerForce.value) * ease;

    if (still) {
      if (!dirty && progress === before) return;
      uniforms.uMotion.value = 0;
      uniforms.uBurst.value = 0;
    } else {
      time += dt;
      uniforms.uMotion.value = 1;
      burst *= Math.exp(-dt * 3.2);
      uniforms.uBurst.value = burst;
    }
    uniforms.uTime.value = time;
    uniforms.uProgress.value = progress;

    const leanTarget = (tracking ? pointer.x * 0.32 : 0) + (still ? 0 : Math.sin(time * 0.15) * 0.25);
    const tiltTarget = tracking ? -pointer.y * 0.12 : 0;
    lean += (leanTarget - lean) * ease;
    tilt += (tiltTarget - tilt) * ease;
    // Turned about the vertical, then tipped (row-major).
    const cy = Math.cos(lean);
    const sy = Math.sin(lean);
    const cx = Math.cos(tilt);
    const sx = Math.sin(tilt);
    spin.set(cy, 0, sy, sx * sy, cx, -sx * cy, -cx * sy, sx, cx * cy);

    renderer.render(scene, camera);
    lastDrawn = now;
    dirty = false;
    if (!shown) {
      shown = true;
      root.classList.add('is-story-ready');
    }
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 120);
  });
  // Web fonts and late images change where the chapters fall.
  new ResizeObserver(() => { measure(); dirty = true; }).observe(document.body);
  reducedMotion.addEventListener('change', () => { dirty = true; });
  perf?.onChange(() => {
    geometry.setDrawRange(0, Math.min(count, pointBudget()));
    layout();
  });

  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    lost = true;
    root.classList.remove('is-story-ready');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    shown = false;
    dirty = true;
  });

  layout();
  requestAnimationFrame(frame);
}

if (canvas && chapters.length && epilog && root.classList.contains('has-story')) start();
