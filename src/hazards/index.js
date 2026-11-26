import { resolveWord, normalizeWord } from '../words.js';

/**
 * Hazard registry: maps the `hazard` key used in words.js to a Hazard class.
 * Each hazard module exports an object of { key: Class }.
 */
export const REGISTRY = {};

export function registerHazards(map) { Object.assign(REGISTRY, map); }

export const MAX_HAZARDS = 12;

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
    const word = normalizeWord(rawWord) || 'blob';
    const entry = resolveWord(word);
    let Cls = entry ? REGISTRY[entry.hazard] : null;
    if (!Cls) Cls = REGISTRY.mystery;
    if (!Cls) return null;
    while (this.list.length >= this.max) this.remove(this.list[0]);
    const h = new Cls(this.game, { word, entry, owner });
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
      if (h.done) this.remove(h);
      else for (const t of h.threats) this.threats.push(t);
    }
  }

  clear() {
    for (const h of this.list.slice()) this.remove(h);
    this.threats.length = 0;
  }
}
