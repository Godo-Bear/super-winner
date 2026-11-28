import { ISLAND_RADIUS, terrainHeight } from './island.js';
import { powerAction } from './powers.js';
import { pick, rand } from './utils.js';

export const BOT_NAMES = [
  'Sir Bonkalot', 'Noodle', 'Captain Pickles', 'Wobbles', 'Toast Boy', 'Mega Muffin', 'Lil Kaboom',
  'Dr. Sprinkles', 'Turbo Snail', 'Pancake', 'Beans', 'Goober', 'Mr. Fluffington', 'Waffle Wizard',
  'Sneezy Pete', 'Jellybean', 'Disco Dan', 'Potato Queen', 'Bonk', 'Señor Squish', 'Chonkers', 'Professor Ham',
  'Yeet Machine', 'Gravy Train', 'Nugget', 'Count Wobula', 'Sock Goblin', 'Baby Thunder',
];

/** How likely a bot is to react to any given danger. Average ≈ 0.7. */
const SKILL_MIN = 0.55, SKILL_MAX = 0.85;

export function initBotAI(bot) {
  bot.ai = {
    skill: rand(SKILL_MIN, SKILL_MAX),
    noticed: new WeakMap(),
    think: Math.random() * 0.2,
    dx: 0, dz: 0, sprint: false,
    target: null, retarget: 0,
    wantJump: false, jetHold: false,
    stuckT: 0, lastX: bot.pos.x, lastZ: bot.pos.z,
    idle: 0,
  };
}

/** Rolls once per (bot, threat) whether the bot notices it. */
export function botNotices(bot, key) {
  const ai = bot.ai;
  let v = ai.noticed.get(key);
  if (v === undefined) {
    v = Math.random() < ai.skill;
    ai.noticed.set(key, v);
  }
  return v;
}

export function updateBot(bot, dt, game) {
  const ai = bot.ai;
  ai.think -= dt;
  if (ai.think <= 0) {
    ai.think = 0.1 + Math.random() * 0.08;
    think(bot, game, dt);
  }
  bot.input.x = ai.dx;
  bot.input.z = ai.dz;
  bot.input.sprint = ai.sprint;
  if (ai.wantJump) { bot.input.jump = true; ai.wantJump = false; }
  bot.input.jumpHeld = ai.jetHold;

  // unstick: if we wanted to move but barely did, hop and pick a new goal
  ai.stuckT += dt;
  if (ai.stuckT > 0.8) {
    const moved = Math.hypot(bot.pos.x - ai.lastX, bot.pos.z - ai.lastZ);
    if (moved < 0.6 && Math.hypot(ai.dx, ai.dz) > 0.5) {
      ai.wantJump = true;
      if (Math.random() < 0.5) ai.target = null;
    }
    ai.stuckT = 0;
    ai.lastX = bot.pos.x;
    ai.lastZ = bot.pos.z;
  }
}

function think(bot, game) {
  const ai = bot.ai, p = bot.pos, island = game.island;
  let ax = 0, az = 0, mode = null, seek = null, seekD = Infinity, ringR = Infinity;

  for (const t of game.hazards.threats) {
    if (!botNotices(bot, t)) continue;
    if (t.type === 'hide') mode = 'hide';
    else if (t.type === 'high') { if (mode !== 'hide') mode = 'high'; }
    else if (t.type === 'ring') ringR = Math.min(ringR, t.radius);
    else if (t.type === 'avoid') {
      const dx = p.x - t.x, dz = p.z - t.z;
      const d = Math.hypot(dx, dz);
      const R = t.radius + 2.2;
      if (d < R) {
        const w = (R - d) / R;
        if (d < 0.05) { const a = Math.random() * 6.28; ax += Math.cos(a) * 2; az += Math.sin(a) * 2; }
        else { ax += (dx / d) * w * 2.5; az += (dz / d) * w * 2.5; }
      }
    } else if (t.type === 'seek') {
      if (t.lowHpOnly && bot.hp > 70) continue;
      const d = Math.hypot(p.x - t.x, p.z - t.z);
      if (d < (t.range || 20) && d < seekD) { seekD = d; seek = t; }
    }
  }

  let tx, tz, sprint = false, precise = false;
  if (mode === 'hide') {
    const s = island.nearestShelter(p);
    if (s) {
      const wp = island.shelterWaypoint(s, p);
      tx = wp.x; tz = wp.z; sprint = !wp.inside; precise = true;
      ax *= 0.15; az *= 0.15; // being inside matters more than dodging
    }
  } else if (mode === 'high') {
    // nearest hilltop
    const hp = island.highPoints.reduce((a, b) => (Math.hypot(p.x - a.x, p.z - a.z) <= Math.hypot(p.x - b.x, p.z - b.z) ? a : b));
    tx = hp.x + Math.sin(bot.id * 2.3) * 1.2;
    tz = hp.z + Math.cos(bot.id * 2.3) * 1.2;
    sprint = true; precise = true;
  } else if (seek) {
    tx = seek.x; tz = seek.z; precise = true;
  }

  if (tx === undefined) {
    ai.retarget -= 0.15;
    if (!ai.target || ai.retarget <= 0 || Math.hypot(p.x - ai.target.x, p.z - ai.target.z) < 1.5) {
      const maxR = Math.min(ISLAND_RADIUS - 6, ringR - 4);
      ai.target = island.randomPoint(0, Math.max(3, maxR), { avoidHut: false, scale: false });
      ai.retarget = rand(3, 8);
      ai.idle = Math.random() < 0.25 ? rand(0.5, 2) : 0;
    }
    tx = ai.target.x; tz = ai.target.z;
    if (ai.idle > 0) {
      ai.idle -= 0.15;
      tx = p.x; tz = p.z;
      if (!bot.emoteId && Math.random() < 0.03) bot.startEmote(1 + Math.floor(Math.random() * 4));
    }
    if (Math.random() < 0.01) ai.wantJump = true;
  }

  let dx = tx - p.x, dz = tz - p.z;
  const dl = Math.hypot(dx, dz);
  if (dl > 0.01) { dx /= dl; dz /= dl; }
  const arriveScale = precise ? Math.min(1, dl / 0.8) : (dl < 0.3 ? 0 : 1);
  dx *= arriveScale; dz *= arriveScale;

  // stay away from the edge (and from lava rings)
  const r = Math.hypot(p.x, p.z);
  const edge = Math.min(ISLAND_RADIUS - 4, ringR - 2.5);
  if (r > edge && r > 0.1) {
    const w = (r - edge) * 0.7;
    ax -= (p.x / r) * w;
    az -= (p.z / r) * w;
  }

  const av = Math.hypot(ax, az);
  if (av > 0.05) {
    dx = dx * 0.4 + ax * 1.6;
    dz = dz * 0.4 + az * 1.6;
    sprint = true;
  }
  ai.dx = dx;
  ai.dz = dz;
  ai.sprint = sprint || bot.hp < 40;

  // items they asked for
  if (bot.items && bot.items.length && Math.random() < 0.5) useBotItems(bot, game, av);
  // a tank fires at people in range; a creature bites whoever is close
  if (bot.power?.action) {
    const near = game.nearestCharacter(p.x, p.z, (c) => c !== bot);
    const d = near ? Math.hypot(near.pos.x - p.x, near.pos.z - p.z) : 99;
    const range = bot.power.action === 'shell' ? 18 : 2.8;
    if (near && d < range && Math.random() < 0.35) {
      bot.yaw = Math.atan2(near.pos.x - p.x, near.pos.z - p.z);
      powerAction(game, bot);
    }
  }

  // jetpack: rescue from falling off, or climb when told to get high
  const ground = terrainHeight(p.x, p.z);
  ai.jetHold = bot.jetpack > 0 && ((!bot.onGround && (ground === -Infinity || p.y < ground)) || mode === 'high' || (av > 0.5 && Math.random() < 0.3));
  if (bot.jetpack > 0 && ground === -Infinity && r > 0.1) {
    ai.dx = -p.x / r; ai.dz = -p.z / r;
  }
}

export function randomBotNames(n) {
  const pool = [...BOT_NAMES];
  const out = [];
  for (let i = 0; i < n; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0] ?? pick(BOT_NAMES));
  return out;
}

/** Bots use the items they asked for, in a simple-minded way. */
function useBotItems(bot, game, danger) {
  const near = game.nearestCharacter(bot.pos.x, bot.pos.z, (c) => c !== bot);
  const d = near ? Math.hypot(near.pos.x - bot.pos.x, near.pos.z - bot.pos.z) : 99;
  bot.items.forEach((slot, i) => {
    const want =
      (slot.id === 'medkit' && bot.hp < 50) ||
      ((slot.id === 'sword' || slot.id === 'hammer') && d < 2.6 && Math.random() < 0.3) ||
      (slot.id === 'snowball' && d < 14 && Math.random() < 0.08) ||
      (slot.id === 'teleporter' && danger > 0.8 && Math.random() < 0.3) ||
      (slot.id === 'trap' && Math.random() < 0.02);
    if (!want) return;
    if (near && (slot.id === 'sword' || slot.id === 'snowball')) bot.yaw = Math.atan2(near.pos.x - bot.pos.x, near.pos.z - bot.pos.z);
    game.items.use(bot, i);
  });
}
