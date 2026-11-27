import { normalizeWord } from '../words.js';
import { interpret } from '../lexicon.js';

/**
 * Hazard registry: maps the `hazard` key used in words.js to a Hazard class.
 * Each hazard module exports an object of { key: Class }.
 */
export const REGISTRY = {};

export function registerHazards(map) { Object.assign(REGISTRY, map); }

export const MAX_HAZARDS = 12;
export const RECUR_DELAY = [6, 11];

/**
 * Stand-in for a finished hazard that is "recharging" before it strikes again.
 * Hazards stack: a word stays active (repeating) until the cap pushes it out.
 */
class Recharging {
  constructor(prev, delay) {
    this.prev = prev;
    this.uid = prev.uid;
    this.label = prev.label;
    this.icon = '⏳';
    this.owner = prev.owner;
    this.entry = prev.entry;
    this.word = prev.word;
    this.t = 0;
    this.duration = delay;
    this.done = false;
    this.threats = [];
    this.recharging = true;
  }
  tick(dt) { this.t += dt; if (this.t >= this.duration) this.done = true; }
  dispose() {}
}

export class HazardManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.max = MAX_HAZARDS;
    this.threats = [];
    this.uid = 0;
  }

  /** Turns a typed word into a live hazard. Unknown words become Mystery Blobs. */
  spawn(rawWord, owner) {
    const word = normalizeWord(rawWord).split(' ').slice(-2).join(' ') || 'blob';
    // the word brain: dictionary word, describing word + noun, extra words, word parts... or a Mystery Blob
    const meaning = interpret(word);
    let Cls = null, entry = null, spec = null;
    if (meaning?.item) { Cls = REGISTRY.giveitem; spec = { item: meaning.item }; }
    else if (meaning?.entry) { entry = meaning.entry; Cls = REGISTRY[entry.hazard]; }
    else if (meaning?.hazard) { Cls = REGISTRY[meaning.hazard]; spec = meaning.spec; }
    if (!Cls) { Cls = REGISTRY.mystery; entry = null; spec = null; }
    if (!Cls) return null;
    while (this.list.length >= this.max) this.remove(this.list[0]);
    const h = new Cls(this.game, { word, entry, owner, spec });
    if (meaning && Cls !== REGISTRY.mystery) {
      if (!h.keepLabel) {
        h.label = meaning.label || h.label;
        if (meaning.icon && !entry) h.icon = meaning.icon;
      }
      h.smart = !entry; // made by the word brain (shown in the Index under "other words")
    }
    h.uid = ++this.uid;
    this.list.push(h);
    return h;
  }

  remove(h) {
    const i = this.list.indexOf(h);
    if (i >= 0) this.list.splice(i, 1);
    h.dispose();
  }

  update(dt) {
    this.threats.length = 0;
    for (const h of this.list.slice()) {
      h.tick(dt);
      if (h.done) this.finish(h);
      else for (const t of h.threats) this.threats.push(t);
    }
  }

  /** A hazard finished: recurring ones recharge and then strike again. */
  finish(h) {
    const i = this.list.indexOf(h);
    if (i < 0) return;
    h.dispose();
    const playing = this.game.state === 'playing';
    if (h.recharging) {
      if (!playing) { this.list.splice(i, 1); return; }
      const prev = h.prev;
      const n = new prev.constructor(this.game, prev.opts);
      n.uid = prev.uid;
      n.generation = prev.generation + 1;
      n.label = prev.label;
      n.icon = prev.icon;
      n.smart = prev.smart;
      this.list[i] = n;
      this.game.feed(`🔁 ${n.icon} <b>${n.label.toUpperCase()}</b> strikes again!`);
    } else if (h.recurring && playing) {
      const rd = this.game.modeCfg?.recharge || RECUR_DELAY;
      const d = rd[0] + Math.random() * (rd[1] - rd[0]);
      this.list[i] = new Recharging(h, d);
    } else this.list.splice(i, 1);
  }

  clear() {
    for (const h of this.list.slice()) this.remove(h);
    this.threats.length = 0;
  }
}
