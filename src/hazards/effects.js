import * as THREE from 'three';
import { Hazard } from './base.js';
import { warnCircle, groundY, stepToward } from './common.js';
import { rand, block, flatMat, makeTextSprite } from '../utils.js';

const DARK_FOG = new THREE.Color(0x0b0b1e);
const DARK_SKY = new THREE.Color(0x1a1a3a);
const SLOW_SKY = new THREE.Color(0xd9c7ff);
const SPACE_SKY = new THREE.Color(0x8a8fd8);
const GAS = [0x8bd450, 0x5aa43a, 0xb5e48c];

/** Shared fade in/out helper (0..1). */
const fade = (h, inT = 1.5, outT = 1.5) => Math.max(0, Math.min(1, h.t / inT, (h.duration - h.t) / outT));

// ------------------------------------------------------------------ WIND
export class Wind extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 20;
    this.killVerb = 'was blown off the island by the WIND';
    this.icon = '💨';
    this.hint = '💨 Gusts! Stay in the middle or hide!';
    this.angle = Math.random() * Math.PI * 2;
    this.gust = 0;
    this.phase = 'calm';
    this.timer = 2;
    this.threat = { type: 'ring', radius: this.R - 8 };
    this.sign = makeTextSprite('💨', { fontSize: 90, height: 2.5, stroke: '#ffffff' });
    this.group.add(this.sign);
    this.audio.whoosh();
  }

  update(dt) {
    this.timer -= dt;
    this.threats.push(this.threat);
    if (this.timer <= 0) {
      if (this.phase === 'calm') { this.phase = 'gust'; this.timer = 3; this.audio.whoosh(); }
      else { this.phase = 'calm'; this.timer = 2.2; this.angle += rand(-1.5, 1.5); }
    }
    const target = this.phase === 'gust' ? 1 : 0;
    this.gust += (target - this.gust) * Math.min(1, dt * 3);
    const dx = Math.cos(this.angle), dz = Math.sin(this.angle);
    const strength = 7.5 * this.gust * fade(this);
    const e = this.game.env;
    e.windX += dx * strength;
    e.windZ += dz * strength;
    this.sign.position.set(-dx * 10, 9, -dz * 10);
    if (Math.random() < this.gust * 0.9) {
      const a = Math.random() * Math.PI * 2, r = rand(0, 20);
      this.particles.emit({ x: Math.cos(a) * r - dx * 8, y: rand(0.5, 5), z: Math.sin(a) * r - dz * 8, color: [0xffffff, 0xd8f3ff, 0x52b356], count: 2, speed: 14, size: 0.18, life: 1, gravity: 0, drag: 0, dir: { x: dx, y: 0, z: dz }, cone: 0.1 });
    }
  }
}

// ------------------------------------------------------------------ LOW GRAVITY
export class LowGravity extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 20;
    this.killVerb = 'floated away into SPACE';
    this.icon = '🌙';
    this.hint = '🌙 Low gravity! Big floaty jumps, careful at the edge!';
    this.audio.tone({ freq: 300, to: 900, type: 'sine', dur: 1.2, vol: 0.15, vibrato: 5 });
  }

  update() {
    const k = fade(this);
    this.game.env.gravityMul = Math.min(this.game.env.gravityMul, 1 - 0.68 * k);
    if (k > 0.3) this.game.env.skyTint = SPACE_SKY;
    if (Math.random() < 0.4) {
      const p = this.island.randomPoint(0, this.R - 2, { avoidHut: false });
      this.particles.emit({ x: p.x, y: groundY(p.x, p.z) + 0.3, z: p.z, color: [0xffffff, 0xfff6b0, 0xb3d9ff], count: 1, speed: 0.3, up: 1.2, size: 0.15, life: 3, gravity: -0.2, drag: 0, shrink: false });
    }
  }
}

// ------------------------------------------------------------------ DARKNESS
export class Darkness extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 20;
    this.killVerb = 'got lost in the DARK';
    this.icon = '🌑';
    this.hint = '🌑 Lights out! Stay calm...';
    this.eyes = [];
    for (let i = 0; i < 8; i++) {
      const s = makeTextSprite('👀', { fontSize: 60, height: 0.6, stroke: '#000000' });
      const p = this.island.randomPoint(4, this.R - 3);
      s.position.set(p.x, groundY(p.x, p.z) + rand(1, 3), p.z);
      this.group.add(s);
      this.eyes.push(s);
    }
  }

  update() {
    const k = fade(this, 2, 2);
    const e = this.game.env;
    e.light = Math.min(e.light, 1 - 0.82 * k);
    e.fogFar = Math.min(e.fogFar, 230 - 205 * k);
    e.fogNear = Math.min(e.fogNear, 70 - 68 * k);
    e.fogColor = DARK_FOG;
    e.skyTint = DARK_SKY;
    for (const s of this.eyes) s.visible = Math.sin(this.t * 2 + s.position.x) > -0.3;
  }
}

// ------------------------------------------------------------------ MAGNET
export class Magnet extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 16;
    this.killVerb = 'got zapped by a giant MAGNET';
    this.icon = '🧲';
    this.hint = '🧲 It pulls you in! Walk away from it!';
    const p = this.island.randomPoint(0, 15);
    this.x = p.x; this.z = p.z; this.y = groundY(p.x, p.z);
    const g = new THREE.Group();
    const red = flatMat(0xd62828), silver = flatMat(0xdddddd);
    g.add(block(0.9, 3, 0.9, red, -1.1, 1.5, 0));
    g.add(block(0.9, 3, 0.9, red, 1.1, 1.5, 0));
    g.add(block(3.1, 0.9, 0.9, red, 0, 3.45, 0));
    g.add(block(0.92, 0.6, 0.92, silver, -1.1, 0.3, 0));
    g.add(block(0.92, 0.6, 0.92, silver, 1.1, 0.3, 0));
    g.position.set(p.x, this.y + 25, p.z);
    this.mag = g;
    this.group.add(g);
    this.warn = warnCircle(this.group, p.x, p.z, 2.6);
    this.threat = { type: 'avoid', x: p.x, z: p.z, radius: 8 };
    this.audio.whoosh();
  }

  update(dt) {
    this.threats.push(this.threat);
    const drop = Math.min(1, this.t / 1.5);
    this.mag.position.y = this.y + 25 * (1 - drop * drop);
    this.mag.rotation.y += dt * 0.6;
    if (drop < 1) return;
    if (this.warn) { this.group.remove(this.warn); this.warn = null; this.game.explode(this.x, this.y, this.z, 2.6, 30, this, { knock: 10 }); }
    const k = fade(this, 1.5, 1);
    for (const c of this.living()) {
      const dx = this.x - c.pos.x, dz = this.z - c.pos.z, d = Math.hypot(dx, dz);
      if (d > 20) continue;
      const pull = Math.min(4.6, 22 / (d + 2)) * k;
      c.pos.x += (dx / (d || 1)) * pull * dt;
      c.pos.z += (dz / (d || 1)) * pull * dt;
      if (d < 2.6) this.hit(c, 30 * dt);
    }
    if (Math.random() < 0.5) this.particles.emit({ x: this.x + rand(-1.5, 1.5), y: this.y + rand(0, 3), z: this.z + rand(-1.5, 1.5), color: [0x7fd4ff, 0xffffff], count: 1, speed: 3, size: 0.18, life: 0.3, gravity: 0 });
  }
}

// ------------------------------------------------------------------ POISON GAS
export class PoisonGas extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 22;
    this.killVerb = 'choked on POISON GAS';
    this.icon = '☠️';
    this.hint = '☠️ Stay out of the green clouds!';
    this.clouds = [];
    for (let i = 0; i < 4; i++) {
      const p = this.island.randomPoint(3, this.R - 6);
      this.clouds.push({ x: p.x, z: p.z, r: rand(3, 4.2), target: this.island.randomPoint(0, this.R - 6), warn: warnCircle(this.group, p.x, p.z, 3.5, { color: 'yellow' }), threat: { type: 'avoid', x: p.x, z: p.z, radius: 4.2 } });
    }
    this.audio.noise({ dur: 2, vol: 0.2, filter: 'bandpass', freq: 600, q: 0.6, attack: 0.5 });
  }

  update(dt) {
    const live = this.t > 2;
    for (const c of this.clouds) {
      if (live && c.warn) { this.group.remove(c.warn); c.warn = null; }
      if (live) {
        if (Math.hypot(c.target.x - c.x, c.target.z - c.z) < 1) c.target = this.island.randomPoint(0, this.R - 6);
        stepToward(c, c.target.x, c.target.z, 1.6, dt);
      }
      c.threat.x = c.x; c.threat.z = c.z;
      this.threats.push(c.threat);
      const gy = groundY(c.x, c.z);
      if (Math.random() < 0.8) {
        const a = Math.random() * 6.28, r = Math.random() * c.r;
        this.particles.emit({ local: false, x: c.x + Math.cos(a) * r, y: gy + rand(0.3, 2.5), z: c.z + Math.sin(a) * r, color: GAS, count: 1, speed: 0.4, up: 0.3, size: live ? 1.1 : 0.5, life: 1.4, gravity: 0, drag: 0.5 });
      }
      if (!live) continue;
      for (const ch of this.living()) {
        if (Math.hypot(ch.pos.x - c.x, ch.pos.z - c.z) < c.r && ch.pos.y < gy + 3) this.hit(ch, 13 * dt);
      }
    }
  }
}

// ------------------------------------------------------------------ DISCO
export class Disco extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 20;
    this.killVerb = 'danced right off the island';
    this.icon = '🪩';
    this.hint = '🪩 Dance party! Everyone gets bumped on the beat!';
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1), new THREE.MeshLambertMaterial({ color: 0xdddddd, emissive: 0x333333, flatShading: true }));
    this.track(ball.geometry); this.track(ball.material);
    ball.position.set(0, 12, 0);
    this.ball = ball;
    this.group.add(ball);
    this.beat = 0;
    this.colors = [0xff3b4f, 0x3fa9ff, 0x3ddc84, 0xffd23f, 0xc77dff].map((c) => new THREE.Color(c));
  }

  update(dt) {
    this.ball.rotation.y += dt * 2;
    this.beat -= dt;
    const k = fade(this, 1, 1);
    if (k > 0.3) this.game.env.skyTint = this.colors[Math.floor(this.t * 2) % this.colors.length];
    if (this.beat <= 0 && this.t > 1.5 && this.t < this.duration - 1) {
      this.beat = 0.55;
      const f = [262, 330, 392, 523][Math.floor(this.t * 1.8) % 4];
      this.audio.tone({ freq: 60, to: 40, type: 'sine', dur: 0.2, vol: 0.4 });
      this.audio.tone({ freq: f, type: 'square', dur: 0.12, vol: 0.06 });
      for (const c of this.living()) {
        if (!c.onGround || Math.random() > 0.35) continue;
        const a = Math.random() * Math.PI * 2;
        c.knock(Math.cos(a) * 4.5, 5, Math.sin(a) * 4.5);
      }
      for (let i = 0; i < 6; i++) {
        const p = this.island.randomPoint(0, this.R - 3, { avoidHut: false });
        this.particles.emit({ x: p.x, y: groundY(p.x, p.z) + 0.2, z: p.z, color: [0xff3b4f, 0x3fa9ff, 0x3ddc84, 0xffd23f, 0xc77dff], count: 3, speed: 3, up: 5, size: 0.3, life: 0.7 });
      }
    }
  }
}

// ------------------------------------------------------------------ SLOW MOTION
export class SlowMo extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 16;
    this.killVerb = 'got stuck in SLOW MOTION';
    this.icon = '🐌';
    this.hint = '🐌 Everything is slooow...';
    this.clock = makeTextSprite('⏰', { fontSize: 100, height: 4, stroke: '#ffffff' });
    this.clock.position.set(0, 16, 0);
    this.group.add(this.clock);
    this.audio.tone({ freq: 400, to: 100, type: 'sawtooth', dur: 1.5, vol: 0.1 });
  }

  update() {
    const k = fade(this);
    this.game.env.speedMul *= 1 - 0.5 * k;
    if (k > 0.3) this.game.env.skyTint = SLOW_SKY;
    this.clock.position.y = 16 + Math.sin(this.t * 2) * 0.5;
  }
}

// ------------------------------------------------------------------ UFO
export class Ufo extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 24;
    this.killVerb = 'got abducted by a UFO';
    this.icon = '🛸';
    this.hint = '🛸 Run out of the beam!';
    const g = new THREE.Group();
    g.add(block(4.2, 0.5, 4.2, 0x9aa0a8, 0, 0, 0));
    g.add(block(3, 0.35, 3, 0x6d6a75, 0, -0.4, 0));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.8 }));
    this.track(dome.geometry); this.track(dome.material);
    dome.position.y = 0.25;
    g.add(dome);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.add(block(0.3, 0.2, 0.3, i % 2 ? 0x3ddc84 : 0xffd23f, Math.cos(a) * 1.9, -0.1, Math.sin(a) * 1.9, false)); }
    this.ufo = g;
    this.group.add(g);
    this.beamMat = this.track(new THREE.MeshBasicMaterial({ color: 0xb6ff7a, transparent: true, opacity: 0, depthWrite: false }));
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.6, 13, 12, 1, true), this.beamMat);
    this.track(this.beam.geometry);
    this.group.add(this.beam);
    this.x = 0; this.z = -this.R - 10;
    this.state = 'hunt';
    this.timer = 2;
    this.lift = new Map();
    this.audio.tone({ freq: 700, to: 300, type: 'sine', dur: 1.6, vol: 0.12, vibrato: 12 });
  }

  update(dt) {
    this.timer -= dt;
    const y = 14 + Math.sin(this.t * 2) * 0.5;
    this.ufo.rotation.y += dt * 2;
    if (this.state === 'hunt') {
      const c = this.game.nearestCharacter(this.x, this.z);
      if (c) stepToward(this, c.pos.x, c.pos.z, 6, dt, this.R + 20);
      if (this.timer <= 0 && c && Math.hypot(c.pos.x - this.x, c.pos.z - this.z) < 3) {
        this.state = 'aim';
        this.timer = 1.4;
        this.spot = { x: this.x, z: this.z };
        this.warn = warnCircle(this.group, this.x, this.z, 2.6, { color: 'yellow' });
        this.spotThreat = { type: 'avoid', x: this.x, z: this.z, radius: 2.8 };
        this.audio.warn();
      }
      this.beamMat.opacity = 0;
    } else if (this.state === 'aim' || this.state === 'beam') {
      this.threats.push(this.spotThreat);
      const gy = groundY(this.spot.x, this.spot.z);
      if (this.state === 'aim') {
        this.beamMat.opacity = 0.12 + Math.sin(this.t * 20) * 0.05;
        if (this.timer <= 0) { this.state = 'beam'; this.timer = 2.6; this.group.remove(this.warn); this.audio.tone({ freq: 200, to: 900, type: 'sawtooth', dur: 2.4, vol: 0.08, vibrato: 8 }); }
      } else {
        this.beamMat.opacity = 0.45;
        for (const c of this.living()) {
          if (Math.hypot(c.pos.x - this.spot.x, c.pos.z - this.spot.z) > 2.6) { this.lift.delete(c); continue; }
          const held = (this.lift.get(c) || 0) + dt;
          this.lift.set(c, held);
          c.vel.y = Math.max(c.vel.y, 5);
          c.onGround = false;
          c.lastHit = { source: this, time: this.game.time };
          if (held > 2.2 || c.pos.y > gy + 10) { this.lift.delete(c); this.game.killCharacter(c, this.killVerb, this); }
        }
        if (this.timer <= 0) { this.state = 'hunt'; this.timer = 2.5; this.lift.clear(); }
      }
      this.beam.position.set(this.spot.x, (y + gy) / 2, this.spot.z);
      this.beam.scale.y = (y - gy) / 13;
    }
    this.ufo.position.set(this.x, y, this.z);
  }
}


// ------------------------------------------------------------------ BLESSING ("god", "angel", "invincible"...)
/**
 * Only helps the Writer: full health, a big shield and a few seconds of invincibility.
 */
export class Blessing extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 12;
    this.recurring = false;
    this.icon = '😇';
    this.hint = `😇 Only ${opts.owner ? opts.owner.name : 'the Writer'} is blessed!`;
    this.killVerb = 'was outshone by a BLESSING';
    const w = opts.owner;
    this.target = w && w.alive ? w : null;
    if (this.target) {
      w.hp = 100;
      w.shield = Math.max(w.shield, 100);
      w.invincible = 10;
      game.notify(w, '😇 BLESSED! Invincible for 10 seconds!', 'powerup');
    }
    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 6, 18), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    this.halo.rotation.x = Math.PI / 2;
    this.track(this.halo.geometry); this.track(this.halo.material);
    this.glow = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.06, 20), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.45, depthWrite: false }));
    this.track(this.glow.geometry); this.track(this.glow.material);
    this.group.add(this.halo, this.glow);
    this.audio.tone({ freq: 523, type: 'triangle', dur: 0.5, vol: 0.15 });
    this.audio.tone({ freq: 784, type: 'triangle', dur: 0.8, vol: 0.15, delay: 0.15 });
  }

  update() {
    const w = this.target;
    const on = w && w.alive && (w.invincible || 0) > 0;
    this.halo.visible = this.glow.visible = !!on;
    if (!on) { if (this.t > 1) this.done = true; return; }
    this.halo.position.set(w.pos.x, w.pos.y + 2.75, w.pos.z);
    this.glow.position.set(w.pos.x, w.pos.y + 0.05, w.pos.z);
    this.glow.scale.setScalar(1 + Math.sin(this.t * 6) * 0.1);
    if (Math.random() < 0.5) this.particles.emit({ x: w.pos.x, y: w.pos.y + 1.2, z: w.pos.z, color: [0xffe066, 0xffffff], count: 1, speed: 1.5, up: 2, size: 0.18, life: 0.7, gravity: -1, spread: 0.6 });
  }
}

export default { wind: Wind, lowgravity: LowGravity, darkness: Darkness, magnet: Magnet, gas: PoisonGas, disco: Disco, slowmo: SlowMo, ufo: Ufo, blessing: Blessing };
