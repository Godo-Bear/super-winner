import { hashString, mulberry32 } from './utils.js';
import { writeSave } from './save.js';

/**
 * Daily quests + levels. Everything is saved in the player's own browser.
 *
 * Progress comes from events reported by the game via game.track(kind, n):
 *   survive  a hazard survived        coin   a coin picked up on the island
 *   write    you wrote a word         kill   your word knocked someone out
 *   win      you won a round          play   you played a round
 *   jump     you jumped               star   you grabbed a power-up star
 *   emote    you did an emote
 */
const QUEST_POOL = [
  { kind: 'survive', goals: [5, 8, 12], text: (n) => `Survive ${n} hazards`, icon: '🛡️' },
  { kind: 'coin', goals: [8, 15, 25], text: (n) => `Collect ${n} coins on the island`, icon: '🪙' },
  { kind: 'write', goals: [2, 4, 6], text: (n) => `Write ${n} words`, icon: '✍️' },
  { kind: 'kill', goals: [1, 2, 4], text: (n) => `Knock out ${n} players with your words`, icon: '💥' },
  { kind: 'win', goals: [1, 2], text: (n) => `Win ${n} round${n > 1 ? 's' : ''}`, icon: '🏆' },
  { kind: 'play', goals: [2, 3, 5], text: (n) => `Play ${n} rounds`, icon: '🎮' },
  { kind: 'jump', goals: [40, 80, 150], text: (n) => `Jump ${n} times`, icon: '🦘' },
  { kind: 'star', goals: [2, 4], text: (n) => `Grab ${n} power-up stars`, icon: '⭐' },
  { kind: 'emote', goals: [3, 6], text: (n) => `Do ${n} emotes`, icon: '💃' },
];

export const XP_FOR = { survive: 5, win: 60, play: 12, kill: 15, write: 4, coin: 1, star: 5 };

export function xpForLevel(level) { return 80 + level * 40; }

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Make sure today's 3 quests exist (new set every day). */
export function ensureQuests(save) {
  const day = today();
  if (save.questDay === day && Array.isArray(save.quests) && save.quests.length) return save.quests;
  const rng = mulberry32(hashString(day + (save.pid || '')));
  const pool = QUEST_POOL.slice();
  const quests = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const q = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const goal = q.goals[Math.floor(rng() * q.goals.length)];
    quests.push({ kind: q.kind, goal, progress: 0, done: false, reward: 30 + Math.round(goal >= 10 ? 50 : goal * 15), xp: 40 });
  }
  save.questDay = day;
  save.quests = quests;
  writeSave(save);
  return quests;
}

export function questInfo(q) {
  const def = QUEST_POOL.find((p) => p.kind === q.kind);
  return { text: def ? def.text(q.goal) : q.kind, icon: def ? def.icon : '📋' };
}

/**
 * Record progress. Returns { completed: [quests], levelUps: [levels] } so the game can celebrate.
 */
export function trackProgress(save, kind, n = 1) {
  const out = { completed: [], levelUps: [] };
  ensureQuests(save);
  for (const q of save.quests) {
    if (q.done || q.kind !== kind) continue;
    q.progress = Math.min(q.goal, q.progress + n);
    if (q.progress >= q.goal) {
      q.done = true;
      save.coins += q.reward;
      out.completed.push(q);
      addXp(save, q.xp, out);
    }
  }
  if (XP_FOR[kind]) addXp(save, XP_FOR[kind] * n, out);
  writeSave(save);
  return out;
}

function addXp(save, xp, out) {
  save.xp = (save.xp || 0) + xp;
  save.level = save.level || 1;
  while (save.xp >= xpForLevel(save.level)) {
    save.xp -= xpForLevel(save.level);
    save.level++;
    save.coins += 25 * save.level;
    out.levelUps.push(save.level);
  }
}
