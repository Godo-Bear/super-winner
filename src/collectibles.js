import * as THREE from 'three';
import { groundY } from './hazards/common.js';
import { flatMat, makeTextSprite, rand, pick } from './utils.js';

const coinGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 14).rotateX(Math.PI / 2);

/**
 * Coins and power-up stars that pop up around the island during a round,
 * so there's always something to chase between hazards. Lives under the
 * hazard root so it shows up for online players too (the host runs it).
 */
export class Collectibles {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    game.hazardRoot.add(this.group);
    this.items = [];
    this.coinT = 2;
    this.starT = 10;
  }

  reset() {
    for (const it of this.items) this.group.remove(it.mesh);
    this.items.length = 0;
    this.coinT = 2;
    this.starT = 10;
  }

  spawn(kind) {
    const p = this.game.island.randomPoint(2, 26, { avoidHut: false });
    let mesh;
    if (kind === 'coin') {
      mesh = new THREE.Mesh(coinGeo, flatMat(0xffc300));
      mesh.castShadow = true;
    } else {
      mesh = makeTextSprite('⭐', { fontSize: 90, height: 1.2, stroke: '#ffffff' });
    }
    const y = groundY(p.x, p.z) + 1;
    mesh.position.set(p.x, y + 6, p.z);
    this.group.add(mesh);
    this.items.push({ kind, x: p.x, z: p.z, y, t: 0, mesh, threat: { type: 'seek', x: p.x, z: p.z, range: kind === 'coin' ? 7 : 12 } });
  }

  update(dt) {
    const g = this.game;
    const sandbox = g.modeCfg.sandbox;
    this.coinT -= dt;
    this.starT -= dt;
    const coins = this.items.filter((i) => i.kind === 'coin').length;
    if (!sandbox && this.coinT <= 0) { this.coinT = rand(2.5, 4.5); if (coins < 8) this.spawn('coin'); }
    if (this.starT <= 0) { this.starT = rand(14, 22); if (this.items.length < 10) this.spawn('star'); }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const drop = Math.min(1, it.t / 0.5);
      it.mesh.position.y = it.y + 6 * (1 - drop) + Math.sin(it.t * 3) * 0.15;
      if (it.kind === 'coin') it.mesh.rotation.y += dt * 3;
      g.hazards.threats.push(it.threat);
      let taken = null;
      for (const c of g.characters) {
        if (!c.alive) continue;
        if (Math.hypot(c.pos.x - it.x, c.pos.z - it.z) < 1.2 && Math.abs(c.pos.y + 1 - it.y) < 1.8) { taken = c; break; }
      }
      if (taken || it.t > 40) {
        if (taken) this.collect(taken, it);
        this.group.remove(it.mesh);
        this.items.splice(i, 1);
      }
    }
  }

  collect(c, it) {
    const g = this.game;
    g.particles.burst(it.x, it.y, it.z, it.kind === 'coin' ? [0xffc300, 0xffe066] : [0xffe066, 0xffffff, 0x7fd4ff], 12, 4, 0.22, 0.5);
    if (it.kind === 'coin') {
      g.audio.pop();
      g.giveCoins(c, 1, 'Coin!', 'coin');
      return;
    }
    // power-up star: a random goodie
    const roll = pick(['speed', 'jetpack', 'shield', 'heal']);
    if (roll === 'speed') { c.speedBoost = Math.max(c.speedBoost, 10); g.notify(c, '⭐ Speed boost!', 'powerup'); }
    else if (roll === 'jetpack') { c.jetpack = Math.max(c.jetpack, 8); g.notify(c, '⭐ Jetpack! Hold jump to fly', 'powerup'); }
    else if (roll === 'shield') { c.shield = Math.max(c.shield, 40); g.notify(c, '⭐ Shield!', 'powerup'); }
    else { c.hp = Math.min(100, c.hp + 40); g.notify(c, '⭐ +40 HP', 'powerup'); }
    g.trackFor(c, 'star');
  }
}
