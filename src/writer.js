import { randomBotWord } from './words.js';
import { randomSmartWord } from './lexicon.js';
import * as THREE from 'three';
import { makeTextSprite, rand, pick } from './utils.js';
import { isWordAllowed } from './filter.js';

export const TURN_INTERVAL = 15;
export const LATE_INTERVAL = 12; // things speed up after a while
export const WRITE_TIME = 10;

/**
 * Fair Writer picks: the longer you've waited since you last wrote, the better your chance.
 * Someone who just wrote gets a small chance; after ~5 minutes of waiting you're very likely next.
 * Real players count double compared with bots.
 */
export const writerWeight = (waitSeconds, human) => (human ? 2 : 1) * Math.min(6, Math.max(0.25, (waitSeconds + 15) / 60));

export const CATEGORY_COLORS = {
  disaster: '#ff8a1f', weather: '#7fd4ff', monster: '#c084fc', weapon: '#ff3b4f',
  nature: '#ffb347', helpful: '#5dff9e', silly: '#ffd23f',
};

/**
 * Picks a random living "Writer" every 15 s. Bots fake-type a word;
 * the player gets a text box with autocomplete and a 10 s timer.
 */
export class WriterSystem {
  constructor(game) {
    this.game = game;
    this.bubble = makeTextSprite('typing...', { fontSize: 40, height: 0.5, color: '#1b1530', stroke: '#ffffff', bg: 'rgba(255,248,231,0.95)' });
    this.bubble.position.y = 3.6;
    this.marker = makeWriterMarker();
    this.reset();
    this.phase = 'idle';
  }

  reset() {
    this.phase = 'waiting';
    this.timer = this.game.modeCfg ? this.game.modeCfg.firstTurn : 5;
    this.turns = 0;
    this.writer = null;
    this.playerWriting = false;
    this.remoteWriting = false;
    this.lastSpawn = null;
    this.detachBubble();
  }

  cancel() {
    if (this.playerWriting) this.game.ui.closeWriter();
    if (this.remoteWriting) this.game.net.sendDirect(this.writer.clientId, 'wclose', '');
    this.playerWriting = false;
    this.remoteWriting = false;
    this.phase = 'idle';
    this.detachBubble();
  }

  detachBubble() {
    if (this.bubble.parent) this.bubble.parent.remove(this.bubble);
    if (this.marker.parent) this.marker.parent.remove(this.marker);
  }

  /** Who is typing right now (any machine: host/solo from the sim, clients from the snapshot). */
  currentWriter() {
    const g = this.game;
    if (g.mode === 'client') {
      const h = g.net.hud;
      return h && h.ph === 'writing' ? g.charById(h.wid) : null;
    }
    return this.phase === 'writing' ? this.writer : null;
  }

  /** Keeps the golden arrow + ring on the Writer and animates them. Called every frame. */
  updateMarker(dt, time) {
    const w = this.currentWriter();
    const m = this.marker;
    if (!w || !w.alive) {
      if (m.parent) m.parent.remove(m);
      return null;
    }
    if (m.parent !== w.mesh) w.mesh.add(m);
    const { arrow, ring } = m.userData;
    arrow.position.y = (this.bubble.parent === w.mesh ? 4.75 : 4.15) + Math.abs(Math.sin(time * 5)) * 0.45;
    arrow.rotation.y += dt * 3;
    ring.rotation.z += dt * 1.5;
    const pulse = 1 + Math.sin(time * 6) * 0.08;
    ring.scale.set(pulse, pulse, 1);
    return w;
  }

  get interval() { const m = this.game.modeCfg; return this.turns > 8 ? m.lateInterval : m.interval; }
  get writeTime() { return this.game.modeCfg.writeTime || WRITE_TIME; }

  /** Sandbox: the player can write a word whenever they like (no timer, no turn). */
  freeWrite() {
    const g = this.game;
    if (!g.modeCfg.sandbox || g.state !== 'playing' || this.playerWriting) return;
    g.ui.openWriter((word, forSelf) => {
      const w = word.trim();
      if (w.split(/\s+/).length > 2) return g.ui.writerError('Use 1 or 2 words!');
      if (w.replace(/\s/g, '').length < 2) return g.ui.writerError('Type at least 2 letters!');
      if (!isWordAllowed(w)) return g.ui.writerError("🚫 That word isn't allowed. Try another!");
      g.ui.closeWriter();
      this.freeWriting = false;
      const h = g.hazards.spawn(w, g.player, { forSelf });
      if (h) g.announceWord(g.player, h);
    }, { noTimer: true });
    this.freeWriting = true;
  }

  statusText() {
    if (this.game.modeCfg.sandbox && this.phase !== 'writing') return '🧪 Sandbox · press ✍️ or T to write a word';
    if (this.phase === 'waiting') return `✍️ Next word in ${Math.ceil(this.timer)}s`;
    if (this.phase === 'writing') {
      if (this.playerWriting) return '✍️ YOU are the Writer!';
      const dots = '.'.repeat(1 + (Math.floor(this.game.time * 3) % 3));
      return `✍️ ${this.writer.name} is typing${dots}`;
    }
    return '';
  }

  update(dt) {
    if (this.freeWriting && this.game.player.alive) this.game.player.invincible = Math.max(this.game.player.invincible || 0, 0.25);
    if (this.phase === 'waiting') {
      this.timer -= dt;
      if (this.timer <= 0) this.startTurn();
    } else if (this.phase === 'writing') {
      this.elapsed += dt;
      this.writeT -= dt;
      // whoever is typing is safe inside a bubble shield
      if (this.writer && this.writer.alive) this.writer.invincible = Math.max(this.writer.invincible || 0, 0.25);
      if (!this.writer.alive) {
        // the writer died mid-sentence: their word still lands (chaos!)
        const human = this.playerWriting || this.remoteWriting;
        this.submit(human ? randomBotWord() : this.botWord);
        return;
      }
      if (this.remoteWriting) {
        if (this.writeT <= 0) {
          this.game.net.sendDirect(this.writer.clientId, 'wclose', '⏰ Too slow! A random word was picked');
          this.submit(randomBotWord());
        }
        return;
      }
      if (this.playerWriting) {
        this.game.ui.setWriterTime(this.writeT, this.writeT / this.writeTime);
        if (this.writeT <= 0) {
          const typed = document.getElementById('writer-input').value.trim();
          const ok = typed.replace(/\s/g, '').length >= 2 && isWordAllowed(typed);
          this.game.ui.toast(ok ? '⏰ Time! Sending your word...' : '⏰ Too slow! A random word was picked');
          this.submit(ok ? typed : randomBotWord());
        }
      } else {
        if (Math.random() < dt * 8) this.game.audio.typing();
        if (this.writeT <= 0) this.submit(this.botWord);
      }
    }
  }

  /** Key that survives between rounds (bots change names, online friends change character slots). */
  waitKey(c) { return c.isPlayer ? 'me' : c.remote ? `p${c.clientId}` : `b${c.id}`; }

  waited(c) {
    const g = this.game;
    this.lastWrote ||= new Map();
    const k = this.waitKey(c);
    if (!this.lastWrote.has(k)) this.lastWrote.set(k, g.time - 30); // newcomers start as if they'd waited a bit
    return g.time - this.lastWrote.get(k);
  }

  /** Each living character's chance (0..1) of being the next Writer. */
  chances() {
    const g = this.game;
    const living = g.livingCharacters().filter((c) => !g.modeCfg.sandbox || c.isBot);
    const w = living.map((c) => writerWeight(this.waited(c), c.isPlayer || c.remote));
    const total = w.reduce((a, b) => a + b, 0) || 1;
    return new Map(living.map((c, i) => [c, w[i] / total]));
  }

  chanceFor(c) { return this.chances().get(c) ?? 0; }

  startTurn() {
    const g = this.game;
    const living = g.livingCharacters();
    if (!living.length) return;
    const humans = living.filter((c) => c.isPlayer || c.remote);
    if (this.turns > 0) for (const h of humans) { g.giveCoins(h, 5, 'Survived a hazard!'); g.trackFor(h, 'survive'); }
    this.turns++;
    // fair pick: weighted by how long each person has waited (in Sandbox you write whenever you like, so bots take turns)
    let w = null;
    let r = Math.random();
    for (const [c, p] of this.chances()) { w = c; r -= p; if (r <= 0) break; }
    if (!w) { this.timer = this.interval; this.phase = 'waiting'; return; }
    this.lastWrote.set(this.waitKey(w), g.time);
    this.writer = w;
    this.phase = 'writing';
    this.elapsed = 0;
    g.audio.writerTurn();
    if (w.isPlayer) {
      this.playerWriting = true;
      this.writeT = this.writeTime;
      g.ui.openWriter((word, forSelf) => this.playerSubmit(word, forSelf));
      g.ui.announce('✍️ You are the', 'WRITER!', 'Type a word. It will come to life!', '#7dffb0');
    } else if (w.remote) {
      this.playerWriting = false;
      this.remoteWriting = true;
      this.writeT = this.writeTime;
      g.net.sendDirect(w.clientId, 'wopen');
      w.mesh.add(this.bubble);
    } else {
      this.playerWriting = false;
      this.writeT = rand(1.8, 4);
      this.botWord = Math.random() < 0.45 ? randomSmartWord() : randomBotWord();
      w.mesh.add(this.bubble);
    }
  }


  /** Player pressed GO: any word is allowed unless it is inappropriate. */
  playerSubmit(word, forSelf = false) {
    const w = word.trim();
    if (w.split(/\s+/).length > 2) {
      this.game.ui.writerError('Use 1 or 2 words!');
      return;
    }
    if (w.replace(/\s/g, '').length < 2) {
      this.game.ui.writerError('Type at least 2 letters!');
      return;
    }
    if (!isWordAllowed(w)) {
      this.game.ui.writerError("🚫 That word isn't allowed. Try another!");
      this.game.audio.hurt();
      return;
    }
    this.submit(w, forSelf);
  }

  /** An online friend sent their word. */
  remoteSubmit(ch, word, forSelf = false) {
    if (this.phase !== 'writing' || !this.remoteWriting || this.writer !== ch) return;
    const w = word.trim();
    if (w.split(/\s+/).length > 2) return this.game.net.sendDirect(ch.clientId, 'werr', 'Use 1 or 2 words!');
    if (w.replace(/\s/g, '').length < 2) return this.game.net.sendDirect(ch.clientId, 'werr', 'Type at least 2 letters!');
    if (!isWordAllowed(w)) return this.game.net.sendDirect(ch.clientId, 'werr', "🚫 That word isn't allowed. Try another!");
    this.game.net.sendDirect(ch.clientId, 'wclose', '');
    this.submit(w, forSelf);
  }

  submit(word, forSelf = false) {
    if (this.phase !== 'writing') return;
    const g = this.game;
    if (this.playerWriting) g.ui.closeWriter();
    this.playerWriting = false;
    this.remoteWriting = false;
    this.detachBubble();
    this.phase = 'waiting';
    this.timer = Math.max(3, this.interval - this.elapsed);
    // bots sometimes keep a vehicle / creature for themselves
    if (this.writer.isBot && !forSelf && Math.random() < 0.15) forSelf = true;
    const h = g.hazards.spawn(word, this.writer, { forSelf });
    if (!h) return;
    this.lastSpawn = h;
    g.announceWord(this.writer, h);
    if (this.writer.isPlayer || this.writer.remote) g.trackFor(this.writer, 'write');
  }
}

/** Big golden "this one is typing!" arrow plus a glowing ring at the feet. */
function makeWriterMarker() {
  const gold = new THREE.MeshBasicMaterial({ color: 0xffd23f });
  const edge = new THREE.MeshBasicMaterial({ color: 0x1b1530, side: THREE.BackSide });
  const g = new THREE.Group();
  const arrow = new THREE.Group();
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.62, 4), gold);
  head.rotation.x = Math.PI; // point down
  head.add(new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.74, 4), edge));
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.55, 0.26), gold);
  shaft.position.y = 0.55;
  shaft.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.63, 0.34), edge));
  arrow.add(head, shaft);
  g.add(arrow);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 1.0, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  g.add(ring);
  for (const o of [head, shaft, ring]) o.renderOrder = 3;
  g.userData = { arrow, ring };
  return g;
}
