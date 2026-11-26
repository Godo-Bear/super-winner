import * as THREE from 'three';
import { Hazard } from './base.js';
import { Drops, warnCircle, stepToward, groundY } from './common.js';
import { hashString, mulberry32, makeTextSprite, boxGeo, flatMat, rand, pick } from '../utils.js';
import { terrainHeight } from '../island.js';

const BEHAVIORS = ['chase', 'jump', 'explode', 'shoot'];
const BEHAVIOR_HINTS = {
  chase: 'It chases you. Keep running!',
  jump: 'It hops at you. Watch the circles!',
  explode: 'It EXPLODES when close. Run!',
  shoot: 'It spits goo. Dodge the circles!',
};
const blobGeos = [new THREE.IcosahedronGeometry(1, 0), new THREE.IcosahedronGeometry(1, 1), new THREE.DodecahedronGeometry(1, 0), new THREE.OctahedronGeometry(1, 1)];
const spikeGeo = new THREE.ConeGeometry(0.25, 0.7, 5);
const gooGeo = new THREE.IcosahedronGeometry(0.45, 0);

/** Derives a creature from the word. Same word → same creature, always. */
export function blobRecipe(word) {
  const rng = mulberry32(hashString(word.toLowerCase()));
  const behavior = BEHAVIORS[Math.floor(rng() * BEHAVIORS.length)];
  const size = 0.7 + rng() * 2.1;
  const speed = (2.6 + rng() * 4) * (1.25 - size * 0.12);
  const hue = rng();
  const count = size > 2 ? 1 : 1 + Math.floor(rng() * 3);
  return {
    behavior, size, speed, count, hue,
    color: new THREE.Color().setHSL(hue, 0.7, 0.55).getHex(),
    eyes: 1 + Math.floor(rng() * 3),
    spikes: rng() < 0.4,
    shape: Math.floor(rng() * blobGeos.length),
    wobble: 0.5 + rng() * 2,
  };
}

/**
 * Any word not in the dictionary becomes a Mystery Blob.
 */
export class MysteryBlob extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    const r = (this.recipe = blobRecipe(this.word));
    this.duration = 30;
    this.hint = `🫧 Mystery Blob! ${BEHAVIOR_HINTS[r.behavior]}`;
    this.killVerb = `was blobbed by "${this.word.toUpperCase()}"`;
    this.mat = this.track(new THREE.MeshLambertMaterial({ color: r.color, flatShading: true, emissive: 0x000000 }));
    this.drops = new Drops(this);
    this.blobs = [];
    for (let i = 0; i < r.count; i++) this.spawnBlob();
    this.audio.bubble();
  }

  spawnBlob(existing = null) {
    const p = this.island.randomPoint(4, this.R - 6);
    const b = existing || { mesh: this.makeMesh(), cd: 0, phase: Math.random() * 6 };
    b.x = p.x; b.z = p.z; b.y = groundY(p.x, p.z);
    b.state = 'rising';
    b.timer = 2;
    b.vy = 0;
    b.mesh.visible = true;
    b.mesh.scale.setScalar(0.01);
    b.mesh.position.set(b.x, b.y, b.z);
    b.warn = warnCircle(this.group, b.x, b.z, this.recipe.size + 1);
    b.threat = { type: 'avoid', x: b.x, z: b.z, radius: this.recipe.size + 2 };
    if (!existing) this.blobs.push(b);
  }

  makeMesh() {
    const r = this.recipe;
    const g = new THREE.Group();
    const body = new THREE.Mesh(blobGeos[r.shape], this.mat);
    body.castShadow = true;
    body.position.y = 1;
    g.add(body);
    const eyeW = flatMat(0xffffff), eyeB = flatMat(0x111111);
    for (let i = 0; i < r.eyes; i++) {
      const ox = r.eyes === 1 ? 0 : (i / (r.eyes - 1) - 0.5) * 0.8;
      const e = new THREE.Mesh(boxGeo(0.3, 0.34, 0.1), eyeW);
      e.position.set(ox, 1.25, 0.88);
      const pupil = new THREE.Mesh(boxGeo(0.14, 0.16, 0.06), eyeB);
      pupil.position.z = 0.06;
      e.add(pupil);
      g.add(e);
    }
    if (r.spikes) {
      for (let i = 0; i < 6; i++) {
        const s = new THREE.Mesh(spikeGeo, this.mat);
        const a = (i / 6) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.75, 1.55, Math.sin(a) * 0.75);
        s.lookAt(Math.cos(a) * 3, 3.5, Math.sin(a) * 3);
        s.rotateX(Math.PI / 2);
        g.add(s);
      }
    }
    const label = makeTextSprite(this.word.toUpperCase(), { color: '#e9dcff', fontSize: 54, height: 0.6 });
    label.position.y = 2.6;
    label.userData.counterScale = true;
    g.add(label);
    g.userData.body = body;
    g.userData.label = label;
    this.group.add(g);
    return g;
  }

  update(dt) {
    const r = this.recipe;
    this.drops.update(dt);
    for (const b of this.blobs) {
      b.phase += dt * r.wobble * 3;
      b.cd -= dt;
      b.timer -= dt;
      const body = b.mesh.userData.body;
      if (b.state === 'dead') {
        if (b.timer <= 0) this.spawnBlob(b);
        continue;
      }
      if (b.state === 'rising') {
        const k = 1 - Math.max(0, b.timer) / 2;
        b.mesh.scale.setScalar(Math.max(0.01, r.size * k));
        if (Math.random() < 0.3) this.particles.emit({ x: b.x, y: b.y + 0.2, z: b.z, color: r.color, count: 1, speed: 3, up: 4, size: 0.3, life: 0.6 });
        this.threats.push(b.threat);
        if (b.timer <= 0) {
          b.state = 'active';
          b.timer = 1;
          this.group.remove(b.warn);
          b.warn = null;
          this.audio.bubble();
        }
        b.mesh.position.set(b.x, b.y, b.z);
        continue;
      }
      // ---- active ----
      const target = this.game.nearestCharacter(b.x, b.z);
      const s = r.size;
      if (r.behavior === 'chase') this.chase(b, target, dt);
      else if (r.behavior === 'jump') this.hop(b, target, dt);
      else if (r.behavior === 'explode') this.fuse(b, target, dt);
      else this.shoot(b, target, dt);

      // contact damage for everyone touching the blob
      if (b.state !== 'fusing' && b.cd <= 0) {
        for (const c of this.living()) {
          const d = Math.hypot(c.pos.x - b.x, c.pos.z - b.z);
          if (d < s * 0.9 + 0.5 && Math.abs(c.pos.y - b.y) < s * 1.6 + 1) {
            const nx = (c.pos.x - b.x) / (d || 1), nz = (c.pos.z - b.z) / (d || 1);
            this.hit(c, 12 + s * 4, { knock: { x: nx * 9, y: 5, z: nz * 9 } });
            b.cd = 0.8;
          }
        }
      }
      if (target) b.mesh.rotation.y = Math.atan2(target.pos.x - b.x, target.pos.z - b.z);
      const squish = 1 + Math.sin(b.phase) * 0.08;
      if (b.state !== 'fusing') b.mesh.scale.set(s / squish, s * squish, s / squish);
      body.position.y = 1;
      b.mesh.position.set(b.x, b.y, b.z);
      b.threat.x = b.x; b.threat.z = b.z;
      this.threats.push(b.threat);
    }
  }

  chase(b, target, dt) {
    if (!target) return;
    stepToward(b, target.pos.x, target.pos.z, this.recipe.speed, dt);
    b.y = groundY(b.x, b.z) + Math.abs(Math.sin(b.phase)) * 0.3;
  }

  hop(b, target, dt) {
    const r = this.recipe;
    if (b.state === 'active') {
      b.y = groundY(b.x, b.z);
      if (b.timer <= 0 && target) {
        let tx = target.pos.x, tz = target.pos.z;
        const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
        const maxHop = 6 + r.speed;
        if (d > maxHop) { tx = b.x + (dx / d) * maxHop; tz = b.z + (dz / d) * maxHop; }
        const rr = Math.hypot(tx, tz);
        if (rr > this.R - 2) { tx *= (this.R - 2) / rr; tz *= (this.R - 2) / rr; }
        b.state = 'crouch';
        b.timer = 0.9;
        b.hop = { sx: b.x, sz: b.z, tx, tz, t: 0 };
        b.warn = warnCircle(this.group, tx, tz, r.size * 1.3 + 1.2);
        b.hopThreat = { type: 'avoid', x: tx, z: tz, radius: r.size * 1.3 + 1.2 };
      }
    } else if (b.state === 'crouch') {
      this.threats.push(b.hopThreat);
      b.mesh.scale.set(r.size * 1.2, r.size * 0.7, r.size * 1.2);
      if (b.timer <= 0) { b.state = 'air'; this.audio.boing(); }
    } else if (b.state === 'air') {
      this.threats.push(b.hopThreat);
      const h = b.hop;
      h.t += dt / 0.7;
      const k = Math.min(1, h.t);
      b.x = h.sx + (h.tx - h.sx) * k;
      b.z = h.sz + (h.tz - h.sz) * k;
      b.y = groundY(b.x, b.z) + Math.sin(k * Math.PI) * (4 + r.size);
      if (k >= 1) {
        b.state = 'active';
        b.timer = rand(0.6, 1.4);
        this.group.remove(b.warn);
        b.warn = null;
        const rad = r.size * 1.3 + 1.2;
        for (const c of this.living()) {
          const d = Math.hypot(c.pos.x - b.x, c.pos.z - b.z);
          if (d < rad && c.pos.y < b.y + 2) {
            this.hit(c, 30, { knock: { x: ((c.pos.x - b.x) / (d || 1)) * 12, y: 7, z: ((c.pos.z - b.z) / (d || 1)) * 12 } });
          }
        }
        this.particles.emit({ x: b.x, y: b.y + 0.2, z: b.z, color: r.color, count: 20, speed: 8, up: 3, size: 0.4, life: 0.7 });
        this.game.addShake(0.3, b.x, b.z);
        this.audio.land();
      }
    }
  }

  fuse(b, target, dt) {
    const r = this.recipe;
    if (b.state === 'active') {
      if (target) stepToward(b, target.pos.x, target.pos.z, r.speed * 0.85, dt);
      b.y = groundY(b.x, b.z);
      if (target && Math.hypot(target.pos.x - b.x, target.pos.z - b.z) < 3.5 && b.timer <= 0) {
        b.state = 'fusing';
        b.timer = 1.4;
        b.warn = warnCircle(this.group, b.x, b.z, 4.5);
        b.fuseThreat = { type: 'avoid', x: b.x, z: b.z, radius: 4.5 };
        this.audio.warn();
      }
    } else if (b.state === 'fusing') {
      this.threats.push(b.fuseThreat);
      const k = 1 - b.timer / 1.4;
      const pulse = 1 + k * 0.6 + Math.sin(this.t * 30) * 0.08 * k;
      b.mesh.scale.setScalar(r.size * pulse);
      this.mat.emissive.setRGB(Math.sin(this.t * 25) > 0 ? k : 0, 0, 0);
      if (b.timer <= 0) {
        this.mat.emissive.setRGB(0, 0, 0);
        this.group.remove(b.warn);
        b.warn = null;
        this.game.explode(b.x, b.y + 0.5, b.z, 4.5, 55, this, { colors: [r.color, 0xffffff, 0xffe066] });
        b.state = 'dead';
        b.mesh.visible = false;
        b.timer = 3;
      }
    }
  }

  shoot(b, target, dt) {
    const r = this.recipe;
    b.y = groundY(b.x, b.z);
    if (!b.wander || Math.hypot(b.wander.x - b.x, b.wander.z - b.z) < 1) b.wander = this.island.randomPoint(2, this.R - 6);
    stepToward(b, b.wander.x, b.wander.z, r.speed * 0.3, dt);
    if (b.timer <= 0) {
      b.timer = 2.2;
      const targets = [...this.living()].filter((c) => Math.hypot(c.pos.x - b.x, c.pos.z - b.z) < 26);
      const t = targets.length ? pick(targets) : target;
      if (!t) return;
      const tx = t.pos.x + t.vel.x * 0.6 + rand(-1, 1), tz = t.pos.z + t.vel.z * 0.6 + rand(-1, 1);
      if (terrainHeight(tx, tz) === -Infinity) return;
      const goo = new THREE.Mesh(gooGeo, this.mat);
      this.audio.pop();
      this.drops.add({
        x: tx, z: tz, from: { x: b.x, y: b.y + r.size * 2, z: b.z }, time: 1.3, radius: 2, mesh: goo, arc: 8,
        onImpact: (x, y, z) => {
          for (const c of this.living()) {
            const d = Math.hypot(c.pos.x - x, c.pos.z - z);
            if (d < 2 && c.pos.y < y + 2.5) this.hit(c, 25, { knock: { x: 0, y: 5, z: 0 } });
          }
          this.particles.emit({ x, y: y + 0.3, z, color: r.color, count: 16, speed: 6, up: 3, size: 0.35, life: 0.7 });
          this.audio.bubble();
        },
      });
    }
  }
}

export default { mystery: MysteryBlob };
