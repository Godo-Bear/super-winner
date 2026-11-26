import * as THREE from 'three';
import { Hazard } from './base.js';
import { groundY, shadowCircle } from './common.js';
import { rand, block, boxGeo, flatMat, makeTextSprite } from '../utils.js';
import { shelterWalls } from '../island.js';

// ------------------------------------------------------------------ WALL
export class Wall extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 40;
    this.killVerb = 'got bonked by a WALL';
    this.walls = [];
    const brick = flatMat(0xb5533c), mortar = flatMat(0xd98b6a);
    for (let i = 0; i < 3; i++) {
      const p = this.island.randomPoint(4, 20, { avoidHill: true });
      const alongX = Math.random() < 0.5;
      const w = alongX ? 6 : 0.9, d = alongX ? 0.9 : 6, h = 3;
      const base = groundY(p.x, p.z, 3) - 0.1;
      const g = new THREE.Group();
      for (let row = 0; row < 4; row++) {
        const m = block(w, h / 4 - 0.04, d, row % 2 ? brick : mortar, 0, row * (h / 4) + h / 8, 0);
        g.add(m);
      }
      g.position.set(p.x, base - h, p.z);
      this.group.add(g);
      this.walls.push({ g, base, h, col: { type: 'box', minX: p.x - w / 2, maxX: p.x + w / 2, minZ: p.z - d / 2, maxZ: p.z + d / 2, bottom: base - 1, top: base + h }, added: false });
    }
    this.audio.rumble(1);
  }

  update() {
    const k = Math.min(1, this.t / 1);
    for (const w of this.walls) {
      w.g.position.y = w.base - w.h * (1 - k);
      if (k >= 1 && !w.added) {
        w.added = true;
        this.addCollider(w.col);
        this.particles.emit({ x: w.g.position.x, y: w.base + 0.2, z: w.g.position.z, color: [0x8a5a35, 0xb08a5a], count: 12, speed: 4, up: 3, size: 0.4, life: 0.6, spread: 1.5 });
      }
    }
    if (this.t > this.duration - 1) {
      for (const w of this.walls) w.g.position.y = w.base - w.h * (this.t - (this.duration - 1));
    }
  }
}

// ------------------------------------------------------------------ BUNKER
export class Bunker extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 60;
    this.killVerb = 'got squashed by a falling BUNKER';
    const p = this.island.randomPoint(9, 19, { avoidHill: true });
    const hx = 2.4, hz = 2.4, h = 2.9;
    const base = groundY(p.x, p.z, 3);
    // door faces the island centre
    const door = Math.abs(p.x) > Math.abs(p.z) ? (p.x > 0 ? '-x' : '+x') : (p.z > 0 ? '-z' : '+z');
    this.spec = { x: p.x, z: p.z, hx, hz, h, base, door };
    const g = new THREE.Group();
    const concrete = flatMat(0x8d9199);
    for (const c of shelterWalls(this.spec)) {
      const m = new THREE.Mesh(boxGeo(c.maxX - c.minX, h, c.maxZ - c.minZ), concrete);
      m.position.set((c.minX + c.maxX) / 2 - p.x, h / 2, (c.minZ + c.maxZ) / 2 - p.z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    g.add(block(hx * 2 + 0.4, 0.35, hz * 2 + 0.4, 0x6f737a, 0, h + 0.17, 0));
    g.add(block(hx * 2 - 0.4, 0.08, hz * 2 - 0.4, 0x5c5f66, 0, 0.04, 0, false));
    const sign = makeTextSprite('BUNKER', { color: '#ffd23f', fontSize: 40, height: 0.55 });
    sign.position.y = h + 1;
    g.add(sign);
    g.position.set(p.x, base + 40, p.z);
    this.bunker = g;
    this.group.add(g);
    this.shadow = shadowCircle(this.group, p.x, p.z, 3.4);
    this.threat = { type: 'avoid', x: p.x, z: p.z, radius: 3.6 };
    this.landed = false;
  }

  update(dt) {
    const fall = 1.6;
    if (!this.landed) {
      this.threats.push(this.threat);
      const k = Math.min(1, this.t / fall);
      this.shadow.scale.setScalar(Math.max(0.01, 3.4 * k));
      this.bunker.position.y = this.spec.base + 40 * (1 - k * k);
      if (k >= 1) {
        this.landed = true;
        this.group.remove(this.shadow);
        const s = this.spec;
        for (const c of this.living()) {
          if (Math.abs(c.pos.x - s.x) < s.hx + 0.3 && Math.abs(c.pos.z - s.z) < s.hz + 0.3 && c.pos.y < s.base + s.h) {
            this.hit(c, 20, { knock: { x: Math.sign(c.pos.x - s.x) * 6, y: 6, z: Math.sign(c.pos.z - s.z) * 6 } });
          }
        }
        for (const col of shelterWalls(s)) this.addCollider(col);
        this.addCollider({ type: 'box', minX: s.x - s.hx - 0.2, maxX: s.x + s.hx + 0.2, minZ: s.z - s.hz - 0.2, maxZ: s.z + s.hz + 0.2, bottom: s.base + s.h, top: s.base + s.h + 0.35 });
        this.addShelter({ ...s, name: 'bunker' });
        this.particles.emit({ x: s.x, y: s.base + 0.3, z: s.z, color: [0x8d9199, 0x8a5a35], count: 30, speed: 8, up: 3, size: 0.5, life: 0.8, spread: 2 });
        this.audio.explosion(1);
        this.game.addShake(0.6, s.x, s.z);
      }
    }
  }
}

// ------------------------------------------------------------------ PICKUPS (shield / jetpack / speed / heal)
class PickupHazard extends Hazard {
  constructor(game, opts, { count = 3, duration = 25 } = {}) {
    super(game, opts);
    this.duration = duration;
    this.pickups = [];
    for (let i = 0; i < count; i++) {
      const p = this.island.randomPoint(2, this.R - 5);
      const mesh = this.makeMesh();
      const y = groundY(p.x, p.z) + 1.2;
      mesh.position.set(p.x, y + 20, p.z);
      this.group.add(mesh);
      this.pickups.push({ x: p.x, z: p.z, y, mesh, delay: i * 0.25, threat: { type: 'seek', x: p.x, z: p.z } });
    }
    this.audio.powerup();
  }

  makeMesh() { return block(0.8, 0.8, 0.8, 0xffffff); }
  apply() {}

  update(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      const k = Math.min(1, Math.max(0, (this.t - p.delay) / 1));
      p.mesh.position.y = p.y + 20 * (1 - k) + Math.sin(this.t * 3 + i) * 0.2;
      p.mesh.rotation.y += dt * 2.5;
      if (k < 1) continue;
      this.threats.push(p.threat);
      if (Math.random() < dt * 4) this.particles.emit({ x: p.x, y: p.y, z: p.z, color: [0xffffff, 0xffe066], count: 1, speed: 1.5, up: 1.5, size: 0.15, life: 0.6, gravity: -1 });
      for (const c of this.living()) {
        if (Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < 1.3 && Math.abs(c.pos.y + 1 - p.y) < 2) {
          this.apply(c);
          this.particles.burst(p.x, p.y, p.z, [0xffffff, 0xffe066, 0x5dff9e], 16, 5, 0.25, 0.6);
          this.audio.pop();
          this.group.remove(p.mesh);
          this.pickups.splice(i, 1);
          break;
        }
      }
    }
    if (this.t > 2 && this.pickups.length === 0) this.done = true;
  }
}

const orbGeo = new THREE.IcosahedronGeometry(0.55, 1);
export class ShieldPickup extends PickupHazard {
  makeMesh() {
    const m = new THREE.Mesh(orbGeo, new THREE.MeshLambertMaterial({ color: 0x66c2ff, emissive: 0x2266aa, flatShading: true }));
    this.track(m.material);
    return m;
  }
  apply(c) { c.shield = Math.max(c.shield, 60); this.game.notify(c, '🛡️ Shield! (blocks 60 damage)', 'powerup'); }
}

export class JetpackPickup extends PickupHazard {
  makeMesh() {
    const g = new THREE.Group();
    g.add(block(0.7, 0.8, 0.35, 0x9aa0a8, 0, 0, 0));
    g.add(block(0.25, 0.9, 0.25, 0xff5a1f, -0.25, -0.1, -0.25));
    g.add(block(0.25, 0.9, 0.25, 0xff5a1f, 0.25, -0.1, -0.25));
    return g;
  }
  apply(c) { c.jetpack = 12; this.game.notify(c, '🚀 Jetpack! HOLD jump to fly', 'powerup'); }
}

export class SpeedPickup extends PickupHazard {
  makeMesh() {
    const g = new THREE.Group();
    const m = flatMat(0xffd23f);
    g.add(block(0.25, 0.6, 0.2, m, 0.1, 0.3, 0));
    g.add(block(0.5, 0.18, 0.2, m, 0, 0, 0));
    g.add(block(0.25, 0.6, 0.2, m, -0.1, -0.3, 0));
    g.scale.setScalar(1.4);
    return g;
  }
  apply(c) { c.speedBoost = 12; this.game.notify(c, '⚡ SPEED BOOST!', 'powerup'); }
}

export class HealPickup extends PickupHazard {
  constructor(game, opts) { super(game, opts, { count: 4 }); }
  makeMesh() {
    const g = new THREE.Group();
    const m = flatMat(0x3ddc84);
    g.add(new THREE.Mesh(boxGeo(0.9, 0.3, 0.3), m));
    g.add(new THREE.Mesh(boxGeo(0.3, 0.9, 0.3), m));
    return g;
  }
  apply(c) { c.hp = Math.min(100, c.hp + 50); this.game.notify(c, '💚 +50 HP', 'powerup'); }
}

export default { wall: Wall, bunker: Bunker, shield: ShieldPickup, jetpack: JetpackPickup, speed: SpeedPickup, heal: HealPickup };
