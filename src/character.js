import * as THREE from 'three';
import { makeHumanoid, animateHumanoid } from './models.js';
import { makeTextSprite, angleLerp } from './utils.js';
import { KILL_Y } from './island.js';

export const GRAVITY = 28;
export const JUMP_V = 11;
export const WALK = 5.5;
export const SPRINT = 9;

const shieldGeo = new THREE.IcosahedronGeometry(1.4, 1);
const shieldMat = new THREE.MeshBasicMaterial({ color: 0x66c2ff, transparent: true, opacity: 0.28, depthWrite: false, wireframe: false });

/** A player or bot. Position is at the feet. */
export class Character {
  constructor(game, { id, name, isPlayer = false, colors }) {
    this.game = game;
    this.id = id;
    this.isPlayer = isPlayer;
    this.isBot = !isPlayer;
    this.radius = 0.45;
    this.height = 2.3;
    this.model = makeHumanoid({ ...colors, ownMaterials: true });
    this.mesh = this.model.group;
    this.mesh.visible = false;
    game.scene.add(this.mesh);
    this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.shieldMesh.position.y = 1.2;
    this.shieldMesh.visible = false;
    this.mesh.add(this.shieldMesh);
    this.colors = colors;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.input = { x: 0, z: 0, sprint: false, jump: false, jumpHeld: false };
    this.mods = { speedMul: 1, friction: 1, jumpMul: 1, sink: 0 };
    this.setName(name);
    this.alive = false;
  }

  /** Rebuild the body with new colours / hat (coin shop, online looks). */
  setLook(colors) {
    const old = this.model;
    this.mesh.remove(old.root);
    for (const m of old.materials) m.dispose();
    const fresh = makeHumanoid({ ...colors, ownMaterials: true });
    fresh.group.remove(fresh.root);
    this.mesh.add(fresh.root);
    this.model = { ...fresh, group: this.mesh };
    this.colors = colors;
  }

  setName(name) {
    this.name = name;
    if (this.label) { this.mesh.remove(this.label); this.label.userData.dispose(); }
    this.label = makeTextSprite(name, { color: this.isPlayer ? '#7dffb0' : '#ffffff', fontSize: 40, height: 0.4, bg: 'rgba(20,14,40,0.5)' });
    this.label.position.y = 3.05;
    this.mesh.add(this.label);
  }

  spawn(x, z, y) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.hp = 100;
    this.alive = true;
    this.onGround = false;
    this.yaw = Math.atan2(-x, -z);
    this.shield = 0;
    this.jetpack = 0;
    this.speedBoost = 0;
    this.tripped = 0;
    this.hurtFlash = 0;
    this.lastHit = null;
    this.walkPhase = Math.random() * 6;
    this.spin = 0;
    this.deathTime = 0;
    this.mesh.visible = true;
    this.mesh.rotation.set(0, this.yaw, 0);
    this.mesh.scale.setScalar(1);
    this.input.x = this.input.z = 0;
    this.input.jump = this.input.jumpHeld = this.input.sprint = false;
  }

  resetMods() {
    this.mods.speedMul = 1;
    this.mods.friction = 1;
    this.mods.jumpMul = 1;
    this.mods.sink = 0;
  }

  get headY() { return this.pos.y + this.height; }
  get center() { return this._c ? this._c.set(this.pos.x, this.pos.y + 1.2, this.pos.z) : (this._c = new THREE.Vector3(this.pos.x, this.pos.y + 1.2, this.pos.z)); }

  /** Apply an instant velocity change (knockback). */
  knock(x, y, z) {
    this.vel.x += x;
    this.vel.y = Math.max(this.vel.y, 0) + y;
    this.vel.z += z;
    if (y > 0) this.onGround = false;
  }

  /** Emotes: 1 wave, 2 dance, 3 flex, 4 spin. They stop as soon as you move. */
  startEmote(id) {
    if (!this.alive) return;
    this.emoteId = id;
    this.emoteT = 0;
    if (this.isPlayer) this.game.track('emote');
  }

  update(dt) {
    if (!this.alive) return;
    this.invincible = Math.max(0, (this.invincible || 0) - dt);
    // online: remote humans (on the host) and everyone else (on clients) are moved by the network
    if (this.remote || this.netDriven) { this.updateVisual(dt); return; }
    const game = this.game, env = game.env;
    this.speedBoost = Math.max(0, this.speedBoost - dt);
    this.jetpack = Math.max(0, this.jetpack - dt);
    this.tripped = Math.max(0, this.tripped - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    let ix = this.input.x, iz = this.input.z;
    const len = Math.hypot(ix, iz);
    if (len > 1) { ix /= len; iz /= len; }
    if (this.tripped > 0) { ix = 0; iz = 0; }
    const speed = (this.input.sprint ? SPRINT : WALK) * this.mods.speedMul * env.speedMul * (this.speedBoost > 0 ? 1.6 : 1);
    const friction = Math.min(this.mods.friction, env.friction);
    const rate = this.onGround ? (this.tripped > 0 ? 1.2 : 14 * friction) : 2.4;
    const k = 1 - Math.exp(-rate * dt);
    this.vel.x += (ix * speed - this.vel.x) * k;
    this.vel.z += (iz * speed - this.vel.z) * k;

    if (this.input.jump && this.onGround && this.tripped <= 0) {
      this.vel.y = JUMP_V * this.mods.jumpMul;
      this.onGround = false;
      if (this.isPlayer) { game.audio.jump(); game.track('jump'); }
    }
    this.input.jump = false;
    if (this.jetpack > 0 && this.input.jumpHeld) {
      this.vel.y = Math.min(this.vel.y + 42 * dt, 8);
      if (Math.random() < 0.6) game.particles.emit({ x: this.pos.x, y: this.pos.y + 0.8, z: this.pos.z, color: [0xffa31a, 0xffe066, 0xff5a1f], count: 2, speed: 2, size: 0.25, life: 0.4, gravity: -2, dir: { x: 0, y: -1, z: 0 } });
    }
    this.vel.y -= GRAVITY * env.gravityMul * dt;
    if (this.vel.y < -32) this.vel.y = -32;

    this.pos.x += (this.vel.x + env.windX) * dt;
    this.pos.z += (this.vel.z + env.windZ) * dt;
    this.pos.y += this.vel.y * dt;
    const wasGround = this.onGround;
    this.bumped = false;
    game.island.resolveCharacter(this, dt);
    if (!wasGround && this.onGround && this.isPlayer) game.audio.land();

    if (this.pos.y < KILL_Y) {
      if (game.mode === 'client') { this.pos.y = KILL_Y; this.vel.set(0, 0, 0); return; } // the host decides
      game.killCharacter(this, 'fell off the island', this.recentAttacker());
      return;
    }

    // facing
    if (len > 0.1 && this.tripped <= 0) this.yaw = angleLerp(this.yaw, Math.atan2(ix, iz), 1 - Math.exp(-12 * dt));
    if (this.tripped > 0) this.spin += dt * 14;
    else this.spin = 0;
    this.updateVisual(dt);
  }

  recentAttacker() {
    if (this.lastHit && this.game.time - this.lastHit.time < 6) return this.lastHit.source;
    return null;
  }

  updateVisual(dt) {
    const parts = this.model.parts, root = this.model.root;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += dt * hs * 1.7;
    const moving = this.onGround ? Math.min(1, hs / 5) : 0;
    const t = this.game.time + this.id * 0.7;
    if (this.onGround) {
      animateHumanoid(parts, this.walkPhase, moving * 0.85);
      parts.armL.rotation.z = -0.05 - Math.sin(t * 2) * 0.03;
      parts.armR.rotation.z = 0.05 + Math.sin(t * 2) * 0.03;
    } else {
      // airborne: legs tucked, arms thrown up
      const up = this.vel.y > 0 ? 1 : 0.6;
      parts.legL.rotation.x = -0.5; parts.legR.rotation.x = 0.3;
      parts.armL.rotation.x = -2.4 * up; parts.armR.rotation.x = -2.4 * up;
      parts.armL.rotation.z = -0.35; parts.armR.rotation.z = 0.35;
    }
    // landing squash, walking bounce, sprint lean, idle breathing
    if (this.onGround && !this.wasGroundVis) this.squash = Math.min(0.28, Math.max(0.1, -(this.lastVy || 0) / 60));
    this.wasGroundVis = this.onGround;
    this.lastVy = this.vel.y;
    this.squash = Math.max(0, (this.squash || 0) - dt * 1.6);
    const breathe = Math.sin(t * 2.2) * 0.012 * (1 - moving);
    root.scale.set(1 + this.squash * 0.5, 1 - this.squash + breathe, 1 + this.squash * 0.5);
    root.position.y = this.onGround ? Math.abs(Math.sin(this.walkPhase)) * 0.09 * moving : 0;
    const lean = this.onGround ? Math.min(0.28, hs / 32) : 0;
    root.rotation.x += (lean - root.rotation.x) * Math.min(1, dt * 8);
    parts.head.rotation.x = -lean * 0.6;
    parts.head.rotation.y = Math.sin(t * 0.6) * 0.15 * (1 - moving);

    // emotes (stop when you start moving)
    let emoteSpin = 0;
    if (this.emoteId) {
      this.emoteT = (this.emoteT || 0) + dt;
      if ((!this.netDriven && !this.remote && hs > 1.2) || this.emoteT > 4 || !this.onGround) this.emoteId = 0;
      else {
        const e = this.emoteT;
        if (this.emoteId === 1) { parts.armR.rotation.x = -2.9; parts.armR.rotation.z = 0.4 + Math.sin(e * 12) * 0.4; }
        else if (this.emoteId === 2) {
          parts.armL.rotation.x = -2.6 + Math.sin(e * 8) * 0.6; parts.armR.rotation.x = -2.6 - Math.sin(e * 8) * 0.6;
          parts.legL.rotation.x = Math.sin(e * 8) * 0.4; parts.legR.rotation.x = -Math.sin(e * 8) * 0.4;
          root.position.y = Math.abs(Math.sin(e * 8)) * 0.25;
          emoteSpin = Math.sin(e * 4) * 0.6;
        } else if (this.emoteId === 3) {
          parts.armL.rotation.set(0, 0, -1.5); parts.armR.rotation.set(0, 0, 1.5);
          parts.armL.rotation.x = -0.3 + Math.sin(e * 6) * 0.15; parts.armR.rotation.x = -0.3 - Math.sin(e * 6) * 0.15;
        } else if (this.emoteId === 4) {
          emoteSpin = e * 9;
          parts.armL.rotation.z = -1.3; parts.armR.rotation.z = 1.3;
        }
      }
    }
    this.mesh.position.set(this.pos.x, this.pos.y - this.mods.sink, this.pos.z);
    this.mesh.rotation.set(this.tripped > 0 ? -1.2 : 0, this.yaw + this.spin + emoteSpin, 0);
    const flash = this.hurtFlash > 0 ? this.hurtFlash * 4 : 0;
    for (const m of this.model.materials) m.emissive.setRGB(flash, 0, 0);
    parts.head.children.forEach((c) => { if (c.userData.spin) c.rotation.y += dt * 14; });
    // face: blink every few seconds, "ouch" when hurt, worried brows when low on HP
    const f = parts.face;
    if (f && f.eyes.length) {
      this.blinkT = (this.blinkT ?? Math.random() * 4) - dt;
      if (this.blinkT < -0.12) this.blinkT = 2.5 + Math.random() * 3;
      const shut = this.blinkT < 0 || flash > 0;
      for (const e of f.eyes) e.scale.y = shut ? 0.15 : 1;
      if (f.mouth) { f.mouth.scale.set(flash > 0 ? 0.8 : 1, flash > 0 ? 3 : 1, 1); }
      const worried = this.hp < 35 || flash > 0 ? -0.4 : -0.12;
      if (f.browL) { f.browL.rotation.z = -worried; f.browR.rotation.z = worried; }
    }
    this.shieldMesh.visible = this.shield > 0;
    if (this.shield > 0) this.shieldMesh.rotation.y += dt * 2;
  }
}
