const KEY = 'super_winner_save_v1';

const DEFAULT = { coins: 0, discovered: [], mysteries: [], wins: 0, games: 0, bestKills: 0, owned: [], equipped: {}, xp: 0, level: 1, quests: [], questDay: '', mode: 'classic' };

/** Fill in missing fields and fix bad types (used for local and cloud saves). */
export function normalizeSave(d) {
  if (!d || typeof d !== 'object') return { ...DEFAULT };
  return {
    ...DEFAULT,
    ...d,
    coins: Math.max(0, Number(d.coins) || 0),
    discovered: Array.isArray(d.discovered) ? d.discovered : [],
    mysteries: Array.isArray(d.mysteries) ? d.mysteries : [],
    owned: Array.isArray(d.owned) ? d.owned : [],
    equipped: d.equipped && typeof d.equipped === 'object' ? d.equipped : {},
    quests: Array.isArray(d.quests) ? d.quests : [],
    level: Math.max(1, Number(d.level) || 1),
    xp: Math.max(0, Number(d.xp) || 0),
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    return normalizeSave(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT };
  }
}

/** Replace the contents of `target` with `source` (keeps the same object the game holds). */
export function mergeSave(target, source) {
  const s = normalizeSave(source);
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, s);
}

const listeners = [];
/** Called after every save (the optional account uses this to sync to the cloud). */
export function onSave(fn) { listeners.push(fn); }

export function writeSave(save, { silent = false } = {}) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage full or blocked */ }
  if (!silent) for (const fn of listeners) fn(save);
}
