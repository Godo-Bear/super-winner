import * as THREE from 'three';
import { block, flatMat, boxGeo, makeTextSprite } from './utils.js';
import { terrainHeight } from './island.js';
import { groundY } from './hazards/common.js';

/** "your sword" for you, "Noodle's sword" for others. */
const whose = (c) => (c.name === 'You' ? 'your' : `${c.name}'s`);

/**
 * ITEMS — things a Writer can ask for. Typing an item word gives it to the Writer only.
 * Hold up to 3. E (or the USE button) uses the selected one, Q switches.
 *
 *   kind     melee | slam | throw | heal | blink | trap   (used with E)
 *   passive  doublejump | superjump | glide | fast         (works just by holding it)
 *   uses     how many times it can be used (Infinity = forever)
 */
export const ITEMS = {
  sword: { name: 'Sword', icon: '🗡️', words: ['sword', 'swords', 'katana', 'blade', 'saber', 'lightsaber', 'dagger'], kind: 'melee', uses: Infinity, cooldown: 0.5, damage: 26, knock: 15, range: 2.8 },
  hammer: { name: 'Hammer', icon: '🔨', words: ['hammer', 'hammers', 'mallet', 'ban hammer'], kind: 'slam', uses: Infinity, cooldown: 1.4, damage: 30, knock: 18, range: 4 },
  snowball: { name: 'Snowballs', icon: '❄️', words: ['snowball', 'snowballs'], kind: 'throw', uses: 12, cooldown: 0.35, damage: 14, knock: 10 },
  medkit: { name: 'Medkit', icon: '🩹', words: ['medkit', 'medkits', 'bandage', 'bandaid', 'band aid', 'first aid'], kind: 'heal', uses: 3, cooldown: 1, amount: 40 },
  teleporter: { name: 'Teleporter', icon: '🌀', words: ['teleporter', 'teleport', 'portal', 'blink', 'warp'], kind: 'blink', uses: 4, cooldown: 0.8, range: 9 },
  trap: { name: 'Peel Trap', icon: '🍌', words: ['trap', 'traps', 'peel trap', 'banana trap'], kind: 'trap', uses: 5, cooldown: 0.5 },
  boots: { name: 'Bounce Boots', icon: '👟', words: ['boots', 'boot', 'sneakers', 'double jump', 'trainers', 'jump boots'], passive: 'doublejump', uses: Infinity },
  pogo: { name: 'Pogo Stick', icon: '🦘', words: ['pogo', 'pogo stick', 'super jump'], passive: 'superjump', uses: Infinity },
  umbrella: { name: 'Umbrella', icon: '☂️', words: ['umbrella', 'umbrellas', 'parasol', 'parachute'], passive: 'glide', uses: Infinity },
  bow: { name: 'Bow', icon: '🏹', words: ['bow', 'bow and arrow', 'arrows', 'arrow', 'crossbow', 'slingshot'], kind: 'throw', uses: 15, cooldown: 0.5, damage: 22, knock: 8, speed: 40, lob: 1.5, color: 0x8d6e63, size: 0.6 },
  boomerang: { name: 'Boomerang', icon: '🪃', words: ['boomerang', 'boomerangs', 'frisbee'], kind: 'boomerang', uses: Infinity, cooldown: 1.2, damage: 18, knock: 10, range: 13 },
  freeze: { name: 'Freeze Ray', icon: '🧊', words: ['freeze ray', 'freeze gun', 'ice ray', 'freezer gun', 'freeze blaster', 'ice gun'], kind: 'freeze', uses: 8, cooldown: 0.8, damage: 8, time: 2.5 },
  blower: { name: 'Leaf Blower', icon: '🌬️', words: ['leaf blower', 'blower', 'hair dryer', 'wind gun', 'air cannon', 'fan gun'], kind: 'push', uses: Infinity, cooldown: 1, damage: 5, knock: 24, range: 7 },
  wand: { name: 'Magic Wand', icon: '🪄', words: ['wand', 'magic wand', 'staff', 'magic staff', 'spell', 'spells', 'spellbook'], kind: 'wand', uses: 8, cooldown: 1 },
  cloak: { name: 'Invisibility Cloak', icon: '🧥', words: ['invisibility cloak', 'cloak', 'invisibility', 'invisible cloak', 'camouflage', 'camo'], passive: 'invisible', uses: Infinity },
  grapple: { name: 'Grappling Hook', icon: '🪝', words: ['grappling hook', 'grapple', 'hook', 'grappling', 'rope', 'web shooter'], kind: 'grapple', uses: 10, cooldown: 0.8, range: 20 },
  grenade: { name: 'Grenades', icon: '💣', words: ['grenade', 'grenades', 'bomb item', 'water balloon', 'water balloons'], kind: 'throw', uses: 4, cooldown: 1, damage: 35, knock: 14, explode: 3.2, speed: 18, lob: 8, color: 0x2f3e2f, size: 1.2 },
  skateboard: { name: 'Skateboard', icon: '🛹', words: ['skateboard', 'skateboards', 'skates', 'rollerblades', 'scooter', 'roller skates'], passive: 'fast', uses: Infinity },
};
export const ITEM_IDS = Object.keys(ITEMS);
export const MAX_ITEMS = 3;

const WORD_TO_ITEM = new Map();
for (const [id, it] of Object.entries(ITEMS)) for (const w of it.words) WORD_TO_ITEM.set(w, id);

/** Item id for a typed word (or null). */
export function itemForWord(word) {
  const w = String(word).toLowerCase().trim();
  return WORD_TO_ITEM.get(w) || WORD_TO_ITEM.get(w.replace(/s$/, '')) || null;
}

export const hasPassive = (c, p) => !!c.items && c.items.some((i) => ITEMS[i.id]?.passive === p);

/** Small 3D model held in the right hand. */
export function makeHeldModel(id) {
  const g = new THREE.Group();
  if (id === 'sword') {
    g.add(block(0.12, 1.3, 0.06, 0xdfe6ee, 0, -0.85, 0.2, false));
    g.add(block(0.4, 0.08, 0.12, 0x8d6e63, 0, -0.22, 0.2, false));
    g.add(block(0.1, 0.25, 0.1, 0x5d4037, 0, -0.08, 0.2, false));
    g.rotation.x = Math.PI;
    g.position.y = -0.8;
  } else if (id === 'hammer') {
    g.add(block(0.1, 1.1, 0.1, 0x8d6e63, 0, 0.4, 0.15, false));
    g.add(block(0.6, 0.35, 0.35, 0x9aa0a8, 0, 0.95, 0.15, false));
    g.position.y = -0.85;
  } else if (id === 'umbrella') {
    g.add(block(0.06, 1.2, 0.06, 0x333333, 0, 0.5, 0.1, false));
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.45, 8), flatMat(0xd62828));
    top.position.set(0, 1.15, 0.1);
    g.add(top);
    g.position.y = -0.85;
  } else {
    const s = makeTextSprite(ITEMS[id].icon, { fontSize: 72, height: 0.55, stroke: '#ffffff' });
    s.position.set(0, -0.95, 0.25);
    g.add(s);
  }
  return g;
}

const ballGeo = new THREE.IcosahedronGeometry(0.22, 0);
const peelGeo = boxGeo(0.5, 0.08, 0.5);

/**
 * Runs item effects (host / single player): uses, projectiles and traps.
 * Projectiles and traps live under the hazard root so online players see them.
 */
export class ItemSystem {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    game.hazardRoot.add(this.group);
    this.balls = [];
    this.traps = [];
  }

  reset() {
    for (const b of this.balls) this.group.remove(b.mesh);
    for (const t of this.traps) this.group.remove(t.mesh);
    this.balls.length = 0;
    this.traps.length = 0;
  }

  /** Give an item to a character (only them). */
  give(c, id, { unlimited = false } = {}) {
    if (!ITEMS[id] || !c) return;
    c.items ||= [];
    const uses = unlimited ? Infinity : ITEMS[id].uses;
    const have = c.items.find((i) => i.id === id);
    if (have) have.uses = uses;
    else {
      if (c.items.length >= MAX_ITEMS) c.items.shift();
      c.items.push({ id, uses });
      c.held = c.items.length - 1;
    }
    this.game.notify(c, `🎁 You got: ${unlimited ? '♾️ UNLIMITED ' : ''}${ITEMS[id].icon} ${ITEMS[id].name}!${ITEMS[id].passive ? '' : ' Press E to use'}`, 'powerup');
    this.sync(c);
  }

  /** Online: tell a friend's browser what they're holding (their physics uses it). */
  sync(c) {
    if (c.remote) this.game.net.sendDirect(c.clientId, 'items', c.items, c.held || 0);
    if (c.isPlayer) this.game.ui.renderHotbar?.();
  }

  /** Use the selected (or given) item. */
  use(c, index = c.held || 0) {
    const g = this.game;
    if (!c || !c.alive || !c.items || !c.items[index]) return;
    c.held = index;
    const slot = c.items[index];
    const it = ITEMS[slot.id];
    if (!it || it.passive) return;
    if ((c.itemCd || 0) > g.time) return;
    c.itemCd = g.time + it.cooldown;
    const src = { owner: c, label: it.name, killVerb: `got bonked by ${whose(c)} ${it.name.toUpperCase()}` };
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    c.swingT = 0.3;
    if (it.kind === 'melee') {
      for (const o of g.characters) {
        if (o === c || !o.alive) continue;
        const dx = o.pos.x - c.pos.x, dz = o.pos.z - c.pos.z, d = Math.hypot(dx, dz);
        if (d > it.range || Math.abs(o.pos.y - c.pos.y) > 2) continue;
        if ((dx * fx + dz * fz) / (d || 1) < 0.3) continue; // must be in front
        g.damage(o, it.damage, src, { knock: { x: (dx / (d || 1)) * it.knock, y: 6, z: (dz / (d || 1)) * it.knock } });
      }
      g.particles.emit({ x: c.pos.x + fx * 1.4, y: c.pos.y + 1.2, z: c.pos.z + fz * 1.4, color: [0xffffff, 0xdfe6ee], count: 8, speed: 4, size: 0.18, life: 0.3, gravity: 0 });
      g.audio.whoosh();
    } else if (it.kind === 'slam') {
      for (const o of g.characters) {
        if (o === c || !o.alive) continue;
        const dx = o.pos.x - c.pos.x, dz = o.pos.z - c.pos.z, d = Math.hypot(dx, dz);
        if (d > it.range || Math.abs(o.pos.y - c.pos.y) > 2.5) continue;
        g.damage(o, it.damage, src, { knock: { x: (dx / (d || 1)) * it.knock, y: 9, z: (dz / (d || 1)) * it.knock } });
      }
      g.particles.emit({ x: c.pos.x, y: c.pos.y + 0.2, z: c.pos.z, color: [0x8a5a35, 0x9a9aa6, 0xffffff], count: 26, speed: 9, up: 3, size: 0.35, life: 0.6, spread: 1 });
      g.audio.explosion(0.6);
      g.addShake(0.4, c.pos.x, c.pos.z);
    } else if (it.kind === 'throw') {
      const sp = it.speed || 26;
      this.fire(c, { x: c.pos.x + fx * 0.8, y: c.pos.y + 1.7, z: c.pos.z + fz * 0.8 }, { vx: fx * sp + c.vel.x * 0.5, vy: it.lob ?? 4, vz: fz * sp + c.vel.z * 0.5 }, { damage: it.damage, knock: it.knock, src, explode: it.explode, color: it.color, size: it.size });
      g.audio.pop();
    } else if (it.kind === 'boomerang') {
      this.fire(c, { x: c.pos.x + fx * 0.8, y: c.pos.y + 1.5, z: c.pos.z + fz * 0.8 }, { vx: fx * 20, vy: 0, vz: fz * 20 }, { damage: it.damage, knock: it.knock, src, color: 0xc68642, size: 1.1, boomerang: it.range });
      g.audio.whoosh();
    } else if (it.kind === 'freeze') {
      this.fire(c, { x: c.pos.x + fx * 0.8, y: c.pos.y + 1.6, z: c.pos.z + fz * 0.8 }, { vx: fx * 34, vy: 0.5, vz: fz * 34 }, { damage: it.damage, knock: 2, src, color: 0x9fe8ff, size: 0.9, freeze: it.time });
      g.audio.tone({ freq: 1800, to: 600, type: 'sine', dur: 0.25, vol: 0.12 });
    } else if (it.kind === 'push') {
      for (const o of g.characters) {
        if (o === c || !o.alive) continue;
        const dx = o.pos.x - c.pos.x, dz = o.pos.z - c.pos.z, d = Math.hypot(dx, dz);
        if (d > it.range || Math.abs(o.pos.y - c.pos.y) > 3 || (dx * fx + dz * fz) / (d || 1) < 0.5) continue;
        g.damage(o, it.damage, src, { knock: { x: fx * it.knock, y: 7, z: fz * it.knock } });
      }
      g.particles.emit({ x: c.pos.x + fx, y: c.pos.y + 1.4, z: c.pos.z + fz, color: [0xffffff, 0xd8f3ff, 0x8bc34a], count: 18, speed: 16, size: 0.2, life: 0.5, gravity: 0, drag: 0.5, dir: { x: fx, y: 0.1, z: fz }, cone: 0.35 });
      g.audio.whoosh();
    } else if (it.kind === 'wand') {
      const spell = ['heal', 'shield', 'zap', 'zap', 'blink'][Math.floor(Math.random() * 5)];
      g.particles.burst(c.pos.x, c.pos.y + 2, c.pos.z, [0xc77dff, 0xffe066, 0x7fd4ff], 16, 4, 0.22, 0.6);
      if (spell === 'heal') { c.hp = Math.min(100, c.hp + 35); g.notify(c, '🪄 Healing spell! +35 HP', 'powerup'); }
      else if (spell === 'shield') { c.shield = Math.max(c.shield, 50); g.notify(c, '🪄 Shield spell!', 'powerup'); }
      else if (spell === 'blink') { this.useKind(c, 'blink', 10); g.notify(c, '🪄 Teleport spell!'); }
      else {
        const t = g.nearestCharacter(c.pos.x, c.pos.z, (o) => o !== c);
        if (t && Math.hypot(t.pos.x - c.pos.x, t.pos.z - c.pos.z) < 14) {
          g.damage(t, 28, src, { knock: { x: 0, y: 8, z: 0 } });
          g.particles.emit({ x: t.pos.x, y: t.pos.y + 1.5, z: t.pos.z, color: [0xc77dff, 0xffffff], count: 18, speed: 6, size: 0.25, life: 0.5 });
          g.audio.zap();
        } else g.notify(c, '🪄 Fizzle... nobody in range');
      }
    } else if (it.kind === 'grapple') {
      let d = it.range;
      while (d > 3 && terrainHeight(c.pos.x + fx * d, c.pos.z + fz * d) === -Infinity) d -= 1;
      c.vel.x = fx * d * 1.3; c.vel.z = fz * d * 1.3; c.vel.y = 9;
      c.onGround = false;
      g.audio.tone({ freq: 300, to: 900, type: 'square', dur: 0.2, vol: 0.08 });
      g.particles.emit({ x: c.pos.x + fx * d, y: groundY(c.pos.x + fx * d, c.pos.z + fz * d) + 0.5, z: c.pos.z + fz * d, color: [0x8d6e63, 0xffffff], count: 8, speed: 3, size: 0.2, life: 0.5 });
    } else if (it.kind === 'heal') {
      c.hp = Math.min(100, c.hp + it.amount);
      g.notify(c, `🩹 +${it.amount} HP`, 'eat');
      g.particles.emit({ x: c.pos.x, y: c.pos.y + 1.2, z: c.pos.z, color: [0x3ddc84, 0xffffff], count: 14, speed: 3, up: 2, size: 0.25, life: 0.7, gravity: -1 });
    } else if (it.kind === 'blink') {
      this.useKind(c, 'blink', it.range);
    } else if (it.kind === 'trap') {
      const x = c.pos.x - fx * 1.5, z = c.pos.z - fz * 1.5;
      if (terrainHeight(x, z) > -Infinity) {
        const mesh = new THREE.Mesh(peelGeo, flatMat(0xffe135));
        mesh.position.set(x, groundY(x, z) + 0.05, z);
        this.group.add(mesh);
        this.traps.push({ x, z, y: groundY(x, z), mesh, owner: c, src, t: 0 });
        g.audio.pop();
      }
    }
    if (Number.isFinite(slot.uses)) {
      slot.uses--;
      if (slot.uses <= 0) {
        c.items.splice(index, 1);
        c.held = Math.max(0, Math.min(c.held || 0, c.items.length - 1));
      }
    }
    this.sync(c);
  }

  /** Launch a projectile (snowballs, tank shells). opts: damage, knock, src, explode (radius), color, size */
  fire(owner, from, v, opts) {
    const mesh = new THREE.Mesh(ballGeo, flatMat(opts.color ?? 0xffffff));
    mesh.scale.setScalar(opts.size || 1);
    mesh.position.set(from.x, from.y, from.z);
    this.group.add(mesh);
    this.balls.push({
      mesh, vx: v.vx, vy: v.vy, vz: v.vz, life: opts.boomerang ? 3 : 1.8, owner, src: opts.src, it: { damage: opts.damage, knock: opts.knock },
      explode: opts.explode || 0, freeze: opts.freeze || 0, boomerang: opts.boomerang || 0, travelled: 0, hitSet: new Set(),
    });
  }

  /** Shared effects reused by several items. */
  useKind(c, kind, range) {
    const g = this.game;
    if (kind !== 'blink') return;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    let dist = range;
    while (dist > 1 && terrainHeight(c.pos.x + fx * dist, c.pos.z + fz * dist) === -Infinity) dist -= 1;
    g.particles.burst(c.pos.x, c.pos.y + 1.2, c.pos.z, [0xc77dff, 0x7fd4ff, 0xffffff], 18, 5, 0.25, 0.5);
    c.pos.x += fx * dist; c.pos.z += fz * dist;
    c.pos.y = Math.max(c.pos.y, terrainHeight(c.pos.x, c.pos.z) + 0.5);
    c.vel.y = Math.max(c.vel.y, 0);
    g.particles.burst(c.pos.x, c.pos.y + 1.2, c.pos.z, [0xc77dff, 0x7fd4ff, 0xffffff], 18, 5, 0.25, 0.5);
    g.audio.tone({ freq: 400, to: 1400, type: 'sine', dur: 0.25, vol: 0.15 });
  }

  update(dt) {
    const g = this.game;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.life -= dt;
      const p = b.mesh.position;
      if (b.boomerang) {
        // fly out, then curve back to whoever threw it
        b.travelled += Math.hypot(b.vx, b.vz) * dt;
        b.mesh.rotation.y += dt * 20;
        if (b.travelled > b.boomerang && b.owner.alive) {
          const dx = b.owner.pos.x - p.x, dz = b.owner.pos.z - p.z, d = Math.hypot(dx, dz) || 1;
          b.vx += ((dx / d) * 22 - b.vx) * Math.min(1, dt * 4);
          b.vz += ((dz / d) * 22 - b.vz) * Math.min(1, dt * 4);
          p.y += (b.owner.pos.y + 1.5 - p.y) * Math.min(1, dt * 4);
          if (d < 1.2) b.life = 0;
        }
      } else b.vy -= 14 * dt;
      p.x += b.vx * dt; p.y += b.vy * dt; p.z += b.vz * dt;
      let hit = b.life <= 0 || (!b.boomerang && g.island.pointSolid(p.x, p.y, p.z));
      for (const o of g.characters) {
        if (hit) break;
        if (o === b.owner || !o.alive || b.hitSet.has(o)) continue;
        if (Math.abs(p.x - o.pos.x) < 0.7 && Math.abs(p.z - o.pos.z) < 0.7 && p.y > o.pos.y && p.y < o.pos.y + 2.4) {
          const l = Math.hypot(b.vx, b.vz) || 1;
          if (!b.explode) g.damage(o, b.it.damage, b.src, { knock: { x: (b.vx / l) * b.it.knock, y: 4, z: (b.vz / l) * b.it.knock } });
          if (b.freeze && o.alive) { o.frozen = Math.max(o.frozen || 0, b.freeze); g.notify(o, '🧊 You are frozen!'); }
          b.hitSet.add(o);
          if (!b.boomerang) hit = true;
        }
      }
      if (hit && b.explode) g.explode(p.x, p.y - 0.5, p.z, b.explode, b.it.damage, b.src, { knock: b.it.knock });
      if (hit) {
        g.particles.emit({ x: p.x, y: p.y, z: p.z, color: [0xffffff, 0xd8f3ff], count: 8, speed: 3, size: 0.18, life: 0.4 });
        this.group.remove(b.mesh);
        this.balls.splice(i, 1);
      }
    }
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const t = this.traps[i];
      t.t += dt;
      let sprung = false;
      for (const o of g.characters) {
        if (!o.alive || o === t.owner || !o.onGround || o.tripped > 0) continue;
        if (Math.hypot(o.pos.x - t.x, o.pos.z - t.z) < 0.8 && Math.abs(o.pos.y - t.y) < 0.7) {
          const l = Math.hypot(o.vel.x, o.vel.z) || 1;
          o.tripped = 0.9;
          g.damage(o, 4, t.src, { knock: { x: (o.vel.x / l) * 11, y: 5, z: (o.vel.z / l) * 11 } });
          g.audio.slip();
          sprung = true;
          break;
        }
      }
      if (sprung || t.t > 45) { this.group.remove(t.mesh); this.traps.splice(i, 1); }
    }
  }
}
