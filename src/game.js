import * as THREE from 'three';
import { Island, terrainHeight, ISLAND_RADIUS, THEMES, DEFAULT_MAP } from './island.js';
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
import creatureHazards from './hazards/creatures.js';
import objectHazards from './hazards/objects.js';
import effectHazards from './hazards/effects.js';
import { WriterSystem, CATEGORY_COLORS, writerChance } from './writer.js';
import { UI, esc } from './ui.js';
import { Online } from './net/online.js';
import { loadSave, writeSave } from './save.js';
import { lookFromSave } from './shop.js';
import { MODES, modeOf } from './modes.js';
import { ensureQuests, trackProgress, questInfo } from './progress.js';
import { Collectibles } from './collectibles.js';
import { ItemSystem } from './items.js';
import { updatePowers, powerAction, endPower, showPower } from './powers.js';
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
    this.mode = 'solo'; // 'solo' | 'host' | 'client'
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
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.12;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    this.baseFog = new THREE.Color(0xbfe6ff);
    scene.fog = new THREE.Fog(this.baseFog.clone(), 70, 230);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 600);
    this.camera.position.set(30, 25, 40);
    this.hazardRoot = new THREE.Group();
    scene.add(this.hazardRoot);

    this.buildSkyAndLights();
    this.island = new Island(scene);
    this.particles = new Particles(scene);
    this.audio = new Audio();
    this.hazards = new HazardManager(this);
    registerHazards({ ...mysteryHazards, ...disasterHazards, ...weatherHazards, ...monsterHazards, ...weaponHazards, ...natureHazards, ...helpfulHazards, ...sillyHazards, ...creatureHazards, ...objectHazards, ...effectHazards });
    installWarnPulse(this);
    this.writer = new WriterSystem(this);
    this.controller = new PlayerController(this);
    this.ui = new UI(this);
    this.net = new Online(this);
    this.collectibles = new Collectibles(this);
    this.items = new ItemSystem(this);
    this.gameMode = modeOf(this.save.mode) === MODES[this.save.mode] ? this.save.mode : 'classic';
    this.paused = false;
    ensureQuests(this.save);
    this.botNotices = botNotices;

    this.env = {};
    this.resetEnv();
    this.cur = { fogFar: 230, fogNear: 70, fogColor: this.baseFog.clone(), sky: new THREE.Color(1, 1, 1), light: 1, ground: new THREE.Color(1, 1, 1) };

    this.characters = [];
    this.makeSoloRoster();

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
    const S = ISLAND_RADIUS + 6;
    s.left = -S; s.right = S; s.top = S; s.bottom = -S; s.near = 5; s.far = 150;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    this.sun = sun;

    // a big soft sun in the sky, in the same direction as the light
    const c2 = document.createElement('canvas');
    c2.width = c2.height = 128;
    const ctx = c2.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,253,235,1)');
    grad.addColorStop(0.22, 'rgba(255,244,190,1)');
    grad.addColorStop(0.32, 'rgba(255,230,150,0.55)');
    grad.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c2);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false, transparent: true, toneMapped: false }));
    sunSprite.position.copy(sun.position).normalize().multiplyScalar(380);
    sunSprite.scale.setScalar(90);
    sunSprite.renderOrder = -1;
    this.scene.add(sunSprite);
  }

  /** Small ambient touches: chimney smoke and drifting pollen (local only, never sent online). */
  ambient(dt) {
    this.ambT = (this.ambT || 0) + dt;
    if (this.ambT < 0.12) return;
    this.ambT = 0;
    const chs = this.island.chimneys || [];
    const ch = chs[Math.floor(Math.random() * chs.length)];
    if (ch && Math.random() < 0.6) this.particles.emit({ local: true, x: ch.x, y: ch.y, z: ch.z, color: [0xdddddd, 0xbbbbbb, 0xeeeeee], count: 1, speed: 0.6, up: 1.6, size: 0.55, life: 2.4, gravity: -0.4, drag: 0.3, shrink: true });
    const t = this.controller.camTarget;
    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 14;
    const x = (this.state === 'lobby' ? 0 : t.x) + Math.cos(a) * r, z = (this.state === 'lobby' ? 0 : t.z) + Math.sin(a) * r;
    const gy = terrainHeight(x, z);
    if (gy > -Infinity) this.particles.emit({ local: true, x, y: gy + 0.5 + Math.random() * 2.5, z, color: [0xfff6b0, 0xffffff, 0xd8ffb0], count: 1, speed: 0.4, up: 0.2, size: 0.09, life: 4, gravity: -0.05, drag: 0.1, shrink: false });
    const wf = this.island.waterfall;
    if (wf && Math.random() < 0.7) this.particles.emit({ local: true, x: wf.x, y: -0.6, z: wf.z, color: [0xffffff, 0xd6f3ff], count: 2, speed: 2, up: 1, size: 0.35, life: 1, gravity: 6, spread: 0.6 });
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
    e.friction = 1; e.speedMul = 1; e.windX = 0; e.windZ = 0; e.gravityMul = 1;
    e.fogFar = 230; e.fogNear = 70; e.fogColor = null; e.skyTint = null; e.light = 1; e.groundTint = null;
  }

  // ---------------- Characters / rosters ----------------
  clearCharacters() {
    for (const c of this.characters) {
      this.scene.remove(c.mesh);
      c.label?.userData.dispose?.();
      for (const m of c.model.materials) m.dispose();
    }
    if (this.spectator) { this.scene.remove(this.spectator.mesh); this.spectator = null; }
    this.characters = [];
  }

  /** Single player (and online host): you + 11 bots. */
  makeSoloRoster() {
    this.clearCharacters();
    this.player = new Character(this, { id: 0, name: this.mode === 'host' ? this.net.myName : 'You', isPlayer: true, colors: lookFromSave(this.save) });
    this.characters.push(this.player);
    for (let i = 0; i < BOT_COUNT; i++) {
      this.characters.push(new Character(this, {
        id: i + 1, name: 'Bot', colors: { skin: pick(SKINS), shirt: SHIRTS[i % SHIRTS.length], pants: pick(PANTS), hat: Math.random() < 0.5 ? pick(SHIRTS) : null, hatStyle: pick(['cap', 'cap', 'party', 'tophat', 'chef', 'propeller']) },
      }));
    }
  }

  /** Online client: copy the host's roster. Characters not ours are driven by snapshots. */
  applyRoster(roster, myClientId) {
    this.clearCharacters();
    for (const r of roster) {
      const mine = r.cid === myClientId;
      const c = new Character(this, { id: r.id, name: r.name, isPlayer: mine, colors: r.colors });
      c.isBot = false;
      c.human = r.cid != null;
      c.netDriven = !mine;
      c.spawn(r.pos[0], r.pos[2], r.pos[1]);
      if (!r.alive) { c.alive = false; c.mesh.visible = false; }
      this.characters.push(c);
    }
    this.player = this.characters.find((c) => c.isPlayer);
    if (!this.player) {
      // joined mid-round: watch until the next one
      this.spectator = new Character(this, { id: -1, name: this.net.myName || 'You', isPlayer: true, colors: lookFromSave(this.save) });
      this.spectator.alive = false;
      this.spectator.hp = 0;
      this.player = this.spectator;
    }
  }

  /** The coin shop changed what we wear. */
  lookChanged() {
    const look = lookFromSave(this.save);
    if (this.mode === 'client') this.net.sendLook(look);
    else this.player.setLook(look);
  }

  get modeCfg() { return modeOf(this.gameMode); }

  /** Choose Classic / Chaos / Sandbox (online rooms can't use Sandbox). */
  setGameMode(id) {
    if (!MODES[id] || (this.net.active && !MODES[id].online)) return;
    this.gameMode = id;
    this.save.mode = id;
    writeSave(this.save);
    if (this.net.isHost) this.net.broadcastRoom();
  }

  // ---------------- Pause (single player only) ----------------
  get canPause() { return this.mode === 'solo' && (this.state === 'playing' || this.state === 'ending'); }

  setPaused(on) {
    if (on && !this.canPause) return;
    if (this.paused === on) return;
    this.paused = on;
    if (on) { this.controller.releasePointer(); this.controller.keys.clear(); }
    this.ui.showPause(on);
  }

  // ---------------- Map ----------------
  /** "new map", "desert", "candy land"...: re-theme and/or reshuffle the island (everyone online too). */
  changeMap(theme, seed) {
    if (!THEMES[theme]) theme = 'grass';
    this.island.applyMap(theme, seed);
    this.mapState = { theme, seed };
    this.net.event('map', theme, seed);
    this.ui.flash('#ffffff', 0.6, 700);
    this.addShake(0.4);
    // anyone now stuck inside a new tree or rock gets nudged out by normal collisions; anyone in the air lands
    for (const c of this.characters) if (c.alive) c.pos.y = Math.max(c.pos.y, terrainHeight(c.pos.x, c.pos.z) + 0.2);
  }

  // ---------------- Items ----------------
  /** Local player pressed E / USE. Online friends ask the host to do it. */
  useItem(index = this.player.held || 0) {
    const p = this.player;
    if (!p.alive || this.paused) return;
    // driving a tank / being a creature: E is its attack
    if (p.power && p.power.action) {
      if (this.mode === 'client') { p.swingT = 0.3; this.net.conn?.send({ t: 'use', power: 1 }); }
      else powerAction(this, p);
      return;
    }
    if (!p.items || !p.items[index]) return;
    if (this.mode === 'client') {
      p.held = index;
      p.swingT = 0.3;
      this.net.conn?.send({ t: 'use', i: index });
      return;
    }
    this.items.use(p, index);
  }

  /** Q / tapping the hotbar: choose which item is in your hand. */
  selectItem(index) {
    const p = this.player;
    if (!p.items || !p.items.length) return;
    p.held = index === undefined ? ((p.held || 0) + 1) % p.items.length : Math.min(index, p.items.length - 1);
    if (this.mode === 'client') this.net.conn?.send({ t: 'held', i: p.held });
    this.ui.renderHotbar();
  }

  // ---------------- Quests & levels ----------------
  /** Count progress for the local player (ignored in Sandbox). */
  track(kind, n = 1) {
    if (this.modeCfg.sandbox) return;
    const res = trackProgress(this.save, kind, n);
    for (const q of res.completed) {
      const info = questInfo(q);
      this.ui.toast(`📋 Quest done: ${info.text}! +${q.reward} 🪙`);
      this.audio.powerup();
    }
    for (const lv of res.levelUps) {
      this.ui.announce('⭐ LEVEL UP ⭐', `LEVEL ${lv}`, `+${25 * lv} coins!`, '#ffd23f');
      this.audio.win();
    }
  }

  /** Progress for any human (online friends get it sent to their own browser). */
  trackFor(ch, kind, n = 1) {
    if (!ch) return;
    if (ch.isPlayer) this.track(kind, n);
    else if (ch.remote) this.net.sendDirect(ch.clientId, 'track', kind, n);
  }

  charById(id) { return this.characters.find((c) => c.id === id) || null; }

  // ---------------- Round flow ----------------
  startRound() {
    if (this.mode === 'client') return;
    this.audio.unlock();
    this.hazards.clear();
    this.particles.clear();
    if (this.mode === 'host') this.net.assignHumans();
    const names = randomBotNames(BOT_COUNT);
    const n = this.characters.length;
    const offset = Math.random() * Math.PI * 2;
    this.characters.forEach((c, i) => {
      if (c.isBot) c.setName(names[i - 1]);
      let a = offset + (i / n) * Math.PI * 2, r = ISLAND_RADIUS * 0.5;
      let x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.island.shelterAt({ x, y: 0, z }) || Math.abs(x + 9) < 5 && Math.abs(z - 7) < 5) { r = ISLAND_RADIUS * 0.7; x = Math.cos(a) * r; z = Math.sin(a) * r; }
      c.spawn(x, z, terrainHeight(x, z) + 0.6);
      if (c.isBot) initBotAI(c);
      c.kills = 0;
    });
    this.state = 'playing';
    this.paused = false;
    this.roundTime = 0;
    this.roundCoins = 0;
    this.spectateTarget = null;
    this.deathShown = false;
    this.collectibles.reset();
    this.items.reset();
    for (const c of this.characters) { c.items = []; c.held = 0; if (c.power) endPower(this, c); else showPower(c, null); }
    if (this.mapState && (this.mapState.theme !== DEFAULT_MAP.theme || this.mapState.seed !== DEFAULT_MAP.seed)) this.island.applyMap(DEFAULT_MAP.theme, DEFAULT_MAP.seed);
    this.mapState = { ...DEFAULT_MAP };
    this.ui.renderHotbar();
    this.save.games++;
    writeSave(this.save);
    for (const c of this.characters) if (c.isPlayer || c.remote) this.trackFor(c, 'play');
    this.ui.showHUD();
    this.controller.yaw = Math.atan2(this.player.pos.x, this.player.pos.z);
    this.controller.camTarget.copy(this.player.pos);
    this.writer.reset();
    const mc = this.modeCfg;
    this.ui.announce(`${mc.icon} ${mc.name} mode`, 'WORD STORM ISLAND', mc.sandbox ? 'Press ✍️ (or T) to write any word, any time!' : 'Survive the words. Last one standing wins!', '#7dffb0');
    this.audio.announce();
    if (this.mode === 'host') this.net.hostStarted();
  }

  /** Online client: the host started a round. */
  clientRoundStarted() {
    this.audio.unlock();
    this.hazards.clear();
    this.particles.clear();
    this.state = 'playing';
    this.roundTime = 0;
    this.roundCoins = 0;
    this.spectateTarget = null;
    this.deathShown = !this.player.alive;
    this.player.kills = 0;
    this.ui.showHUD();
    this.controller.yaw = Math.atan2(this.player.pos.x, this.player.pos.z);
    this.controller.camTarget.copy(this.player.pos);
    if (this.player.alive) {
      this.save.games++;
      writeSave(this.save);
      this.ui.announce('Welcome to', 'WORD STORM ISLAND', 'Survive the words. Last one standing wins!', '#7dffb0');
    } else {
      this.ui.announce('Round in progress', 'SPECTATING', "You'll play in the next round!", '#7fd4ff');
      this.cycleSpectate(1);
    }
    this.audio.announce();
  }

  toLobby() {
    const wasActive = this.state !== 'lobby';
    this.state = 'lobby';
    this.hazards.clear();
    this.particles.clear();
    this.writer.cancel();
    this.collectibles.reset();
    this.items.reset();
    this.paused = false;
    this.ui.showPause(false);
    for (const c of this.characters) { c.alive = false; c.mesh.visible = false; }
    this.resetEnv();
    this.controller.releasePointer();
    if (this.mode === 'host') this.net.hostToRoom(wasActive);
    if (this.mode === 'client') { this.net.inRound = false; this.net.decoder?.reset(); this.island.setDynamicColliders([]); }
    this.ui.showLobby();
  }

  checkEnd() {
    if (this.state !== 'playing' || this.modeCfg.sandbox) return;
    const alive = this.characters.filter((c) => c.alive);
    if (alive.length <= 1) {
      this.state = 'ending';
      this.endTimer = 2.5;
      this.winner = alive[0] || null;
      this.writer.cancel();
      this.announceWinner(this.winner);
      this.net.event('win', this.winner ? this.winner.id : -1);
    }
  }

  announceWinner(w) {
    if (w && w.onGround) { w.input.x = w.input.z = 0; w.vel.x = w.vel.z = 0; w.startEmote(2); }
    if (w) this.ui.announce('🏆 Winner', w.name.toUpperCase(), w.isPlayer ? 'YOU SURVIVED THE WORD STORM!' : 'Last one standing!', '#7dffb0');
  }

  endRound() {
    this.state = 'ended';
    const w = this.winner;
    if (w && w.remote) this.giveCoins(w, 50, 'Victory!');
    if (w && (w.isPlayer || w.remote)) this.trackFor(w, 'win');
    this.showResults(w);
    this.net.hostEnded(w);
  }

  /** Results screen (single player, host and clients). */
  showResults(w) {
    if (w && w.isPlayer) {
      this.save.wins++;
      if (this.mode !== 'client') this.addCoins(50, 'Victory!');
      this.audio.win();
    } else {
      this.audio.lose();
    }
    this.save.bestKills = Math.max(this.save.bestKills, this.player.kills || 0);
    writeSave(this.save);
    const lines = [];
    lines.push(w ? `🏆 Winner: <b>${esc(w.name)}</b>` : '🤝 Nobody survived!');
    lines.push(`⏱️ Round time: ${Math.floor(this.roundTime / 60)}:${String(Math.floor(this.roundTime % 60)).padStart(2, '0')}`);
    lines.push(`🗡️ Kills with your words: ${this.player.kills || 0}`);
    lines.push(`🪙 Coins earned: <b>${this.roundCoins}</b> (total ${this.save.coins})`);
    this.controller.releasePointer();
    this.ui.closeWriter();
    this.ui.showResults(w && w.isPlayer ? '🎉 YOU WIN! 🎉' : 'Round over', lines);
  }

  clientRoundEnded(winner, time) {
    this.state = 'ended';
    this.roundTime = time;
    this.showResults(winner);
  }

  addCoins(n, reason, kind = null) {
    if (this.modeCfg.sandbox) return;
    if (kind) this.track(kind, n);
    this.save.coins += n;
    this.roundCoins += n;
    writeSave(this.save);
    this.ui.toast(`+${n} 🪙 ${reason}`);
    this.audio.coin();
  }

  /** Coins for any human: local player directly, online friends via the network. */
  giveCoins(ch, n, reason, kind = null) {
    if (this.modeCfg.sandbox) return;
    if (ch.isPlayer) this.addCoins(n, reason, kind);
    else if (ch.remote) this.net.sendDirect(ch.clientId, 'coins', n, reason, kind);
  }

  /** A personal message for one character (toast + optional sound). */
  notify(ch, text, sound) {
    if (ch.isPlayer) {
      this.ui.toast(text);
      if (sound) this.audio[sound]?.();
    } else if (ch.remote) this.net.sendDirect(ch.clientId, 'toast', text, sound || null);
  }

  /** Kill-feed line for everyone. */
  feed(html) {
    this.ui.killFeed(html);
    this.net.event('f', html);
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

  /** Big word announcement when a writer's word lands (and tell everyone online). */
  announceWord(writer, h) {
    const info = {
      wid: writer.id, label: h.label, icon: h.icon, hint: h.hint, entry: h.entry ? h.entry.id : null, word: h.word,
      color: h.entry ? CATEGORY_COLORS[h.entry.category] : h.smart ? '#ffb3e6' : '#c4a7ff',
    };
    this.showWord(info);
    this.net.event('word', info);
  }

  showWord(info) {
    const writer = this.charById(info.wid);
    const who = writer && writer.isPlayer ? 'You wrote' : `${writer ? writer.name : 'Someone'} wrote`;
    this.ui.announce(who, `${info.icon} ${info.label.toUpperCase()}`, info.hint, info.color);
    this.audio.announce();
    this.addShake(0.25);
    this.discover(info.entry ? words.DICTIONARY.find((e) => e.id === info.entry) : null, info.entry ? null : info.word);
  }

  clientWord(info) { this.showWord(info); }

  // ---------------- Combat helpers ----------------
  /** Deal damage from a hazard. `opts.knock` = {x,y,z}, `opts.cause` = kill feed text. */
  damage(ch, amount, source = null, opts = {}) {
    if (!ch.alive || this.state === 'lobby' || this.state === 'ended' || this.mode === 'client') return 0;
    if (ch.invincible > 0) return 0; // blessed ("god") or typing as the Writer
    if (ch.power && ch.power.armor) amount *= 1 - ch.power.armor; // tanks and creatures are tough
    if (opts.knock) ch.knock(opts.knock.x || 0, opts.knock.y || 0, opts.knock.z || 0);
    if (amount <= 0) return 0;
    if (source) ch.lastHit = { source, time: this.time };
    let dmg = amount;
    if (ch.shield > 0) {
      const absorbed = Math.min(ch.shield, dmg);
      ch.shield -= absorbed;
      dmg -= absorbed;
      if (ch.shield <= 0) this.notify(ch, '🛡️ Shield broken!');
    }
    ch.hp -= dmg;
    ch.hurtFlash = 0.25;
    if (ch.isPlayer && dmg > 0) {
      if (dmg > 3 || Math.random() < 0.15) this.audio.hurt();
      this.ui.hurt(dmg);
      this.addShake(Math.min(0.6, dmg / 60));
    } else if (ch.remote && dmg > 0) this.net.queueHurt(ch.clientId, dmg);
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
    if (!ch.alive || this.mode === 'client') return;
    if (ch.invincible > 0 && cause !== 'fell off the island') return;
    ch.alive = false;
    ch.hp = 0;
    ch.mesh.visible = false;
    const cl = ch.colors;
    this.particles.burst(ch.pos.x, ch.pos.y + 1.2, ch.pos.z, [cl.shirt, cl.skin, cl.pants], 30, 9, 0.4, 1.2);
    const killer = source?.owner || null;
    const verb = cause || (source ? `was wiped out by ${source.label}` : 'was eliminated');
    this.showKill(ch, verb, killer);
    this.net.event('kill', ch.id, verb, killer ? killer.id : -1);
    if (ch.remote) this.net.playerKnockedOut(ch);
    if (killer && killer !== ch && this.state === 'playing') {
      killer.kills = (killer.kills || 0) + 1;
      this.giveCoins(killer, 10, `Your word got ${ch.name}!`, 'kill');
    }
    if (this.modeCfg.sandbox) {
      // Sandbox: nobody is out for good — pop back in a moment later
      ch.respawnAt = this.time + 2.5;
      if (ch.isPlayer) this.ui.toast('🧪 Respawning...');
      return;
    }
    if (ch.isPlayer) this.onLocalDeath();
    else if (this.spectateTarget === ch) this.cycleSpectate(1);
    this.checkEnd();
  }

  sandboxRespawns() {
    for (const c of this.characters) {
      if (c.alive || !c.respawnAt || this.time < c.respawnAt) continue;
      c.respawnAt = 0;
      const p = this.island.randomPoint(4, 18);
      c.spawn(p.x, p.z, terrainHeight(p.x, p.z) + 3);
      if (c.isBot) initBotAI(c);
      this.particles.burst(p.x, terrainHeight(p.x, p.z) + 1, p.z, [0xffffff, 0x7fd4ff], 16, 5, 0.3, 0.6);
    }
  }

  /** Kill-feed line + sound, written from this player's point of view. */
  showKill(ch, verb, killer) {
    const near = this.camera.position.distanceTo(ch.pos) < 40;
    if (near || ch.isPlayer) this.audio.death();
    let html = `💀 <b class="${ch.isPlayer ? 'me' : ''}">${esc(ch.name)}</b> ${esc(verb)}`;
    if (killer && killer !== ch) html += ` <span style="opacity:.7">(${killer.isPlayer ? '<span class="me">your</span>' : esc(killer.name) + "'s"} word)</span>`;
    this.ui.killFeed(html);
  }

  /** Online client: the host reported a knockout. */
  clientKill(victimId, verb, killerId) {
    const ch = this.charById(victimId);
    if (!ch) return;
    const killer = this.charById(killerId);
    if (killer && killer.isPlayer && killer !== ch) killer.kills = (killer.kills || 0) + 1;
    ch.alive = false;
    ch.mesh.visible = false;
    this.showKill(ch, verb, killer);
    if (ch.isPlayer) this.onLocalDeath();
    else if (this.spectateTarget === ch) this.cycleSpectate(1);
  }

  onLocalDeath() {
    if (this.deathShown) return;
    this.deathShown = true;
    this.ui.refreshTouch();
    this.player.alive = false;
    this.player.mesh.visible = false;
    this.controller.releasePointer();
    this.ui.closeWriter();
    if (this.net.isClient) this.net.writing = false;
    this.audio.lose();
    this.spectateTarget = null;
    this.cycleSpectate(1);
  }

  cycleSpectate(dir) {
    const alive = this.characters.filter((c) => c.alive);
    if (!alive.length) return;
    let i = alive.indexOf(this.spectateTarget);
    i = i < 0 ? 0 : (i + dir + alive.length) % alive.length;
    this.spectateTarget = alive[i];
    if (!this.player.alive && this.state === 'playing' && !this.modeCfg.sandbox) this.ui.showSpectate(this.spectateTarget.name);
  }

  addShake(amount, x, z) {
    let f = 1;
    if (x !== undefined && x !== null) {
      const t = this.controller.camTarget;
      f = clamp(1.2 - Math.hypot(t.x - x, t.z - z) / 40, 0.15, 1);
    }
    this.shake = Math.min(1.5, Math.max(this.shake, amount * f));
    this.net.shake(amount, x, z);
  }

  livingCharacters() { return this.characters.filter((c) => c.alive); }

  /** Nearest living character to a point (optionally filtered). */
  nearestCharacter(x, z, filter = null) {
    let best = null, bd = Infinity;
    for (const c of this.characters) {
      if (!c.alive || (filter && !filter(c))) continue;
      if (c.items && c.items.some((i) => i.id === 'cloak')) continue; // invisibility cloak: monsters can't find you
      const d = Math.hypot(c.pos.x - x, c.pos.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  /** What the HUD shows (local simulation, or the host's snapshot when we're a client). */
  /** My chance (0..1) of being picked as the next Writer, or null if I'm out. */
  myWriterChance() {
    if (!this.player.alive || this.modeCfg.sandbox) return null;
    const living = this.characters.filter((c) => c.alive);
    const humans = living.filter((c) => c.isPlayer || c.remote || c.human).length;
    return writerChance(living.length, humans, living.length - humans);
  }

  hudData() {
    if (this.mode === 'client') return { ...this.net.hudData(), chance: this.myWriterChance() };
    return {
      chance: this.myWriterChance(),
      writer: this.writer.statusText(),
      hazards: this.hazards.list.map((h) => ({
        uid: h.uid, icon: h.icon, label: h.label, owner: h.owner ? h.owner.name : '',
        frac: Math.max(0, 1 - h.t / h.duration), recharging: !!h.recharging,
      })),
    };
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
    if (!this.paused) this.step(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** Advances the whole simulation by dt seconds (no rendering). */
  step(dt) {
    this.time += dt;
    for (const f of this.onTick) f(dt, this.time);

    this.resetEnv();
    const active = this.state === 'playing' || this.state === 'ending';
    const host = this.mode === 'host';
    if (this.mode === 'client') {
      this.net.clientUpdate(dt);
      if (active || this.state === 'ended') {
        if (this.player.alive) this.controller.applyInput(this.player);
        for (const c of this.characters) c.update(dt);
        if (active) this.ui.updateHUD(dt);
      }
    } else if (active) {
      this.roundTime += dt;
      if (this.player.alive) this.controller.applyInput(this.player);
      if (host) this.net.hostBeforeHazards();
      for (const c of this.characters) {
        if (!c.alive) continue;
        if (c.isBot) updateBot(c, dt, this);
        c.resetMods();
      }
      this.hazards.update(dt);
      this.collectibles.update(dt);
      this.items.update(dt);
      updatePowers(this, dt);
      if (this.state === 'playing') this.writer.update(dt);
      for (const c of this.characters) c.update(dt);
      this.separateCharacters();
      if (this.modeCfg.sandbox) this.sandboxRespawns();
      if (host) this.net.hostAfterSim();
      this.ui.updateHUD(dt);
      if (this.state === 'ending') {
        this.endTimer -= dt;
        if (this.endTimer <= 0) this.endRound();
      }
    } else if (this.state === 'ended') {
      this.hazards.update(dt);
      for (const c of this.characters) c.update(dt);
    }
    if (host) this.net.hostTick(dt);

    // camera
    if (active || this.state === 'ended') {
      let target = this.player;
      if (!this.player.alive) {
        if (!this.spectateTarget || !this.spectateTarget.alive) this.cycleSpectate(1);
        if (this.spectateTarget) target = this.spectateTarget;
      }
      this.controller.updateCamera(dt, target.pos, this.shake);
    } else if (this.shopPreview) {
      // coin shop: show off your outfit
      const p = this.player, gy = terrainHeight(0, 2);
      p.mesh.visible = true;
      p.mesh.position.set(0, gy, 2);
      p.mesh.rotation.set(0, Math.sin(this.time * 0.8) * 0.9, 0);
      p.model.parts.head.children.forEach((c) => { if (c.userData.spin) c.rotation.y += dt * 14; });
      const wide = innerWidth > innerHeight;
      this.camera.position.set(wide ? 1.7 : 0, gy + 2.2, 2 + (wide ? 5 : 7));
      this.camera.lookAt(wide ? 1.7 : 0, gy + (wide ? 1.3 : 0.4), 2);
    } else {
      const a = this.time * 0.06;
      this.camera.position.set(Math.cos(a) * ISLAND_RADIUS * 1.75, ISLAND_RADIUS * 0.85, Math.sin(a) * ISLAND_RADIUS * 1.75);
      this.camera.lookAt(0, -2, 0);
    }
    this.shake *= Math.exp(-5 * dt);
    if (this.shake < 0.01) this.shake = 0;

    const writerNow = this.writer.updateMarker(dt, this.time);
    this.ui.updateWriterPointer(active && writerNow && writerNow !== this.player ? writerNow : null);
    this.ambient(dt);
    this.applyEnv(dt);
    this.island.update(dt, this.time);
    this.particles.update(dt);
  }

  applyEnv(dt) {
    const e = this.env, c = this.cur;
    const k = 1 - Math.exp(-2 * dt);
    c.fogFar += (e.fogFar - c.fogFar) * k;
    c.fogNear += (e.fogNear - c.fogNear) * k;
    c.fogColor.lerp(e.fogColor || this.island.fogColor || this.baseFog, k);
    c.sky.lerp(e.skyTint || this.island.skyColor || WHITE, k);
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
