const KEY = 'super_winner_save_v1';

const DEFAULT = { coins: 0, discovered: [], mysteries: [], wins: 0, games: 0, bestKills: 0 };

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
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage full or blocked */ }
}
