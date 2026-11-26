import * as THREE from 'three';
import { Hazard } from './base.js';
import { Drops, groundY, shadowCircle } from './common.js';
import { rand, pick, block, flatMat } from '../utils.js';
import { terrainHeight } from '../island.js';

function bananaMesh() {
  const g = new THREE.Group();
  const y = flatMat(0xffe135);
  g.add(block(0.3, 0.25, 0.5, y, 0, 0, 0, false));
  const a = block(0.25, 0.22, 0.45, y, 0, 0.1, 0.4, false);
  a.rotation.x = -0.5;
  g.add(a);
  const b = block(0.25, 0.22, 0.45, y, 0, 0.1, -0.4, false);
  b.rotation.x = 0.5;
  g.add(b);
  g.add(block(0.12, 0.12, 0.12, 0x5c3a21, 0, 0.3, 0.62, false));
  return g;
}

function peelMesh() {
  const g = new THREE.Group();
  const y = flatMat(0xffe135);
  for (let i = 0; i < 4; i++) {
    const p = block(0.22, 0.06, 0.6, y, 0, 0.03, 0, false);
    p.position.set(Math.cos((i * Math.PI) / 2) * 0.25, 0.04, Math.sin((i * Math.PI) / 2) * 0.25);
    p.rotation.y = (i * Math.PI) / 2;
    g.add(p);
  }
  g.add(block(0.3, 0.2, 0.3, y, 0, 0.1, 0, false));
  return g;
}

/** Random spot near a random survivor (or anywhere). */
function spot(h, chance, spread) {
  const living = [...h.living()];
  if (living.length && Math.random() < chance) {
    const c = pick(living);
    const x = c.pos.x + rand(-spread, spread), z = c.pos.z + rand(-spread, spread);
    if (terrainHeight(x, z) > -Infinity) return { x, z };
  }
  return h.island.randomPoint(0, h.R - 2, { avoidHut: false });
}

// ------------------------------------------------------------------ BANANA
export class Banana extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 30;
    this.killVerb = 'slipped on a BANANA';
    this.drops = new Drops(this);
    this.peels = [];
    this.left = 14;
    this.next = 0;
  }

  update(dt) {
    this.next -= dt;
    if (this.left > 0 && this.next <= 0) {
      this.left--;
      this.next = 0.18;
      const p = spot(this, 0.5, 4);
      this.drops.add({
        x: p.x, z: p.z, from: { x: p.x, y: 30, z: p.z }, time: 1.2, radius: 0.9, warn: 'shadow', mesh: bananaMesh(), spin: 6,
        onImpact: (x, y, z) => {
          for (const c of this.living()) if (Math.hypot(c.pos.x - x, c.pos.z - z) < 0.9 && c.pos.y < y + 2.3) this.hit(c, 5);
          const m = peelMesh();
          m.position.set(x, y, z);
          m.rotation.y = Math.random() * 6;
          this.group.add(m);
          this.peels.push({ x, z, y, m, threat: { type: 'avoid', x, z, radius: 0.7 } });
          this.audio.pop();
        },
      });
    }
    this.drops.update(dt);
    for (let i = this.peels.length - 1; i >= 0; i--) {
      const p = this.peels[i];
      this.threats.push(p.threat);
      for (const c of this.living()) {
        if (c.onGround && c.tripped <= 0 && Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < 0.75 && Math.abs(c.pos.y - p.y) < 0.6) {
          let vx = c.vel.x, vz = c.vel.z;
          const l = Math.hypot(vx, vz);
          if (l < 0.5) { const a = Math.random() * 6.28; vx = Math.cos(a); vz = Math.sin(a); } else { vx /= l; vz /= l; }
          c.tripped = 0.9;
          this.hit(c, 4, { knock: { x: vx * 11, y: 5, z: vz * 11 } });
          this.audio.slip();
          this.group.remove(p.m);
          this.peels.splice(i, 1);
          break;
        }
      }
    }
  }
}

// ------------------------------------------------------------------ GIANT BALL
export class GiantBall extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 26;
    this.killVerb = 'got bowled over by a GIANT BALL';
    this.radius = 2.8;
    const geo = new THREE.IcosahedronGeometry(this.radius, 1);
    const cols = [];
    const palette = [0xff3b4f, 0xffffff, 0x3fa9ff, 0xffd23f, 0x3ddc84, 0xffffff].map((c) => new THREE.Color(c));
    const nonIdx = geo.toNonIndexed();
    geo.dispose();
    const pos = nonIdx.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const seg = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 6) % 6;
      for (let k = 0; k < 3; k++) cols.push(palette[seg].r, palette[seg].g, palette[seg].b);
    }
    nonIdx.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    nonIdx.computeVertexNormals();
    this.track(nonIdx);
    const mat = this.track(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.ball = new THREE.Mesh(nonIdx, mat);
    this.ball.castShadow = true;
    this.group.add(this.ball);
    const p = this.island.randomPoint(3, 16);
    this.x = p.x; this.z = p.z;
    this.vx = 0; this.vz = 0;
    this.state = 'drop';
    this.shadow = shadowCircle(this.group, p.x, p.z, this.radius + 1);
    this.threat = { type: 'avoid', x: p.x, z: p.z, radius: this.radius + 2 };
    this.cooldowns = new Map();
    this.audio.whoosh();
  }

  update(dt) {
    this.threat.x = this.x; this.threat.z = this.z;
    this.threats.push(this.threat);
    const gy = groundY(this.x, this.z);
    if (this.state === 'drop') {
      const k = Math.min(1, this.t / 2);
      this.shadow.scale.setScalar(Math.max(0.01, (this.radius + 1) * k));
      this.ball.position.set(this.x, gy + this.radius + 40 * (1 - k * k), this.z);
      if (k >= 1) {
        this.group.remove(this.shadow);
        this.state = 'roll';
        this.game.explode(this.x, gy, this.z, this.radius + 1.5, 25, this, { knock: 13, colors: [0xff3b4f, 0x3fa9ff, 0xffd23f] });
        this.audio.boing();
        const c = this.game.nearestCharacter(this.x, this.z);
        const a = c ? Math.atan2(c.pos.z - this.z, c.pos.x - this.x) : Math.random() * 6.28;
        this.vx = Math.cos(a) * 7; this.vz = Math.sin(a) * 7;
      }
      return;
    }
    const c = this.game.nearestCharacter(this.x, this.z);
    if (c) {
      const dx = c.pos.x - this.x, dz = c.pos.z - this.z, d = Math.hypot(dx, dz) || 1;
      this.vx += (dx / d) * 3 * dt; this.vz += (dz / d) * 3 * dt;
    }
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 9) { this.vx *= 9 / sp; this.vz *= 9 / sp; }
    this.x += this.vx * dt; this.z += this.vz * dt;
    const r = Math.hypot(this.x, this.z), lim = this.R - this.radius - 0.5;
    if (r > lim) {
      const nx = this.x / r, nz = this.z / r;
      const vn = this.vx * nx + this.vz * nz;
      if (vn > 0) { this.vx -= 2 * vn * nx; this.vz -= 2 * vn * nz; this.audio.boing(); }
      this.x = nx * lim; this.z = nz * lim;
    }
    const s = Math.hypot(this.vx, this.vz);
    if (s > 0.01) this.ball.rotateOnWorldAxis(new THREE.Vector3(this.vz / s, 0, -this.vx / s), (s * dt) / this.radius);
    const bounce = Math.abs(Math.sin(this.t * 2.2)) * 0.6;
    this.ball.position.set(this.x, gy + this.radius + bounce, this.z);
    for (const ch of this.living()) {
      const dx = ch.pos.x - this.x, dz = ch.pos.z - this.z, d = Math.hypot(dx, dz);
      if (d < this.radius + 0.5 && ch.pos.y < gy + this.radius * 2 && (this.cooldowns.get(ch) || 0) < this.game.time) {
        this.cooldowns.set(ch, this.game.time + 1);
        const nx = dx / (d || 1), nz = dz / (d || 1);
        this.hit(ch, 20, { knock: { x: nx * 12 + this.vx, y: 8, z: nz * 12 + this.vz } });
        this.audio.boing();
      }
    }
  }
}

// ------------------------------------------------------------------ TACOS
const shellGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.28, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
export class Tacos extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 18;
    this.killVerb = 'was buried in TACOS';
    this.drops = new Drops(this);
    this.tacos = [];
    this.next = 0;
    this.track(shellGeo);
  }

  tacoMesh() {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(shellGeo, flatMat(0xf2c14e));
    shell.rotation.y = Math.PI / 2;
    g.add(shell);
    g.add(block(0.5, 0.12, 0.2, 0x5aa43a, 0, 0.42, 0, false));
    g.add(block(0.45, 0.1, 0.15, 0x7b3f1f, 0, 0.34, 0, false));
    return g;
  }

  update(dt) {
    this.next -= dt;
    if (this.t < 11 && this.next <= 0) {
      this.next = 0.22;
      const p = spot(this, 0.35, 5);
      this.drops.add({
        x: p.x, z: p.z, from: { x: p.x, y: 26, z: p.z }, time: 1.0, radius: 0.8, warn: 'shadow', mesh: this.tacoMesh(), spin: 5, threat: false,
        onImpact: (x, y, z) => {
          for (const c of this.living()) if (Math.hypot(c.pos.x - x, c.pos.z - z) < 0.9 && c.pos.y < y + 2.3) this.hit(c, 6, { knock: { x: rand(-3, 3), y: 3, z: rand(-3, 3) } });
          if (this.tacos.length < 25) {
            const m = this.tacoMesh();
            m.position.set(x, y + 0.25, z);
            m.rotation.y = Math.random() * 6;
            this.group.add(m);
            this.tacos.push({ x, z, y, m, threat: { type: 'seek', x, z, lowHpOnly: true } });
          }
        },
      });
    }
    this.drops.update(dt);
    for (let i = this.tacos.length - 1; i >= 0; i--) {
      const t = this.tacos[i];
      this.threats.push(t.threat);
      for (const c of this.living()) {
        if (c.hp < 100 && Math.hypot(c.pos.x - t.x, c.pos.z - t.z) < 1 && Math.abs(c.pos.y - t.y) < 1.5) {
          c.hp = Math.min(100, c.hp + 8);
          this.game.notify(c, '🌮 Yum! +8 HP', 'eat');
          this.particles.burst(t.x, t.y + 0.3, t.z, [0xf2c14e, 0x5aa43a], 8, 3, 0.2, 0.5);
          this.group.remove(t.m);
          this.tacos.splice(i, 1);
          break;
        }
      }
    }
  }
}

// ------------------------------------------------------------------ TRAMPOLINE
export class Trampoline extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 40;
    this.killVerb = 'bounced off the island on a TRAMPOLINE';
    this.pads = [];
    for (let i = 0; i < 4; i++) {
      const p = this.island.randomPoint(4, 20, { avoidHill: true });
      if (this.pads.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 4)) continue;
      const base = groundY(p.x, p.z, 1.6);
      const g = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.15, 6, 16), flatMat(0x3fa9ff));
      this.track(frame.geometry);
      frame.rotation.x = Math.PI / 2;
      frame.position.y = 0.55;
      g.add(frame);
      const mat = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.08, 16), flatMat(0x1b1530));
      this.track(mat.geometry);
      mat.position.y = 0.55;
      g.add(mat);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        g.add(block(0.15, 0.55, 0.15, 0x888888, Math.cos(a) * 1.4, 0.27, Math.sin(a) * 1.4));
      }
      g.position.set(p.x, base, p.z);
      g.scale.setScalar(0.01);
      this.group.add(g);
      const col = this.addCollider({ type: 'circle', x: p.x, z: p.z, r: 1.55, bottom: base - 1, top: base + 0.6 });
      this.pads.push({ x: p.x, z: p.z, top: base + 0.6, g, mat, col, squash: 0 });
    }
    this.audio.boing();
  }

  update(dt) {
    const grow = Math.min(1, this.t / 0.6);
    for (const p of this.pads) {
      p.g.scale.setScalar(Math.max(0.01, grow));
      p.squash = Math.max(0, p.squash - dt * 4);
      p.mat.scale.y = 1 - p.squash * 0.8;
      p.mat.position.y = 0.55 - p.squash * 0.3;
      for (const c of this.living()) {
        if (c.onGround && Math.abs(c.pos.y - p.top) < 0.15 && Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < 1.6) {
          c.vel.y = 21;
          c.onGround = false;
          c.knock(rand(-3, 3), 0, rand(-3, 3));
          p.squash = 1;
          this.audio.boing();
          this.particles.burst(p.x, p.top, p.z, [0xffd23f, 0x3fa9ff], 6, 4, 0.2, 0.4);
        }
      }
    }
  }
}

export default { banana: Banana, ball: GiantBall, tacos: Tacos, trampoline: Trampoline };
