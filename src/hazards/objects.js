import * as THREE from 'three';
import { Hazard } from './base.js';
import { Drops, warnStrip, groundY } from './common.js';
import { rand, pick, block, flatMat, makeTextSprite } from '../utils.js';
import { terrainHeight } from '../island.js';

/**
 * "It's raining <thing>!" — pianos, anvils, toilets, pizza, money, hearts...
 * Everything is drawn as a big emoji so any object word is recognisable.
 *
 * spec: icon, size, damage, rate (seconds between drops), total, radius,
 *       land: 'gone' | 'food' (heals when eaten) | 'coin' (gives coins) | 'heart' (heals) ,
 *       heavy (bigger boom), bounce (bounces away after landing)
 */
export class ObjectRain extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    const s = (this.spec = { size: 1.6, damage: 25, rate: 0.35, total: 24, radius: 1.4, land: 'gone', ...opts.spec });
    this.icon = s.icon;
    this.label = s.label || this.label;
    this.hint = s.land === 'food' ? `${s.icon} Dodge it, then EAT it!` : s.land === 'coin' ? `${s.icon} Grab the coins!` : s.land === 'heart' ? `${s.icon} Grab them to heal!` : `${s.icon} Watch for shadows!`;
    this.killVerb = `got flattened by ${/^[aeiou]/i.test(this.label) ? 'an' : 'a'} ${this.label.toUpperCase()}`;
    this.duration = s.total * s.rate + 14;
    this.drops = new Drops(this);
    // one shared emoji texture for every falling copy
    this.proto = makeTextSprite(s.icon, { fontSize: 110, height: s.size, stroke: '#ffffff' });
    this.mat = this.proto.material;
    this.track({ dispose: () => this.proto.userData.dispose() });
    this.left = s.total;
    this.next = 0.4;
    this.items = [];
    this.audio.whoosh();
  }

  sprite() {
    const sp = new THREE.Sprite(this.mat);
    sp.scale.copy(this.proto.scale);
    return sp;
  }

  update(dt) {
    const s = this.spec;
    this.next -= dt;
    if (this.left > 0 && this.next <= 0) {
      this.left--;
      this.next = s.rate * rand(0.6, 1.4);
      const living = [...this.living()];
      let p;
      if (living.length && Math.random() < (s.land === 'gone' ? 0.6 : 0.3)) {
        const c = pick(living);
        p = { x: c.pos.x + c.vel.x * 0.6 + rand(-2.5, 2.5), z: c.pos.z + c.vel.z * 0.6 + rand(-2.5, 2.5) };
        if (terrainHeight(p.x, p.z) === -Infinity) p = null;
      }
      if (!p) p = this.island.randomPoint(0, this.R - 2, { avoidHut: false });
      this.drops.add({
        x: p.x, z: p.z, from: { x: p.x + rand(-2, 2), y: 32, z: p.z + rand(-2, 2) }, time: s.heavy ? 1.6 : 1.3,
        radius: s.radius, warn: 'shadow', mesh: this.sprite(), spin: 0,
        onImpact: (x, y, z) => this.land(x, y, z),
      });
    }
    this.drops.update(dt);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.mesh.position.y = it.y + this.spec.size * 0.3 + Math.abs(Math.sin(it.t * 3)) * 0.15;
      if (it.threat) this.threats.push(it.threat);
      let taken = false;
      for (const c of this.living()) {
        if (Math.hypot(c.pos.x - it.x, c.pos.z - it.z) > 1.1 || Math.abs(c.pos.y - it.y) > 1.6) continue;
        if (s.land === 'coin') {
          if (c.isPlayer || c.remote) this.game.giveCoins(c, 1, `${s.icon}`);
          taken = true;
        } else if (c.hp < 100) {
          c.hp = Math.min(100, c.hp + (s.land === 'heart' ? 15 : 8));
          this.game.notify(c, `${s.icon} +${s.land === 'heart' ? 15 : 8} HP`, 'eat');
          taken = true;
        }
        if (taken) break;
      }
      if (taken || it.t > 20) {
        this.particles.burst(it.x, it.y + 0.4, it.z, [0xffe066, 0xffffff], 8, 3, 0.2, 0.5);
        this.group.remove(it.mesh);
        this.items.splice(i, 1);
      }
    }
  }

  land(x, y, z) {
    const s = this.spec;
    if (s.damage > 0) {
      for (const c of this.living()) {
        const d = Math.hypot(c.pos.x - x, c.pos.z - z);
        if (d < s.radius && c.pos.y < y + 2.5) this.hit(c, s.damage, { knock: { x: ((c.pos.x - x) / (d || 1)) * 6, y: 5, z: ((c.pos.z - z) / (d || 1)) * 6 } });
      }
    }
    this.particles.emit({ x, y: y + 0.3, z, color: [0xffffff, 0xdddddd, 0x8a5a35], count: s.heavy ? 26 : 10, speed: s.heavy ? 8 : 4, up: 3, size: 0.35, life: 0.6 });
    if (s.heavy) { this.audio.explosion(0.8); this.game.addShake(0.5, x, z); } else this.audio.pop();
    if (s.land !== 'gone' && this.items.length < 25) {
      const m = this.sprite();
      m.scale.multiplyScalar(0.6);
      m.position.set(x, y, z);
      this.group.add(m);
      this.items.push({ x, y, z, t: 0, mesh: m, threat: s.land === 'food' ? { type: 'seek', x, z, lowHpOnly: true } : { type: 'seek', x, z } });
    }
  }
}

/** Blocky vehicle model (also used when a Writer drives one "for me"). */
export function makeVehicleModel(s) {
  const g = new THREE.Group();
  const body = flatMat(s.color), dark = flatMat(0x222222), glass = flatMat(0xa8e0ff);
  const len = s.kind === 'bus' ? 5.5 : s.kind === 'truck' ? 4.6 : s.kind === 'bike' ? 1.8 : s.kind === 'train' ? 5 : 3.6;
  const w = s.kind === 'bike' ? 0.6 : 2;
  const cars = s.kind === 'train' ? 4 : 1;
  for (let k = 0; k < cars; k++) {
    const z0 = -k * (len + 0.4);
    g.add(block(w, s.kind === 'bike' ? 0.6 : 1.1, len, k === 0 ? body : flatMat(k % 2 ? 0x3d5a80 : s.color), 0, 0.85, z0));
    // when someone is driving it ("for me"), leave the top open so you can see them
    if (k === 0 && s.kind !== 'bike' && !s.ridden) g.add(block(w * 0.9, 0.8, len * 0.45, glass, 0, 1.75, z0 + (s.kind === 'bus' || s.kind === 'train' ? 0 : -0.2)));
    if (s.kind === 'tank' && k === 0) {
      if (!s.ridden) g.add(block(1.4, 0.6, 1.6, body, 0, 1.75, z0));
      g.add(block(0.3, 0.3, 2.4, dark, 0, s.ridden ? 1.45 : 1.8, z0 + 1.7));
    }
    for (const zz of [len / 2 - 0.6, -len / 2 + 0.6]) for (const sx of [-1, 1]) g.add(block(0.3, 0.7, 0.7, dark, sx * (w / 2 + 0.05), 0.35, z0 + zz));
  }
  g.add(block(0.3, 0.2, 0.1, flatMat(0xffe066), -w / 3, 1, len / 2));
  g.add(block(0.3, 0.2, 0.1, flatMat(0xffe066), w / 3, 1, len / 2));
  if (!s.ridden) {
    const tag = makeTextSprite(s.icon, { fontSize: 80, height: 1.2, stroke: '#ffffff' });
    tag.position.y = 3.2;
    g.add(tag);
  }
  g.userData.length = cars * (len + 0.4);
  return g;
}


/**
 * Vehicles race across the island along red lanes: cars, buses, trains, tanks...
 * spec: icon, color, kind ('car'|'truck'|'bus'|'train'|'bike'|'tank'), speed, lanes, damage
 */
export class VehicleRush extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    const s = (this.spec = { color: 0xe63946, kind: 'car', speed: 22, lanes: 4, damage: 40, ...opts.spec });
    this.icon = s.icon;
    this.label = s.label || this.label;
    this.hint = `${s.icon} Get out of the red lanes!`;
    this.killVerb = `got run over by ${/^[aeiou]/i.test(this.label) ? 'an' : 'a'} ${this.label.toUpperCase()}`;
    this.duration = s.lanes * 3.2 + 6;
    this.runs = [];
    this.next = 0.2;
    this.left = s.lanes;
  }

  buildVehicle() { return makeVehicleModel(this.spec); }

  startRun() {
    const living = [...this.living()];
    const c = living.length ? pick(living) : null;
    const p = c ? { x: c.pos.x, z: c.pos.z } : this.island.randomPoint(0, 15);
    const a = Math.random() * Math.PI * 2;
    const dir = { x: Math.cos(a), z: Math.sin(a) };
    const along = p.x * dir.x + p.z * dir.z;
    const ox = p.x - dir.x * along, oz = p.z - dir.z * along;
    const L = this.R + 8;
    const run = { dir, ox, oz, s: -L - 10, t: 0, hitSet: new Set(), threats: [] };
    run.strip = warnStrip(this.group, ox - dir.x * L, oz - dir.z * L, ox + dir.x * L, oz + dir.z * L, 3.2);
    for (let k = -L; k <= L; k += 3) run.threats.push({ type: 'avoid', x: ox + dir.x * k, z: oz + dir.z * k, radius: 2.4 });
    run.mesh = this.buildVehicle();
    run.mesh.visible = false;
    run.mesh.rotation.y = Math.atan2(dir.x, dir.z);
    this.group.add(run.mesh);
    this.runs.push(run);
    this.audio.tone({ freq: 440, type: 'square', dur: 0.25, vol: 0.12 });
    this.audio.tone({ freq: 350, type: 'square', dur: 0.35, vol: 0.12, delay: 0.3 });
  }

  update(dt) {
    const s = this.spec;
    this.next -= dt;
    if (this.left > 0 && this.next <= 0) { this.left--; this.next = 3; this.startRun(); }
    for (const run of this.runs) {
      if (run.done) continue;
      run.t += dt;
      for (const th of run.threats) this.threats.push(th);
      if (run.t < 1.6) continue;
      run.s += s.speed * dt;
      const x = run.ox + run.dir.x * run.s, z = run.oz + run.dir.z * run.s;
      const gy = Math.max(0, terrainHeight(x, z) === -Infinity ? -0.3 : groundY(x, z));
      run.mesh.visible = true;
      run.mesh.position.set(x, gy, z);
      const len = run.mesh.userData.length;
      for (const c of this.living()) {
        if (run.hitSet.has(c)) continue;
        const rx = c.pos.x - run.ox, rz = c.pos.z - run.oz;
        const along = rx * run.dir.x + rz * run.dir.z;
        const side = Math.abs(-rx * run.dir.z + rz * run.dir.x);
        if (side < 1.5 && along < run.s + 2 && along > run.s - len && c.pos.y < gy + 2.5) {
          run.hitSet.add(c);
          this.hit(c, s.damage, { knock: { x: run.dir.x * 18, y: 8, z: run.dir.z * 18 } });
          this.audio.explosion(0.4);
        }
      }
      if (Math.random() < 0.3) this.particles.emit({ x, y: gy + 0.3, z, color: [0xbbbbbb, 0x8a5a35], count: 1, speed: 1, up: 1, size: 0.4, life: 0.5, gravity: -1 });
      if (run.s > this.R + 12 + len) { run.done = true; this.group.remove(run.strip); this.group.remove(run.mesh); }
    }
  }
}

export default { objectrain: ObjectRain, vehicle: VehicleRush };
