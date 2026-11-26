# Super Winner: Word Storm Island

A 3D browser party-survival game. Twelve blocky survivors (you + 11 silly bots) stand on a floating island.
Every 15 seconds a random survivor becomes the **Writer** and types a word, and that word comes to life as a hazard.
Hazards stack (up to 12 at once), so the chaos keeps building. Last one standing wins.

Built with **Three.js + Vite + plain JavaScript**. All art is made from primitive shapes and all sound is synthesised
with the Web Audio API, so there are no asset files.

## Running it

```bash
npm install
```

```bash
npm run dev
```

Then open the printed URL. To make a static build in `dist/`:

```bash
npm run build
```

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | WASD / arrow keys | Left joystick |
| Jump (hold with a jetpack to fly) | Space | ⤒ button |
| Sprint | Shift | » toggle |
| Camera | Mouse (click to lock, Esc to release), wheel to zoom | Drag the right side of the screen |
| Writer box | Type, Tab/→ to autocomplete, ↑/↓ to pick, Enter to send | Tap a suggestion or type |

## Rules

* Falling off the island, or reaching 0 HP, knocks you out. Knocked-out players spectate (◀ ▶ to switch).
* Every hazard warns you first with red circles, shadows, sirens or wind-ups. Instant-kill hazards always have a way
  out: the **hut** (or a bunker) survives nukes, the **hill** survives tsunamis, and you can **jump** spinning lasers.
* When a hazard finishes it recharges for a few seconds and then strikes again, until a newer word pushes it out.
* **Any word works.** Words in the dictionary get a hand-made hazard. Any other word becomes a **Mystery Blob** whose
  behaviour (chase / jump / explode / shoot), size, speed, colour and look come from a hash of the word, so the same word
  always makes the same creature. Inappropriate words are rejected by a profanity filter (see `src/filter.js`).
* Coins (saved in `localStorage`): **+5** per hazard survived, **+10** per elimination caused by your word, **+50** for a win.
* The lobby's **Word Index** tracks every dictionary word you have seen (undiscovered words show as `???`) and every
  Mystery Blob you have created.

## Project layout

```
src/
  main.js            entry point
  game.js            scene, main loop, rounds, damage/explosions, coins
  island.js          island geometry, hut, trees, rocks, collision and shelter queries
  character.js       shared player/bot body, physics and animation
  player.js          keyboard/mouse/touch input and the orbit camera
  bots.js            bot AI (wander, dodge ~70% of threats, hide, climb, grab pickups)
  writer.js          the Writer turn system
  words.js           THE DICTIONARY (data only) plus lookup and autocomplete
  filter.js          inappropriate-word filter for the Writer box
  ui.js              lobby, HUD, kill feed, announcements, writer box, results, index
  audio.js           Web Audio synthesised sound effects
  particles.js       pooled InstancedMesh particles
  save.js            localStorage save data
  hazards/
    index.js         registry + HazardManager (stacking, cap, recharge)
    base.js          Hazard base class (read this first)
    common.js        telegraph helpers: warning circles, strips, shadows, falling drops, rain
    disasters.js     tsunami, meteor, earthquake, volcano, nuke, tornado
    weather.js       lightning, rain, blizzard, acid rain
    monsters.js      zombie, dragon, giant, ghost, dinosaur, bees, shark, bull
    weapons.js       minigun turret, airstrike, cannon, spinning laser
    nature.js        lava, quicksand, black hole, hell, ice
    helpful.js       wall, bunker, shield, jetpack, speed, heal
    silly.js         banana, giant ball, tacos, trampoline
    mystery.js       Mystery Blob generator for unknown words
```

## Adding new words

### 1. A new spelling for an existing hazard

Add it to the `aliases` of the matching entry in `src/words.js`:

```js
{ id: 'meteor', name: 'Meteor', ..., aliases: ['meteors', 'asteroid', 'space rock'] },
```

Simple plurals (`-s`, `-es`, `-ies`) are already handled automatically.

### 2. A new word that reuses an existing hazard

Add a new entry and point `hazard` at an existing registry key. It gets its own Index card:

```js
{ id: 'hailstorm', name: 'Hailstorm', icon: '🧊', category: 'weather', hazard: 'ice',
  aliases: ['hail'], desc: 'Chunks of ice fall from the sky.', hint: 'Watch for shadows!' },
```

### 3. A brand new hazard

1. Write a class that extends `Hazard` (in an existing category file or a new one in `src/hazards/`):

```js
import * as THREE from 'three';
import { Hazard } from './base.js';
import { warnCircle, groundY } from './common.js';

export class Piano extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 6;                       // seconds before it finishes (then recharges)
    this.killVerb = 'got flattened by a PIANO';
    const target = this.island.randomPoint(0, 20);
    this.target = target;
    this.warn = warnCircle(this.group, target.x, target.z, 3);         // ALWAYS telegraph first
    this.threat = { type: 'avoid', x: target.x, z: target.z, radius: 3 }; // tells bots to dodge
  }

  update(dt) {
    if (this.t < 2) { this.threats.push(this.threat); return; }    // 2 s warning
    if (!this.smashed) {
      this.smashed = true;
      this.group.remove(this.warn);
      const y = groundY(this.target.x, this.target.z);
      this.game.explode(this.target.x, y, this.target.z, 3, 60, this); // damage credits the writer
    }
  }
}

export default { piano: Piano };
```

2. Register the module in `src/game.js` (only needed for a new file):

```js
import pianoHazards from './hazards/piano.js';
registerHazards({ ...pianoHazards, /* ...others */ });
```

3. Add the dictionary entry in `src/words.js` with `hazard: 'piano'`.

Hazard rules of thumb:

* Put every mesh in `this.group`; it is removed automatically. Colliders and shelters added with `this.addCollider()` /
  `this.addShelter()` are cleaned up too. Pass `track(x)` anything that has its own `dispose()`.
* Deal damage with `this.hit(character, amount, { knock: {x, y, z} })` or `this.game.explode(...)` so kills are credited
  to the writer.
* Push threat objects into `this.threats` every frame you want bots to react. Keep the same objects between frames.
  Types: `avoid` (circle), `hide` (go to shelter), `high` (climb the hill), `ring` (stay inside a radius), `seek` (pickup).
* Telegraph before anything can hurt, and give instant-kill hazards a counterplay.
* Set `this.recurring = false` if the hazard should not come back after it finishes.

## Filtering words

`src/filter.js` uses the [`obscenity`](https://www.npmjs.com/package/obscenity) package's English dataset, which also
catches common letter tricks. To block extra words, add them to `EXTRA_BLOCKED` in that file.

## Performance notes

* Particles live in one pooled `InstancedMesh`. Geometries and materials are shared and cached.
* Game logic costs well under 1 ms per frame. If the frame rate drops below about 50 fps, the game lowers render
  resolution and then shadow quality automatically.
