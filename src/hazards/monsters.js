import * as THREE from 'three';
import { Hazard } from './base.js';
import { warnCircle, warnStrip, groundY, stepToward, collideObject, shadowCircle } from './common.js';
import { rand, pick, block, boxGeo, flatMat, angleLerp } from '../utils.js';
import { makeHumanoid, animateHumanoid } from '../models.js';
import { terrainHeight } from '../island.js';

const FIRE = [0xff3d00, 0xff6a00, 0xffa31a, 0xffe066];

/** Spawn point far from everyone. */
function farPoint(h, minDist = 8, minR = 6, maxR) {
  let best = null, bestD = -1;
  for (let i = 0; i < 12; i++) {
    const p = h.island.randomPoint(minR, maxR ?? h.R - 4);
    const c = h.game.nearestCharacter(p.x, p.z);
    const d = c ? Math.hypot(c.pos.x - p.x, c.pos.z - p.z) : 99;
    if (d > bestD) { best = p; bestD = d; }
    if (d >= minDist) break;
  }
  return best;
}

// ------------------------------------------------------------------ ZOMBIE
export class Zombie extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 40;
    this.killVerb = 'got munched by a ZOMBIE';
    this.zombies = [];
    for (let i = 0; i < 4; i++) {
      const p = farPoint(this, 9);
      const m = makeHumanoid({ skin: 0x7bc46a, shirt: pick([0x5b6b7a, 0x7a5b5b, 0x4d6b4d]), pants: 0x3b3355, eyes: 0xff2020 });
      this.group.add(m.group);
      this.zombies.push({ x: p.x, z: p.z, y: groundY(p.x, p.z), m, rise: 0, phase: rand(0, 6), state: 'chase', timer: 0, yaw: 0,
        warn: warnCircle(this.group, p.x, p.z, 1.4), threat: { type: 'avoid', x: p.x, z: p.z, radius: 2.2 } });
    }
    this.audio.roar(0.7);
  }

  update(dt) {
    for (const zb of this.zombies) {
      zb.y = groundY(zb.x, zb.z);
      this.threats.push(zb.threat);
      if (zb.rise < 1) {
        zb.rise = Math.min(1, this.t / 2.2);
        zb.m.group.position.set(zb.x, zb.y - 2.4 * (1 - zb.rise), zb.z);
        if (Math.random() < 0.4) this.particles.emit({ x: zb.x, y: zb.y + 0.2, z: zb.z, color: [0x6d4c32, 0x8a5a35], count: 1, speed: 3, up: 3, size: 0.3, life: 0.5 });
        if (zb.rise >= 1) this.group.remove(zb.warn);
        continue;
      }
      const target = this.game.nearestCharacter(zb.x, zb.z);
      zb.timer -= dt;
      let moving = false;
      if (target) {
        const d = Math.hypot(target.pos.x - zb.x, target.pos.z - zb.z);
        zb.yaw = angleLerp(zb.yaw, Math.atan2(target.pos.x - zb.x, target.pos.z - zb.z), 1 - Math.exp(-6 * dt));
        if (zb.state === 'chase') {
          if (d > 1.1) { stepToward(zb, target.pos.x, target.pos.z, 3.3, dt); moving = true; }
          if (d < 1.5 && zb.timer <= 0) { zb.state = 'windup'; zb.timer = 0.5; }
        } else if (zb.state === 'windup') {
          zb.m.parts.armL.rotation.x = zb.m.parts.armR.rotation.x = -2.6;
          if (zb.timer <= 0) {
            if (d < 2 && Math.abs(target.pos.y - zb.y) < 2) {
              const nx = (target.pos.x - zb.x) / (d || 1), nz = (target.pos.z - zb.z) / (d || 1);
              this.hit(target, 20, { knock: { x: nx * 7, y: 4, z: nz * 7 } });
              this.audio.hurt();
            }
            zb.state = 'chase';
            zb.timer = 1.1;
          }
        }
      }
      collideObject(this.island, zb, 0.45, zb.y + 0.5);
      zb.phase += dt * (moving ? 6 : 1);
      if (zb.state !== 'windup') animateHumanoid(zb.m.parts, zb.phase, moving ? 0.5 : 0.05, { zombie: true });
      zb.m.group.position.set(zb.x, groundY(zb.x, zb.z), zb.z);
      zb.m.group.rotation.set(0, zb.yaw, Math.sin(zb.phase * 0.5) * 0.08);
      zb.threat.x = zb.x; zb.threat.z = zb.z;
      if (Math.random() < dt * 0.15) this.audio.roar(0.6);
    }
  }
}

// ------------------------------------------------------------------ DRAGON
export class Dragon extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 30;
    this.killVerb = 'got roasted by a DRAGON';
    const red = flatMat(0xc0392b), dark = flatMat(0x7b1e1e), belly = flatMat(0xf4c542);
    const d = new THREE.Group();
    d.add(block(2.4, 1.6, 5, red, 0, 0, 0));
    d.add(block(1.8, 0.4, 4, belly, 0, -0.75, 0));
    d.add(block(1, 1, 2.4, red, 0, 0.6, 3.2));
    const head = new THREE.Group();
    head.position.set(0, 0.9, 4.6);
    head.add(block(1.5, 1.1, 1.8, red, 0, 0, 0));
    head.add(block(1.2, 0.4, 1.2, dark, 0, -0.5, 0.8));
    head.add(block(0.25, 0.6, 0.25, belly, -0.45, 0.8, -0.4));
    head.add(block(0.25, 0.6, 0.25, belly, 0.45, 0.8, -0.4));
    head.add(block(0.2, 0.2, 0.1, flatMat(0xffe066), -0.4, 0.2, 0.9));
    head.add(block(0.2, 0.2, 0.1, flatMat(0xffe066), 0.4, 0.2, 0.9));
    d.add(head);
    this.head = head;
    for (let i = 0; i < 4; i++) d.add(block(1.4 - i * 0.3, 1 - i * 0.2, 1.6, red, 0, -0.1 + i * 0.15, -3.2 - i * 1.5));
    const wing = (s) => {
      const piv = new THREE.Group();
      piv.position.set(1.1 * s, 0.6, 0.5);
      const w = block(5, 0.2, 3.2, dark, 2.5 * s, 0, 0);
      piv.add(w);
      d.add(piv);
      return piv;
    };
    this.wingL = wing(-1);
    this.wingR = wing(1);
    this.dragon = d;
    this.group.add(d);
    this.angle = Math.random() * Math.PI * 2;
    this.next = 2.5;
    this.attack = null;
    this.audio.roar(1.2);
  }

  update(dt) {
    const enter = Math.min(1, this.t / 2.5);
    this.angle += dt * 0.32;
    const r = 22 + (1 - enter) * 40;
    const x = Math.cos(this.angle) * r, z = Math.sin(this.angle) * r;
    const y = 15 + Math.sin(this.t * 0.8) * 1.5;
    this.dragon.position.set(x, y, z);
    this.dragon.rotation.y = Math.atan2(-Math.sin(this.angle), Math.cos(this.angle));
    const flap = Math.sin(this.t * 6) * 0.6;
    this.wingL.rotation.z = flap;
    this.wingR.rotation.z = -flap;

    this.next -= dt;
    if (!this.attack && this.next <= 0 && this.t < this.duration - 3) {
      const target = pick([...this.living()]);
      if (target) {
        const p = { x: target.pos.x + target.vel.x * 0.4, z: target.pos.z + target.vel.z * 0.4 };
        if (terrainHeight(p.x, p.z) > -Infinity) {
          this.attack = { ...p, t: 0, warn: warnCircle(this.group, p.x, p.z, 3.6), threat: { type: 'avoid', x: p.x, z: p.z, radius: 3.6 } };
          this.audio.roar(1.3);
        }
      }
      this.next = rand(2.8, 3.8);
    }
    const a = this.attack;
    if (a) {
      a.t += dt;
      this.threats.push(a.threat);
      const gy = groundY(a.x, a.z);
      const hp = new THREE.Vector3();
      this.head.getWorldPosition(hp);
      if (a.t > 1.3 && a.t < 2.6) {
        const dir = { x: a.x - hp.x, y: gy + 0.5 - hp.y, z: a.z - hp.z };
        const l = Math.hypot(dir.x, dir.y, dir.z);
        this.particles.emit({ x: hp.x, y: hp.y, z: hp.z, color: FIRE, count: 6, speed: l * 1.7, size: 0.8, life: 0.65, gravity: 0, drag: 0, dir: { x: dir.x / l, y: dir.y / l, z: dir.z / l }, cone: 0.12 });
        this.particles.emit({ x: a.x, y: gy + 0.5, z: a.z, color: FIRE, count: 3, speed: 4, up: 3, size: 0.6, life: 0.5, spread: 2 });
        for (const c of this.living()) {
          if (Math.hypot(c.pos.x - a.x, c.pos.z - a.z) < 3.6 && c.pos.y < gy + 4 && !this.island.isSheltered(c.pos)) this.hit(c, 38 * dt);
        }
        if (!a.roared) { a.roared = true; this.audio.noise({ dur: 1.3, vol: 0.35, filter: 'lowpass', freq: 900, to: 300, attack: 0.05 }); }
      }
      if (a.t > 2.6) { this.group.remove(a.warn); this.attack = null; }
    }
  }
}

// ------------------------------------------------------------------ GIANT
export class Giant extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 30;
    this.killVerb = 'got stomped by a GIANT';
    const p = farPoint(this, 8, 4, 18);
    this.x = p.x; this.z = p.z;
    this.scale = 4.2;
    this.m = makeHumanoid({ skin: 0xb5835a, shirt: 0x6b4226, pants: 0x3f3f3f, scale: this.scale, hat: 0x555555 });
    this.m.group.visible = false;
    this.group.add(this.m.group);
    this.state = 'falling';
    this.timer = 2.2;
    this.yaw = 0;
    this.phase = 0;
    this.landWarn = warnCircle(this.group, p.x, p.z, 4.5);
    this.landThreat = { type: 'avoid', x: p.x, z: p.z, radius: 4.5 };
    this.bodyThreat = { type: 'avoid', x: p.x, z: p.z, radius: 3 };
    this.audio.whoosh();
  }

  update(dt) {
    this.timer -= dt;
    const gy = groundY(this.x, this.z);
    if (this.state === 'falling') {
      this.threats.push(this.landThreat);
      if (this.timer < 1) {
        this.m.group.visible = true;
        this.m.group.position.set(this.x, gy + this.timer * 40, this.z);
      }
      if (this.timer <= 0) {
        this.group.remove(this.landWarn);
        this.m.group.position.set(this.x, gy, this.z);
        this.game.explode(this.x, gy, this.z, 4.5, 40, this, { knock: 14, colors: [0x8a5a35, 0x6d4c32, 0x999999] });
        this.state = 'walk';
        this.timer = 1.5;
        this.audio.roar(0.5);
      }
      return;
    }
    this.bodyThreat.x = this.x; this.bodyThreat.z = this.z;
    this.threats.push(this.bodyThreat);
    const target = this.game.nearestCharacter(this.x, this.z);
    if (this.state === 'walk') {
      if (target) {
        const d = stepToward(this, target.pos.x, target.pos.z, 2.4, dt, this.R - 3);
        this.yaw = angleLerp(this.yaw, Math.atan2(target.pos.x - this.x, target.pos.z - this.z), 1 - Math.exp(-3 * dt));
        this.phase += dt * 3;
        animateHumanoid(this.m.parts, this.phase, 0.4);
        if (d < 11 && this.timer <= 0) {
          let sx = target.pos.x + target.vel.x * 0.5, sz = target.pos.z + target.vel.z * 0.5;
          const dx = sx - this.x, dz = sz - this.z, dd = Math.hypot(dx, dz);
          if (dd > 6) { sx = this.x + (dx / dd) * 6; sz = this.z + (dz / dd) * 6; }
          this.stomp = { x: sx, z: sz, warn: warnCircle(this.group, sx, sz, 4), threat: { type: 'avoid', x: sx, z: sz, radius: 4 } };
          this.state = 'windup';
          this.timer = 1.15;
        }
      }
    } else if (this.state === 'windup') {
      this.threats.push(this.stomp.threat);
      this.m.parts.legR.rotation.x = -1.3 * (1 - this.timer / 1.15);
      this.m.parts.armL.rotation.x = this.m.parts.armR.rotation.x = -0.8;
      if (this.timer <= 0) {
        const s = this.stomp;
        this.group.remove(s.warn);
        const sy = groundY(s.x, s.z);
        for (const c of this.living()) {
          const d = Math.hypot(c.pos.x - s.x, c.pos.z - s.z);
          if (d < 4 && c.pos.y < sy + 2) this.hit(c, 45, { knock: { x: ((c.pos.x - s.x) / (d || 1)) * 14, y: 9, z: ((c.pos.z - s.z) / (d || 1)) * 14 } });
        }
        this.particles.emit({ x: s.x, y: sy + 0.3, z: s.z, color: [0x8a5a35, 0x9a9aa6, 0x52b356], count: 30, speed: 10, up: 4, size: 0.5, life: 0.8, spread: 1.5 });
        this.audio.explosion(1.1);
        this.game.addShake(1, s.x, s.z);
        this.m.parts.legR.rotation.x = 0;
        this.state = 'walk';
        this.timer = rand(1.4, 2.2);
      }
    }
    // body blocks people
    for (const c of this.living()) {
      const dx = c.pos.x - this.x, dz = c.pos.z - this.z, d = Math.hypot(dx, dz);
      if (d < 1.9 && c.pos.y < gy + 9) { c.pos.x = this.x + (dx / (d || 1)) * 1.9; c.pos.z = this.z + (dz / (d || 1)) * 1.9; }
    }
    this.m.group.position.set(this.x, groundY(this.x, this.z), this.z);
    this.m.group.rotation.y = this.yaw;
  }
}

// ------------------------------------------------------------------ GHOST
export class Ghost extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 26;
    this.killVerb = 'was spooked to death by a GHOST';
    this.mat = this.track(new THREE.MeshLambertMaterial({ color: 0xf4f7ff, transparent: true, opacity: 0, emissive: 0x334466, flatShading: true }));
    this.ghosts = [];
    for (let i = 0; i < 2; i++) {
      const p = farPoint(this, 10);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(boxGeo(1.3, 1.5, 1.1), this.mat));
      for (let k = 0; k < 3; k++) {
        const t = new THREE.Mesh(boxGeo(0.4, 0.5, 0.9), this.mat);
        t.position.set(-0.45 + k * 0.45, -0.95, 0);
        g.add(t);
      }
      const eye = flatMat(0x111122);
      g.add(block(0.22, 0.32, 0.05, eye, -0.28, 0.25, 0.56, false));
      g.add(block(0.22, 0.32, 0.05, eye, 0.28, 0.25, 0.56, false));
      g.add(block(0.4, 0.25, 0.05, eye, 0, -0.2, 0.56, false));
      this.group.add(g);
      this.ghosts.push({ x: p.x, z: p.z, g, target: null, retarget: 0, threat: { type: 'avoid', x: p.x, z: p.z, radius: 2.8 } });
    }
    this.audio.tone({ freq: 300, to: 600, type: 'sine', dur: 1.5, vol: 0.15, vibrato: 6, attack: 0.3 });
  }

  update(dt) {
    const fade = Math.min(1, this.t / 2, Math.max(0, this.duration - this.t));
    this.mat.opacity = fade * (0.65 + Math.sin(this.t * 7) * 0.15);
    for (const gh of this.ghosts) {
      gh.retarget -= dt;
      if (!gh.target || !gh.target.alive || gh.retarget <= 0) {
        gh.target = pick([...this.living()]);
        gh.retarget = 7;
      }
      const t = gh.target;
      const baseY = groundY(gh.x, gh.z);
      const y = (t ? Math.max(baseY, t.pos.y) : baseY) + 1.4 + Math.sin(this.t * 2) * 0.3;
      if (this.t > 2 && t) {
        stepToward(gh, t.pos.x, t.pos.z, 4.3, dt, this.R);
        for (const c of this.living()) {
          if (Math.hypot(c.pos.x - gh.x, c.pos.z - gh.z) < 1.3 && Math.abs(c.pos.y + 1.2 - y) < 2.2) {
            this.hit(c, 26 * dt);
            if (Math.random() < 0.3) this.particles.emit({ x: c.pos.x, y: c.pos.y + 1.5, z: c.pos.z, color: [0xb388ff, 0xffffff], count: 1, speed: 2, up: 3, size: 0.25, life: 0.6, gravity: -2 });
          }
        }
        gh.g.rotation.y = Math.atan2(t.pos.x - gh.x, t.pos.z - gh.z);
      }
      gh.g.position.set(gh.x, y, gh.z);
      gh.threat.x = gh.x; gh.threat.z = gh.z;
      if (this.t > 1) this.threats.push(gh.threat);
    }
  }
}

// ------------------------------------------------------------------ DINOSAUR
export class Dinosaur extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 32;
    this.killVerb = 'got chomped by a DINOSAUR';
    const green = flatMat(0x4f8a3c), light = flatMat(0x9ccc65), white = flatMat(0xffffff);
    const d = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = 2.4;
    body.add(block(1.8, 1.8, 3, green, 0, 0, 0));
    body.add(block(1.3, 0.5, 2.4, light, 0, -0.8, 0.1));
    const neck = block(1.2, 1.4, 1, green, 0, 0.9, 1.6);
    body.add(neck);
    const head = new THREE.Group();
    head.position.set(0, 1.6, 2.6);
    head.add(block(1.4, 1.1, 2, green, 0, 0, 0));
    const jaw = block(1.2, 0.35, 1.7, light, 0, -0.75, 0.1);
    head.add(jaw);
    for (let i = 0; i < 4; i++) head.add(block(0.15, 0.25, 0.15, white, -0.45 + i * 0.3, -0.5, 0.85, false));
    head.add(block(0.2, 0.2, 0.1, flatMat(0xffd23f), -0.5, 0.25, 0.6));
    head.add(block(0.2, 0.2, 0.1, flatMat(0xffd23f), 0.5, 0.25, 0.6));
    body.add(head);
    body.add(block(0.25, 0.7, 0.25, green, -0.7, -0.3, 1.5));
    body.add(block(0.25, 0.7, 0.25, green, 0.7, -0.3, 1.5));
    for (let i = 0; i < 3; i++) body.add(block(1.2 - i * 0.35, 1.1 - i * 0.3, 1.5, green, 0, 0.1 - i * 0.2, -2.1 - i * 1.3));
    d.add(body);
    const leg = (s) => {
      const piv = new THREE.Group();
      piv.position.set(0.7 * s, 1.8, 0);
      piv.add(block(0.7, 1.8, 0.8, green, 0, -0.9, 0));
      d.add(piv);
      return piv;
    };
    this.legL = leg(-1); this.legR = leg(1);
    this.head = head; this.jaw = jaw;
    this.mesh = d;
    this.group.add(d);
    const a = Math.random() * Math.PI * 2;
    this.x = Math.cos(a) * (this.R - 4); this.z = Math.sin(a) * (this.R - 4);
    this.yaw = Math.atan2(-this.x, -this.z);
    this.state = 'enter';
    this.timer = 2;
    this.phase = 0;
    this.threat = { type: 'avoid', x: this.x, z: this.z, radius: 3 };
    this.enterWarn = warnCircle(this.group, this.x, this.z, 2.5);
    this.mesh.visible = false;
    this.audio.rumble(2);
  }

  update(dt) {
    this.timer -= dt;
    this.threat.x = this.x; this.threat.z = this.z;
    this.threats.push(this.threat);
    if (this.state === 'enter') {
      this.game.addShake(0.08);
      if (this.timer <= 0) {
        this.group.remove(this.enterWarn);
        this.mesh.visible = true;
        this.state = 'stalk';
        this.timer = 1;
        this.audio.roar(0.8);
      }
      return;
    }
    const target = this.game.nearestCharacter(this.x, this.z);
    let speed = 0;
    if (this.state === 'stalk' && target) {
      const d = stepToward(this, target.pos.x, target.pos.z, 4.2, dt, this.R - 2);
      speed = 4.2;
      this.yaw = angleLerp(this.yaw, Math.atan2(target.pos.x - this.x, target.pos.z - this.z), 1 - Math.exp(-5 * dt));
      collideObject(this.island, this, 1, groundY(this.x, this.z) + 0.5);
      if (d < 11 && this.timer <= 0) {
        const dx = target.pos.x - this.x, dz = target.pos.z - this.z, dd = Math.hypot(dx, dz) || 1;
        this.dir = { x: dx / dd, z: dz / dd };
        this.yaw = Math.atan2(this.dir.x, this.dir.z);
        this.chargeLen = Math.min(dd + 5, 16);
        const ex = this.x + this.dir.x * this.chargeLen, ez = this.z + this.dir.z * this.chargeLen;
        this.strip = warnStrip(this.group, this.x, this.z, ex, ez, 2.8);
        this.lineThreats = [];
        for (let i = 1; i <= 4; i++) {
          const k = i / 4;
          this.lineThreats.push({ type: 'avoid', x: this.x + (ex - this.x) * k, z: this.z + (ez - this.z) * k, radius: 2 });
        }
        this.state = 'roar';
        this.timer = 1.0;
        this.audio.roar(0.9);
      }
    } else if (this.state === 'roar') {
      for (const t of this.lineThreats) this.threats.push(t);
      this.head.rotation.x = -0.5;
      this.jaw.position.y = -0.95;
      if (this.timer <= 0) { this.state = 'charge'; this.travel = 0; this.hitSet = new Set(); this.head.rotation.x = 0; this.jaw.position.y = -0.75; }
    } else if (this.state === 'charge') {
      for (const t of this.lineThreats) this.threats.push(t);
      const step = 16 * dt;
      this.x += this.dir.x * step; this.z += this.dir.z * step;
      this.travel += step;
      speed = 16;
      const bumped = collideObject(this.island, this, 1, groundY(this.x, this.z) + 0.5);
      for (const c of this.living()) {
        if (this.hitSet.has(c)) continue;
        if (Math.hypot(c.pos.x - this.x, c.pos.z - this.z) < 2 && c.pos.y < groundY(this.x, this.z) + 3) {
          this.hitSet.add(c);
          this.hit(c, 45, { knock: { x: this.dir.x * 15, y: 7, z: this.dir.z * 15 } });
          this.audio.explosion(0.4);
        }
      }
      const r = Math.hypot(this.x, this.z);
      if (this.travel >= this.chargeLen || bumped || r > this.R - 2) {
        if (r > this.R - 2) { this.x *= (this.R - 2) / r; this.z *= (this.R - 2) / r; }
        this.group.remove(this.strip);
        this.state = 'rest';
        this.timer = bumped ? 2 : 1.3;
        if (bumped) this.game.addShake(0.4, this.x, this.z);
      }
    } else if (this.state === 'rest' && this.timer <= 0) {
      this.state = 'stalk';
      this.timer = 1.5;
    }
    this.phase += dt * speed * 0.9;
    this.legL.rotation.x = Math.sin(this.phase) * 0.6 * Math.min(1, speed / 4);
    this.legR.rotation.x = -this.legL.rotation.x;
    this.mesh.position.set(this.x, groundY(this.x, this.z), this.z);
    this.mesh.rotation.y = this.yaw;
    if (speed > 0 && Math.sin(this.phase) > 0.95) this.game.addShake(0.12, this.x, this.z);
  }
}

// ------------------------------------------------------------------ BEES
export class Bees extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 22;
    this.killVerb = 'got stung to bits by BEES';
    const tree = pick(this.island.trees);
    this.hive = new THREE.Group();
    const hy = tree.y + 3.2;
    this.hive.add(block(1, 0.4, 1, 0xf4c542, 0, 0.5, 0));
    this.hive.add(block(1.3, 0.5, 1.3, 0xe0a82e, 0, 0, 0));
    this.hive.add(block(1, 0.4, 1, 0xf4c542, 0, -0.45, 0));
    this.hive.position.set(tree.x + 1.2, hy, tree.z);
    this.group.add(this.hive);
    this.swarms = [];
    const yellow = flatMat(0xffd23f), black = flatMat(0x1b1530);
    for (let s = 0; s < 3; s++) {
      const sw = { x: this.hive.position.x, z: this.hive.position.z, y: hy, bees: [], target: null, retarget: 0, threat: { type: 'avoid', x: 0, z: 0, radius: 3 } };
      for (let i = 0; i < 8; i++) {
        const b = new THREE.Group();
        b.add(new THREE.Mesh(boxGeo(0.3, 0.22, 0.4), yellow));
        const stripe = new THREE.Mesh(boxGeo(0.32, 0.24, 0.1), black);
        b.add(stripe);
        b.userData.o = { a: rand(0, 6.28), r: rand(0.3, 1.1), s: rand(4, 9), h: rand(-0.6, 0.6) };
        b.visible = false;
        this.group.add(b);
        sw.bees.push(b);
      }
      this.swarms.push(sw);
    }
    this.buzzT = 0;
    this.audio.buzz(2);
  }

  update(dt) {
    this.buzzT -= dt;
    if (this.buzzT <= 0) { this.buzzT = 1.5; this.audio.buzz(1.6); }
    this.hive.rotation.z = Math.sin(this.t * 20) * (this.t < 2 ? 0.15 : 0.03);
    if (this.t < 2) return;
    for (const sw of this.swarms) {
      sw.retarget -= dt;
      if (!sw.target || !sw.target.alive || sw.retarget <= 0) {
        const opts = [...this.living()].filter((c) => !this.island.isSheltered(c.pos));
        sw.target = opts.length ? pick(opts.sort((a, b) => Math.hypot(a.pos.x - sw.x, a.pos.z - sw.z) - Math.hypot(b.pos.x - sw.x, b.pos.z - sw.z)).slice(0, 3)) : null;
        sw.retarget = 5;
      }
      const t = sw.target;
      if (t && !this.island.isSheltered(t.pos)) {
        stepToward(sw, t.pos.x, t.pos.z, 6.3, dt, this.R + 2);
        sw.y += (t.pos.y + 1.4 - sw.y) * Math.min(1, dt * 3);
      } else {
        sw.wander = sw.wander && Math.hypot(sw.wander.x - sw.x, sw.wander.z - sw.z) > 1 ? sw.wander : this.island.randomPoint(0, 20);
        stepToward(sw, sw.wander.x, sw.wander.z, 3, dt);
        sw.y += (groundY(sw.x, sw.z) + 2 - sw.y) * Math.min(1, dt * 2);
      }
      for (const b of sw.bees) {
        const o = b.userData.o;
        o.a += dt * o.s;
        b.visible = true;
        b.position.set(sw.x + Math.cos(o.a) * o.r, sw.y + o.h + Math.sin(o.a * 2) * 0.2, sw.z + Math.sin(o.a) * o.r);
        b.rotation.y = -o.a;
      }
      for (const c of this.living()) {
        if (Math.hypot(c.pos.x - sw.x, c.pos.z - sw.z) < 1.6 && Math.abs(c.pos.y + 1.2 - sw.y) < 2 && !this.island.isSheltered(c.pos)) this.hit(c, 9 * dt);
      }
      sw.threat.x = sw.x; sw.threat.z = sw.z;
      this.threats.push(sw.threat);
    }
  }
}

// ------------------------------------------------------------------ SHARK (land shark)
export class Shark extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 26;
    this.killVerb = 'became LAND SHARK food';
    const grey = flatMat(0x6f8796), white = flatMat(0xf2f2f2);
    this.fin = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 3), grey);
    this.fin.scale.z = 0.35;
    this.track(this.fin.geometry);
    this.group.add(this.fin);
    const body = new THREE.Group();
    body.add(block(1.6, 1.4, 4, grey, 0, 0, 0));
    body.add(block(1.3, 0.5, 3.4, white, 0, -0.6, 0.1));
    body.add(block(1.3, 0.3, 0.8, white, 0, -0.1, 2.2));
    for (let i = 0; i < 4; i++) body.add(block(0.15, 0.3, 0.15, white, -0.45 + i * 0.3, -0.2, 2.5, false));
    body.add(block(0.2, 1.6, 1, grey, 0, 0.3, -2.4));
    body.visible = false;
    this.body = body;
    this.group.add(body);
    const a = Math.random() * Math.PI * 2;
    this.x = Math.cos(a) * (this.R - 3); this.z = Math.sin(a) * (this.R - 3);
    this.yaw = 0;
    this.state = 'enter';
    this.timer = 2.2;
    this.threat = { type: 'avoid', x: this.x, z: this.z, radius: 4 };
    this.audio.jaws();
  }

  /** The shark can only swim through low ground (not up the hill or rocks). */
  canSwim(x, z) {
    const h = terrainHeight(x, z);
    return h > -Infinity && h < 1.3 && Math.hypot(x, z) < this.R - 1;
  }

  update(dt) {
    this.timer -= dt;
    this.threat.x = this.x; this.threat.z = this.z;
    if (this.state !== 'enter') this.threats.push(this.threat);
    const gy = groundY(this.x, this.z);
    const prey = (c) => c.pos.y < 1.7 && !this.island.isSheltered(c.pos) && this.canSwim(c.pos.x, c.pos.z);
    if (this.state === 'enter' || this.state === 'hunt') {
      if (this.state === 'enter' && this.timer <= 0) { this.state = 'hunt'; this.timer = 0.5; }
      const target = this.game.nearestCharacter(this.x, this.z, prey);
      let tx, tz;
      if (target) { tx = target.pos.x; tz = target.pos.z; }
      else {
        if (!this.wander || Math.hypot(this.wander.x - this.x, this.wander.z - this.z) < 1.5) this.wander = this.island.randomPoint(3, this.R - 3);
        tx = this.wander.x; tz = this.wander.z;
      }
      const speed = this.state === 'enter' ? 2.5 : 6.6;
      const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz) || 1;
      let nx = this.x + (dx / d) * speed * dt, nz = this.z + (dz / d) * speed * dt;
      if (!this.canSwim(nx, nz)) {
        // slide around obstacles
        const sx = this.x + (-dz / d) * speed * dt, sz = this.z + (dx / d) * speed * dt;
        if (this.canSwim(sx, sz)) { nx = sx; nz = sz; } else { nx = this.x; nz = this.z; this.wander = null; }
      }
      this.x = nx; this.z = nz;
      this.yaw = angleLerp(this.yaw, Math.atan2(dx, dz), 1 - Math.exp(-6 * dt));
      if (Math.random() < 0.5) this.particles.emit({ x: this.x, y: gy + 0.1, z: this.z, color: [0x8a5a35, 0x52b356], count: 1, speed: 2, up: 2, size: 0.25, life: 0.4 });
      if (this.state === 'hunt' && target && d < 2.3 && this.timer <= 0) {
        this.state = 'windup';
        this.timer = 0.6;
        this.bite = { x: this.x + (dx / d) * 1, z: this.z + (dz / d) * 1 };
        this.warn = warnCircle(this.group, this.bite.x, this.bite.z, 2.3);
        this.biteThreat = { type: 'avoid', x: this.bite.x, z: this.bite.z, radius: 2.3 };
      }
      this.fin.visible = true;
      this.body.visible = false;
      this.fin.position.set(this.x, gy + 0.7 + Math.sin(this.t * 8) * 0.08, this.z);
      this.fin.rotation.y = this.yaw;
    } else if (this.state === 'windup') {
      this.threats.push(this.biteThreat);
      this.fin.position.y = gy + 0.7 + Math.sin(this.t * 40) * 0.1;
      if (this.timer <= 0) { this.state = 'leap'; this.timer = 0.8; this.bitten = false; this.audio.splash(); }
    } else if (this.state === 'leap') {
      this.threats.push(this.biteThreat);
      const k = 1 - this.timer / 0.8;
      this.fin.visible = false;
      this.body.visible = true;
      this.body.position.set(this.bite.x, gy + Math.sin(k * Math.PI) * 3.5, this.bite.z);
      this.body.rotation.set(-Math.cos(k * Math.PI) * 0.9, this.yaw, 0);
      if (k > 0.35 && !this.bitten) {
        this.bitten = true;
        for (const c of this.living()) {
          if (Math.hypot(c.pos.x - this.bite.x, c.pos.z - this.bite.z) < 2.3 && c.pos.y < gy + 2.2) this.hit(c, 50, { knock: { x: rand(-4, 4), y: 9, z: rand(-4, 4) } });
        }
        this.particles.emit({ x: this.bite.x, y: gy + 0.3, z: this.bite.z, color: [0x8a5a35, 0x52b356, 0x6d4c32], count: 24, speed: 7, up: 6, size: 0.4, life: 0.8 });
      }
      if (this.timer <= 0) {
        this.group.remove(this.warn);
        this.state = 'hunt';
        this.timer = 2;
        this.body.visible = false;
      }
    }
  }
}

// ------------------------------------------------------------------ BULL
export class Bull extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 26;
    this.killVerb = 'got launched by a BULL';
    this.bulls = [];
    for (let i = 0; i < 2; i++) {
      const p = farPoint(this, 8);
      const g = new THREE.Group();
      const brown = flatMat(i ? 0x5c3a21 : 0x2b2b2b), horn = flatMat(0xf5f0e1);
      g.add(block(1.4, 1.2, 2.4, brown, 0, 1.4, 0));
      g.add(block(1, 1, 1, brown, 0, 1.7, 1.5));
      g.add(block(0.8, 0.5, 0.3, flatMat(0xd99a9a), 0, 1.45, 2.05));
      g.add(block(0.9, 0.18, 0.18, horn, -0.65, 2.25, 1.4));
      g.add(block(0.9, 0.18, 0.18, horn, 0.65, 2.25, 1.4));
      g.add(block(0.18, 0.5, 0.18, horn, -1.05, 2.5, 1.4));
      g.add(block(0.18, 0.5, 0.18, horn, 1.05, 2.5, 1.4));
      const legs = [];
      for (const [lx, lz] of [[-0.5, 0.8], [0.5, 0.8], [-0.5, -0.8], [0.5, -0.8]]) {
        const piv = new THREE.Group();
        piv.position.set(lx, 0.9, lz);
        piv.add(block(0.35, 0.9, 0.35, brown, 0, -0.45, 0));
        g.add(piv);
        legs.push(piv);
      }
      this.group.add(g);
      this.bulls.push({ x: p.x, z: p.z, g, legs, yaw: 0, state: 'idle', timer: 1 + i * 1.2, phase: 0, lineThreats: [] });
    }
    this.audio.roar(1.6);
  }

  update(dt) {
    for (const b of this.bulls) {
      b.timer -= dt;
      let speed = 0;
      if (b.state === 'idle' && b.timer <= 0) {
        const t = pick([...this.living()]);
        if (t) {
          const dx = t.pos.x - b.x, dz = t.pos.z - b.z, d = Math.hypot(dx, dz) || 1;
          b.dir = { x: dx / d, z: dz / d };
          b.yaw = Math.atan2(b.dir.x, b.dir.z);
          b.len = Math.min(d + 6, 26);
          const ex = b.x + b.dir.x * b.len, ez = b.z + b.dir.z * b.len;
          b.strip = warnStrip(this.group, b.x, b.z, ex, ez, 2.4);
          b.lineThreats = [];
          const n = Math.ceil(b.len / 3);
          for (let i = 1; i <= n; i++) b.lineThreats.push({ type: 'avoid', x: b.x + (ex - b.x) * (i / n), z: b.z + (ez - b.z) * (i / n), radius: 1.8 });
          b.state = 'scrape';
          b.timer = 1.3;
          this.audio.roar(1.5);
        }
      } else if (b.state === 'scrape') {
        for (const t of b.lineThreats) this.threats.push(t);
        b.legs[0].rotation.x = Math.sin(this.t * 20) * 0.6;
        if (Math.random() < 0.5) this.particles.emit({ x: b.x, y: groundY(b.x, b.z) + 0.2, z: b.z, color: [0x8a5a35, 0xb08a5a], count: 1, speed: 3, up: 2, size: 0.25, life: 0.4 });
        if (b.timer <= 0) { b.state = 'charge'; b.travel = 0; b.hitSet = new Set(); }
      } else if (b.state === 'charge') {
        for (const t of b.lineThreats) this.threats.push(t);
        const step = 17 * dt;
        b.x += b.dir.x * step; b.z += b.dir.z * step;
        b.travel += step;
        speed = 17;
        const bumped = collideObject(this.island, b, 0.9, groundY(b.x, b.z) + 0.5);
        for (const c of this.living()) {
          if (b.hitSet.has(c)) continue;
          if (Math.hypot(c.pos.x - b.x, c.pos.z - b.z) < 1.7 && c.pos.y < groundY(b.x, b.z) + 2.5) {
            b.hitSet.add(c);
            this.hit(c, 30, { knock: { x: b.dir.x * 18, y: 7, z: b.dir.z * 18 } });
            this.audio.boing();
          }
        }
        const r = Math.hypot(b.x, b.z);
        if (b.travel >= b.len || bumped || r > this.R - 1.5) {
          if (r > this.R - 1.5) { b.x *= (this.R - 1.5) / r; b.z *= (this.R - 1.5) / r; }
          this.group.remove(b.strip);
          b.state = 'idle';
          b.timer = bumped ? 2 : rand(0.8, 1.6);
          if (bumped) { this.game.addShake(0.3, b.x, b.z); this.particles.burst(b.x, groundY(b.x, b.z) + 2.5, b.z, 0xffe066, 8, 4, 0.25, 0.6); }
        }
      }
      b.phase += dt * speed * 0.8;
      b.legs.forEach((l, i) => { if (b.state !== 'scrape' || i) l.rotation.x = Math.sin(b.phase + (i % 2) * Math.PI) * 0.7 * Math.min(1, speed / 5); });
      b.g.position.set(b.x, groundY(b.x, b.z), b.z);
      b.g.rotation.y = b.yaw;
    }
  }
}

export default { zombie: Zombie, dragon: Dragon, giant: Giant, ghost: Ghost, dinosaur: Dinosaur, bees: Bees, shark: Shark, bull: Bull };
