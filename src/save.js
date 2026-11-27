const KEY = 'super_winner_save_v1';

const DEFAULT = { coins: 0, discovered: [], mysteries: [], wins: 0, games: 0, bestKills: 0, owned: [], equipped: {}, xp: 0, level: 1, quests: [], questDay: '', mode: 'classic' };

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const d = JSON.parse(raw);
    return {
      ...DEFAULT,
      ...d,
      discovered: Array.isArray(d.discovered) ? d.discovered : [],
      mysteries: Array.isArray(d.mysteries) ? d.mysteries : [],
      owned: Array.isArray(d.owned) ? d.owned : [],
      equipped: d.equipped && typeof d.equipped === 'object' ? d.equipped : {},
      quests: Array.isArray(d.quests) ? d.quests : [],
      level: Math.max(1, Number(d.level) || 1),
      xp: Math.max(0, Number(d.xp) || 0),
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage full or blocked */ }
}
