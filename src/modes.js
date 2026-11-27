/**
 * Game modes. Pick one in the lobby (or in an online room, as the host).
 *   interval     seconds between Writer turns (lateInterval once things heat up)
 *   writeTime    seconds a human gets to type
 *   recharge     [min, max] seconds before a finished hazard strikes again
 *   sandbox      nobody is eliminated, you can write whenever you like, no coins/quests
 *   online       can be played in an online room
 */
export const MODES = {
  classic: {
    name: 'Classic', icon: '🌪️', desc: 'A new word every 15 seconds. Last one standing wins.',
    interval: 15, lateInterval: 12, firstTurn: 5, writeTime: 10, recharge: [6, 11], online: true,
  },
  chaos: {
    name: 'Chaos', icon: '🔥', desc: 'A new word every 8 seconds and hazards come back faster. Pure mayhem!',
    interval: 8, lateInterval: 6, firstTurn: 3, writeTime: 7, recharge: [3, 6], online: true,
  },
  sandbox: {
    name: 'Sandbox', icon: '🧪', desc: 'Nobody gets knocked out. Write any word, any time, and see what happens!',
    interval: 25, lateInterval: 25, firstTurn: 12, writeTime: 10, recharge: [6, 11], sandbox: true, online: false,
  },
};

export const modeOf = (id) => MODES[id] || MODES.classic;
