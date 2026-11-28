import { makeTextSprite } from './utils.js';
import { makeVehicleModel } from './hazards/objects.js';

/** "your sword" for you, "Noodle's sword" for others. */
const whose = (c) => (c.name === 'You' ? 'your' : `${c.name}'s`);

/**
 * "FOR ME" POWERS — when a Writer picks 🛡️ For me, their word turns into a power for them:
 *   ride  vehicles ("tank", "car", "bus"...)   drive it: faster, armoured, rams people; tanks fire shells (E)
 *   morph creatures ("lion", "dragon"...)      become a bigger, tougher version with a bite (E)
 *   buff  anything else                         shield + speed + health
 * Items and map words keep doing what they normally do.
 */
export const POWER_TIME = 25;

/** Decide what power a word gives (from the word brain's interpretation). */
export function powerFor(meaning, word) {
  const label = meaning?.label || word.replace(/\b\w/g, (c) => c.toUpperCase());
  if (meaning?.hazard === 'vehicle') {
    const s = meaning.spec;
    const tank = s.kind === 'tank';
    return { type: 'ride', kind: s.kind, color: s.color, icon: s.icon || '🚗', label, armor: tank ? 0.65 : 0.35, speed: tank ? 1.05 : 1.7, ram: tank ? 30 : 24, action: tank ? 'shell' : null };
  }
  if (meaning?.hazard === 'creature' || meaning?.entry?.category === 'monster') {
    const icon = meaning.icon || meaning.entry?.icon || '👾';
    const color = meaning.spec?.color ?? 0x8338ec;
    return { type: 'morph', icon, color, label, armor: 0.35, speed: 1.15, scale: 1.35, action: 'bite' };
  }
  return { type: 'buff', icon: meaning?.icon || meaning?.entry?.icon || '✨', label };
}

/** Compact string so other players can draw it (sent in snapshots). */
export const powerKey = (p) => (p ? `${p.type}|${p.kind || ''}|${p.color ?? ''}|${p.icon || ''}` : '');
export function powerFromKey(k) {
  if (!k) return null;
  const [type, kind, color, icon] = k.split('|');
  return { type, kind, color: color === '' ? undefined : Number(color), icon };
}

/** Add / remove the look of a power on a character (works for anyone, on any computer). */
export function showPower(c, p) {
  const v = c.powerVisual;
  if (v) {
    if (v.model) c.mesh.remove(v.model);
    if (v.tag) c.mesh.remove(v.tag);
    c.model.root.position.y = 0;
    c.mesh.scale.setScalar(1);
    c.powerVisual = null;
  }
  if (!p || p.type === 'buff') return;
  const nv = {};
  if (p.type === 'ride') {
    nv.model = makeVehicleModel({ kind: p.kind || 'car', color: p.color ?? 0xd62828, icon: p.icon, ridden: true });
    // turn the vehicle so it faces forward (+Z) under the driver
    c.mesh.add(nv.model);
    c.model.root.position.y = p.kind === 'tank' ? 1.0 : p.kind === 'bike' ? 0.6 : 0.8; // sit in the hatch / seat
  } else if (p.type === 'morph') {
    c.mesh.scale.setScalar(1.35);
    nv.tag = makeTextSprite(p.icon, { fontSize: 80, height: 0.9, stroke: '#ffffff' });
    nv.tag.position.y = 3.7;
    c.mesh.add(nv.tag);
  }
  c.powerVisual = nv;
}

/** Host / single player: start a power on a character. */
export function applyPower(game, c, p) {
  if (!c || !c.alive) return;
  if (p.type === 'buff') {
    c.shield = Math.max(c.shield, 60);
    c.speedBoost = Math.max(c.speedBoost, 10);
    c.hp = Math.min(100, c.hp + 30);
    game.notify(c, `${p.icon} ${p.label} power-up! Shield + speed + health`, 'powerup');
    return;
  }
  c.power = { ...p, t: p.time || POWER_TIME };
  showPower(c, c.power);
  const how = p.type === 'ride' ? (p.action ? 'Drive it! Press E to fire' : 'Drive it and ram people!') : 'Press E to bite!';
  game.notify(c, `${p.icon} You are a ${p.label.toUpperCase()}! ${how}`, 'powerup');
  if (c.remote) game.net.sendDirect(c.clientId, 'power', c.power);
}

export function endPower(game, c) {
  if (!c.power) return;
  c.power = null;
  showPower(c, null);
  if (c.remote) game.net.sendDirect(c.clientId, 'power', null);
}

/** Every frame (host / single player): timers and ramming. */
export function updatePowers(game, dt) {
  for (const c of game.characters) {
    const p = c.power;
    if (!p) continue;
    if (!c.alive) { endPower(game, c); continue; }
    p.t -= dt;
    if (p.t <= 0) { game.notify(c, `${p.icon} Your ${p.label} power ran out`); endPower(game, c); continue; }
    if (p.type === 'ride') {
      const sp = Math.hypot(c.vel.x, c.vel.z);
      if (sp < 5) continue;
      for (const o of game.characters) {
        if (o === c || !o.alive || (o.ramCd || 0) > game.time) continue;
        const dx = o.pos.x - c.pos.x, dz = o.pos.z - c.pos.z, d = Math.hypot(dx, dz);
        if (d > 1.9 || Math.abs(o.pos.y - c.pos.y) > 2) continue;
        o.ramCd = game.time + 0.8;
        const src = { owner: c, label: p.label, killVerb: `got run over by ${whose(c)} ${p.label.toUpperCase()}` };
        game.damage(o, p.ram, src, { knock: { x: (c.vel.x / sp) * 16, y: 7, z: (c.vel.z / sp) * 16 } });
        game.audio.explosion(0.4);
      }
    }
  }
}

/** E with a power: tank shell or creature bite. */
export function powerAction(game, c) {
  const p = c.power;
  if (!p || !p.action || !c.alive) return false;
  if ((c.powerCd || 0) > game.time) return true;
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  const src = { owner: c, label: p.label, killVerb: p.action === 'shell' ? `got blasted by ${whose(c)} TANK` : `got chomped by ${whose(c)} ${p.label.toUpperCase()}` };
  c.swingT = 0.3;
  if (p.action === 'shell') {
    c.powerCd = game.time + 1.2;
    game.items.fire(c, { x: c.pos.x + fx * 2.4, y: c.pos.y + 1.6, z: c.pos.z + fz * 2.4 }, { vx: fx * 30, vy: 1.5, vz: fz * 30 }, { explode: 3.5, damage: 40, knock: 14, src, color: 0x222222, size: 1.8 });
    game.particles.emit({ x: c.pos.x + fx * 2.4, y: c.pos.y + 2.3, z: c.pos.z + fz * 2.4, color: [0xdddddd, 0x999999, 0xffa31a], count: 12, speed: 4, up: 2, size: 0.6, life: 0.7, gravity: -1 });
    game.audio.explosion(0.5);
  } else {
    c.powerCd = game.time + 0.7;
    for (const o of game.characters) {
      if (o === c || !o.alive) continue;
      const dx = o.pos.x - c.pos.x, dz = o.pos.z - c.pos.z, d = Math.hypot(dx, dz);
      if (d > 3 || Math.abs(o.pos.y - c.pos.y) > 2.5 || (dx * fx + dz * fz) / (d || 1) < 0.2) continue;
      game.damage(o, 30, src, { knock: { x: (dx / (d || 1)) * 13, y: 6, z: (dz / (d || 1)) * 13 } });
    }
    game.audio.roar(1.4);
    game.particles.emit({ x: c.pos.x + fx * 1.8, y: c.pos.y + 1.4, z: c.pos.z + fz * 1.8, color: [p.color ?? 0xffffff, 0xffffff], count: 10, speed: 4, size: 0.25, life: 0.4 });
  }
  return true;
}

