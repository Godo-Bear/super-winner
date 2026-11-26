import * as THREE from 'three';
import { Connection, randomRoomCode } from './connection.js';
import { SceneEncoder, SceneDecoder } from './scenesync.js';
import { NAMED_MATERIALS, Precipitation } from '../hazards/common.js';
import { KILL_Y } from '../island.js';
import { isWordAllowed } from '../filter.js';
import { angleLerp, clamp } from '../utils.js';

/**
 * Online play: host-authoritative.
 *
 * The host's browser runs the real game (bots, hazards, writer, damage) exactly as in
 * single player, and ~20 times a second broadcasts a snapshot: characters, HUD data,
 * environment, dynamic colliders, a hazard scene delta (see scenesync.js) and
 * events (particles, sounds, kill feed...).
 *
 * Each client simulates its OWN character locally (so movement feels instant) and
 * reports it ~30 times a second. The host applies hazards to that report and sends
 * back corrections: position pushes, velocity knocks, slow-downs, HP and power-ups.
 */
const SNAP_RATE = 20;
const INPUT_RATE = 30;
const R2 = (v) => Math.round(v * 100) / 100;

// Sounds triggered by hazards that everyone should hear.
const SHARED_SOUNDS = ['explosion', 'bigBoom', 'zap', 'whoosh', 'splash', 'roar', 'shot', 'laser', 'rumble', 'buzz', 'siren', 'warn', 'thunder', 'bubble', 'boing', 'pop', 'slip', 'jaws', 'tone', 'noise'];

export class Online {
  constructor(game) {
    this.game = game;
    this.conn = null;
    this.role = null; // 'host' | 'client'
    this.players = [];
    this.code = '';
    this.events = [];
    this.direct = new Map();
    this.hurtAcc = new Map();
    this.snapT = 0;
    this.inputT = 0;
    this.pendingShake = null;
    this.lastColSig = '';
    this.hooksInstalled = false;
    this.inRound = false;
  }

  get active() { return !!this.conn; }
  get isHost() { return this.role === 'host'; }
  get isClient() { return this.role === 'client'; }

  // ------------------------------------------------------------------ connect
  async create(relay, name) {
    let lastErr;
    for (let i = 0; i < 4; i++) {
      const conn = new Connection();
      const code = randomRoomCode();
      try {
        await conn.connect(relay, code, name, true);
        this.conn = conn;
        this.code = code;
        break;
      } catch (e) {
        lastErr = e;
        if (!/taken/i.test(e.message)) throw e;
      }
    }
    if (!this.conn) throw lastErr;
    this.role = 'host';
    this.myName = name;
    this.players = [{ id: this.conn.id, name, host: true }];
    this.encoder = new SceneEncoder(this.game.hazardRoot);
    this.game.mode = 'host';
    this.installHostHooks();
    this.conn.on('join', (m) => this.onJoin(m));
    this.conn.on('leave', (m) => this.onLeave(m));
    this.conn.on('from', (m) => this.onClientMessage(m.from, m.d));
    this.conn.on('disconnect', () => this.dropped('Lost connection to the server.'));
    this.game.player.setName(name);
    this.game.ui.showRoom();
  }

  async join(relay, code, name) {
    const conn = new Connection();
    await conn.connect(relay, code.toUpperCase(), name, false);
    this.conn = conn;
    this.code = code.toUpperCase();
    this.role = 'client';
    this.myName = name;
    this.game.mode = 'client';
    this.decoder = new SceneDecoder(this.game, this.game.hazardRoot, NAMED_MATERIALS);
    this.decoder.interval = 1 / SNAP_RATE;
    conn.on('any', (m) => this.onHostMessage(m));
    conn.on('closed', () => this.dropped('The host left the room.'));
    conn.on('disconnect', () => this.dropped('Lost connection to the host.'));
    this.game.ui.showRoom();
  }

  /** Leave the room and go back to single player. */
  leave() {
    const conn = this.conn;
    this.conn = null;
    conn?.close();
    this.cleanup();
  }

  dropped(message) {
    if (!this.conn) return;
    this.conn = null;
    this.cleanup();
    this.game.ui.toast(`📡 ${message}`);
    this.game.ui.notice(message);
  }

  cleanup() {
    const g = this.game;
    this.decoder?.reset();
    this.decoder = null;
    this.encoder = null;
    this.role = null;
    this.players = [];
    this.inRound = false;
    g.mode = 'solo';
    g.toLobby();
    g.makeSoloRoster();
    g.island.setDynamicColliders(null);
  }

  // ------------------------------------------------------------------ HOST
  installHostHooks() {
    if (this.hooksInstalled) return;
    this.hooksInstalled = true;
    const g = this.game;
    const live = () => this.isHost && (g.state === 'playing' || g.state === 'ending' || g.state === 'ended');
    const emit = g.particles.emit.bind(g.particles);
    g.particles.emit = (o) => {
      emit(o);
      if (live()) this.events.push(['p', o]);
    };
    let depth = 0;
    for (const name of SHARED_SOUNDS) {
      const fn = g.audio[name].bind(g.audio);
      g.audio[name] = (...args) => {
        depth++;
        try { fn(...args); } finally { depth--; }
        if (depth === 0 && live()) this.events.push(['a', name, args]);
      };
    }
    for (const name of ['flash', 'countdown']) {
      const fn = g.ui[name].bind(g.ui);
      g.ui[name] = (...args) => {
        fn(...args);
        if (live()) this.events.push(['u', name, args]);
      };
    }
  }

  broadcastRoom(extra = {}) {
    if (!this.isHost) return;
    this.conn.sendTo('all', { t: 'room', code: this.code, players: this.players, playing: this.game.state !== 'lobby', ...extra });
    this.game.ui.showRoom();
  }

  onJoin(m) {
    this.players.push({ id: m.id, name: m.name, host: false });
    this.broadcastRoom();
    this.game.ui.toast(`👋 ${m.name} joined`);
    // joined mid-round: let them spectate right away
    if (this.inRound) {
      this.conn.sendTo(m.id, this.startMessage());
      this.encoder.reset();
    }
  }

  onLeave(m) {
    const p = this.players.find((x) => x.id === m.id);
    this.players = this.players.filter((x) => x.id !== m.id);
    const c = this.game.characters.find((ch) => ch.remote && ch.clientId === m.id);
    if (c && c.alive) this.game.killCharacter(c, 'left the game', null);
    if (c) c.clientId = null;
    if (p) this.game.ui.toast(`👋 ${p.name} left`);
    this.broadcastRoom();
  }

  onClientMessage(from, d) {
    if (!d || typeof d !== 'object') return;
    const c = this.game.characters.find((ch) => ch.remote && ch.clientId === from);
    if (d.t === 'in' && c && Array.isArray(d.p) && Array.isArray(d.v)) {
      c.netIn = d;
    } else if (d.t === 'word' && c && typeof d.w === 'string') {
      this.game.writer.remoteSubmit(c, d.w.slice(0, 24));
    }
  }

  /** Host pressed Start: humans take the first character slots, bots fill the rest. */
  assignHumans() {
    const g = this.game;
    const clients = this.players.filter((p) => !p.host).slice(0, g.characters.length - 1);
    g.characters.forEach((c, i) => {
      if (i === 0) return;
      const p = clients[i - 1];
      c.remote = !!p;
      c.isBot = !p;
      c.clientId = p ? p.id : null;
      c.netIn = null;
      if (p) c.setName(p.name);
    });
  }

  startMessage() {
    const g = this.game;
    return {
      t: 'start',
      roster: g.characters.map((c) => ({
        id: c.id, name: c.name, colors: c.colors,
        cid: c.isPlayer ? this.conn.id : c.remote ? c.clientId : null,
        pos: [R2(c.pos.x), R2(c.pos.y), R2(c.pos.z)], alive: c.alive,
      })),
    };
  }

  hostStarted() {
    this.inRound = true;
    this.events.length = 0;
    this.direct.clear();
    this.encoder.reset();
    this.lastColSig = '';
    for (const c of this.game.characters) c.corr = { dp: [0, 0, 0], dv: [0, 0, 0] };
    this.conn.sendTo('all', this.startMessage());
    this.broadcastRoom();
  }

  /** Queue an event for everyone. */
  event(...e) { if (this.isHost && this.inRound) this.events.push(e); }

  /** Queue an event for one client. */
  sendDirect(clientId, ...e) {
    if (!this.isHost || clientId == null) return;
    let q = this.direct.get(clientId);
    if (!q) this.direct.set(clientId, (q = []));
    q.push(e);
  }

  queueHurt(clientId, dmg) { this.hurtAcc.set(clientId, (this.hurtAcc.get(clientId) || 0) + dmg); }

  shake(amount, x, z) {
    if (!this.isHost || !this.inRound || amount < 0.08) return;
    if (!this.pendingShake || amount > this.pendingShake[0]) this.pendingShake = [R2(amount), x === undefined ? null : R2(x), z === undefined ? null : R2(z)];
  }

  /** Before hazards run: put remote players where their own browsers say they are. */
  hostBeforeHazards() {
    for (const c of this.game.characters) {
      if (!c.remote || !c.alive) continue;
      const n = c.netIn;
      if (n) {
        c.pos.set(n.p[0], n.p[1], n.p[2]);
        c.vel.set(n.v[0], n.v[1], n.v[2]);
        c.yaw = +n.y || 0;
        c.onGround = !!n.g;
        c.input.jumpHeld = !!n.j;
        c.netIn = null;
      }
      (c.basePos ||= new THREE.Vector3()).copy(c.pos);
      (c.baseVel ||= new THREE.Vector3()).copy(c.vel);
    }
  }

  /** After the simulation: whatever hazards did to them becomes a correction to send. */
  hostAfterSim() {
    const g = this.game;
    for (const c of g.characters) {
      if (!c.remote || !c.alive || !c.basePos) continue;
      const corr = c.corr || (c.corr = { dp: [0, 0, 0], dv: [0, 0, 0] });
      corr.dp[0] += c.pos.x - c.basePos.x; corr.dp[1] += c.pos.y - c.basePos.y; corr.dp[2] += c.pos.z - c.basePos.z;
      corr.dv[0] += c.vel.x - c.baseVel.x; corr.dv[1] += c.vel.y - c.baseVel.y; corr.dv[2] += c.vel.z - c.baseVel.z;
      if (c.pos.y <= KILL_Y + 0.05) g.killCharacter(c, 'fell off the island', c.recentAttacker());
    }
  }

  hostTick(dt) {
    if (!this.isHost || !this.inRound) return;
    this.snapT += dt;
    if (this.snapT < 1 / SNAP_RATE) return;
    this.snapT = 0;
    const g = this.game;
    const e = g.env;
    const hex = (c) => (c ? c.getHex() : null);
    const snap = {
      t: 's',
      st: g.state,
      tm: Math.round(g.roundTime),
      ch: g.characters.map((c) => [
        c.id, R2(c.pos.x), R2(c.pos.y), R2(c.pos.z), R2(c.yaw), Math.max(0, Math.ceil(c.hp)), c.alive ? 1 : 0,
        (c.onGround ? 1 : 0) | (c.tripped > 0 ? 2 : 0) | (c.jetpack > 0 && c.input.jumpHeld ? 4 : 0) | (c.shield > 0 ? 8 : 0) | (c.hurtFlash > 0 ? 16 : 0),
        R2(c.mods.sink), R2(c.vel.x), R2(c.vel.z),
      ]),
      env: [R2(e.friction), R2(e.speedMul), R2(e.windX), R2(e.windZ), Math.round(e.fogFar), Math.round(e.fogNear), hex(e.fogColor), hex(e.skyTint), R2(e.light), hex(e.groundTint)],
      hud: {
        ph: g.writer.phase, wid: g.writer.writer ? g.writer.writer.id : -1, wt: Math.ceil(g.writer.timer),
        hz: g.hazards.list.map((h) => [h.uid, h.icon, h.label, h.owner ? h.owner.name : '', R2(clamp(1 - h.t / h.duration, 0, 1)), h.recharging ? 1 : 0]),
      },
      cr: {},
    };
    for (const c of g.characters) {
      if (!c.remote || !c.alive) continue;
      const corr = c.corr || { dp: [0, 0, 0], dv: [0, 0, 0] };
      snap.cr[c.id] = {
        dp: corr.dp.map(R2), dv: corr.dv.map(R2),
        m: [R2(c.mods.speedMul), R2(c.mods.friction), R2(c.mods.jumpMul), R2(c.mods.sink)],
        tr: R2(c.tripped), jp: R2(c.jetpack), sb: R2(c.speedBoost), sh: Math.ceil(c.shield),
      };
      c.corr = { dp: [0, 0, 0], dv: [0, 0, 0] };
    }
    const cols = g.island.dynamicColliders();
    const sig = JSON.stringify(cols);
    if (sig !== this.lastColSig) { snap.col = cols; this.lastColSig = sig; }
    const sc = this.encoder.encode();
    if (Object.keys(sc).length) snap.sc = sc;
    if (this.events.length) { snap.ev = this.events; this.events = []; }
    if (this.pendingShake) { snap.sh = this.pendingShake; this.pendingShake = null; }
    this.conn.sendTo('all', snap);
    for (const [cid, dmg] of this.hurtAcc) this.sendDirect(cid, 'hurt', R2(dmg));
    this.hurtAcc.clear();
    for (const [cid, q] of this.direct) if (q.length) this.conn.sendTo(cid, { t: 'd', ev: q });
    this.direct.clear();
  }

  hostEnded(winner) {
    if (!this.isHost) return;
    this.hostTick(1); // flush the last events
    this.conn.sendTo('all', { t: 'end', winner: winner ? winner.id : -1, time: Math.round(this.game.roundTime) });
    this.inRound = false;
  }

  hostToRoom(aborted) {
    if (!this.isHost) return;
    this.inRound = false;
    for (const c of this.game.characters) { c.remote = false; c.clientId = null; }
    this.broadcastRoom({ aborted: !!aborted });
  }

  // ------------------------------------------------------------------ CLIENT
  onHostMessage(m) {
    const g = this.game;
    switch (m.t) {
      case 'room':
        this.code = m.code;
        this.players = m.players;
        this.playing = m.playing;
        if (m.aborted && this.inRound) {
          this.inRound = false;
          g.toLobby();
          g.ui.toast('The host ended the round');
        }
        if (g.state === 'lobby') g.ui.showRoom();
        break;
      case 'start': this.clientStart(m); break;
      case 's': if (this.inRound) this.applySnapshot(m); break;
      case 'd': if (this.inRound) for (const e of m.ev) this.directEvent(e); break;
      case 'end': if (this.inRound) this.clientEnd(m); break;
      default: break;
    }
  }

  clientStart(m) {
    const g = this.game;
    this.inRound = true;
    this.decoder.reset();
    this.prevSnap = null;
    this.env = null;
    this.hud = null;
    g.applyRoster(m.roster, this.conn.id);
    g.clientRoundStarted();
  }

  applySnapshot(s) {
    const g = this.game;
    const now = performance.now() / 1000;
    if (s.st === 'playing' || s.st === 'ending') g.state = s.st;
    g.roundTime = s.tm;
    const me = g.player;
    for (const row of s.ch) {
      const c = g.charById(row[0]);
      if (!c) continue;
      const wasAlive = c.alive;
      c.hp = row[5];
      c.alive = row[6] === 1;
      const f = row[7];
      if (c === me) {
        if (wasAlive && !c.alive) g.onLocalDeath();
        continue;
      }
      c.mesh.visible = c.alive;
      const target = [row[1], row[2], row[3], row[4]];
      c.netFrom = c.netTo ? this.charPose(c) : target;
      c.netTo = target;
      c.netFlags = f;
      c.onGround = !!(f & 1);
      c.tripped = f & 2 ? 0.5 : 0;
      c.shield = f & 8 ? 1 : 0;
      c.hurtFlash = f & 16 ? 0.25 : Math.min(c.hurtFlash, 0.1);
      c.mods.sink = row[8];
      c.vel.set(row[9], 0, row[10]);
      if (f & 4 && Math.random() < 0.5) g.particles.emit({ x: c.pos.x, y: c.pos.y + 0.8, z: c.pos.z, color: [0xffa31a, 0xffe066], count: 2, speed: 2, size: 0.25, life: 0.4, gravity: -2 });
    }
    this.snapTime = now;
    const cr = s.cr && s.cr[me.id];
    if (cr && me.alive) {
      me.pos.x += cr.dp[0]; me.pos.y += cr.dp[1]; me.pos.z += cr.dp[2];
      me.vel.x += cr.dv[0]; me.vel.y += cr.dv[1]; me.vel.z += cr.dv[2];
      const hs = Math.hypot(me.vel.x, me.vel.z);
      if (hs > 24) { me.vel.x *= 24 / hs; me.vel.z *= 24 / hs; }
      if (me.vel.y > 24) me.vel.y = 24;
      if (cr.dv[1] > 0.5) me.onGround = false;
      me.netMods = cr.m;
      me.tripped = cr.tr;
      me.jetpack = cr.jp;
      me.speedBoost = cr.sb;
      me.shield = cr.sh;
    }
    if (s.env) this.env = s.env;
    if (s.hud) this.hud = s.hud;
    if (s.col) g.island.setDynamicColliders(s.col);
    if (s.sc) this.decoder.apply(s.sc, (params, parent) => this.makeLocalEffect(params, parent));
    if (s.ev) for (const e of s.ev) this.event_(e);
    if (s.sh) g.addShake(s.sh[0], s.sh[1] ?? undefined, s.sh[2] ?? undefined);
    // typing bubble above whoever is writing
    const bubble = g.writer.bubble;
    const w = this.hud && this.hud.ph === 'writing' ? g.charById(this.hud.wid) : null;
    if (w && w !== me && w.alive) { if (bubble.parent !== w.mesh) w.mesh.add(bubble); }
    else if (bubble.parent) bubble.parent.remove(bubble);
  }

  charPose(c) { return [c.pos.x, c.pos.y, c.pos.z, c.yaw]; }

  makeLocalEffect(params, parent) {
    if (params.kind === 'precip') {
      const p = new Precipitation({ game: this.game }, params, parent);
      p.set(params);
      return p;
    }
    return null;
  }

  /** Broadcast events from the host. */
  event_(e) {
    const g = this.game;
    switch (e[0]) {
      case 'p': g.particles.emit(e[1]); break;
      case 'a': g.audio[e[1]]?.(...e[2]); break;
      case 'u': g.ui[e[1]]?.(...e[2]); break;
      case 'f': g.ui.killFeed(e[1]); break;
      case 'kill': g.clientKill(e[1], e[2], e[3]); break;
      case 'word': g.clientWord(e[1]); break;
      case 'win': g.announceWinner(g.charById(e[1])); break;
      default: break;
    }
  }

  /** Events meant only for this player. */
  directEvent(e) {
    const g = this.game;
    switch (e[0]) {
      case 'toast': g.ui.toast(e[1]); if (e[2]) g.audio[e[2]]?.(); break;
      case 'coins': g.addCoins(e[1], e[2]); break;
      case 'hurt':
        g.ui.hurt(e[1]);
        if (e[1] > 3) g.audio.hurt();
        g.addShake(Math.min(0.6, e[1] / 60));
        break;
      case 'wopen': this.openWriter(); break;
      case 'wclose':
        this.writing = false;
        g.ui.closeWriter();
        if (e[1]) g.ui.toast(e[1]);
        break;
      case 'werr': g.ui.writerError(e[1]); break;
      default: break;
    }
  }

  openWriter() {
    const g = this.game;
    this.writing = true;
    this.writerT = 10;
    g.audio.writerTurn();
    g.ui.announce('✍️ You are the', 'WRITER!', 'Type a word. It will come to life!', '#7dffb0');
    g.ui.openWriter((word) => {
      const w = word.trim();
      if (w.replace(/\s/g, '').length < 2) return g.ui.writerError('Type at least 2 letters!');
      if (!isWordAllowed(w)) { g.audio.hurt(); return g.ui.writerError("🚫 That word isn't allowed. Try another!"); }
      this.conn.send({ t: 'word', w });
    });
  }

  clientEnd(m) {
    this.inRound = false;
    this.writing = false;
    this.game.clientRoundEnded(this.game.charById(m.winner), m.time);
  }

  /** Client per-frame work: env, interpolation, sending our position. */
  clientUpdate(dt) {
    const g = this.game;
    if (this.env) {
      const e = g.env, v = this.env;
      e.friction = v[0]; e.speedMul = v[1]; e.windX = v[2]; e.windZ = v[3]; e.fogFar = v[4]; e.fogNear = v[5];
      e.fogColor = v[6] === null ? null : (this._fog ||= new THREE.Color()).setHex(v[6]);
      e.skyTint = v[7] === null ? null : (this._sky ||= new THREE.Color()).setHex(v[7]);
      e.light = v[8];
      e.groundTint = v[9] === null ? null : (this._gr ||= new THREE.Color()).setHex(v[9]);
    }
    const me = g.player;
    if (me.netMods) {
      me.mods.speedMul = me.netMods[0]; me.mods.friction = me.netMods[1]; me.mods.jumpMul = me.netMods[2]; me.mods.sink = me.netMods[3];
    }
    // interpolate everyone else toward the latest snapshot
    const t = this.snapTime ? Math.min(1, (performance.now() / 1000 - this.snapTime) * SNAP_RATE) : 1;
    for (const c of g.characters) {
      if (c === me || !c.netTo || !c.alive) continue;
      const a = c.netFrom, b = c.netTo;
      c.pos.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
      c.yaw = angleLerp(a[3], b[3], t);
    }
    this.decoder?.update(dt);
    if (this.writing) {
      this.writerT -= dt;
      g.ui.setWriterTime(this.writerT, this.writerT / 10);
    }
    this.inputT += dt;
    if (this.inputT >= 1 / INPUT_RATE && me.alive && this.inRound) {
      this.inputT = 0;
      this.conn.send({
        t: 'in',
        p: [R2(me.pos.x), R2(me.pos.y), R2(me.pos.z)],
        v: [R2(me.vel.x), R2(me.vel.y), R2(me.vel.z)],
        y: R2(me.yaw), g: me.onGround ? 1 : 0, j: me.input.jumpHeld ? 1 : 0,
      });
    }
  }

  /** HUD data from the latest snapshot. */
  hudData() {
    const g = this.game;
    const h = this.hud;
    let writer = '';
    if (h) {
      if (h.ph === 'waiting') writer = `✍️ Next word in ${h.wt}s`;
      else if (h.ph === 'writing') {
        const w = g.charById(h.wid);
        writer = w === g.player ? '✍️ YOU are the Writer!' : `✍️ ${w ? w.name : '?'} is typing${'.'.repeat(1 + (Math.floor(g.time * 3) % 3))}`;
      }
    }
    return {
      writer,
      hazards: (h ? h.hz : []).map(([uid, icon, label, owner, frac, rech]) => ({ uid, icon: rech ? '⏳' : icon, label, owner, frac, recharging: !!rech })),
    };
  }
}
