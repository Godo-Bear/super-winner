import * as THREE from 'three';
import { ISLAND_RADIUS } from '../island.js';

/**
 * Base class for every hazard.
 *
 * Lifecycle: constructed when the word is written → tick(dt) every frame →
 * marked `done` when `t >= duration` (or set `this.done = true` yourself) →
 * dispose() removes everything it added to the scene / island.
 *
 * Bots read `this.threats` (rebuilt every frame) to dodge:
 *   { type: 'avoid', x, z, radius }   run out of this circle
 *   { type: 'hide' }                  go inside the hut / a bunker
 *   { type: 'high' }                  climb the hill
 *   { type: 'ring', radius }          stay within this distance of the centre
 *   { type: 'seek', x, z }            pick-up worth grabbing
 * Keep threat objects stable between frames (bots remember per object whether
 * they "noticed" it, which is how the ~70% dodge rate works).
 */
export class Hazard {
  constructor(game, { word, entry, owner, spec = null }) {
    this.game = game;
    this.word = word;
    this.entry = entry;
    this.owner = owner;
    this.opts = { word, entry, owner, spec };
    this.recurring = true; // comes back after a pause when finished (set false for one-time things)
    this.generation = 1;
    this.label = entry ? entry.name : word.replace(/\b\w/g, (c) => c.toUpperCase());
    this.icon = entry ? entry.icon : '🫧';
    this.hint = entry ? entry.hint : 'A Mystery Blob appears!';
    this.killVerb = `was wiped out by ${this.label}`;
    this.t = 0;
    this.duration = 20;
    this.done = false;
    this.group = new THREE.Group();
    (game.hazardRoot || game.scene).add(this.group);
    this.threats = [];
    this.colliders = [];
    this.shelters = [];
    this.disposables = [];
    this.R = ISLAND_RADIUS;
  }

  get island() { return this.game.island; }
  get particles() { return this.game.particles; }
  get audio() { return this.game.audio; }
  get characters() { return this.game.characters; }

  tick(dt) {
    this.t += dt;
    this.threats.length = 0;
    this.update(dt);
    if (this.t >= this.duration) this.done = true;
  }

  /** Override me. */
  update() {}

  /** Damage helper that credits the writer of this hazard. */
  hit(ch, amount, opts) { return this.game.damage(ch, amount, this, opts); }

  *living() { for (const c of this.game.characters) if (c.alive) yield c; }

  addCollider(c) { this.island.addCollider(c); this.colliders.push(c); return c; }
  removeCollider(c) {
    this.island.removeCollider(c);
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
  }
  addShelter(s) { const sh = this.island.addShelter(s); this.shelters.push(sh); return sh; }

  /** Register something with a dispose() to be cleaned up. */
  track(x) { this.disposables.push(x); return x; }

  onDispose() {}

  dispose() {
    this.onDispose();
    this.group.parent?.remove(this.group);
    for (const c of this.colliders) this.island.removeCollider(c);
    for (const s of this.shelters) this.island.removeShelter(s);
    this.group.traverse((o) => { if (o.userData && o.userData.dispose) o.userData.dispose(); });
    for (const d of this.disposables) d.dispose?.();
    this.colliders.length = 0;
    this.shelters.length = 0;
  }
}
