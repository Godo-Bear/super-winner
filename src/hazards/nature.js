import * as THREE from 'three';
import { Hazard } from './base.js';
import { Drops, warnCircle, groundY } from './common.js';
import { rand, pick } from '../utils.js';
import { terrainHeight } from '../island.js';

const LAVA = [0xff3d00, 0xff6a00, 0xffa31a, 0xffd23f];
const HELL_SKY = new THREE.Color(0xff7a5a);
const HELL_FOG = new THREE.Color(0xa0402a);
const HELL_GROUND = new THREE.Color(0xd08a70);
const ICE_GROUND = new THREE.Color(0xbfe8ff);
const ICE_FOG = new THREE.Color(0xdff4ff);

// ------------------------------------------------------------------ LAVA (spreads inward)
export class Lava extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 45;
    this.killVerb = 'melted in the LAVA';
    this.minR = 14;
    this.r = this.R + 1;
    this.mat = this.track(new THREE.MeshBasicMaterial({ color: 0xff5a00, side: THREE.DoubleSide }));
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(this.r, this.R + 4, 64, 1).rotateX(-Math.PI / 2), this.mat);
    this.mesh.position.y = 0.22;
    this.builtR = this.r;
    this.group.add(this.mesh);
    this.ringThreat = { type: 'ring', radius: this.r };
    this.audio.rumble(2);
  }

  update(dt) {
    if (this.t > 3) this.r = Math.max(this.minR, this.R + 1 - (this.t - 3) * 0.75);
    if (this.t > this.duration - 4) this.r = Math.min(this.R + 2, this.r + dt * 6);
    if (Math.abs(this.builtR - this.r) > 0.15) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = new THREE.RingGeometry(this.r, this.R + 4, 64, 1).rotateX(-Math.PI / 2);
      this.builtR = this.r;
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
    this.mat.color.setRGB(1, 0.3 + pulse * 0.15, 0);
    this.ringThreat.radius = this.r;
    this.threats.push(this.ringThreat);
    // bubbling edge
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2, rr = rand(this.r, this.R);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (terrainHeight(x, z) < 0.3) this.particles.emit({ x, y: 0.3, z, color: LAVA, count: 1, speed: 1.5, up: 3, size: 0.35, life: 0.6 });
    }
    for (const c of this.living()) {
      const d = Math.hypot(c.pos.x, c.pos.z);
      if (d > this.r - 0.2 && c.pos.y < 0.75) {
        this.hit(c, 32 * dt, { knock: { x: 0, y: c.onGround ? 5 : 0, z: 0 } });
        if (Math.random() < 0.5) this.particles.emit({ x: c.pos.x, y: c.pos.y + 0.3, z: c.pos.z, color: LAVA, count: 2, speed: 2, up: 3, size: 0.3, life: 0.4 });
      }
    }
  }
}

// ------------------------------------------------------------------ QUICKSAND
const sandGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
export class Quicksand extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 30;
    this.killVerb = 'sank into the QUICKSAND';
    this.mat = this.track(new THREE.MeshLambertMaterial({ color: 0xc2a165, transparent: true, opacity: 0, flatShading: true }));
    this.innerMat = this.track(new THREE.MeshLambertMaterial({ color: 0x8f7240, transparent: true, opacity: 0 }));
    this.pits = [];
    for (let i = 0; i < 4; i++) {
      const p = this.island.randomPoint(3, this.R - 5, { avoidHill: true });
      const r = rand(2.3, 3.4);
      const y = groundY(p.x, p.z, r) + 0.06;
      const m = new THREE.Mesh(sandGeo, this.mat);
      m.scale.setScalar(r);
      m.position.set(p.x, y, p.z);
      const inner = new THREE.Mesh(sandGeo, this.innerMat);
      inner.scale.setScalar(0.5);
      inner.position.y = 0.01;
      m.add(inner);
      this.group.add(m);
      this.pits.push({ x: p.x, z: p.z, r, y, warn: warnCircle(this.group, p.x, p.z, r, { wall: false }), threat: { type: 'avoid', x: p.x, z: p.z, radius: r } });
    }
    this.sink = new Map();
  }

  update(dt) {
    const k = Math.min(1, this.t / 2.5);
    this.mat.opacity = 0.95 * k;
    this.innerMat.opacity = 0.95 * k;
    if (this.t > 2.5) for (const p of this.pits) if (p.warn) { this.group.remove(p.warn); p.warn = null; }
    for (const p of this.pits) {
      this.threats.push(p.threat);
      if (Math.random() < dt * 3) this.particles.emit({ x: p.x + rand(-p.r, p.r) * 0.5, y: p.y + 0.1, z: p.z + rand(-p.r, p.r) * 0.5, color: [0xc2a165, 0x8f7240], count: 1, speed: 1, up: 2, size: 0.25, life: 0.5 });
    }
    if (this.t < 2.5) return;
    for (const c of this.living()) {
      let inPit = false;
      for (const p of this.pits) {
        if (Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < p.r && c.pos.y < p.y + 0.4) { inPit = true; break; }
      }
      let s = this.sink.get(c) || 0;
      if (inPit) {
        s = Math.min(1.3, s + dt * 0.55);
        c.mods.speedMul *= 0.28;
        c.mods.jumpMul = Math.min(c.mods.jumpMul, 0.8);
        this.hit(c, 10 * dt);
      } else s = Math.max(0, s - dt * 3);
      if (s > 0) { this.sink.set(c, s); c.mods.sink = Math.max(c.mods.sink, s); } else this.sink.delete(c);
    }
  }
}

// ------------------------------------------------------------------ BLACK HOLE
export class BlackHole extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 14;
    this.killVerb = 'was spaghettified by a BLACK HOLE';
    const p = this.island.randomPoint(0, 16);
    this.x = p.x; this.z = p.z;
    this.y = groundY(p.x, p.z) + 2.6;
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.35, 6, 24), new THREE.MeshBasicMaterial({ color: 0xb04dff }));
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.2, 6, 24), new THREE.MeshBasicMaterial({ color: 0xff8a1f }));
    ring.rotation.x = Math.PI / 2 - 0.3;
    ring2.rotation.x = Math.PI / 2 + 0.3;
    for (const m of [core, ring, ring2]) { this.track(m.geometry); this.track(m.material); g.add(m); }
    this.rings = [ring, ring2];
    g.position.set(this.x, this.y, this.z);
    g.scale.setScalar(0.01);
    this.hole = g;
    this.group.add(g);
    this.threat = { type: 'avoid', x: this.x, z: this.z, radius: 10 };
    this.audio.tone({ freq: 60, to: 30, type: 'sawtooth', dur: 3, vol: 0.25, attack: 1 });
  }

  update(dt) {
    const grow = Math.min(1, this.t / 3);
    const shrink = Math.max(0, Math.min(1, (this.duration - this.t) / 1));
    const s = grow * shrink;
    this.hole.scale.setScalar(Math.max(0.01, s));
    this.rings[0].rotation.z += dt * 3;
    this.rings[1].rotation.z -= dt * 2;
    this.threats.push(this.threat);
    // inward-spiralling dust
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(5, 12);
      const x = this.x + Math.cos(a) * r, z = this.z + Math.sin(a) * r, y = this.y + rand(-2, 2);
      const sp = r * 1.2;
      this.particles.emit({ x, y, z, color: [0xb04dff, 0x6a4c93, 0xffffff], count: 1, speed: sp, size: 0.25, life: 0.8, gravity: 0, drag: 0, dir: { x: (this.x - x) / r, y: (this.y - y) / r, z: (this.z - z) / r }, cone: 0.05 });
    }
    if (this.t < 3 || s < 0.5) return;
    this.game.addShake(0.08);
    for (const c of this.living()) {
      const dx = this.x - c.pos.x, dy = this.y - (c.pos.y + 1), dz = this.z - c.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 2.1) {
        this.particles.burst(this.x, this.y, this.z, [0xb04dff, 0xffffff], 20, 6);
        this.game.killCharacter(c, this.killVerb, this);
        continue;
      }
      if (d > 24) continue;
      const pull = Math.min(13, 32 / (d + 0.8));
      const hd = Math.hypot(dx, dz) || 1;
      c.pos.x += (dx / hd) * pull * dt;
      c.pos.z += (dz / hd) * pull * dt;
      if (d < 7 && dy > 0) c.vel.y = Math.max(c.vel.y, Math.min(4, dy));
      c.lastHit = { source: this, time: this.game.time };
    }
  }
}

// ------------------------------------------------------------------ HELL
const pillarMat = new THREE.MeshBasicMaterial({ color: 0xff5a00, transparent: true, opacity: 0.75, depthWrite: false });
const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3d00, transparent: true, opacity: 0.8 });
const pillarGeo = new THREE.CylinderGeometry(2.2, 2.6, 9, 8, 1, true).translate(0, 4.5, 0);
const glowGeo = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
export class Hell extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 25;
    this.killVerb = 'got sent to HELL';
    this.craters = [];
    for (let i = 0; i < 6; i++) this.craters.push(this.newCrater(i * 0.35));
    this.audio.roar(0.4);
  }

  newCrater(delay = 0) {
    const living = [...this.living()];
    let p;
    if (living.length && Math.random() < 0.5) {
      const c = pick(living);
      p = { x: c.pos.x + rand(-3, 3), z: c.pos.z + rand(-3, 3) };
      if (terrainHeight(p.x, p.z) === -Infinity) p = this.island.randomPoint(0, this.R - 3);
    } else p = this.island.randomPoint(0, this.R - 3);
    const y = groundY(p.x, p.z, 2.6);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.scale.setScalar(2.6);
    glow.position.set(p.x, y + 0.1, p.z);
    this.group.add(glow);
    return { x: p.x, z: p.z, y, t: -delay, state: 'warn', glow, warn: warnCircle(this.group, p.x, p.z, 2.6), threat: { type: 'avoid', x: p.x, z: p.z, radius: 2.8 }, hitSet: new Set() };
  }

  update(dt) {
    const e = this.game.env;
    const k = Math.min(1, this.t / 2, this.duration - this.t);
    if (k > 0.3) { e.skyTint = HELL_SKY; e.fogColor = HELL_FOG; e.groundTint = HELL_GROUND; }
    if (this.t < 1.5) return;
    for (let i = 0; i < this.craters.length; i++) {
      const cr = this.craters[i];
      cr.t += dt;
      if (cr.t < 0) continue;
      if (cr.state !== 'rest') this.threats.push(cr.threat);
      if (cr.state === 'warn') {
        cr.glow.scale.setScalar(2.6 * (0.5 + 0.5 * Math.sin(cr.t * 14)));
        if (Math.random() < 0.2) this.particles.emit({ x: cr.x, y: cr.y + 0.2, z: cr.z, color: LAVA, count: 1, speed: 2, up: 3, size: 0.3, life: 0.4, spread: 1.5 });
        if (cr.t > 1.5) {
          cr.state = 'erupt'; cr.t = 0;
          this.group.remove(cr.warn);
          cr.pillar = new THREE.Mesh(pillarGeo, pillarMat);
          cr.pillar.position.set(cr.x, cr.y, cr.z);
          this.group.add(cr.pillar);
          this.audio.noise({ dur: 1.3, vol: 0.3, freq: 700, to: 200, attack: 0.05 });
        }
      } else if (cr.state === 'erupt') {
        cr.pillar.scale.set(1 + Math.sin(this.t * 30) * 0.05, Math.min(1, cr.t * 5), 1 + Math.cos(this.t * 30) * 0.05);
        this.particles.emit({ x: cr.x, y: cr.y + rand(0, 6), z: cr.z, color: LAVA, count: 3, speed: 3, up: 8, size: 0.5, life: 0.6, spread: 1.6, gravity: -2 });
        for (const c of this.living()) {
          if (Math.hypot(c.pos.x - cr.x, c.pos.z - cr.z) < 2.6 && c.pos.y < cr.y + 8) {
            this.hit(c, 45 * dt, cr.hitSet.has(c) ? undefined : { knock: { x: 0, y: 7, z: 0 } });
            cr.hitSet.add(c);
          }
        }
        if (cr.t > 1.4) {
          this.group.remove(cr.pillar);
          this.group.remove(cr.glow);
          cr.state = 'rest'; cr.t = -rand(0.3, 1.2);
        }
      } else if (cr.state === 'rest' && cr.t >= 0 && this.t < this.duration - 3) {
        this.craters[i] = this.newCrater();
      }
    }
  }
}

// ------------------------------------------------------------------ ICE
const icicleGeo = new THREE.ConeGeometry(0.45, 2.2, 5).rotateX(Math.PI);
const icicleMat = new THREE.MeshLambertMaterial({ color: 0xd8f3ff, emissive: 0x335577, flatShading: true });
export class Ice extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 25;
    this.killVerb = 'got skewered by an ICICLE';
    this.drops = new Drops(this);
    this.next = 1.5;
    this.audio.tone({ freq: 1800, to: 900, type: 'triangle', dur: 0.6, vol: 0.12 });
  }

  update(dt) {
    const e = this.game.env;
    const k = Math.min(1, this.t / 1.5, Math.max(0, this.duration - this.t));
    e.friction = Math.min(e.friction, 1 - 0.9 * k);
    if (k > 0.2) { e.groundTint = ICE_GROUND; e.fogColor = ICE_FOG; }
    this.drops.update(dt);
    this.next -= dt;
    if (this.next <= 0 && this.t < this.duration - 2) {
      this.next = rand(0.45, 0.8);
      const living = [...this.living()];
      let p;
      if (living.length && Math.random() < 0.55) {
        const c = pick(living);
        p = { x: c.pos.x + c.vel.x * 0.8 + rand(-2, 2), z: c.pos.z + c.vel.z * 0.8 + rand(-2, 2) };
        if (terrainHeight(p.x, p.z) === -Infinity) return;
      } else p = this.island.randomPoint(0, this.R - 2, { avoidHut: false });
      this.drops.add({
        x: p.x, z: p.z, from: { x: p.x, y: 34, z: p.z }, time: 1.4, radius: 1.6, warn: 'shadow', spin: 0,
        mesh: new THREE.Mesh(icicleGeo, icicleMat),
        onImpact: (x, y, z) => {
          for (const c of this.living()) {
            if (Math.hypot(c.pos.x - x, c.pos.z - z) < 1.6 && c.pos.y < y + 2.3) this.hit(c, 25, { knock: { x: rand(-3, 3), y: 4, z: rand(-3, 3) } });
          }
          this.particles.emit({ x, y: y + 0.4, z, color: [0xffffff, 0xd8f3ff, 0x9fd8ff], count: 14, speed: 6, up: 3, size: 0.3, life: 0.6 });
          this.audio.tone({ freq: 2400, to: 1200, type: 'triangle', dur: 0.15, vol: 0.12 });
        },
      });
    }
  }
}

export default { lava: Lava, quicksand: Quicksand, blackhole: BlackHole, hell: Hell, ice: Ice };
