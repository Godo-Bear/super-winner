import * as THREE from 'three';
import { Hazard } from './base.js';
import { warnCircle, groundY, stormClouds, Precipitation } from './common.js';
import { rand, pick } from '../utils.js';
import { terrainHeight } from '../island.js';

const STORM_SKY = new THREE.Color(0x6b7385);
const STORM_FOG = new THREE.Color(0x8a93a3);
const ACID_SKY = new THREE.Color(0x8fbf6a);
const ACID_FOG = new THREE.Color(0x9fc48a);
const SNOW_FOG = new THREE.Color(0xeef4ff);
const boltMat = new THREE.LineBasicMaterial({ color: 0xfffbd0 });

/** Fades storm clouds in and out with the hazard lifetime. */
function fadeClouds(h, clouds, max = 0.85) {
  const k = Math.min(1, h.t / 2, Math.max(0, h.duration - h.t) / 2);
  clouds.userData.mat.opacity = max * k;
  clouds.rotation.y += 0.01 * (1 / 60);
  return k;
}

// ------------------------------------------------------------------ LIGHTNING
export class Lightning extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 15;
    this.killVerb = 'got zapped by LIGHTNING';
    this.clouds = stormClouds(this.group);
    this.next = 2;
    this.strikes = [];
    this.audio.thunder();
  }

  update(dt) {
    const k = fadeClouds(this, this.clouds);
    const e = this.game.env;
    e.skyTint = STORM_SKY; e.fogColor = STORM_FOG; e.light = Math.min(e.light, 1 - 0.4 * k);
    this.next -= dt;
    if (this.next <= 0 && this.t < this.duration - 2) {
      this.next = rand(0.7, 1.2);
      const living = [...this.living()];
      let x, z;
      if (living.length && Math.random() < 0.8) {
        const c = pick(living);
        const a = Math.random() * 6.28, r = rand(0, 2.5);
        x = c.pos.x + Math.cos(a) * r; z = c.pos.z + Math.sin(a) * r;
      } else ({ x, z } = this.island.randomPoint(0, this.R - 2, { avoidHut: false }));
      if (terrainHeight(x, z) > -Infinity) {
        this.strikes.push({ x, z, t: 0, warn: warnCircle(this.group, x, z, 2.6, { color: 'yellow' }), threat: { type: 'avoid', x, z, radius: 2.6 } });
        this.audio.warn();
      }
    }
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t += dt;
      if (!s.bolt) this.threats.push(s.threat);
      if (s.t > 1.3 && !s.bolt) this.strike(s);
      if (s.bolt && s.t > 1.55) {
        this.group.remove(s.bolt);
        s.bolt.geometry.dispose();
        this.strikes.splice(i, 1);
      }
    }
  }

  strike(s) {
    this.group.remove(s.warn);
    const gy = groundY(s.x, s.z);
    const pts = [];
    let x = s.x + rand(-4, 4), z = s.z + rand(-4, 4);
    for (let y = 28; y > gy; y -= 2.5) {
      pts.push(new THREE.Vector3(x, y, z));
      x += (s.x - x) * 0.35 + rand(-0.8, 0.8);
      z += (s.z - z) * 0.35 + rand(-0.8, 0.8);
    }
    pts.push(new THREE.Vector3(s.x, gy, s.z));
    s.bolt = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), boltMat);
    this.group.add(s.bolt);
    for (const c of this.living()) {
      if (Math.hypot(c.pos.x - s.x, c.pos.z - s.z) < 2.6 && !this.island.isSheltered(c.pos)) {
        this.hit(c, 45, { knock: { x: rand(-3, 3), y: 7, z: rand(-3, 3) } });
      }
    }
    this.particles.emit({ x: s.x, y: gy + 0.4, z: s.z, color: [0xffffff, 0xfff04a, 0x9fd8ff], count: 22, speed: 9, up: 5, size: 0.35, life: 0.6 });
    this.audio.zap();
    this.game.ui.flash('#e8f0ff', 0.35, 250);
    this.game.addShake(0.5, s.x, s.z);
  }
}

// ------------------------------------------------------------------ RAIN
export class Rain extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 26;
    this.killVerb = 'slipped off the island in the RAIN';
    this.clouds = stormClouds(this.group, 0x7a8290);
    this.rain = new Precipitation(this, { count: 1600, color: 0xa9cfff, speed: 34, size: 0.16 });
    this.thunderT = rand(4, 8);
  }

  update(dt) {
    const k = fadeClouds(this, this.clouds, 0.7);
    const e = this.game.env;
    e.skyTint = STORM_SKY; e.fogColor = STORM_FOG; e.light = Math.min(e.light, 1 - 0.3 * k);
    e.fogFar = Math.min(e.fogFar, 140);
    this.rain.update(dt, k);
    if (this.t > 2) e.friction = Math.min(e.friction, 0.28);
    this.thunderT -= dt;
    if (this.thunderT <= 0) { this.thunderT = rand(6, 10); this.audio.thunder(); }
  }
}

// ------------------------------------------------------------------ BLIZZARD
export class Blizzard extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 22;
    this.killVerb = 'was blown away by the BLIZZARD';
    this.snow = new Precipitation(this, { count: 1800, color: 0xffffff, speed: 6, size: 0.3, drift: 0 });
    const a = Math.random() * Math.PI * 2;
    this.wind = { x: Math.cos(a), z: Math.sin(a) };
    this.snow.drift = this.wind.x * 8;
    this.audio.whoosh();
  }

  update(dt) {
    const k = Math.min(1, this.t / 2.5, Math.max(0, this.duration - this.t) / 2);
    const e = this.game.env;
    e.fogFar = Math.min(e.fogFar, 230 - 200 * k);
    e.fogNear = Math.min(e.fogNear, 70 - 66 * k);
    e.fogColor = SNOW_FOG;
    e.speedMul *= 1 - 0.38 * k;
    e.windX += this.wind.x * 1.4 * k;
    e.windZ += this.wind.z * 1.4 * k;
    this.snow.update(dt, k);
    if (Math.random() < dt * 0.4) this.audio.whoosh();
  }
}

// ------------------------------------------------------------------ ACID RAIN
export class AcidRain extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 19;
    this.warnTime = 3.5;
    this.killVerb = 'melted in the ACID RAIN';
    this.clouds = stormClouds(this.group, 0x5d7a3a);
    this.rain = new Precipitation(this, { count: 1400, color: 0x9dff4a, speed: 26, size: 0.2 });
    this.threat = { type: 'hide' };
    this.audio.siren(2);
  }

  update(dt) {
    const k = fadeClouds(this, this.clouds, 0.8);
    const e = this.game.env;
    e.skyTint = ACID_SKY; e.fogColor = ACID_FOG; e.light = Math.min(e.light, 1 - 0.25 * k);
    if (this.t < this.duration - 1) this.threats.push(this.threat);
    if (this.t < this.warnTime) {
      this.rain.update(dt, 0.05);
      return;
    }
    this.rain.update(dt, k);
    for (const c of this.living()) {
      if (this.island.isCovered(c.pos) || c.items?.some((i) => i.id === 'umbrella')) continue;
      this.hit(c, 7 * dt);
      if (Math.random() < dt * 6) this.particles.emit({ x: c.pos.x, y: c.pos.y + 2.2, z: c.pos.z, color: [0x9dff4a, 0xeaff8a], count: 2, speed: 1.5, up: 2, size: 0.25, life: 0.5, gravity: -1 });
    }
  }
}

export default { lightning: Lightning, rain: Rain, blizzard: Blizzard, acidrain: AcidRain };
