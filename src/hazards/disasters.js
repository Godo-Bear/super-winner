import * as THREE from 'three';
import { Hazard } from './base.js';
import { Drops } from './common.js';
import { rand, pick } from '../utils.js';

const meteorGeo = new THREE.DodecahedronGeometry(1.3, 0);
const meteorMat = new THREE.MeshLambertMaterial({ color: 0x6b3b22, emissive: 0xff5a00, emissiveIntensity: 0.6, flatShading: true });

/** Meteors crash into red circles near players. */
export class Meteor extends Hazard {
  constructor(game, opts) {
    super(game, opts);
    this.duration = 13;
    this.killVerb = 'got flattened by a METEOR';
    this.drops = new Drops(this);
    this.nextDrop = 0.3;
    this.left = 7;
  }

  update(dt) {
    this.nextDrop -= dt;
    if (this.left > 0 && this.nextDrop <= 0) {
      this.left--;
      this.nextDrop = rand(0.8, 1.4);
      const living = [...this.living()];
      let p;
      if (living.length && Math.random() < 0.75) {
        const c = pick(living);
        const a = Math.random() * Math.PI * 2, r = rand(0, 3);
        p = { x: c.pos.x + Math.cos(a) * r, z: c.pos.z + Math.sin(a) * r };
      } else p = this.island.randomPoint(0, this.R - 2, { avoidHut: false });
      const mesh = new THREE.Mesh(meteorGeo, meteorMat);
      mesh.castShadow = true;
      this.audio.whoosh();
      this.drops.add({
        x: p.x, z: p.z, time: 2.4, radius: 4.2, mesh, height: 55,
        from: { x: p.x + 25, y: 60, z: p.z + 12 },
        trail: (pos) => this.particles.emit({ x: pos.x, y: pos.y, z: pos.z, color: [0xff5a1f, 0xffa31a, 0xffe066, 0x666666], count: 2, speed: 1.5, size: 0.7, life: 0.6, gravity: -1 }),
        onImpact: (x, y, z) => this.game.explode(x, y, z, 4.2, 70, this, { knock: 14 }),
      });
    }
    this.drops.update(dt);
    if (this.left === 0 && this.drops.count === 0 && this.t > 4) this.done = true;
  }
}

export default { meteor: Meteor };
