import * as THREE from 'three';
import { Hazard } from './base.js';
import { Drops, warnCircle, warnStrip, groundY } from './common.js';
import { rand, pick, distToSegment, boxGeo, flatMat } from '../utils.js';
import { HILL, terrainHeight } from '../island.js';

const meteorGeo = new THREE.DodecahedronGeometry(1.3, 0);
const meteorMat = new THREE.MeshLambertMaterial({ color: 0x6b3b22, emissive: 0xff5a00, emissiveIntensity: 0.6, flatShading: true });
const lavaBombGeo = new THREE.DodecahedronGeometry(0.7, 0);
const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff6a00 });
const LAVA_COLORS = [0xff3d00, 0xff6a00, 0xffa31a, 0xffd23f];

/** Random spot, usually close to a random survivor. */
function nearSomeone(h, chance = 0.7, spread = 3) {
  const living = [...h.living()];
  if (living.length && Math.random() < chance) {
    const c = pick(living);
    const a = Math.random() * Math.PI * 2, r = rand(0, spread);
    const x = c.pos.x + Math.cos(a) * r, z = c.pos.z + Math.sin(a) * r;
    if (terrainHeight(x, z) > -Infinity) return { x, z };
  }
  return h.island.randomPoint(0, h.R - 2, { avoidHut: false });
}

// ------------------------------------------------------------------ METEOR
export class Meteor extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 14;
    this.killVerb = 'got flattened by a METEOR';
    this.drops = new Drops(this);
    this.nextDrop = 0.3;
    this.left = 7;
  }

  update(dt) {
    this.nextDrop -= dt;
    if (this.left > 0 && this.nextDrop <= 0) {
      this.left--;
      this.nextDrop = rand(0.8, 1.4);
      const p = nearSomeone(this, 0.75);
      const mesh = new THREE.Mesh(meteorGeo, meteorMat);
      mesh.castShadow = true;
      this.audio.whoosh();
      this.drops.add({
        x: p.x, z: p.z, time: 2.4, radius: 4.2, mesh,
        from: { x: p.x + 25, y: 60, z: p.z + 12 },
        trail: (pos) => this.particles.emit({ x: pos.x, y: pos.y, z: pos.z, color: [0xff5a1f, 0xffa31a, 0xffe066, 0x666666], count: 2, speed: 1.5, size: 0.7, life: 0.6, gravity: -1 }),
        onImpact: (x, y, z) => this.game.explode(x, y, z, 4.2, 60, this, { knock: 13 }),
      });
    }
    this.drops.update(dt);
    if (this.left === 0 && this.drops.count === 0 && this.t > 4) this.done = true;
  }
}

// ------------------------------------------------------------------ TSUNAMI
const waveMat = new THREE.MeshLambertMaterial({ color: 0x2a9df4, transparent: true, opacity: 0.82, flatShading: true });
const foamMat = flatMat(0xe8f8ff);
export class Tsunami extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 14;
    this.killVerb = 'was swept away by a TSUNAMI';
    this.angle = Math.random() * Math.PI * 2;
    this.dir = { x: Math.cos(this.angle), z: Math.sin(this.angle) };
    this.warnTime = 4.5;
    this.speed = 13;
    this.height = 3.2;
    this.s = -this.R - 6;
    const wave = new THREE.Group();
    const body = new THREE.Mesh(boxGeo(1, 1, 1), waveMat);
    body.scale.set(80, this.height + 0.6, 6);
    body.position.y = (this.height + 0.6) / 2 - 0.6;
    wave.add(body);
    const foam = new THREE.Mesh(boxGeo(1, 1, 1), foamMat);
    foam.scale.set(80, 0.5, 2.2);
    foam.position.set(0, this.height + 0.1, 1.6);
    wave.add(foam);
    wave.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    this.wave = wave;
    this.group.add(wave);
    this.threat = { type: 'high' };
    this.audio.siren(4);
  }

  update(dt) {
    const d = this.dir;
    const rising = Math.min(1, this.t / this.warnTime);
    if (this.t > this.warnTime) this.s += this.speed * dt;
    this.wave.scale.y = 0.15 + rising * 0.85;
    this.wave.position.set(d.x * this.s, -0.2, d.z * this.s);
    if (this.s < this.R + 4) this.threats.push(this.threat);
    if (this.t > this.warnTime) {
      this.game.addShake(0.15, d.x * this.s, d.z * this.s);
      for (const c of this.living()) {
        const proj = c.pos.x * d.x + c.pos.z * d.z;
        if (proj < this.s + 3 && proj > this.s - 7 && c.pos.y < this.height && !this.island.isSheltered(c.pos)) {
          c.vel.x = d.x * 16;
          c.vel.z = d.z * 16;
          c.vel.y = Math.max(c.vel.y, 3.5);
          c.onGround = false;
          this.hit(c, 12 * dt);
          if (Math.random() < 0.3) this.particles.emit({ x: c.pos.x, y: c.pos.y + 1, z: c.pos.z, color: [0xffffff, 0x9fd8ff], count: 2, speed: 4, up: 4, size: 0.4, life: 0.5 });
        }
      }
      if (Math.random() < 0.6) {
        const side = rand(-30, 30);
        const px = d.x * (this.s + 2) - d.z * side, pz = d.z * (this.s + 2) + d.x * side;
        this.particles.emit({ x: px, y: this.height, z: pz, color: [0xffffff, 0xc8ecff], count: 3, speed: 3, up: 5, size: 0.5, life: 0.7 });
      }
      if (!this.splashed && this.s > -this.R) { this.splashed = true; this.audio.splash(); }
    }
    if (this.s > this.R + 12) this.done = true;
  }
}

// ------------------------------------------------------------------ EARTHQUAKE
const crackMat = new THREE.MeshBasicMaterial({ color: 0x1a0d05 });
const crackGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
export class Earthquake extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 12;
    this.killVerb = 'fell into an EARTHQUAKE crack';
    this.fissures = [];
    this.schedule = [2, 2.4, 4.6, 5, 7.2, 7.6];
    this.jolt = 0;
    this.audio.rumble(3);
  }

  addFissure() {
    const p = this.island.randomPoint(0, this.R - 6, { avoidHut: true });
    const target = Math.random() < 0.6 ? pick([...this.living()]) : null;
    const cx = target ? target.pos.x : p.x, cz = target ? target.pos.z : p.z;
    const a = Math.random() * Math.PI;
    const L = 14;
    const f = {
      ax: cx - Math.cos(a) * L / 2, az: cz - Math.sin(a) * L / 2, bx: cx + Math.cos(a) * L / 2, bz: cz + Math.sin(a) * L / 2,
      t: 0, state: 'warn', threats: [],
    };
    f.warn = warnStrip(this.group, f.ax, f.az, f.bx, f.bz, 2.6);
    for (let i = 0; i <= 4; i++) {
      const k = i / 4;
      f.threats.push({ type: 'avoid', x: f.ax + (f.bx - f.ax) * k, z: f.az + (f.bz - f.az) * k, radius: 1.8 });
    }
    this.fissures.push(f);
    this.audio.warn();
  }

  update(dt) {
    while (this.schedule.length && this.t >= this.schedule[0]) { this.schedule.shift(); this.addFissure(); }
    const quaking = this.t > 1.5 && this.t < 10.5;
    this.game.addShake(quaking ? 0.45 : 0.12);
    if (quaking) {
      this.jolt -= dt;
      if (this.jolt <= 0) {
        this.jolt = 0.4;
        for (const c of this.living()) if (c.onGround) c.knock(rand(-2.5, 2.5), 2.5, rand(-2.5, 2.5));
        if (Math.random() < 0.3) this.audio.rumble(1);
      }
    }
    for (const f of this.fissures) {
      f.t += dt;
      if (f.state === 'warn') {
        for (const th of f.threats) this.threats.push(th);
        if (f.t > 1.6) {
          f.state = 'open';
          this.group.remove(f.warn);
          const m = new THREE.Mesh(crackGeo, crackMat);
          m.scale.set(1.6, 1, Math.hypot(f.bx - f.ax, f.bz - f.az));
          m.rotation.y = Math.atan2(f.bx - f.ax, f.bz - f.az);
          m.position.set((f.ax + f.bx) / 2, groundY((f.ax + f.bx) / 2, (f.az + f.bz) / 2) + 0.1, (f.az + f.bz) / 2);
          this.group.add(m);
          for (const c of this.living()) {
            if (distToSegment(c.pos.x, c.pos.z, f.ax, f.az, f.bx, f.bz) < 1.5 && c.pos.y < terrainHeight(c.pos.x, c.pos.z) + 1.2) {
              this.hit(c, 40, { knock: { x: rand(-3, 3), y: 13, z: rand(-3, 3) } });
            }
          }
          for (let i = 0; i <= 6; i++) {
            const k = i / 6, x = f.ax + (f.bx - f.ax) * k, z = f.az + (f.bz - f.az) * k;
            this.particles.emit({ x, y: groundY(x, z) + 0.3, z, color: [0x6d4c32, 0x8a5a35, 0x555555], count: 6, speed: 6, up: 8, size: 0.5, life: 1 });
          }
          this.audio.explosion(0.8);
          this.game.addShake(0.8, f.ax, f.az);
        }
      }
    }
  }
}

// ------------------------------------------------------------------ VOLCANO
export class Volcano extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 17;
    this.killVerb = 'got cooked by the VOLCANO';
    this.drops = new Drops(this);
    this.top = { x: HILL.x, z: HILL.z, y: terrainHeight(HILL.x, HILL.z) };
    this.next = 3;
    const crater = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 0.4, 8), lavaMat);
    crater.position.set(this.top.x, this.top.y + 0.05, this.top.z);
    crater.scale.setScalar(0.01);
    this.track(crater.geometry);
    this.crater = crater;
    this.group.add(crater);
    this.topThreat = { type: 'avoid', x: this.top.x, z: this.top.z, radius: 4.5 };
    this.audio.rumble(3);
  }

  update(dt) {
    const tp = this.top;
    this.threats.push(this.topThreat);
    this.crater.scale.setScalar(Math.min(1, this.t / 3));
    if (this.t < 3) {
      this.game.addShake(0.15);
      this.particles.emit({ x: tp.x, y: tp.y + 0.5, z: tp.z, color: [0x555555, 0x777777, 0x333333], count: 2, speed: 1.5, up: 5, size: 1, life: 1.6, gravity: -1, spread: 1 });
    } else if (this.t < 15) {
      this.particles.emit({ x: tp.x, y: tp.y + 0.6, z: tp.z, color: LAVA_COLORS, count: 3, speed: 4, up: 12, size: 0.5, life: 1.2, spread: 1 });
      this.next -= dt;
      if (this.next <= 0) {
        this.next = rand(0.35, 0.6);
        const p = nearSomeone(this, 0.55, 4);
        if (Math.hypot(p.x - tp.x, p.z - tp.z) > 3) {
          this.drops.add({
            x: p.x, z: p.z, from: { x: tp.x, y: tp.y + 1, z: tp.z }, time: rand(1.6, 2.1), radius: 2.6, arc: 16,
            mesh: new THREE.Mesh(lavaBombGeo, lavaMat),
            trail: (pos) => Math.random() < 0.5 && this.particles.emit({ x: pos.x, y: pos.y, z: pos.z, color: LAVA_COLORS, count: 1, speed: 1, size: 0.4, life: 0.5, gravity: 0 }),
            onImpact: (x, y, z) => this.game.explode(x, y, z, 2.6, 35, this, { knock: 9, colors: LAVA_COLORS }),
          });
        }
        if (Math.random() < 0.15) this.audio.explosion(0.6);
      }
      for (const c of this.living()) {
        if (Math.hypot(c.pos.x - tp.x, c.pos.z - tp.z) < 2.8 && c.pos.y < tp.y + 1.5) {
          this.hit(c, 35 * dt, { knock: { x: 0, y: c.onGround ? 4 : 0, z: 0 } });
        }
      }
    }
    this.drops.update(dt);
  }
}

// ------------------------------------------------------------------ NUKE
const bombMat = flatMat(0x3d4a3d);
const NUKE_SKY = new THREE.Color(1, 0.75, 0.55);
export class Nuke extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 16;
    this.fuse = 11;
    this.killVerb = 'was vaporized by a NUKE';
    this.threat = { type: 'hide' };
    this.sirenT = 0;
    this.lastSec = -1;
    const bomb = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 2.6, 3, 8), bombMat);
    this.track(body.geometry);
    bomb.add(body);
    const stripe = new THREE.Mesh(boxGeo(2.3, 0.4, 2.3), flatMat(0xffd23f));
    bomb.add(stripe);
    const fin = new THREE.Mesh(boxGeo(2.8, 1, 0.2), bombMat);
    fin.position.y = 2;
    bomb.add(fin);
    const fin2 = fin.clone();
    fin2.rotation.y = Math.PI / 2;
    bomb.add(fin2);
    bomb.visible = false;
    this.bomb = bomb;
    this.group.add(bomb);
    this.cloud = null;
  }

  update(dt) {
    const remaining = this.fuse - this.t;
    if (remaining > 0) {
      this.threats.push(this.threat);
      this.sirenT -= dt;
      if (this.sirenT <= 0) { this.sirenT = 2; this.audio.siren(2); }
      const sec = Math.ceil(remaining);
      if (sec !== this.lastSec) {
        this.lastSec = sec;
        this.game.ui.countdown(`☢️ ${sec}`, this.game.player.alive && this.island.isSheltered(this.game.player.pos) ? 'You are safe in here... probably' : 'GET IN THE HUT!');
      }
      if (remaining < 3) {
        this.bomb.visible = true;
        const k = 1 - remaining / 3;
        this.bomb.position.set(0, 70 - k * 70, 0);
        this.bomb.rotation.z = Math.sin(this.t * 5) * 0.1;
      }
    } else if (!this.cloud) {
      this.detonate();
    } else {
      const k = (this.t - this.fuse) / (this.duration - this.fuse);
      this.cloud.scale.setScalar(0.3 + k * 1.4);
      this.cloud.position.y = k * 6;
      this.cloudMat.opacity = Math.max(0, 0.95 - k * 0.95);
      this.game.env.skyTint = NUKE_SKY;
    }
  }

  detonate() {
    const g = this.game;
    this.bomb.visible = false;
    g.ui.countdown('');
    g.ui.flash('#ffffff', 1, 1800);
    this.audio.bigBoom();
    g.addShake(1.5);
    for (const c of [...this.living()]) {
      if (!this.island.isSheltered(c.pos)) g.killCharacter(c, this.killVerb, this);
      else c.knock(0, 3, 0);
    }
    // mushroom cloud
    this.cloudMat = this.track(new THREE.MeshLambertMaterial({ color: 0xff9a3c, emissive: 0x662200, flatShading: true, transparent: true, opacity: 0.95 }));
    const cloud = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, 22, 8), this.cloudMat);
    stem.position.y = 11;
    const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(10, 1), this.cloudMat);
    cap.position.y = 24;
    cap.scale.y = 0.6;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 2.5, 6, 12), this.cloudMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 14;
    for (const m of [stem, cap, ring]) { this.track(m.geometry); cloud.add(m); }
    this.cloud = cloud;
    this.group.add(cloud);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.particles.emit({ x: Math.cos(a) * 8, y: 2, z: Math.sin(a) * 8, color: [0xffa31a, 0xffe066, 0x777777], count: 30, speed: 25, up: 6, size: 1.2, life: 1.8, gravity: 2 });
    }
  }

  onDispose() {
    if (!this.cloud) this.game.ui.countdown('');
  }
}

// ------------------------------------------------------------------ TORNADO
const funnelMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.55, flatShading: true, side: THREE.DoubleSide, depthWrite: false });
export class Tornado extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 17;
    this.killVerb = 'got yeeted by a TORNADO';
    const a = Math.random() * Math.PI * 2;
    this.x = Math.cos(a) * (this.R - 6);
    this.z = Math.sin(a) * (this.R - 6);
    this.funnel = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const rTop = 0.8 + i * 0.75, rBot = 0.6 + i * 0.7;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, 1.6, 7, 1, true), funnelMat);
      this.track(ring.geometry);
      ring.position.y = i * 1.55 + 0.8;
      this.funnel.add(ring);
    }
    this.group.add(this.funnel);
    this.target = this.island.randomPoint(0, 15);
    this.cooldowns = new Map();
    this.threat = { type: 'avoid', x: this.x, z: this.z, radius: 7 };
    this.warn = warnCircle(this.group, this.x, this.z, 4);
    this.audio.whoosh();
  }

  update(dt) {
    const grow = Math.min(1, this.t / 2);
    const fading = Math.max(0, Math.min(1, this.duration - this.t));
    const scale = grow * fading;
    this.funnel.scale.set(scale, Math.max(0.05, scale), scale);
    this.funnel.children.forEach((r, i) => { r.rotation.y += dt * (6 - i * 0.3); r.position.x = Math.sin(this.t * 3 + i * 0.6) * 0.4 * i * 0.2; });
    this.funnel.position.set(this.x, groundY(this.x, this.z) - 0.3, this.z);
    this.threat.x = this.x; this.threat.z = this.z;
    this.threats.push(this.threat);
    if (this.t < 2) {
      this.warn.position.set(this.x, this.warn.position.y, this.z);
      return;
    }
    if (this.warn) { this.group.remove(this.warn); this.warn = null; this.audio.whoosh(); }
    // wander, drifting toward people
    if (Math.hypot(this.target.x - this.x, this.target.z - this.z) < 2 || Math.random() < dt * 0.15) {
      const c = Math.random() < 0.4 ? this.game.nearestCharacter(this.x, this.z) : null;
      this.target = c ? { x: c.pos.x, z: c.pos.z } : this.island.randomPoint(0, this.R - 5);
    }
    const dx = this.target.x - this.x, dz = this.target.z - this.z, d = Math.hypot(dx, dz) || 1;
    this.x += (dx / d) * 3.6 * dt;
    this.z += (dz / d) * 3.6 * dt;
    if (Math.random() < 0.5) {
      const a = Math.random() * 6.28, r = rand(1, 4);
      this.particles.emit({ x: this.x + Math.cos(a) * r, y: rand(0.5, 8), z: this.z + Math.sin(a) * r, color: [0x8a5a35, 0x52b356, 0x888888], count: 1, speed: 6, up: 6, size: 0.35, life: 0.8, gravity: -2 });
    }
    if (scale < 0.3) return;
    for (const c of this.living()) {
      if (this.island.isSheltered(c.pos)) continue;
      const cx = c.pos.x - this.x, cz = c.pos.z - this.z, cd = Math.hypot(cx, cz);
      if (cd > 10 || c.pos.y > 14) continue;
      const pull = 6.5 * (1 - cd / 10) * scale;
      c.pos.x -= (cx / (cd || 1)) * pull * dt;
      c.pos.z -= (cz / (cd || 1)) * pull * dt;
      const cdKey = this.cooldowns.get(c) || 0;
      if (cd < 2.3 && this.game.time > cdKey) {
        this.cooldowns.set(c, this.game.time + 1.6);
        const tx = -cz / (cd || 1), tz = cx / (cd || 1);
        this.hit(c, 12, { knock: { x: tx * 13 + (cx / (cd || 1)) * 5, y: 14, z: tz * 13 + (cz / (cd || 1)) * 5 } });
        this.audio.whoosh();
      }
    }
  }
}

export default { meteor: Meteor, tsunami: Tsunami, earthquake: Earthquake, volcano: Volcano, nuke: Nuke, tornado: Tornado };
