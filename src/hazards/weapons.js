import * as THREE from 'three';
import { Hazard } from './base.js';
import { Drops, warnCircle, warnStrip, groundY, shadowCircle } from './common.js';
import { rand, pick, block, boxGeo, flatMat, angleLerp } from '../utils.js';
import { terrainHeight } from '../island.js';

const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
const ballGeo = new THREE.IcosahedronGeometry(0.55, 0);
const bombGeo = new THREE.CapsuleGeometry(0.35, 0.8, 2, 6);
const dark = 0x2f3640;

// ------------------------------------------------------------------ MINIGUN TURRET
export class MinigunTurret extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 22;
    this.killVerb = 'got sprayed by a MINIGUN TURRET';
    const p = this.island.randomPoint(3, 14);
    this.x = p.x; this.z = p.z;
    this.y = groundY(p.x, p.z);
    const t = new THREE.Group();
    t.add(block(1.6, 0.6, 1.6, dark, 0, 0.3, 0));
    t.add(block(0.5, 0.8, 0.5, 0x57606f, 0, 0.9, 0));
    const head = new THREE.Group();
    head.position.y = 1.5;
    head.add(block(1, 0.7, 1.2, 0xc0392b, 0, 0, 0));
    for (const [bx, by] of [[-0.15, 0.1], [0.15, 0.1], [0, -0.12]]) head.add(block(0.14, 0.14, 1.6, 0x222222, bx, by, 1.2));
    t.add(head);
    this.head = head;
    this.turret = t;
    t.visible = false;
    this.group.add(t);
    this.shadow = shadowCircle(this.group, p.x, p.z, 1.6);
    this.landThreat = { type: 'avoid', x: p.x, z: p.z, radius: 2 };
    this.threat = { type: 'avoid', x: p.x, z: p.z, radius: 10 };
    this.state = 'drop';
    this.timer = 1.6;
    this.yaw = 0;
    this.bullets = [];
    const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    this.laserMat = this.track(new THREE.LineBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.9 }));
    this.laser = new THREE.Line(laserGeo, this.laserMat);
    this.track(laserGeo);
    this.laser.visible = false;
    this.group.add(this.laser);
  }

  visibleTarget() {
    let best = null, bd = 30;
    for (const c of this.living()) {
      const d = Math.hypot(c.pos.x - this.x, c.pos.z - this.z);
      if (d > bd) continue;
      if (this.island.segmentBlocked(this.x, this.z, c.pos.x, c.pos.z, this.y + 1.5) && this.island.segmentBlocked(this.x, this.z, c.pos.x, c.pos.z, c.pos.y + 1.2)) continue;
      best = c; bd = d;
    }
    return best;
  }

  update(dt) {
    this.timer -= dt;
    this.updateBullets(dt);
    if (this.state === 'drop') {
      this.threats.push(this.landThreat);
      this.shadow.scale.setScalar(Math.max(0.01, 1.6 * (1 - this.timer / 1.6)));
      if (this.timer < 0.6) { this.turret.visible = true; this.turret.position.set(this.x, this.y + this.timer * 50, this.z); }
      if (this.timer <= 0) {
        this.group.remove(this.shadow);
        this.turret.position.set(this.x, this.y, this.z);
        this.game.explode(this.x, this.y, this.z, 2, 25, this, { knock: 8, colors: [0x999999, 0x666666] });
        this.addCollider({ type: 'circle', x: this.x, z: this.z, r: 0.9, bottom: this.y - 1, top: this.y + 1.8 });
        this.state = 'seek';
        this.timer = 0.5;
      }
      return;
    }
    this.threats.push(this.threat);
    if (this.state === 'seek' && this.timer <= 0) {
      this.target = this.visibleTarget();
      if (this.target) { this.state = 'aim'; this.timer = 1.0; this.audio.warn(); }
      else this.timer = 0.4;
    }
    const tgt = this.target;
    if ((this.state === 'aim' || this.state === 'fire') && (!tgt || !tgt.alive)) { this.state = 'seek'; this.timer = 0.3; }
    if (this.state === 'aim' || this.state === 'fire') {
      const want = Math.atan2(tgt.pos.x - this.x, tgt.pos.z - this.z);
      // limited turn speed means sprinting sideways dodges the stream
      const turn = this.state === 'aim' ? 4 : 1.1;
      let d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += Math.max(-turn * dt, Math.min(turn * dt, d));
      this.head.rotation.y = this.yaw;
      this.laser.visible = this.state === 'aim';
      const p = this.laser.geometry.attributes.position;
      p.setXYZ(0, this.x, this.y + 1.5, this.z);
      p.setXYZ(1, tgt.pos.x, tgt.pos.y + 1.2, tgt.pos.z);
      p.needsUpdate = true;
      if (this.state === 'aim' && this.timer <= 0) { this.state = 'fire'; this.timer = 2.6; this.shotT = 0; }
      if (this.state === 'fire') {
        this.head.children.forEach((c, i) => { if (i) c.rotation.z += dt * 30; });
        this.shotT -= dt;
        while (this.shotT <= 0) {
          this.shotT += 1 / 12;
          this.fire(tgt);
        }
        if (this.timer <= 0) { this.state = 'seek'; this.timer = 1.6; }
      }
    } else this.laser.visible = false;
  }

  fire(tgt) {
    const sx = this.x + Math.sin(this.yaw) * 1.8, sz = this.z + Math.cos(this.yaw) * 1.8, sy = this.y + 1.5;
    const d = Math.hypot(tgt.pos.x - this.x, tgt.pos.z - this.z);
    const ty = tgt.pos.y + 1.1;
    const pitch = Math.atan2(ty - sy, d);
    const spread = 0.05;
    const yaw = this.yaw + rand(-spread, spread);
    const v = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch) + rand(-spread, spread), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(40);
    const mesh = new THREE.Mesh(boxGeo(0.12, 0.12, 0.5), bulletMat);
    mesh.position.set(sx, sy, sz);
    mesh.lookAt(sx + v.x, sy + v.y, sz + v.z);
    this.group.add(mesh);
    this.bullets.push({ mesh, v, life: 1.2 });
    this.audio.shot();
    this.particles.emit({ x: sx, y: sy, z: sz, color: [0xffe066, 0xffa31a], count: 2, speed: 3, size: 0.2, life: 0.15, gravity: 0 });
  }

  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      const p = b.mesh.position;
      let dead = b.life <= 0;
      const steps = 3;
      for (let s = 0; s < steps && !dead; s++) {
        p.addScaledVector(b.v, dt / steps);
        if (this.island.pointSolid(p.x, p.y, p.z)) {
          dead = true;
          this.particles.emit({ x: p.x, y: p.y, z: p.z, color: [0xcccccc, 0xffe066], count: 3, speed: 3, size: 0.15, life: 0.3 });
          break;
        }
        for (const c of this.living()) {
          if (Math.abs(p.x - c.pos.x) < 0.55 && Math.abs(p.z - c.pos.z) < 0.55 && p.y > c.pos.y && p.y < c.pos.y + 2.3) {
            this.hit(c, 7, { knock: { x: b.v.x * 0.05, y: 0, z: b.v.z * 0.05 } });
            dead = true;
            break;
          }
        }
      }
      if (dead) { this.group.remove(b.mesh); this.bullets.splice(i, 1); }
    }
  }
}

// ------------------------------------------------------------------ AIRSTRIKE
export class Airstrike extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 14;
    this.killVerb = 'got carpet-bombed by an AIRSTRIKE';
    this.drops = new Drops(this);
    this.passes = [];
    this.schedule = [0, 6];
    const plane = new THREE.Group();
    plane.add(block(1.2, 1, 6, 0x6b7a5a, 0, 0, 0));
    plane.add(block(9, 0.25, 1.8, 0x5a684a, 0, 0, 0.3));
    plane.add(block(3.2, 0.2, 1, 0x5a684a, 0, 0.2, -2.6));
    plane.add(block(0.2, 1.4, 1, 0x5a684a, 0, 0.8, -2.6));
    plane.add(block(0.8, 0.5, 1, 0x9fd8ff, 0, 0.5, 2));
    plane.visible = false;
    this.plane = plane;
    this.group.add(plane);
  }

  startPass() {
    const living = [...this.living()];
    const c = living.length ? pick(living) : null;
    const p = c ? { x: c.pos.x, z: c.pos.z } : this.island.randomPoint(0, 15);
    const a = this.passes.length ? this.passes[0].angle + Math.PI / 2 + rand(-0.3, 0.3) : Math.random() * Math.PI * 2;
    const dir = { x: Math.cos(a), z: Math.sin(a) };
    // project the line so it crosses the whole island
    const along = p.x * dir.x + p.z * dir.z;
    const ox = p.x - dir.x * along, oz = p.z - dir.z * along;
    const L = this.R + 6;
    const pass = { angle: a, dir, ox, oz, t: 0, dropped: 0, threats: [] };
    pass.strip = warnStrip(this.group, ox - dir.x * L, oz - dir.z * L, ox + dir.x * L, oz + dir.z * L, 5.2);
    for (let s = -L; s <= L; s += 3) pass.threats.push({ type: 'avoid', x: ox + dir.x * s, z: oz + dir.z * s, radius: 3 });
    this.passes.push(pass);
    this.audio.siren(3);
  }

  update(dt) {
    while (this.schedule.length && this.t >= this.schedule[0]) { this.schedule.shift(); this.startPass(); }
    this.drops.update(dt);
    let flying = false;
    for (const pass of this.passes) {
      pass.t += dt;
      if (pass.done) continue;
      for (const th of pass.threats) this.threats.push(th);
      if (pass.t > 3) {
        const s = -60 + (pass.t - 3) * 30;
        const px = pass.ox + pass.dir.x * s, pz = pass.oz + pass.dir.z * s;
        this.plane.visible = true;
        flying = true;
        this.plane.position.set(px, 20, pz);
        this.plane.rotation.y = Math.atan2(pass.dir.x, pass.dir.z);
        if (!pass.roar) { pass.roar = true; this.audio.whoosh(); this.audio.rumble(2.5); }
        while (s > -this.R - 3 + pass.dropped * 2.6 && s < this.R + 3) {
          const ds = -this.R - 3 + pass.dropped * 2.6;
          pass.dropped++;
          const bx = pass.ox + pass.dir.x * ds + rand(-1, 1), bz = pass.oz + pass.dir.z * ds + rand(-1, 1);
          if (terrainHeight(bx, bz) === -Infinity) continue;
          this.drops.add({
            x: bx, z: bz, from: { x: bx, y: 19, z: bz }, time: 0.65, radius: 3.2, warn: false, spin: 0,
            mesh: new THREE.Mesh(bombGeo, flatMat(dark)),
            onImpact: (x, y, z) => this.game.explode(x, y, z, 3.2, 55, this, { knock: 12, sound: Math.random() < 0.6 }),
          });
        }
        if (s > 60) { pass.done = true; this.group.remove(pass.strip); }
      }
    }
    if (!flying) this.plane.visible = false;
  }
}

// ------------------------------------------------------------------ CANNON
export class Cannon extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 22;
    this.killVerb = 'got blasted by a CANNON';
    this.drops = new Drops(this);
    const a = Math.random() * Math.PI * 2;
    this.x = Math.cos(a) * (this.R - 2); this.z = Math.sin(a) * (this.R - 2);
    this.y = groundY(this.x, this.z);
    const c = new THREE.Group();
    const barrel = new THREE.Group();
    barrel.position.y = 1.2;
    barrel.add(block(0.9, 0.9, 3, 0x2b2b2b, 0, 0, 0.6));
    barrel.add(block(1.1, 1.1, 0.3, 0x444444, 0, 0, 2.1));
    barrel.rotation.x = -0.5;
    c.add(barrel);
    c.add(block(1.4, 0.6, 2, 0x7b5032, 0, 0.6, 0));
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.25, 8), flatMat(0x5c3a21));
      this.track(w.geometry);
      w.rotation.z = Math.PI / 2;
      w.position.set(0.85 * s, 0.7, 0);
      c.add(w);
    }
    c.position.set(this.x, this.y, this.z);
    c.rotation.y = Math.atan2(-this.x, -this.z);
    this.cannon = c;
    this.barrel = barrel;
    this.group.add(c);
    this.addCollider({ type: 'circle', x: this.x, z: this.z, r: 1, bottom: this.y - 1, top: this.y + 1.4 });
    this.next = 1.5;
    this.audio.tone({ freq: 200, to: 120, type: 'square', dur: 0.3, vol: 0.15 });
  }

  update(dt) {
    this.drops.update(dt);
    this.next -= dt;
    this.barrel.scale.z += (1 - this.barrel.scale.z) * Math.min(1, dt * 6);
    if (this.next <= 0 && this.t < this.duration - 2) {
      this.next = rand(1.4, 1.9);
      const c = pick([...this.living()]);
      if (!c) return;
      const tx = c.pos.x + c.vel.x * 0.9 + rand(-1.5, 1.5), tz = c.pos.z + c.vel.z * 0.9 + rand(-1.5, 1.5);
      if (terrainHeight(tx, tz) === -Infinity) return;
      this.cannon.rotation.y = Math.atan2(tx - this.x, tz - this.z);
      const mx = this.x + Math.sin(this.cannon.rotation.y) * 2.2, mz = this.z + Math.cos(this.cannon.rotation.y) * 2.2;
      this.barrel.scale.z = 0.75;
      this.particles.emit({ x: mx, y: this.y + 2.2, z: mz, color: [0xdddddd, 0x999999, 0xffa31a], count: 14, speed: 5, up: 3, size: 0.7, life: 0.8, gravity: -1 });
      this.audio.explosion(0.5);
      this.game.addShake(0.2, this.x, this.z);
      this.drops.add({
        x: tx, z: tz, from: { x: mx, y: this.y + 2.2, z: mz }, time: 1.6, radius: 3, arc: 14,
        mesh: new THREE.Mesh(ballGeo, flatMat(0x222222)),
        onImpact: (x, y, z) => this.game.explode(x, y, z, 3, 45, this, { knock: 12 }),
      });
    }
  }
}

// ------------------------------------------------------------------ SPINNING LASER
const beamMat = new THREE.MeshBasicMaterial({ color: 0xff1a3c, transparent: true, opacity: 0.9 });
export class SpinningLaser extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 20;
    this.killVerb = 'got sliced by the SPINNING LASER';
    const p = this.island.randomPoint(0, 7, { avoidHill: true });
    this.x = p.x; this.z = p.z;
    this.base = groundY(p.x, p.z);
    this.beamY = this.base + 0.75;
    this.len = 34;
    this.angle = Math.random() * Math.PI * 2;
    this.speed = 1.5;
    const pole = new THREE.Group();
    pole.add(block(0.8, 2.6, 0.8, 0x3d3d4d, 0, 1.3, 0));
    pole.add(block(1.2, 0.5, 1.2, 0xff1a3c, 0, 0.75, 0));
    pole.position.set(p.x, this.base, p.z);
    this.group.add(pole);
    this.mat = this.track(beamMat.clone());
    this.arms = [];
    for (let i = 0; i < 2; i++) {
      const arm = new THREE.Mesh(boxGeo(this.len, 0.22, 0.22), this.mat);
      arm.geometry = arm.geometry.clone().translate(this.len / 2, 0, 0);
      this.track(arm.geometry);
      arm.position.set(p.x, this.beamY, p.z);
      arm.visible = i === 0;
      this.group.add(arm);
      this.arms.push(arm);
    }
    this.addCollider({ type: 'circle', x: p.x, z: p.z, r: 0.5, bottom: this.base - 1, top: this.base + 2.6 });
    this.cooldowns = new Map();
    this.warnTime = 2.5;
    this.centerThreat = { type: 'avoid', x: p.x, z: p.z, radius: 1.5 };
    this.audio.laser();
  }

  armAngles() { return this.t > 9 ? [this.angle, this.angle + Math.PI] : [this.angle]; }

  update(dt) {
    const live = this.t > this.warnTime;
    this.angle += dt * (live ? this.speed : 0.4);
    const angles = this.armAngles();
    this.arms.forEach((a, i) => {
      a.visible = i < angles.length;
      a.rotation.y = -(angles[i] ?? 0);
      a.scale.set(1, live ? 1 : 0.35, live ? 1 : 0.35);
    });
    this.mat.opacity = live ? 0.85 + Math.sin(this.t * 30) * 0.1 : 0.3 + Math.sin(this.t * 12) * 0.15;
    this.threats.push(this.centerThreat);
    if (live && Math.random() < dt * 4) this.audio.tone({ freq: 90, type: 'sawtooth', dur: 0.25, vol: 0.04 });
    for (const c of this.living()) {
      const dx = c.pos.x - this.x, dz = c.pos.z - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist > this.len) continue;
      const phi = Math.atan2(dz, dx);
      for (const th of angles) {
        // bots try to hop when the beam is about to reach them
        if (c.isBot && c.onGround && c.pos.y < this.beamY + 0.2) {
          let ahead = (phi - th) % (Math.PI * 2);
          if (ahead < 0) ahead += Math.PI * 2;
          const timeToHit = ahead / (live ? this.speed : 0.4);
          if (live && timeToHit < 0.28 + 0.6 / Math.max(dist, 1) && this.game.botNotices(c, this)) c.ai.wantJump = true;
        }
        if (!live) continue;
        const along = dx * Math.cos(th) + dz * Math.sin(th);
        const perp = Math.abs(-dx * Math.sin(th) + dz * Math.cos(th));
        if (along > 0 && perp < 0.6 && c.pos.y < this.beamY + 0.1 && c.pos.y + c.height > this.beamY) {
          if ((this.cooldowns.get(c) || 0) > this.game.time) continue;
          this.cooldowns.set(c, this.game.time + 0.8);
          const tx = -Math.sin(th), tz = Math.cos(th);
          this.hit(c, 35, { knock: { x: tx * 9, y: 7, z: tz * 9 } });
          this.particles.emit({ x: c.pos.x, y: this.beamY, z: c.pos.z, color: [0xff1a3c, 0xffffff], count: 12, speed: 6, size: 0.25, life: 0.4 });
          this.audio.laser();
        }
      }
    }
  }
}

export default { minigun: MinigunTurret, airstrike: Airstrike, cannon: Cannon, laser: SpinningLaser };
