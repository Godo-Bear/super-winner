/**
 * THE WORD DICTIONARY
 * --------------------
 * Every word a Writer can type that has a hand-made hazard lives here.
 * To add a word: add an entry below and point `hazard` at a key registered in
 * src/hazards/index.js (or reuse an existing hazard with a new alias).
 *
 *   id        unique id (used for the Index / save data)
 *   name      display name
 *   icon      emoji shown in the HUD / index
 *   category  one of CATEGORIES
 *   hazard    key in the hazard registry
 *   aliases   other spellings / plurals / synonyms that resolve to this entry
 *   desc      short Index description
 *   hint      survival tip shown under the big announcement
 *   weight    how often bots pick it (default 1)
 */

export const CATEGORIES = {
  disaster: { name: 'Disasters', icon: '🌋' },
  weather: { name: 'Weather', icon: '⛈️' },
  monster: { name: 'Monsters & Animals', icon: '👾' },
  weapon: { name: 'Weapons', icon: '💥' },
  nature: { name: 'Nature & Places', icon: '🌀' },
  helpful: { name: 'Helpful', icon: '💚' },
  silly: { name: 'Silly', icon: '🤪' },
};

export const DICTIONARY = [
  // ---------- Disasters ----------
  { id: 'tsunami', name: 'Tsunami', icon: '🌊', category: 'disaster', hazard: 'tsunami', aliases: ['tsunamis', 'tidal wave', 'wave', 'waves', 'flood', 'floods'], desc: 'A giant wave sweeps across the island.', hint: 'Climb a HILL or hide in the HUT!' },
  { id: 'meteor', name: 'Meteor', icon: '☄️', category: 'disaster', hazard: 'meteor', aliases: ['meteors', 'asteroid', 'asteroids', 'comet', 'comets', 'meteorite', 'meteor shower'], desc: 'Flaming rocks crash into red circles.', hint: 'Stay out of the red circles!' },
  { id: 'earthquake', name: 'Earthquake', icon: '🫨', category: 'disaster', hazard: 'earthquake', aliases: ['earthquakes', 'quake', 'quakes', 'tremor'], desc: 'The ground shakes and cracks open.', hint: 'Dodge the glowing cracks!' },
  { id: 'volcano', name: 'Volcano', icon: '🌋', category: 'disaster', hazard: 'volcano', aliases: ['volcanoes', 'volcanos', 'eruption', 'magma'], desc: 'The hill erupts and rains lava bombs.', hint: 'Get OFF the hill and dodge the bombs!' },
  { id: 'nuke', name: 'Nuke', icon: '☢️', category: 'disaster', hazard: 'nuke', aliases: ['nukes', 'nuclear', 'atomic bomb', 'bomb', 'bombs', 'atom bomb', 'nuclear bomb'], desc: 'Total wipeout. Only shelter survives.', hint: 'GET IN THE HUT!', weight: 0.6 },
  { id: 'tornado', name: 'Tornado', icon: '🌪️', category: 'disaster', hazard: 'tornado', aliases: ['tornadoes', 'tornados', 'twister', 'twisters', 'hurricane', 'cyclone'], desc: 'A twister that sucks you up and flings you.', hint: 'Sprint away from the funnel!' },

  // ---------- Weather ----------
  { id: 'lightning', name: 'Lightning', icon: '⚡', category: 'weather', hazard: 'lightning', aliases: ['thunder', 'thunderstorm', 'storm', 'storms', 'lightning bolt', 'zap'], desc: 'Bolts strike the flashing circles.', hint: 'Watch for flashing circles!' },
  { id: 'rain', name: 'Rain', icon: '🌧️', category: 'weather', hazard: 'rain', aliases: ['rains', 'rainy', 'raining', 'drizzle', 'downpour'], desc: 'Everything gets slippery.', hint: 'Slippery! Careful near the edge!' },
  { id: 'blizzard', name: 'Blizzard', icon: '🌨️', category: 'weather', hazard: 'blizzard', aliases: ['blizzards', 'snow', 'snowstorm', 'snowy', 'winter'], desc: 'Fog, wind and slow freezing legs.', hint: 'Fog and wind! Stay central!' },
  { id: 'acid rain', name: 'Acid Rain', icon: '☣️', category: 'weather', hazard: 'acidrain', aliases: ['acid', 'acidrain', 'toxic rain', 'acid storm'], desc: 'Burning rain. Find cover.', hint: 'Get under a roof or a tree!' },

  // ---------- Monsters & animals ----------
  { id: 'zombie', name: 'Zombie', icon: '🧟', category: 'monster', hazard: 'zombie', aliases: ['zombies', 'undead', 'walker', 'walkers'], desc: 'Slow but relentless.', hint: 'They are slow. Keep moving!' },
  { id: 'dragon', name: 'Dragon', icon: '🐉', category: 'monster', hazard: 'dragon', aliases: ['dragons', 'wyvern', 'drake'], desc: 'Circles above and breathes fire.', hint: 'Dodge the fire circles!' },
  { id: 'giant', name: 'Giant', icon: '🗿', category: 'monster', hazard: 'giant', aliases: ['giants', 'titan', 'ogre', 'big guy', 'colossus'], desc: 'A huge stomping blockhead.', hint: 'Move away when its foot lifts!' },
  { id: 'ghost', name: 'Ghost', icon: '👻', category: 'monster', hazard: 'ghost', aliases: ['ghosts', 'spirit', 'spook', 'phantom', 'boo'], desc: 'Floats through walls and drains HP.', hint: 'Outrun them! They go through walls!' },
  { id: 'dinosaur', name: 'Dinosaur', icon: '🦖', category: 'monster', hazard: 'dinosaur', aliases: ['dinosaurs', 'dino', 'dinos', 't rex', 'trex', 'raptor', 'raptors'], desc: 'Roars, then charges in a straight line.', hint: 'Side-step when it roars!' },
  { id: 'bees', name: 'Bees', icon: '🐝', category: 'monster', hazard: 'bees', aliases: ['bee', 'hornet', 'hornets', 'wasp', 'wasps', 'swarm'], desc: 'An angry buzzing swarm.', hint: 'Sprint or hide in the hut!' },
  { id: 'shark', name: 'Shark', icon: '🦈', category: 'monster', hazard: 'shark', aliases: ['sharks', 'land shark', 'jaws'], desc: 'A land shark swims through the grass.', hint: 'Climb rocks or the hill!' },
  { id: 'bull', name: 'Bull', icon: '🐂', category: 'monster', hazard: 'bull', aliases: ['bulls', 'cow', 'cows', 'ox', 'rhino'], desc: 'Charges along the red line.', hint: 'Get off the red line!' },

  // ---------- Weapons ----------
  { id: 'minigun', name: 'Minigun Turret', icon: '🔫', category: 'weapon', hazard: 'minigun', aliases: ['minigun', 'turret', 'turrets', 'gun', 'guns', 'machine gun', 'minigun turret'], desc: 'Sprays bullets after aiming a laser.', hint: 'Hide behind rocks, trees or walls!' },
  { id: 'airstrike', name: 'Airstrike', icon: '✈️', category: 'weapon', hazard: 'airstrike', aliases: ['airstrikes', 'air strike', 'bomber', 'plane', 'planes', 'jet'], desc: 'A bomber carpet-bombs a red strip.', hint: 'Get out of the red strip!' },
  { id: 'cannon', name: 'Cannon', icon: '💣', category: 'weapon', hazard: 'cannon', aliases: ['cannons', 'cannonball', 'artillery', 'mortar'], desc: 'Lobs cannonballs at the red circles.', hint: 'Keep moving!' },
  { id: 'laser', name: 'Spinning Laser', icon: '🔴', category: 'weapon', hazard: 'laser', aliases: ['laser', 'lasers', 'spinning laser', 'laser beam', 'beam'], desc: 'A sweeping beam. Jump it!', hint: 'JUMP over the beam!' },

  // ---------- Nature & places ----------
  { id: 'lava', name: 'Lava', icon: '🔥', category: 'nature', hazard: 'lava', aliases: ['floor is lava', 'the floor is lava', 'molten'], desc: 'Lava creeps in from the edges.', hint: 'Move to the middle or up high!' },
  { id: 'quicksand', name: 'Quicksand', icon: '🏜️', category: 'nature', hazard: 'quicksand', aliases: ['quick sand', 'sinkhole', 'mud', 'swamp', 'bog'], desc: 'Sticky pits that drag you down.', hint: 'Jump out of the pits!' },
  { id: 'black hole', name: 'Black Hole', icon: '🕳️', category: 'nature', hazard: 'blackhole', aliases: ['blackhole', 'black holes', 'vortex', 'singularity', 'void', 'wormhole'], desc: 'Sucks everything in. Do not touch.', hint: 'SPRINT away from it!' },
  { id: 'hell', name: 'Hell', icon: '😈', category: 'nature', hazard: 'hell', aliases: ['inferno', 'underworld', 'fire', 'fires', 'flames', 'hellfire'], desc: 'Fire craters erupt from the ground.', hint: 'Avoid the glowing craters!' },
  { id: 'ice', name: 'Ice', icon: '🧊', category: 'nature', hazard: 'ice', aliases: ['icy', 'frozen', 'freeze', 'icicle', 'icicles', 'ice age'], desc: 'Ice rink island with falling icicles.', hint: 'Super slippery! Watch for shadows!' },

  // ---------- Helpful ----------
  { id: 'wall', name: 'Wall', icon: '🧱', category: 'helpful', hazard: 'wall', aliases: ['walls', 'barrier', 'fence', 'cover'], desc: 'Solid walls to hide behind.', hint: 'Free cover!', weight: 0.5 },
  { id: 'bunker', name: 'Bunker', icon: '🏚️', category: 'helpful', hazard: 'bunker', aliases: ['bunkers', 'shelter', 'house', 'safe room', 'fort'], desc: 'A second shelter appears.', hint: 'Another safe spot!', weight: 0.5 },
  { id: 'shield', name: 'Shield', icon: '🛡️', category: 'helpful', hazard: 'shield', aliases: ['shields', 'armor', 'armour', 'force field', 'bubble'], desc: 'Grab a bubble shield.', hint: 'Grab a shield orb!', weight: 0.5 },
  { id: 'jetpack', name: 'Jetpack', icon: '🚀', category: 'helpful', hazard: 'jetpack', aliases: ['jetpacks', 'jet pack', 'rocket', 'fly', 'flying', 'wings'], desc: 'Hold jump to fly for a while.', hint: 'Grab one, then HOLD jump!', weight: 0.5 },
  { id: 'speed', name: 'Speed', icon: '⚡', category: 'helpful', hazard: 'speed', aliases: ['fast', 'faster', 'sprint', 'speed boost', 'run', 'zoom'], desc: 'Speed boost pickups.', hint: 'Grab a speed boost!', weight: 0.5 },
  { id: 'heal', name: 'Heal', icon: '💚', category: 'helpful', hazard: 'heal', aliases: ['heals', 'health', 'medicine', 'potion', 'hospital', 'doctor'], desc: 'Healing pickups.', hint: 'Grab the green crosses!', weight: 0.5 },

  // ---------- Silly ----------
  { id: 'banana', name: 'Banana', icon: '🍌', category: 'silly', hazard: 'banana', aliases: ['bananas', 'banana peel', 'peel', 'peels'], desc: 'Peels rain down. Slip city.', hint: 'Watch your step!' },
  { id: 'giant ball', name: 'Giant Ball', icon: '⚽', category: 'silly', hazard: 'ball', aliases: ['ball', 'balls', 'beach ball', 'boulder', 'bowling ball', 'giantball'], desc: 'A huge bouncing ball.', hint: 'Don\'t get bowled over!' },
  { id: 'tacos', name: 'Tacos', icon: '🌮', category: 'silly', hazard: 'tacos', aliases: ['taco', 'taco rain', 'food', 'burrito', 'burritos'], desc: 'It\'s raining tacos! Eat them to heal.', hint: 'Dodge, then EAT them!' },
  { id: 'trampoline', name: 'Trampoline', icon: '🤸', category: 'silly', hazard: 'trampoline', aliases: ['trampolines', 'bounce', 'bouncy', 'boing', 'spring', 'springs'], desc: 'Bouncy pads. Don\'t bounce off the edge!', hint: 'BOING!' },
];

export const MYSTERY_WORDS = [
  'pickle', 'grandma', 'toaster', 'spaghetti', 'sock', 'wizard', 'cheese', 'robot', 'penguin', 'noodle', 'lamp',
  'cactus', 'duck', 'pizza', 'homework', 'printer', 'goose', 'slime', 'teacher', 'cabbage', 'llama', 'jelly', 'fridge',
];

// ---------- lookup tables ----------
const norm = (s) => String(s).toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const lookup = new Map();
const forms = [];
for (const e of DICTIONARY) {
  for (const f of [e.id, e.name, ...e.aliases]) {
    const n = norm(f);
    if (!lookup.has(n)) lookup.set(n, e);
    if (!lookup.has(n.replace(/ /g, ''))) lookup.set(n.replace(/ /g, ''), e);
    if (!forms.some((x) => x.form === n)) forms.push({ form: n, entry: e });
  }
}

export function normalizeWord(s) { return norm(s); }

/** Returns the dictionary entry for any spelling, plural or alias (or null). */
export function resolveWord(raw) {
  const w = norm(raw);
  if (!w) return null;
  const direct = lookup.get(w) || lookup.get(w.replace(/ /g, ''));
  if (direct) return direct;
  // simple de-pluralisation fallbacks
  const tries = [];
  if (w.endsWith('ies')) tries.push(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) tries.push(w.slice(0, -2));
  if (w.endsWith('s')) tries.push(w.slice(0, -1));
  for (const t of tries) if (lookup.has(t)) return lookup.get(t);
  return null;
}

/** Autocomplete for the writer box. */
export function suggest(prefix, n = 6) {
  const p = norm(prefix);
  const out = [];
  const seen = new Set();
  if (!p) {
    const shuffled = DICTIONARY.slice().sort(() => Math.random() - 0.5);
    for (const e of shuffled.slice(0, n)) out.push({ fill: e.name.toLowerCase(), icon: e.icon, entry: e });
    return out;
  }
  const add = (f) => {
    if (seen.has(f.entry.id) || out.length >= n) return;
    seen.add(f.entry.id);
    out.push({ fill: f.form, icon: f.entry.icon, entry: f.entry });
  };
  for (const f of forms) if (f.form.startsWith(p)) add(f);
  for (const f of forms) if (f.form.includes(p)) add(f);
  return out;
}

/** Word a bot writer will type. */
export function randomBotWord() {
  if (Math.random() < 0.12) return MYSTERY_WORDS[Math.floor(Math.random() * MYSTERY_WORDS.length)];
  const total = DICTIONARY.reduce((s, e) => s + (e.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const e of DICTIONARY) {
    r -= e.weight ?? 1;
    if (r <= 0) {
      // sometimes bots type an alias instead of the main name
      return Math.random() < 0.3 && e.aliases.length ? e.aliases[Math.floor(Math.random() * e.aliases.length)] : e.name.toLowerCase();
    }
  }
  return DICTIONARY[0].name.toLowerCase();
}
