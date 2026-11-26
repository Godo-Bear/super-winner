import * as THREE from 'three';
import { terrainHeight, ISLAND_RADIUS } from '../island.js';
import { clamp, rand } from '../utils.js';

// ---------- shared telegraph materials (pulsed every frame) ----------
export const WARN_MAT = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
export const WARN_RING_MAT = new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
export const WARN_WALL_MAT = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
export const YELLOW_WARN_MAT = new THREE.MeshBasicMaterial({ color: 0xfff04a, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
export const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });

const discGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
const ringGeo = new THREE.RingGeometry(0.88, 1, 28).rotateX(-Math.PI / 2);
const wallGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true).translate(0, 0.5, 0);
const planeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

let pulseInstalled = false;
export function installWarnPulse(game) {
  if (pulseInstalled) return;
  pulseInstalled = true;
  game.onTick.push((dt, t) => {
    const s = Math.sin(t * 12);
    WARN_MAT.opacity = 0.24 + 0.14 * s;
    WARN_RING_MAT.opacity = 0.7 + 0.3 * s;
    WARN_WALL_MAT.opacity = 0.14 + 0.1 * s;
    YELLOW_WARN_MAT.opacity = 0.3 + 0.25 * Math.sin(t * 25);
  });
}

/** Highest ground under a disc (so decals stay visible on slopes). */
export function groundY(x, z, r = 0) {
  let y = terrainHeight(x, z);
  if (y === -Infinity) y = 0;
  if (r > 0) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const h = terrainHeight(x + Math.cos(a) * r * 0.7, z + Math.sin(a) * r * 0.7);
      if (h > y) y = h;
    }
  }
  return y;
}

/** Red pulsing danger circle. */
export function warnCircle(parent, x, z, r, { color = 'red', wall = true } = {}) {
  const g = new THREE.Group();
  const y = groundY(x, z, r) + 0.08;
  g.position.set(x, y, z);
  const disc = new THREE.Mesh(discGeo, color === 'yellow' ? YELLOW_WARN_MAT : WARN_MAT);
  disc.scale.setScalar(r);
  disc.renderOrder = 2;
  g.add(disc);
  const ring = new THREE.Mesh(ringGeo, WARN_RING_MAT);
  ring.scale.setScalar(r);
  ring.position.y = 0.01;
  ring.renderOrder = 2;
  g.add(ring);
  if (wall) {
    const w = new THREE.Mesh(wallGeo, WARN_WALL_MAT);
    w.scale.set(r, 0.9, r);
    w.position.y = -0.3;
    g.add(w);
  }
  parent.add(g);
  return g;
}

/** Dark growing shadow for things falling from the sky. */
export function shadowCircle(parent, x, z, r) {
  const m = new THREE.Mesh(discGeo, SHADOW_MAT);
  m.position.set(x, groundY(x, z, r) + 0.07, z);
  m.scale.setScalar(r);
  parent.add(m);
  const ring = new THREE.Mesh(ringGeo, WARN_RING_MAT);
  ring.position.y = 0.01;
  m.add(ring);
  return m;
}

/** Red strip from (ax,az) to (bx,bz). */
export function warnStrip(parent, ax, az, bx, bz, width) {
  const m = new THREE.Mesh(planeGeo, WARN_MAT);
  const len = Math.hypot(bx - ax, bz - az);
  m.scale.set(width, 1, len);
  m.rotation.y = Math.atan2(bx - ax, bz - az);
  m.position.set((ax + bx) / 2, Math.max(groundY((ax + bx) / 2, (az + bz) / 2), 0) + 0.12, (az + bz) / 2);
  m.renderOrder = 2;
  parent.add(m);
  return m;
}

/** Moves an x/z object toward a target on the ground, staying on the island. Returns remaining distance. */
export function stepToward(obj, tx, tz, speed, dt, maxR = ISLAND_RADIUS - 1.5) {
  const dx = tx - obj.x, dz = tz - obj.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.01) {
    const s = Math.min(d, speed * dt);
    obj.x += (dx / d) * s;
    obj.z += (dz / d) * s;
  }
  const r = Math.hypot(obj.x, obj.z);
  if (r > maxR) { obj.x *= maxR / r; obj.z *= maxR / r; }
  return d;
}

/**
 * Things that fall / fly to a spot after a telegraph (meteors, bombs, icicles, tacos...).
 */
export class Drops {
  constructor(hazard) {
    this.h = hazard;
    this.list = [];
  }

  add({ x, z, from = null, height = 40, time = 2, radius = 2, mesh = null, warn = 'circle', onImpact, arc = 0, spin = 3, trail = null, threat = true }) {
    const ty = groundY(x, z);
    const start = from ? { ...from } : { x: x + rand(-4, 4), y: ty + height, z: z + rand(-4, 4) };
    const d = { x, z, ty, start, t: 0, time, radius, mesh, onImpact, arc, spin, trail };
    d.warn = warn === 'shadow' ? shadowCircle(this.h.group, x, z, radius) : warn ? warnCircle(this.h.group, x, z, radius) : null;
    if (d.warn && warn === 'shadow') d.warn.scale.setScalar(0.01);
    d.threat = threat ? { type: 'avoid', x, z, radius } : null;
    if (mesh) { mesh.position.set(start.x, start.y, start.z); this.h.group.add(mesh); }
    this.list.push(d);
    return d;
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.t += dt;
      const k = clamp(d.t / d.time, 0, 1);
      if (d.mesh) {
        const e = d.arc ? k : k * k;
        d.mesh.position.set(
          d.start.x + (d.x - d.start.x) * e,
          d.start.y + (d.ty - d.start.y) * e + d.arc * 4 * k * (1 - k),
          d.start.z + (d.z - d.start.z) * e,
        );
        d.mesh.rotation.x += dt * d.spin;
        d.mesh.rotation.z += dt * d.spin * 0.7;
        if (d.trail) d.trail(d.mesh.position);
      }
      if (d.warn && d.warn.material === SHADOW_MAT) d.warn.scale.setScalar(Math.max(0.01, d.radius * k));
      if (d.threat) this.h.threats.push(d.threat);
      if (k >= 1) {
        this.list.splice(i, 1);
        if (d.mesh) this.h.group.remove(d.mesh);
        if (d.warn) this.h.group.remove(d.warn);
        d.onImpact?.(d.x, d.ty, d.z);
      }
    }
  }

  get count() { return this.list.length; }
}

/** Alive characters within radius of a ground point (2D), with an optional height window. */
export function charsNear(game, x, z, r, yMin = -Infinity, yMax = Infinity) {
  const out = [];
  for (const c of game.characters) {
    if (!c.alive) continue;
    if (Math.hypot(c.pos.x - x, c.pos.z - z) > r) continue;
    if (c.pos.y < yMin || c.pos.y > yMax) continue;
    out.push(c);
  }
  return out;
}
