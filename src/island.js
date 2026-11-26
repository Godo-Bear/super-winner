import * as THREE from 'three';
import { block, boxGeo, flatMat, mulberry32, clamp, rand } from './utils.js';

export const ISLAND_RADIUS = 30;
export const HILL = { x: 9, z: -6, r: 9, h: 5.5 };
export const HUT = { x: -7, z: 5, hx: 3.25, hz: 3.25, h: 3.4 };
export const KILL_Y = -18;

const STEP = 0.4; // how far below a ledge top your feet may be and still climb onto it

/** Smooth terrain height (feet height) or -Infinity when off the island. */
export function terrainHeight(x, z) {
  const d = Math.hypot(x, z);
  if (d > ISLAND_RADIUS) return -Infinity;
  const hd = Math.hypot(x - HILL.x, z - HILL.z);
  let h = 0;
  if (hd < HILL.r) h = HILL.h * (0.5 + 0.5 * Math.cos((Math.PI * hd) / HILL.r));
  h = Math.min(h, HILL.h - 0.25);
  // gentle bumps so the low-poly surface feels hand made (never negative)
  h += 0.09 * (1 + Math.sin(x * 0.7) * Math.cos(z * 0.6));
  return h;
}

/** Builds 4 walls with a doorway. Returns colliders (axis aligned boxes). */
export function shelterWalls(s, t = 0.4, doorW = 2.2) {
  const { x, z, hx, hz, h } = s;
  const base = s.base ?? 0;
  const top = base + h;
  const cols = [];
  const box = (minX, maxX, minZ, maxZ) => cols.push({ type: 'box', minX, maxX, minZ, maxZ, bottom: base, top });
  const d = s.door; // '+x' | '-x' | '+z' | '-z'
  // x walls (west/east) span z
  const wallX = (side) => {
    const minX = side < 0 ? x - hx : x + hx - t;
    const maxX = minX + t;
    if (d === (side < 0 ? '-x' : '+x')) {
      box(minX, maxX, z - hz, z - doorW / 2);
      box(minX, maxX, z + doorW / 2, z + hz);
    } else box(minX, maxX, z - hz, z + hz);
  };
  const wallZ = (side) => {
    const minZ = side < 0 ? z - hz : z + hz - t;
    const maxZ = minZ + t;
    if (d === (side < 0 ? '-z' : '+z')) {
      box(x - hx, x - doorW / 2, minZ, maxZ);
      box(x + doorW / 2, x + hx, minZ, maxZ);
    } else box(x - hx, x + hx, minZ, maxZ);
  };
  wallX(-1); wallX(1); wallZ(-1); wallZ(1);
  return cols;
}

export class Island {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.colliders = [];
    this.shelters = [];
    this.trees = [];
    this.highPoint = { x: HILL.x, z: HILL.z };
    this.build();
  }

  build() {
    const rng = mulberry32(1337);
    this.buildGround(rng);
    this.buildHut();
    this.buildTrees(rng);
    this.buildRocks(rng);
    this.buildSurroundings(rng);
  }

  buildGround(rng) {
    const geo = new THREE.RingGeometry(0.01, ISLAND_RADIUS, 56, 18);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const hx = Math.min(r, ISLAND_RADIUS - 0.001);
      const sx = r > 0 ? (x / r) * hx : x, sz = r > 0 ? (z / r) * hx : z;
      pos.setY(i, terrainHeight(sx, sz));
      const n = rng();
      const hill = Math.max(0, terrainHeight(sx, sz) / HILL.h);
      c.setHSL(0.27 + n * 0.04 - hill * 0.03, 0.55 + n * 0.1, 0.42 + n * 0.08 + hill * 0.06);
      if (r > ISLAND_RADIUS - 1.2) c.offsetHSL(0, 0, -0.06);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const ground = new THREE.Mesh(geo, this.groundMat);
    ground.receiveShadow = true;
    this.group.add(ground);
    this.ground = ground;

    // dirt band + rocky underside
    const dirt = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS - 1.2, 1.6, 48, 1, true), flatMat(0x8a5a35));
    dirt.position.y = -0.75;
    this.group.add(dirt);
    const coneGeo = new THREE.CylinderGeometry(ISLAND_RADIUS - 1.2, 2.5, 18, 18, 5);
    const cp = coneGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const y = cp.getY(i);
      if (y < 8.9) {
        cp.setX(i, cp.getX(i) * (0.85 + rng() * 0.3));
        cp.setZ(i, cp.getZ(i) * (0.85 + rng() * 0.3));
        cp.setY(i, y + (rng() - 0.5) * 1.5);
      }
    }
    coneGeo.computeVertexNormals();
    const cone = new THREE.Mesh(coneGeo, flatMat(0x6d6a75));
    cone.position.y = -1.5 - 9;
    this.group.add(cone);
  }

  buildHut() {
    const s = { ...HUT, door: '+x', base: 0 };
    const top = s.h;
    const wallMat = flatMat(0xb07a46);
    for (const col of shelterWalls(s)) {
      this.colliders.push(col);
      const w = col.maxX - col.minX, d = col.maxZ - col.minZ;
      const m = new THREE.Mesh(boxGeo(w, top, d), wallMat);
      m.position.set((col.minX + col.maxX) / 2, top / 2, (col.minZ + col.maxZ) / 2);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    }
    // door frame + floor
    this.group.add(block(0.5, 0.4, 2.8, 0x7a4f2a, s.x + s.hx - 0.2, top - 0.2, s.z));
    const floor = block(s.hx * 2 - 0.4, 0.12, s.hz * 2 - 0.4, 0xd8b384, s.x, 0.06, s.z, false);
    floor.receiveShadow = true;
    this.group.add(floor);
    // roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(s.hx * 1.62, 2.6, 4, 1), flatMat(0xc0392b));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(s.x, top + 1.3, s.z);
    roof.castShadow = true;
    this.group.add(roof);
    const sign = block(1.6, 0.6, 0.12, 0xfff3c4, s.x + s.hx + 0.05, top - 0.75, s.z);
    sign.rotation.y = Math.PI / 2;
    this.group.add(sign);
    this.addShelter({ ...s, name: 'hut' });
  }

  /** Registers a walk-in shelter (hut, bunkers). */
  addShelter(s) {
    const t = 0.4;
    const nx = s.door === '+x' ? 1 : s.door === '-x' ? -1 : 0;
    const nz = s.door === '+z' ? 1 : s.door === '-z' ? -1 : 0;
    const shelter = {
      ...s,
      nx, nz,
      minX: s.x - s.hx + t, maxX: s.x + s.hx - t,
      minZ: s.z - s.hz + t, maxZ: s.z + s.hz - t,
      top: (s.base ?? 0) + s.h,
    };
    this.shelters.push(shelter);
    return shelter;
  }

  removeShelter(s) {
    const i = this.shelters.indexOf(s);
    if (i >= 0) this.shelters.splice(i, 1);
  }

  buildTrees(rng) {
    let tries = 0;
    while (this.trees.length < 14 && tries++ < 400) {
      const a = rng() * Math.PI * 2, r = 7 + rng() * (ISLAND_RADIUS - 10);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - HUT.x, z - HUT.z) < 6.5) continue;
      if (Math.hypot(x - HILL.x, z - HILL.z) < 3.5) continue;
      if (this.trees.some((t) => Math.hypot(t.x - x, t.z - z) < 5)) continue;
      const y = terrainHeight(x, z);
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const trunkH = 2.2 + rng() * 1.2;
      g.add(block(0.6, trunkH, 0.6, 0x7b5032, 0, trunkH / 2, 0));
      const leafCols = [0x2f9e44, 0x37b24d, 0x40c057];
      let ly = trunkH;
      for (let i = 0; i < 3; i++) {
        const s = 2.6 - i * 0.7;
        g.add(block(s, 0.9, s, leafCols[i], 0, ly + 0.35, 0));
        ly += 0.8;
      }
      g.rotation.y = rng() * Math.PI;
      this.group.add(g);
      this.trees.push({ x, z, y, mesh: g });
      this.colliders.push({ type: 'circle', x, z, r: 0.45, bottom: y - 1, top: y + 40 });
    }
  }

  buildRocks(rng) {
    let n = 0, tries = 0;
    const placed = [];
    while (n < 10 && tries++ < 400) {
      const a = rng() * Math.PI * 2, r = 5 + rng() * (ISLAND_RADIUS - 8);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - HUT.x, z - HUT.z) < 6) continue;
      if (this.trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3)) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 4)) continue;
      const rad = 0.8 + rng() * 0.9;
      const y = terrainHeight(x, z);
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(rad, 0), flatMat(rng() > 0.5 ? 0x9a9aa6 : 0x84848f));
      m.scale.set(1, 0.75, 1);
      m.position.set(x, y + rad * 0.35, z);
      m.rotation.set(rng(), rng() * 3, rng());
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      placed.push({ x, z });
      this.colliders.push({ type: 'circle', x, z, r: rad * 0.85, bottom: y - 1, top: y + rad * 0.95 });
      n++;
    }
  }

  buildSurroundings(rng) {
    // sea far below
    const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 32), new THREE.MeshLambertMaterial({ color: 0x2a8bd8 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -40;
    this.scene.add(sea);
    this.sea = sea;
    // floating mini islands
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng();
      const r = 45 + rng() * 30;
      const g = new THREE.Group();
      const s = 2 + rng() * 3;
      g.add(block(s * 2, s * 0.5, s * 2, 0x52b356, 0, 0, 0, false));
      g.add(block(s * 1.6, s * 1.2, s * 1.6, 0x8a5a35, 0, -s * 0.85, 0, false));
      g.add(block(s * 0.8, s * 1.0, s * 0.8, 0x6d6a75, 0, -s * 1.9, 0, false));
      g.position.set(Math.cos(a) * r, -6 + rng() * 14, Math.sin(a) * r);
      g.userData.bob = rng() * 6;
      this.scene.add(g);
      (this.floaters ||= []).push(g);
    }
    // clouds
    this.clouds = [];
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.92 });
    this.cloudMat = cloudMat;
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(boxGeo(4 + rng() * 5, 1.6 + rng() * 1.5, 3 + rng() * 4), cloudMat);
        m.position.set(k * 3 - n * 1.5, rng(), rng() * 2);
        g.add(m);
      }
      g.position.set((rng() - 0.5) * 200, 22 + rng() * 18, (rng() - 0.5) * 200);
      this.scene.add(g);
      this.clouds.push(g);
    }
  }

  update(dt, time) {
    for (const c of this.clouds) {
      c.position.x += dt * 1.5;
      if (c.position.x > 110) c.position.x = -110;
    }
    for (const f of this.floaters) f.position.y += Math.sin(time * 0.6 + f.userData.bob) * dt * 0.3;
  }

  // ---------------- Queries ----------------

  addCollider(c) { this.colliders.push(c); return c; }
  removeCollider(c) {
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
  }

  /** Ground height including standable collider tops below `y`. */
  groundAt(x, z, y, footR = 0.25) {
    let g = terrainHeight(x, z);
    for (const c of this.colliders) {
      if (c.top > y + STEP || c.top <= g || c.noStand) continue;
      if (c.type === 'circle') {
        if (Math.hypot(x - c.x, z - c.z) < c.r + footR * 0.5) g = c.top;
      } else if (x > c.minX - footR * 0.5 && x < c.maxX + footR * 0.5 && z > c.minZ - footR * 0.5 && z < c.maxZ + footR * 0.5) g = c.top;
    }
    return g;
  }

  /** Pushes a character out of solid colliders, then resolves ground contact. */
  resolveCharacter(ch, dt) {
    const p = ch.pos, r = ch.radius;
    for (const c of this.colliders) {
      if (p.y >= c.top - STEP || p.y + ch.height <= c.bottom) continue;
      if (c.type === 'circle') {
        const dx = p.x - c.x, dz = p.z - c.z;
        const d = Math.hypot(dx, dz), min = c.r + r;
        if (d < min) {
          const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
          p.x = c.x + nx * min;
          p.z = c.z + nz * min;
          const vn = ch.vel.x * nx + ch.vel.z * nz;
          if (vn < 0) { ch.vel.x -= vn * nx; ch.vel.z -= vn * nz; }
          ch.bumped = true;
        }
      } else {
        const qx = clamp(p.x, c.minX, c.maxX), qz = clamp(p.z, c.minZ, c.maxZ);
        const dx = p.x - qx, dz = p.z - qz;
        const d = Math.hypot(dx, dz);
        if (d < r) {
          if (d > 1e-5) {
            const nx = dx / d, nz = dz / d;
            p.x = qx + nx * r;
            p.z = qz + nz * r;
            const vn = ch.vel.x * nx + ch.vel.z * nz;
            if (vn < 0) { ch.vel.x -= vn * nx; ch.vel.z -= vn * nz; }
          } else {
            // centre inside the box: escape along the shallowest axis
            const pen = [p.x - c.minX, c.maxX - p.x, p.z - c.minZ, c.maxZ - p.z];
            const m = Math.min(...pen);
            if (m === pen[0]) p.x = c.minX - r; else if (m === pen[1]) p.x = c.maxX + r;
            else if (m === pen[2]) p.z = c.minZ - r; else p.z = c.maxZ + r;
          }
          ch.bumped = true;
        }
      }
    }
    const g = this.groundAt(p.x, p.z, p.y, r);
    const tol = Math.max(0.7, -ch.vel.y * dt + 0.25);
    if (g > -Infinity && p.y <= g + 0.02 && p.y > g - tol && ch.vel.y <= 0.5) {
      p.y = g;
      if (ch.vel.y < 0) ch.vel.y = 0;
      ch.onGround = true;
    } else if (ch.onGround && g > -Infinity && p.y > g && p.y - g < 0.35 && ch.vel.y <= 0) {
      // stick to downhill slopes
      p.y = g;
      ch.vel.y = 0;
      ch.onGround = true;
    } else {
      ch.onGround = false;
    }
  }

  /** Is this point inside a shelter (hut / bunker)? */
  shelterAt(pos) {
    for (const s of this.shelters) {
      if (pos.x > s.minX && pos.x < s.maxX && pos.z > s.minZ && pos.z < s.maxZ && pos.y < s.top - 0.5 && pos.y > (s.base ?? 0) - 1) return s;
    }
    return null;
  }
  isSheltered(pos) { return !!this.shelterAt(pos); }

  /** Under a tree canopy also counts as cover from rain-type hazards. */
  isCovered(pos) {
    if (this.isSheltered(pos)) return true;
    return this.trees.some((t) => Math.hypot(pos.x - t.x, pos.z - t.z) < 1.4 && pos.y < t.y + 2);
  }

  /** Waypoint a bot should walk toward to get inside shelter `s`. */
  shelterWaypoint(s, pos) {
    const lx = pos.x - s.x, lz = pos.z - s.z;
    const front = lx * s.nx + lz * s.nz; // distance in door direction
    const side = s.nx !== 0 ? lz : lx;
    const half = s.nx !== 0 ? s.hx : s.hz;
    const inside = this.shelterAt(pos) === s;
    if (inside) return { x: s.x + (Math.sin(pos.x * 3) * 0.5), z: s.z + Math.cos(pos.z * 3) * 0.5, inside: true };
    if (front > half - 0.6 && Math.abs(side) < 0.8) return { x: s.x, z: s.z };
    if (front > half + 0.4) return { x: s.x + s.nx * (half + 1.6), z: s.z + s.nz * (half + 1.6) };
    // go around to the door side
    const sideSign = side >= 0 ? 1 : -1;
    const tx = s.nx !== 0 ? s.x + s.nx * (half + 1.8) : s.x + sideSign * (s.hx + 1.8);
    const tz = s.nx !== 0 ? s.z + sideSign * (s.hz + 1.8) : s.z + s.nz * (half + 1.8);
    return { x: tx, z: tz };
  }

  nearestShelter(pos) {
    let best = null, bd = Infinity;
    for (const s of this.shelters) {
      const d = Math.hypot(pos.x - s.x, pos.z - s.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /** Random point on the island. */
  randomPoint(minR = 0, maxR = ISLAND_RADIUS - 3, { avoidHut = true, avoidHill = false } = {}) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(rand(minR * minR, maxR * maxR));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (avoidHut && Math.abs(x - HUT.x) < HUT.hx + 1.5 && Math.abs(z - HUT.z) < HUT.hz + 1.5) continue;
      if (avoidHill && Math.hypot(x - HILL.x, z - HILL.z) < HILL.r * 0.8) continue;
      if (avoidHut && this.shelters.some((s) => Math.abs(x - s.x) < s.hx + 1 && Math.abs(z - s.z) < s.hz + 1)) continue;
      return { x, z };
    }
    return { x: 0, z: 0 };
  }

  /** True if a straight segment at height y is blocked by a collider. */
  segmentBlocked(ax, az, bx, bz, y) {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(len / 0.5);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.pointSolid(ax + (bx - ax) * t, y, az + (bz - az) * t)) return true;
    }
    return false;
  }

  pointSolid(x, y, z) {
    if (y < terrainHeight(x, z)) return true;
    for (const c of this.colliders) {
      if (y > c.top || y < c.bottom) continue;
      if (c.type === 'circle') { if (Math.hypot(x - c.x, z - c.z) < c.r) return true; }
      else if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
    }
    return false;
  }
}
