import * as THREE from 'three';

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** FNV-1a 32 bit string hash, stable across sessions. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small deterministic PRNG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distance from point P to segment AB in the XZ plane. */
export function distToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const len2 = abx * abx + abz * abz || 1e-6;
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / len2, 0, 1);
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

/** Canvas-texture text sprite (used for name tags and mystery word labels). */
export function makeTextSprite(text, { color = '#ffffff', stroke = '#1b1530', fontSize = 56, height = 0.55, bg = null } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `900 ${fontSize}px "Arial Black", "Trebuchet MS", sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 32;
  const h = fontSize + 28;
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (bg) {
    ctx.fillStyle = bg;
    const r = 16;
    ctx.beginPath();
    ctx.roundRect(2, 2, w - 4, h - 4, r);
    ctx.fill();
  }
  ctx.lineWidth = fontSize * 0.16;
  ctx.strokeStyle = stroke;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, w / 2, h / 2 + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set((height * w) / h, height, 1);
  sprite.renderOrder = 10;
  sprite.userData.dispose = () => { tex.dispose(); mat.dispose(); };
  return sprite;
}

/** Cache of box geometries keyed by size so hundreds of blocks share buffers. */
const boxCache = new Map();
export function boxGeo(w, h, d) {
  const key = `${w}|${h}|${d}`;
  let g = boxCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    boxCache.set(key, g);
  }
  return g;
}

const matCache = new Map();
/** Shared flat-shaded Lambert material by colour. Do not mutate the result. */
export function flatMat(color) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    matCache.set(color, m);
  }
  return m;
}

export function block(w, h, d, color, x = 0, y = 0, z = 0, shadows = true) {
  const m = new THREE.Mesh(boxGeo(w, h, d), typeof color === 'number' ? flatMat(color) : color);
  m.position.set(x, y, z);
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
}
