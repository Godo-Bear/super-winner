import { randomBotWord } from './words.js';
import { makeTextSprite, rand, pick } from './utils.js';
import { isWordAllowed } from './filter.js';

export const TURN_INTERVAL = 15;
export const LATE_INTERVAL = 12; // things speed up after a while
export const WRITE_TIME = 10;

const CATEGORY_COLORS = {
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
    this.lastSpawn = null;
    this.detachBubble();
  }

  cancel() {
    if (this.playerWriting) this.game.ui.closeWriter();
    this.playerWriting = false;
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
        this.submit(this.playerWriting ? (this.game.words.suggest('', 1)[0]?.fill ?? 'meteor') : this.botWord);
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
    if (this.turns > 0 && g.player.alive) g.addCoins(5, 'Survived a hazard!');
    this.turns++;
    // the player gets a fair (slightly boosted) shot at writing
    let w;
    if (g.player.alive && Math.random() < Math.max(1 / living.length, 0.18)) w = g.player;
    else w = pick(living.filter((c) => c !== g.player)) || g.player;
    this.writer = w;
    this.phase = 'writing';
    this.elapsed = 0;
    g.audio.writerTurn();
    if (w.isPlayer) {
      this.playerWriting = true;
      this.writeT = WRITE_TIME;
      g.ui.openWriter((word) => this.playerSubmit(word));
      g.ui.announce('✍️ You are the', 'WRITER!', 'Type a word. It will come to life!', '#7dffb0');
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

  submit(word) {
    if (this.phase !== 'writing') return;
    const g = this.game;
    if (this.playerWriting) g.ui.closeWriter();
    this.playerWriting = false;
    this.detachBubble();
    this.phase = 'waiting';
    this.timer = Math.max(3, this.interval - this.elapsed);
    const h = g.hazards.spawn(word, this.writer);
    if (!h) return;
    this.lastSpawn = h;
    g.discover(h.entry, h.entry ? null : h.word);
    const who = this.writer.isPlayer ? 'You wrote' : `${this.writer.name} wrote`;
    const color = h.entry ? CATEGORY_COLORS[h.entry.category] : '#c4a7ff';
    g.ui.announce(who, `${h.icon} ${h.label.toUpperCase()}`, h.hint, color);
    g.audio.announce();
    g.addShake(0.25);
  }
}
