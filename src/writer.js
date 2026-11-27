import { randomBotWord } from './words.js';
import { makeTextSprite, rand, pick } from './utils.js';
import { isWordAllowed } from './filter.js';

export const TURN_INTERVAL = 15;
export const LATE_INTERVAL = 12; // things speed up after a while
export const WRITE_TIME = 10;

/**
 * Chance that one particular living human becomes the next Writer.
 * Mirrors startTurn(): humans share a boosted slice, bots split the rest.
 */
export function writerChance(living, humans, bots) {
  if (!living || !humans) return 0;
  const P = Math.min(0.75, humans * Math.max(1 / living, 0.18));
  return bots > 0 ? P / humans : P / humans + (1 - P) / living;
}

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
    this.reset();
    this.phase = 'idle';
  }

  reset() {
    this.phase = 'waiting';
    this.timer = 5;
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

  detachBubble() { if (this.bubble.parent) this.bubble.parent.remove(this.bubble); }

  get interval() { return this.turns > 8 ? LATE_INTERVAL : TURN_INTERVAL; }

  statusText() {
    if (this.phase === 'waiting') return `✍️ Next word in ${Math.ceil(this.timer)}s`;
    if (this.phase === 'writing') {
      if (this.playerWriting) return '✍️ YOU are the Writer!';
      const dots = '.'.repeat(1 + (Math.floor(this.game.time * 3) % 3));
      return `✍️ ${this.writer.name} is typing${dots}`;
    }
    return '';
  }

  update(dt) {
    if (this.phase === 'waiting') {
      this.timer -= dt;
      if (this.timer <= 0) this.startTurn();
    } else if (this.phase === 'writing') {
      this.elapsed += dt;
      this.writeT -= dt;
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
        this.game.ui.setWriterTime(this.writeT, this.writeT / WRITE_TIME);
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

  startTurn() {
    const g = this.game;
    const living = g.livingCharacters();
    if (!living.length) return;
    const humans = living.filter((c) => c.isPlayer || c.remote);
    if (this.turns > 0) for (const h of humans) g.giveCoins(h, 5, 'Survived a hazard!');
    this.turns++;
    // humans get a fair (slightly boosted) shot at writing
    let w;
    if (humans.length && Math.random() < Math.min(0.75, humans.length * Math.max(1 / living.length, 0.18))) w = pick(humans); // keep in sync with writerChance()
    else w = pick(living.filter((c) => c.isBot)) || pick(living);
    this.writer = w;
    this.phase = 'writing';
    this.elapsed = 0;
    g.audio.writerTurn();
    if (w.isPlayer) {
      this.playerWriting = true;
      this.writeT = WRITE_TIME;
      g.ui.openWriter((word) => this.playerSubmit(word));
      g.ui.announce('✍️ You are the', 'WRITER!', 'Type a word. It will come to life!', '#7dffb0');
    } else if (w.remote) {
      this.playerWriting = false;
      this.remoteWriting = true;
      this.writeT = WRITE_TIME;
      g.net.sendDirect(w.clientId, 'wopen');
      w.mesh.add(this.bubble);
    } else {
      this.playerWriting = false;
      this.writeT = rand(1.8, 4);
      this.botWord = randomBotWord();
      w.mesh.add(this.bubble);
    }
  }

  /** Player pressed GO: any word is allowed unless it is inappropriate. */
  playerSubmit(word) {
    const w = word.trim();
    if (w.replace(/\s/g, '').length < 2) {
      this.game.ui.writerError('Type at least 2 letters!');
      return;
    }
    if (!isWordAllowed(w)) {
      this.game.ui.writerError("🚫 That word isn't allowed. Try another!");
      this.game.audio.hurt();
      return;
    }
    this.submit(w);
  }

  /** An online friend sent their word. */
  remoteSubmit(ch, word) {
    if (this.phase !== 'writing' || !this.remoteWriting || this.writer !== ch) return;
    const w = word.trim();
    if (w.replace(/\s/g, '').length < 2) return this.game.net.sendDirect(ch.clientId, 'werr', 'Type at least 2 letters!');
    if (!isWordAllowed(w)) return this.game.net.sendDirect(ch.clientId, 'werr', "🚫 That word isn't allowed. Try another!");
    this.game.net.sendDirect(ch.clientId, 'wclose', '');
    this.submit(w);
  }

  submit(word) {
    if (this.phase !== 'writing') return;
    const g = this.game;
    if (this.playerWriting) g.ui.closeWriter();
    this.playerWriting = false;
    this.remoteWriting = false;
    this.detachBubble();
    this.phase = 'waiting';
    this.timer = Math.max(3, this.interval - this.elapsed);
    const h = g.hazards.spawn(word, this.writer);
    if (!h) return;
    this.lastSpawn = h;
    g.announceWord(this.writer, h);
  }
}
