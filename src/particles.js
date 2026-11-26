import * as THREE from 'three';

const MAX = 2500;

/**
 * Pooled cube particles drawn with a single InstancedMesh.
 * Active particles are kept densely packed so only `count` instances are uploaded.
 */
export class Particles {
  constructor(scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);

    this.n = 0;
    this.px = new Float32Array(MAX); this.py = new Float32Array(MAX); this.pz = new Float32Array(MAX);
    this.vx = new Float32Array(MAX); this.vy = new Float32Array(MAX); this.vz = new Float32Array(MAX);
    this.life = new Float32Array(MAX); this.maxLife = new Float32Array(MAX);
    this.size = new Float32Array(MAX); this.grav = new Float32Array(MAX); this.drag = new Float32Array(MAX);
    this.rot = new Float32Array(MAX);
    this.cr = new Float32Array(MAX); this.cg = new Float32Array(MAX); this.cb = new Float32Array(MAX);
    this.shrink = new Uint8Array(MAX);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  /**
   * Emit `count` particles.
   * opts: x,y,z, spread, speed, up, color (number|array), size, life, gravity, drag, dir {x,y,z}
   */
  emit(o) {
    const count = o.count ?? 10;
    const colors = Array.isArray(o.color) ? o.color : [o.color ?? 0xffffff];
    for (let k = 0; k < count; k++) {
      if (this.n >= MAX) return;
      const i = this.n++;
      const sp = o.spread ?? 0.3;
      this.px[i] = o.x + (Math.random() - 0.5) * sp * 2;
      this.py[i] = o.y + (Math.random() - 0.5) * sp * 2;
      this.pz[i] = o.z + (Math.random() - 0.5) * sp * 2;
      const speed = (o.speed ?? 5) * (0.4 + Math.random() * 0.6);
      let dx = Math.random() - 0.5, dy = Math.random() - 0.5, dz = Math.random() - 0.5;
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      if (o.dir) {
        const cone = o.cone ?? 0.3;
        dx = o.dir.x + dx * cone; dy = o.dir.y + dy * cone; dz = o.dir.z + dz * cone;
      }
      this.vx[i] = dx * speed;
      this.vy[i] = dy * speed + (o.up ?? 0);
      this.vz[i] = dz * speed;
      const life = (o.life ?? 1) * (0.6 + Math.random() * 0.4);
      this.life[i] = life; this.maxLife[i] = life;
      this.size[i] = (o.size ?? 0.3) * (0.6 + Math.random() * 0.6);
      this.grav[i] = o.gravity ?? 9;
      this.drag[i] = o.drag ?? 0.5;
      this.rot[i] = Math.random() * 6;
      this.shrink[i] = o.shrink === false ? 0 : 1;
      this._c.set(colors[(Math.random() * colors.length) | 0]);
      this.cr[i] = this._c.r; this.cg[i] = this._c.g; this.cb[i] = this._c.b;
    }
  }

  burst(x, y, z, color, count = 20, speed = 8, size = 0.35, life = 0.9) {
    this.emit({ x, y, z, color, count, speed, size, life, up: speed * 0.4 });
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j];
    this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
    this.life[i] = this.life[j]; this.maxLife[i] = this.maxLife[j];
    this.size[i] = this.size[j]; this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j];
    this.rot[i] = this.rot[j]; this.shrink[i] = this.shrink[j];
    this.cr[i] = this.cr[j]; this.cg[i] = this.cg[j]; this.cb[i] = this.cb[j];
  }

  clear() { this.n = 0; this.mesh.count = 0; }

  update(dt) {
    const m = this._m, q = this._q, e = this._e, s = this._s, p = this._p, c = this._c;
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      const dr = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= dr; this.vz[i] *= dr; this.vy[i] = this.vy[i] * dr - this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      this.rot[i] += dt * 4;
    }
    for (let i = 0; i < this.n; i++) {
      const t = this.shrink[i] ? this.life[i] / this.maxLife[i] : 1;
      const sz = this.size[i] * t;
      e.set(this.rot[i], this.rot[i] * 0.7, 0);
      q.setFromEuler(e);
      s.set(sz, sz, sz);
      p.set(this.px[i], this.py[i], this.pz[i]);
      m.compose(p, q, s);
      this.mesh.setMatrixAt(i, m);
      c.setRGB(this.cr[i], this.cg[i], this.cb[i]);
      this.mesh.setColorAt(i, c);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
