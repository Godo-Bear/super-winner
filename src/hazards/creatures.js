import * as THREE from 'three';
import { Hazard } from './base.js';
import { Drops, warnCircle, warnStrip, groundY, stepToward, collideObject } from './common.js';
import { rand, pick, block, flatMat, angleLerp, makeTextSprite } from '../utils.js';
import { makeHumanoid, animateHumanoid } from '../models.js';
import { terrainHeight } from '../island.js';

/**
 * One hazard class that can become hundreds of creatures: lions, spiders, eagles,
 * pirates, robots, grandmas... The look and behaviour come from a `spec` made by
 * the word brain (src/lexicon.js):
 *
 *   body      'quad' | 'bird' | 'bug' | 'sea' | 'human'
 *   behavior  'chase' | 'charge' | 'swarm' | 'dive' | 'leap' | 'shoot'
 *   icon      emoji shown above each creature
 *   color, color2, size, speed, count, damage, fire, ice, hat, hatStyle
 */
const HINTS = {
  chase: 'It chases you. Keep moving!',
  charge: 'It charges along the red line. Side-step!',
  swarm: 'A swarm! Sprint away!',
  dive: 'It dives at the red circles!',
  leap: 'It leaps at you. Watch the circles!',
  shoot: 'It shoots! Dodge the circles, use cover!',
};

export class Creature extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    const s = (this.spec = { size: 1, speed: 4, count: 2, damage: 20, color: 0x888888, color2: 0x444444, ...opts.spec });
    this.duration = 32;
    this.icon = s.icon || '👾';
    this.label = s.label || this.label;
    this.hint = `${s.icon || ''} ${HINTS[s.behavior] || HINTS.chase}`;
    this.killVerb = `got got by ${/^[aeiou]/i.test(this.label) ? 'an' : 'a'} ${this.label.toUpperCase()}`;
    this.drops = new Drops(this);
    this.mobs = [];
    const n = s.behavior === 'swarm' ? Math.max(5, s.count) : s.count;
    for (let i = 0; i < n; i++) this.spawnMob(i);
    if (s.sound) this.audio[s.sound]?.(s.pitch || 1);
    else this.audio.roar(Math.max(0.5, 1.6 - s.size * 0.4));
  }

  spawnMob(i) {
    const s = this.spec;
    let p;
    if (s.body === 'sea') { const a = Math.random() * Math.PI * 2; p = { x: Math.cos(a) * (this.R - 2), z: Math.sin(a) * (this.R - 2) }; }
    else p = this.island.randomPoint(6, this.R - 5);
    const model = this.buildBody();
    model.group.scale.setScalar(s.size);
    model.group.visible = false;
    this.group.add(model.group);
    // emoji sign so everyone knows what it is
    const tag = makeTextSprite(s.icon || '?', { fontSize: 72, height: 0.9, stroke: '#ffffff' });
    tag.position.y = (model.height + 0.7) * s.size;
    this.group.add(tag);
    const m = {
      x: p.x, z: p.z, y: groundY(p.x, p.z), model, tag, yaw: Math.random() * 6, phase: Math.random() * 6,
      state: 'spawn', timer: 1.6 + i * 0.25, cd: 0,
      warn: warnCircle(this.group, p.x, p.z, 1.2 * s.size + 0.6), threat: { type: 'avoid', x: p.x, z: p.z, radius: 2 + s.size },
    };
    this.mobs.push(m);
  }

  /** Blocky body for each body type. Returns { group, parts, height }. */
  buildBody() {
    const s = this.spec;
    const c1 = flatMat(s.color), c2 = flatMat(s.color2), eye = flatMat(0x111111), white = flatMat(0xffffff);
    const g = new THREE.Group();
    const parts = {};
    const eyes = (parent, x, y, z, gap) => {
      for (const sx of [-1, 1]) {
        parent.add(block(0.12, 0.12, 0.04, white, sx * gap, y, z, false));
        parent.add(block(0.07, 0.08, 0.04, eye, sx * gap, y, z + 0.02, false));
      }
    };
    if (s.body === 'human') {
      const h = makeHumanoid({ skin: s.skin ?? 0xf1c27d, shirt: s.color, pants: s.color2, hat: s.hat ?? null, hatStyle: s.hatStyle, hair: s.hair ?? 0x4a2f1b, outline: true });
      return { group: h.group, parts: h.parts, height: 2.4, human: true };
    }
    if (s.body === 'quad') {
      const body = block(0.9, 0.75, 1.5, c1, 0, 0.95, 0);
      g.add(body);
      const head = new THREE.Group();
      head.position.set(0, 1.35 + (s.neck || 0), 0.85 + (s.neck || 0) * 0.3);
      head.add(block(0.66, 0.6, 0.66, c1, 0, 0, 0));
      head.add(block(0.4, 0.3, 0.3, c2, 0, -0.1, 0.42));
      head.add(block(0.18, 0.25, 0.1, c2, -0.24, 0.38, -0.05));
      head.add(block(0.18, 0.25, 0.1, c2, 0.24, 0.38, -0.05));
      eyes(head, 0, 0.1, 0.34, 0.17);
      if (s.neck) g.add(block(0.35, s.neck + 0.4, 0.35, c1, 0, 1.2 + s.neck / 2, 0.8));
      if (s.mane) head.add(block(0.95, 0.9, 0.3, c2, 0, 0, -0.3));
      g.add(head);
      parts.legs = [];
      for (const [lx, lz] of [[-0.3, 0.55], [0.3, 0.55], [-0.3, -0.55], [0.3, -0.55]]) {
        const piv = new THREE.Group();
        piv.position.set(lx, 0.62, lz);
        piv.add(block(0.24, 0.62, 0.24, c2, 0, -0.31, 0));
        g.add(piv);
        parts.legs.push(piv);
      }
      g.add(block(0.14, 0.14, 0.7, c2, 0, 1.1, -1.0));
      parts.head = head;
      return { group: g, parts, height: 1.8 + (s.neck || 0) };
    }
    if (s.body === 'bird') {
      g.add(block(0.7, 0.7, 0.9, c1, 0, 0.9, 0));
      const head = new THREE.Group();
      head.position.set(0, 1.45, 0.35);
      head.add(block(0.5, 0.5, 0.5, c1, 0, 0, 0));
      head.add(block(0.18, 0.14, 0.3, flatMat(0xffa31a), 0, -0.05, 0.38));
      eyes(head, 0, 0.08, 0.26, 0.13);
      g.add(head);
      parts.wings = [];
      for (const sx of [-1, 1]) {
        const piv = new THREE.Group();
        piv.position.set(sx * 0.35, 1.05, 0);
        piv.add(block(0.9, 0.08, 0.6, c2, sx * 0.45, 0, 0));
        g.add(piv);
        parts.wings.push(piv);
      }
      g.add(block(0.1, 0.5, 0.1, flatMat(0xffa31a), -0.15, 0.3, 0));
      g.add(block(0.1, 0.5, 0.1, flatMat(0xffa31a), 0.15, 0.3, 0));
      return { group: g, parts, height: 1.8 };
    }
    if (s.body === 'bug') {
      g.add(block(0.6, 0.35, 0.8, c1, 0, 0.35, 0));
      const head = block(0.4, 0.3, 0.35, c2, 0, 0.38, 0.5);
      eyes(head, 0, 0.05, 0.18, 0.1);
      g.add(head);
      parts.legs = [];
      for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) {
        const l = block(0.5, 0.06, 0.06, c2, sx * 0.48, 0.25, -0.25 + i * 0.25);
        l.rotation.z = sx * 0.4;
        g.add(l);
        parts.legs.push(l);
      }
      return { group: g, parts, height: 0.8 };
    }
    // sea creature: fish-like body that leaps from the edge
    g.add(block(0.8, 0.8, 1.6, c1, 0, 0.6, 0));
    g.add(block(0.7, 0.3, 1.4, c2, 0, 0.25, 0.05));
    g.add(block(0.1, 0.7, 0.6, c1, 0, 0.7, -1.0));
    eyes(g, 0, 0.75, 0.82, 0.2);
    return { group: g, parts, height: 1.3 };
  }

  update(dt) {
    const s = this.spec;
    this.drops.update(dt);
    for (const m of this.mobs) {
      m.timer -= dt;
      m.cd -= dt;
      m.phase += dt * (3 + s.speed);
      if (m.state === 'dead') continue;
      if (m.state === 'spawn') {
        this.threats.push(m.threat);
        if (m.timer <= 0) {
          this.group.remove(m.warn);
          m.model.group.visible = true;
          m.state = 'go';
          m.timer = rand(0.5, 1.5);
          this.particles.emit({ x: m.x, y: m.y + 0.5, z: m.z, color: [s.color, s.color2, 0xffffff], count: 14, speed: 5, up: 3, size: 0.3, life: 0.6 });
        }
        this.place(m, 0);
        continue;
      }
      const target = this.game.nearestCharacter(m.x, m.z);
      const behave = s.behavior;
      let moving = 0;
      if (behave === 'dive') moving = this.dive(m, target, dt);
      else if (behave === 'charge') moving = this.charge(m, target, dt);
      else if (behave === 'leap') moving = this.leap(m, target, dt);
      else if (behave === 'shoot') moving = this.shoot(m, target, dt);
      else moving = this.chase(m, target, dt);
      // contact damage for swarms and touching anything big
      if ((behave === 'swarm' || s.size >= 2) && m.cd <= 0 && m.state === 'go') {
        for (const c of this.living()) {
          if (Math.hypot(c.pos.x - m.x, c.pos.z - m.z) < 0.7 * s.size + 0.45 && Math.abs(c.pos.y - m.y) < 2 * s.size) {
            this.hit(c, behave === 'swarm' ? s.damage * 0.35 : s.damage, { knock: { x: (c.pos.x - m.x) * 3, y: 4, z: (c.pos.z - m.z) * 3 } });
            m.cd = 0.7;
          }
        }
      }
      if (s.fire && Math.random() < 0.3) this.particles.emit({ x: m.x, y: m.y + 0.6 * s.size, z: m.z, color: [0xff5a1f, 0xffa31a, 0xffe066], count: 1, speed: 1.5, up: 2, size: 0.35, life: 0.5, gravity: -1 });
      m.threat.x = m.x; m.threat.z = m.z;
      this.threats.push(m.threat);
      this.place(m, moving);
    }
  }

  place(m, moving) {
    const s = this.spec, model = m.model;
    model.group.position.set(m.x, m.y, m.z);
    model.group.rotation.y = m.yaw;
    m.tag.position.set(m.x, m.y + (model.height + 0.7) * s.size + Math.sin(m.phase * 0.5) * 0.1, m.z);
    const p = model.parts;
    if (model.human) animateHumanoid(p, m.phase, moving ? 0.7 : 0.05, { zombie: s.zombieArms });
    else if (p.legs) p.legs.forEach((l, i) => { l.rotation.x = Math.sin(m.phase + (i % 2) * Math.PI) * 0.6 * (moving ? 1 : 0.1); });
    if (p.wings) { const f = Math.sin(m.phase * 2.5) * (m.y - groundY(m.x, m.z) > 0.5 ? 0.9 : 0.3); p.wings[0].rotation.z = f; p.wings[1].rotation.z = -f; }
  }

  face(m, tx, tz, dt, rate = 8) { m.yaw = angleLerp(m.yaw, Math.atan2(tx - m.x, tz - m.z), 1 - Math.exp(-rate * dt)); }

  /** Walk after the nearest survivor and bonk them. */
  chase(m, target, dt) {
    const s = this.spec;
    m.y = groundY(m.x, m.z);
    if (!target) return 0;
    const d = Math.hypot(target.pos.x - m.x, target.pos.z - m.z);
    this.face(m, target.pos.x, target.pos.z, dt);
    if (m.state === 'windup') {
      if (m.timer <= 0) {
        if (d < 1.2 * s.size + 1.1 && Math.abs(target.pos.y - m.y) < 2 * s.size) {
          this.hit(target, s.damage, { knock: { x: Math.sin(m.yaw) * 8, y: 5, z: Math.cos(m.yaw) * 8 } });
          this.audio.hurt();
        }
        m.state = 'go';
        m.timer = 0.9;
      }
      return 0;
    }
    const reach = 0.8 * s.size + 0.8;
    if (d > reach) {
      stepToward(m, target.pos.x, target.pos.z, s.speed, dt);
      if (s.size < 2) collideObject(this.island, m, 0.4 * s.size, m.y + 0.5);
      return 1;
    }
    if (m.timer <= 0 && this.spec.behavior !== 'swarm') { m.state = 'windup'; m.timer = 0.45; }
    return 0;
  }

  /** Telegraph a red line, then charge along it (lions, rhinos, horses...). */
  charge(m, target, dt) {
    const s = this.spec;
    m.y = groundY(m.x, m.z);
    if (m.state === 'go') {
      if (!target) return 0;
      this.face(m, target.pos.x, target.pos.z, dt, 4);
      stepToward(m, target.pos.x, target.pos.z, s.speed * 0.5, dt);
      if (m.timer <= 0 && Math.hypot(target.pos.x - m.x, target.pos.z - m.z) < 14) {
        const dx = target.pos.x - m.x, dz = target.pos.z - m.z, d = Math.hypot(dx, dz) || 1;
        m.dir = { x: dx / d, z: dz / d };
        m.yaw = Math.atan2(m.dir.x, m.dir.z);
        m.len = Math.min(d + 5, 18);
        const ex = m.x + m.dir.x * m.len, ez = m.z + m.dir.z * m.len;
        m.strip = warnStrip(this.group, m.x, m.z, ex, ez, 1.6 + s.size);
        m.lineThreats = [0.33, 0.66, 1].map((k) => ({ type: 'avoid', x: m.x + (ex - m.x) * k, z: m.z + (ez - m.z) * k, radius: 1.5 + s.size * 0.5 }));
        m.state = 'aim';
        m.timer = 1.1;
      }
      return 1;
    }
    if (m.state === 'aim') {
      for (const t of m.lineThreats) this.threats.push(t);
      if (m.timer <= 0) { m.state = 'rush'; m.travel = 0; m.hitSet = new Set(); this.audio.roar(1.3); }
      return 0;
    }
    if (m.state === 'rush') {
      for (const t of m.lineThreats) this.threats.push(t);
      const step = (s.speed * 2.6 + 6) * dt;
      m.x += m.dir.x * step; m.z += m.dir.z * step; m.travel += step;
      for (const c of this.living()) {
        if (m.hitSet.has(c)) continue;
        if (Math.hypot(c.pos.x - m.x, c.pos.z - m.z) < 0.9 * s.size + 0.6 && c.pos.y < m.y + 2 * s.size) {
          m.hitSet.add(c);
          this.hit(c, s.damage * 1.3, { knock: { x: m.dir.x * 15, y: 7, z: m.dir.z * 15 } });
        }
      }
      const bumped = s.size < 2 && collideObject(this.island, m, 0.5 * s.size, m.y + 0.5);
      const r = Math.hypot(m.x, m.z);
      if (m.travel >= m.len || bumped || r > this.R - 1.5) {
        if (r > this.R - 1.5) { m.x *= (this.R - 1.5) / r; m.z *= (this.R - 1.5) / r; }
        this.group.remove(m.strip);
        m.state = 'go';
        m.timer = bumped ? 2 : 1.4;
      }
      return 2;
    }
    m.state = 'go';
    return 0;
  }

  /** Fly overhead, then dive-bomb a red circle (eagles, bats, dragons-lite). */
  dive(m, target, dt) {
    const s = this.spec;
    const gy = groundY(m.x, m.z);
    if (m.state === 'go') {
      m.ang = (m.ang ?? Math.random() * 6) + dt * 0.5;
      const cx = target ? target.pos.x : 0, cz = target ? target.pos.z : 0;
      const tx = cx + Math.cos(m.ang) * 7, tz = cz + Math.sin(m.ang) * 7;
      stepToward(m, tx, tz, s.speed * 1.2, dt, this.R + 4);
      m.y += (gy + 7 - m.y) * Math.min(1, dt * 2);
      this.face(m, tx, tz, dt, 4);
      if (m.timer <= 0 && target) {
        m.dv = { x: target.pos.x + target.vel.x * 0.5, z: target.pos.z + target.vel.z * 0.5 };
        if (terrainHeight(m.dv.x, m.dv.z) === -Infinity) { m.timer = 0.5; return 1; }
        m.warn = warnCircle(this.group, m.dv.x, m.dv.z, 1.4 + s.size * 0.6);
        m.diveThreat = { type: 'avoid', x: m.dv.x, z: m.dv.z, radius: 1.6 + s.size * 0.6 };
        m.state = 'aim';
        m.timer = 1.1;
        this.audio.whoosh();
      }
      return 1;
    }
    if (m.state === 'aim' || m.state === 'swoop') {
      this.threats.push(m.diveThreat);
      if (m.state === 'aim') {
        this.face(m, m.dv.x, m.dv.z, dt, 10);
        if (m.timer <= 0) { m.state = 'swoop'; m.from = { x: m.x, y: m.y, z: m.z }; m.k = 0; }
        return 1;
      }
      m.k += dt / 0.45;
      const k = Math.min(1, m.k);
      const ty = groundY(m.dv.x, m.dv.z) + 0.3;
      m.x = m.from.x + (m.dv.x - m.from.x) * k;
      m.z = m.from.z + (m.dv.z - m.from.z) * k;
      m.y = m.from.y + (ty - m.from.y) * k * k;
      if (k >= 1) {
        const r = 1.4 + s.size * 0.6;
        for (const c of this.living()) {
          const d = Math.hypot(c.pos.x - m.x, c.pos.z - m.z);
          if (d < r && c.pos.y < ty + 2.5) this.hit(c, s.damage * 1.4, { knock: { x: ((c.pos.x - m.x) / (d || 1)) * 9, y: 6, z: ((c.pos.z - m.z) / (d || 1)) * 9 } });
        }
        this.particles.emit({ x: m.x, y: ty, z: m.z, color: [s.color, s.color2, 0xffffff], count: 16, speed: 7, up: 3, size: 0.3, life: 0.6 });
        this.group.remove(m.warn);
        m.state = 'go';
        m.timer = rand(1.8, 2.8);
      }
      return 2;
    }
    return 0;
  }

  /** Hop at targets with a landing circle (frogs, kangaroos, sea creatures). */
  leap(m, target, dt) {
    const s = this.spec;
    if (m.state === 'go') {
      m.y = groundY(m.x, m.z);
      if (target) this.face(m, target.pos.x, target.pos.z, dt);
      if (m.timer <= 0 && target) {
        let tx = target.pos.x + target.vel.x * 0.6, tz = target.pos.z + target.vel.z * 0.6;
        const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
        const max = 5 + s.speed;
        if (d > max) { tx = m.x + (dx / d) * max; tz = m.z + (dz / d) * max; }
        const r = Math.hypot(tx, tz);
        if (r > this.R - 2) { tx *= (this.R - 2) / r; tz *= (this.R - 2) / r; }
        m.hop = { sx: m.x, sz: m.z, tx, tz, k: 0 };
        m.warn = warnCircle(this.group, tx, tz, 1.3 + s.size * 0.7);
        m.hopThreat = { type: 'avoid', x: tx, z: tz, radius: 1.5 + s.size * 0.7 };
        m.state = 'crouch';
        m.timer = 0.8;
      }
      return 0;
    }
    this.threats.push(m.hopThreat);
    if (m.state === 'crouch') {
      if (m.timer <= 0) { m.state = 'air'; this.audio.boing(); }
      return 0;
    }
    m.hop.k += dt / 0.75;
    const k = Math.min(1, m.hop.k);
    m.x = m.hop.sx + (m.hop.tx - m.hop.sx) * k;
    m.z = m.hop.sz + (m.hop.tz - m.hop.sz) * k;
    m.y = groundY(m.x, m.z) + Math.sin(k * Math.PI) * (4 + s.size);
    if (k >= 1) {
      const r = 1.3 + s.size * 0.7;
      for (const c of this.living()) {
        const d = Math.hypot(c.pos.x - m.x, c.pos.z - m.z);
        if (d < r && c.pos.y < m.y + 2) this.hit(c, s.damage * 1.3, { knock: { x: ((c.pos.x - m.x) / (d || 1)) * 11, y: 7, z: ((c.pos.z - m.z) / (d || 1)) * 11 } });
      }
      this.particles.emit({ x: m.x, y: m.y + 0.2, z: m.z, color: [s.color, 0x8a5a35], count: 16, speed: 7, up: 3, size: 0.35, life: 0.6 });
      this.game.addShake(0.25, m.x, m.z);
      this.group.remove(m.warn);
      m.state = 'go';
      m.timer = rand(0.8, 1.6);
    }
    return 1;
  }

  /** Keep some distance and lob projectiles at red circles (wizards, robots, aliens...). */
  shoot(m, target, dt) {
    const s = this.spec;
    m.y = groundY(m.x, m.z);
    if (!target) return 0;
    const d = Math.hypot(target.pos.x - m.x, target.pos.z - m.z);
    this.face(m, target.pos.x, target.pos.z, dt);
    let moving = 0;
    if (d > 13) { stepToward(m, target.pos.x, target.pos.z, s.speed, dt); moving = 1; }
    else if (d < 7) {
      const ax = m.x - (target.pos.x - m.x), az = m.z - (target.pos.z - m.z);
      stepToward(m, ax, az, s.speed * 0.7, dt);
      moving = 1;
    }
    if (m.timer <= 0) {
      m.timer = rand(1.8, 2.6);
      const tx = target.pos.x + target.vel.x * 0.7 + rand(-1, 1), tz = target.pos.z + target.vel.z * 0.7 + rand(-1, 1);
      if (terrainHeight(tx, tz) === -Infinity) return moving;
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), new THREE.MeshBasicMaterial({ color: s.shot || s.color2 }));
      this.track(orb.geometry); this.track(orb.material);
      this.audio.laser();
      this.drops.add({
        x: tx, z: tz, from: { x: m.x, y: m.y + 2 * s.size, z: m.z }, time: 1.3, radius: 2, arc: 6, mesh: orb,
        trail: (pos) => Math.random() < 0.5 && this.particles.emit({ x: pos.x, y: pos.y, z: pos.z, color: [s.shot || s.color2, 0xffffff], count: 1, speed: 0.5, size: 0.25, life: 0.4, gravity: 0 }),
        onImpact: (x, y, z) => this.game.explode(x, y, z, 2, s.damage, this, { knock: 7, colors: [s.shot || s.color2, 0xffffff], sound: false }),
      });
    }
    return moving;
  }
}

export default { creature: Creature };
