import * as THREE from 'three';
import { Island, terrainHeight, ISLAND_RADIUS } from './island.js';
import { Particles } from './particles.js';
import { Audio } from './audio.js';
import { Character } from './character.js';
import { PlayerController } from './player.js';
import { initBotAI, updateBot, randomBotNames, botNotices } from './bots.js';
import { HazardManager, registerHazards } from './hazards/index.js';
import { installWarnPulse } from './hazards/common.js';
import mysteryHazards from './hazards/mystery.js';
import disasterHazards from './hazards/disasters.js';
import weatherHazards from './hazards/weather.js';
import monsterHazards from './hazards/monsters.js';
import weaponHazards from './hazards/weapons.js';
import natureHazards from './hazards/nature.js';
import helpfulHazards from './hazards/helpful.js';
import sillyHazards from './hazards/silly.js';
import { WriterSystem } from './writer.js';
import { UI, esc } from './ui.js';
import { loadSave, writeSave } from './save.js';
import * as words from './words.js';
import { clamp, pick, rand } from './utils.js';

const BOT_COUNT = 11;
const SHIRTS = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93, 0xff924c, 0xf15bb5, 0x00bbf9, 0x00f5d4, 0x9b5de5, 0xfee440, 0xef476f, 0x06d6a0];
const PANTS = [0x2b2d42, 0x3d405b, 0x264653, 0x6d597a, 0x463f3a, 0x1d3557];
const SKINS = [0xffd6a5, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffe0bd, 0x9fe870, 0x7ec8e3];

export class Game {
  constructor(container) {
    this.container = container;
    this.words = words;
    this.dictionaryCount = words.DICTIONARY.length;
    this.time = 0;
    this.state = 'lobby';
    this.shake = 0;
    this.save = loadSave();
    this.roundCoins = 0;
    this.onTick = []; // per-frame callbacks registered by modules (e.g. warning pulse)

    const isTouch = matchMedia('(pointer: coarse)').matches;
    const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 1.75));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    this.baseFog = new THREE.Color(0xbfe6ff);
    scene.fog = new THREE.Fog(this.baseFog.clone(), 70, 230);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 600);
    this.camera.position.set(30, 25, 40);

    this.buildSkyAndLights();
    this.island = new Island(scene);
    this.particles = new Particles(scene);
    this.audio = new Audio();
    this.hazards = new HazardManager(this);
    registerHazards({ ...mysteryHazards, ...disasterHazards, ...weatherHazards, ...monsterHazards, ...weaponHazards, ...natureHazards, ...helpfulHazards, ...sillyHazards });
    installWarnPulse(this);
    this.writer = new WriterSystem(this);
    this.controller = new PlayerController(this);
    this.ui = new UI(this);
    this.botNotices = botNotices;

    this.env = {};
    this.resetEnv();
    this.cur = { fogFar: 230, fogNear: 70, fogColor: this.baseFog.clone(), sky: new THREE.Color(1, 1, 1), light: 1, ground: new THREE.Color(1, 1, 1) };

    this.characters = [];
    this.player = new Character(this, { id: 0, name: 'You', isPlayer: true, colors: { skin: 0xffd6a5, shirt: 0x22c55e, pants: 0x1d3557, hat: 0xffd23f } });
    this.characters.push(this.player);
    for (let i = 0; i < BOT_COUNT; i++) {
      const c = new Character(this, {
        id: i + 1, name: 'Bot', colors: { skin: pick(SKINS), shirt: SHIRTS[i % SHIRTS.length], pants: pick(PANTS), hat: Math.random() < 0.4 ? pick(SHIRTS) : null },
      });
      this.characters.push(c);
    }

    addEventListener('resize', () => this.resize());
    this.resize();
    this.clock = new THREE.Clock();
    this.fpsFrames = 0; this.fpsTime = 0; this.fps = 60;
    renderer.setAnimationLoop(() => this.tick());
    this.ui.showLobby();
  }

  buildSkyAndLights() {
    const skyGeo = new THREE.SphereGeometry(450, 24, 12);
    const cols = [];
    const top = new THREE.Color(0x4aa8ff), mid = new THREE.Color(0xbfe6ff), bot = new THREE.Color(0xe8f6ff);
    const c = new THREE.Color();
    const p = skyGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 450;
      if (y > 0) c.copy(mid).lerp(top, Math.min(1, y * 1.6)); else c.copy(mid).lerp(bot, Math.min(1, -y * 2));
      cols.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    const sky = new THREE.Mesh(skyGeo, this.skyMat);
    sky.renderOrder = -1;
    this.scene.add(sky);
    this.sky = sky;

    this.hemi = new THREE.HemisphereLight(0xdff2ff, 0x5d7f3e, 1.5);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    sun.position.set(25, 45, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -36; s.right = 36; s.top = 36; s.bottom = -36; s.near = 5; s.far = 120;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    this.sun = sun;
  }

  /** Drops render resolution (then shadows) if the frame rate sags, to hold ~60fps. */
  adaptQuality() {
    if (document.hidden) return;
    const r = this.renderer;
    this.slowSeconds = this.fps < 50 ? (this.slowSeconds || 0) + 1 : 0;
    if (this.slowSeconds >= 3) {
      this.slowSeconds = 0;
      const pr = r.getPixelRatio();
      if (pr > 0.75) r.setPixelRatio(Math.max(0.75, pr - 0.25));
      else if (this.sun.shadow.mapSize.x > 1024) {
        this.sun.shadow.mapSize.set(1024, 1024);
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
      }
    }
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.fov = this.camera.aspect < 1 ? 78 : 62;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  resetEnv() {
    const e = this.env;
    e.friction = 1; e.speedMul = 1; e.windX = 0; e.windZ = 0;
    e.fogFar = 230; e.fogNear = 70; e.fogColor = null; e.skyTint = null; e.light = 1; e.groundTint = null;
  }

  // ---------------- Round flow ----------------
  startRound() {
    this.audio.unlock();
    this.hazards.clear();
    this.particles.clear();
    const names = randomBotNames(BOT_COUNT);
    const n = this.characters.length;
    const offset = Math.random() * Math.PI * 2;
    this.characters.forEach((c, i) => {
      if (c.isBot) c.setName(names[i - 1]);
      let a = offset + (i / n) * Math.PI * 2, r = 15;
      let x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.island.shelterAt({ x, y: 0, z }) || Math.abs(x + 7) < 5 && Math.abs(z - 5) < 5) { r = 21; x = Math.cos(a) * r; z = Math.sin(a) * r; }
      c.spawn(x, z, terrainHeight(x, z) + 0.6);
      if (c.isBot) initBotAI(c);
      c.kills = 0;
    });
    this.state = 'playing';
    this.roundTime = 0;
    this.roundCoins = 0;
    this.spectateTarget = null;
    this.save.games++;
    writeSave(this.save);
    this.ui.showHUD();
    this.controller.yaw = Math.atan2(this.player.pos.x, this.player.pos.z);
    this.controller.camTarget.copy(this.player.pos);
    if (this.writer) this.writer.reset();
    this.ui.announce('Welcome to', 'WORD STORM ISLAND', 'Survive the words. Last one standing wins!', '#7dffb0');
    this.audio.announce();
  }

  toLobby() {
    this.state = 'lobby';
    this.hazards.clear();
    this.particles.clear();
    if (this.writer) this.writer.cancel();
    for (const c of this.characters) { c.alive = false; c.mesh.visible = false; }
    this.resetEnv();
    this.controller.releasePointer();
    this.ui.showLobby();
  }

  checkEnd() {
    if (this.state !== 'playing') return;
    const alive = this.characters.filter((c) => c.alive);
    if (alive.length <= 1) {
      this.state = 'ending';
      this.endTimer = 2.5;
      this.winner = alive[0] || null;
      if (this.writer) this.writer.cancel();
      if (this.winner) this.ui.announce('🏆 Winner', this.winner.name.toUpperCase(), this.winner.isPlayer ? 'YOU SURVIVED THE WORD STORM!' : 'Last one standing!', '#7dffb0');
    }
  }

  endRound() {
    this.state = 'ended';
    const w = this.winner;
    const lines = [];
    if (w && w.isPlayer) {
      this.save.wins++;
      this.addCoins(50, 'Victory!');
      this.audio.win();
    } else {
      this.audio.lose();
    }
    this.save.bestKills = Math.max(this.save.bestKills, this.player.kills || 0);
    writeSave(this.save);
    lines.push(w ? `🏆 Winner: <b>${esc(w.name)}</b>` : '🤝 Nobody survived!');
    lines.push(`⏱️ Round time: ${Math.floor(this.roundTime / 60)}:${String(Math.floor(this.roundTime % 60)).padStart(2, '0')}`);
    lines.push(`🗡️ Kills with your words: ${this.player.kills || 0}`);
    lines.push(`🪙 Coins earned: <b>${this.roundCoins}</b> (total ${this.save.coins})`);
    this.controller.releasePointer();
    this.ui.closeWriter();
    this.ui.showResults(w && w.isPlayer ? '🎉 YOU WIN! 🎉' : 'Round over', lines);
  }

  addCoins(n, reason) {
    this.save.coins += n;
    this.roundCoins += n;
    writeSave(this.save);
    this.ui.toast(`+${n} 🪙 ${reason}`);
    this.audio.coin();
  }

  discover(entry, word) {
    if (entry) {
      if (!this.save.discovered.includes(entry.id)) {
        this.save.discovered.push(entry.id);
        this.ui.toast(`📖 New word: ${entry.name}!`);
      }
    } else if (word && !this.save.mysteries.includes(word)) {
      this.save.mysteries.push(word);
      if (this.save.mysteries.length > 200) this.save.mysteries.shift();
    }
    writeSave(this.save);
  }

  // ---------------- Combat helpers ----------------
  /** Deal damage from a hazard. `opts.knock` = {x,y,z}, `opts.cause` = kill feed text. */
  damage(ch, amount, source = null, opts = {}) {
    if (!ch.alive || this.state === 'lobby' || this.state === 'ended') return 0;
    if (opts.knock) ch.knock(opts.knock.x || 0, opts.knock.y || 0, opts.knock.z || 0);
    if (amount <= 0) return 0;
    if (source) ch.lastHit = { source, time: this.time };
    let dmg = amount;
    if (ch.shield > 0) {
      const absorbed = Math.min(ch.shield, dmg);
      ch.shield -= absorbed;
      dmg -= absorbed;
      if (ch.shield <= 0 && ch.isPlayer) this.ui.toast('🛡️ Shield broken!');
    }
    ch.hp -= dmg;
    ch.hurtFlash = 0.25;
    if (ch.isPlayer && dmg > 0) {
      if (dmg > 3 || Math.random() < 0.15) this.audio.hurt();
      this.ui.hurt(dmg);
      this.addShake(Math.min(0.6, dmg / 60));
    }
    if (ch.hp <= 0) this.killCharacter(ch, opts.cause || source?.killVerb, source);
    return dmg;
  }

  /** Explosion with falloff and knockback. */
  explode(x, y, z, radius, damage, source, { knock = 12, colors = [0xff5a1f, 0xffa31a, 0xffe066, 0x555555], cause, sound = true } = {}) {
    for (const c of this.characters) {
      if (!c.alive) continue;
      const dx = c.pos.x - x, dy = c.pos.y + 1 - y, dz = c.pos.z - z;
      const d = Math.hypot(dx, dy, dz);
      if (d > radius) continue;
      const f = 1 - (d / radius) * 0.5;
      const hd = Math.hypot(dx, dz) || 1;
      this.damage(c, damage * f, source, { knock: { x: (dx / hd) * knock * f, y: knock * 0.55 * f + 2, z: (dz / hd) * knock * f }, cause });
    }
    this.particles.emit({ x, y: y + 0.5, z, color: colors, count: Math.min(60, 12 + radius * 8), speed: radius * 3.2, size: 0.55, life: 0.9, up: radius * 1.5, spread: radius * 0.2 });
    this.particles.emit({ x, y: y + 0.5, z, color: [0x444444, 0x777777, 0x999999], count: 10 + radius * 2, speed: radius * 1.2, size: 0.9, life: 1.6, gravity: -2, up: 3, spread: radius * 0.3 });
    if (sound) this.audio.explosion(Math.min(1.6, radius / 4));
    this.addShake(Math.min(1.2, radius * 0.18), x, z);
  }

  killCharacter(ch, cause, source) {
    if (!ch.alive) return;
    ch.alive = false;
    ch.hp = 0;
    ch.mesh.visible = false;
    const cl = ch.colors;
    this.particles.burst(ch.pos.x, ch.pos.y + 1.2, ch.pos.z, [cl.shirt, cl.skin, cl.pants], 30, 9, 0.4, 1.2);
    const near = this.camera.position.distanceTo(ch.pos) < 40;
    if (near || ch.isPlayer) this.audio.death();
    const killer = source?.owner || null;
    const verb = cause || (source ? `was wiped out by ${source.label}` : 'was eliminated');
    let html = `💀 <b class="${ch.isPlayer ? 'me' : ''}">${esc(ch.name)}</b> ${esc(verb)}`;
    if (killer && killer !== ch) html += ` <span style="opacity:.7">(${killer.isPlayer ? '<span class="me">your</span>' : esc(killer.name) + "'s"} word)</span>`;
    this.ui.killFeed(html);
    if (killer && killer !== ch && this.state === 'playing') {
      killer.kills = (killer.kills || 0) + 1;
      if (killer.isPlayer) this.addCoins(10, `Your word got ${ch.name}!`);
    }
    if (ch.isPlayer) {
      this.controller.releasePointer();
      this.ui.closeWriter();
      this.audio.lose();
      this.spectateTarget = null;
      this.cycleSpectate(1);
    } else if (this.spectateTarget === ch) {
      this.cycleSpectate(1);
    }
    this.checkEnd();
  }

  cycleSpectate(dir) {
    const alive = this.characters.filter((c) => c.alive);
    if (!alive.length) return;
    let i = alive.indexOf(this.spectateTarget);
    i = i < 0 ? 0 : (i + dir + alive.length) % alive.length;
    this.spectateTarget = alive[i];
    if (!this.player.alive && this.state === 'playing') this.ui.showSpectate(this.spectateTarget.name);
  }

  addShake(amount, x, z) {
    let f = 1;
    if (x !== undefined) {
      const t = this.controller.camTarget;
      f = clamp(1.2 - Math.hypot(t.x - x, t.z - z) / 40, 0.15, 1);
    }
    this.shake = Math.min(1.5, Math.max(this.shake, amount * f));
  }

  livingCharacters() { return this.characters.filter((c) => c.alive); }

  /** Nearest living character to a point (optionally filtered). */
  nearestCharacter(x, z, filter = null) {
    let best = null, bd = Infinity;
    for (const c of this.characters) {
      if (!c.alive || (filter && !filter(c))) continue;
      const d = Math.hypot(c.pos.x - x, c.pos.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // ---------------- Main loop ----------------
  tick() {
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    this.fpsFrames++; this.fpsTime += rawDt;
    if (this.fpsTime > 1) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0; this.fpsTime = 0;
      this.adaptQuality();
    }
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Advances the whole simulation by dt seconds (no rendering). */
  step(dt) {
    this.time += dt;
    for (const f of this.onTick) f(dt, this.time);

    this.resetEnv();
    const active = this.state === 'playing' || this.state === 'ending';
    if (active) {
      this.roundTime += dt;
      if (this.player.alive) this.controller.applyInput(this.player);
      for (const c of this.characters) {
        if (!c.alive) continue;
        if (c.isBot) updateBot(c, dt, this);
        c.resetMods();
      }
      this.hazards.update(dt);
      if (this.writer && this.state === 'playing') this.writer.update(dt);
      for (const c of this.characters) c.update(dt);
      this.separateCharacters();
      this.ui.updateHUD(dt);
      if (this.state === 'ending') {
        this.endTimer -= dt;
        if (this.endTimer <= 0) this.endRound();
      }
    } else if (this.state === 'ended') {
      this.hazards.update(dt);
      for (const c of this.characters) c.update(dt);
    }

    // camera
    if (active || this.state === 'ended') {
      let target = this.player;
      if (!this.player.alive) {
        if (!this.spectateTarget || !this.spectateTarget.alive) this.cycleSpectate(1);
        if (this.spectateTarget) target = this.spectateTarget;
      }
      this.controller.updateCamera(dt, target.pos, this.shake);
    } else {
      const a = this.time * 0.06;
      this.camera.position.set(Math.cos(a) * 52, 26, Math.sin(a) * 52);
      this.camera.lookAt(0, -2, 0);
    }
    this.shake *= Math.exp(-5 * dt);
    if (this.shake < 0.01) this.shake = 0;

    this.applyEnv(dt);
    this.island.update(dt, this.time);
    this.particles.update(dt);
  }

  applyEnv(dt) {
    const e = this.env, c = this.cur;
    const k = 1 - Math.exp(-2 * dt);
    c.fogFar += (e.fogFar - c.fogFar) * k;
    c.fogNear += (e.fogNear - c.fogNear) * k;
    c.fogColor.lerp(e.fogColor || this.baseFog, k);
    c.sky.lerp(e.skyTint || WHITE, k);
    c.ground.lerp(e.groundTint || WHITE, k);
    c.light += (e.light - c.light) * k;
    this.scene.fog.far = c.fogFar;
    this.scene.fog.near = Math.min(c.fogNear, c.fogFar * 0.5);
    this.scene.fog.color.copy(c.fogColor);
    this.skyMat.color.copy(c.sky);
    this.island.groundMat.color.copy(c.ground);
    this.hemi.intensity = 1.5 * c.light;
    this.sun.intensity = 2.4 * c.light;
  }

  separateCharacters() {
    const cs = this.characters;
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < cs.length; j++) {
        const b = cs[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.9 && Math.abs(a.pos.y - b.pos.y) < 2) {
          const push = (0.9 - d) / 2;
          const nx = d > 1e-4 ? dx / d : Math.random() - 0.5, nz = d > 1e-4 ? dz / d : Math.random() - 0.5;
          a.pos.x -= nx * push; a.pos.z -= nz * push;
          b.pos.x += nx * push; b.pos.z += nz * push;
        }
      }
    }
  }
}

const WHITE = new THREE.Color(1, 1, 1);
export { ISLAND_RADIUS, rand };
