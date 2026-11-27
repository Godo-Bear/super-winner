import * as THREE from 'three';
import { makeTextSprite, TOON_GRADIENT } from '../utils.js';

/**
 * Generic scene replication for hazards.
 *
 * The host walks `game.hazardRoot` and sends:
 *   - geometry buffers (once per geometry, re-sent for small geometries that change)
 *   - material settings (re-sent when they change; shared "named" materials map to
 *     the client's own copies so animated warnings stay smooth)
 *   - object create / transform / remove deltas
 * Clients rebuild the same objects under their own hazardRoot and interpolate.
 * This means every hazard (including brand new ones) works online automatically.
 */

const MATERIALS = {
  MeshLambertMaterial: THREE.MeshLambertMaterial,
  MeshToonMaterial: THREE.MeshToonMaterial,
  MeshBasicMaterial: THREE.MeshBasicMaterial,
  MeshStandardMaterial: THREE.MeshStandardMaterial,
  LineBasicMaterial: THREE.LineBasicMaterial,
  SpriteMaterial: THREE.SpriteMaterial,
};
const R = (v) => Math.round(v * 1000) / 1000;
const MAX_LIVE_GEO_VERTS = 64; // small geometries (lines) are re-sent when edited

function colorHex(c) { return c ? c.getHex() : null; }

export class SceneEncoder {
  constructor(root) {
    this.root = root;
    this.reset();
  }

  /** Forget everything so the next encode() describes the whole scene again. */
  reset() {
    this.ids = new WeakMap();
    this.nextId = 1;
    this.live = new Map(); // id -> { obj, state, g, m }
    this.geos = new Map(); // geometry -> { id, ver }
    this.mats = new Map(); // material -> { id, sig }
    this.nextG = 1;
    this.nextM = 1;
    this.fresh = true;
  }

  geoId(geo, out) {
    let rec = this.geos.get(geo);
    const pos = geo.attributes.position;
    const ver = pos ? pos.version : 0;
    if (rec && (rec.ver === ver || !pos || pos.count > MAX_LIVE_GEO_VERTS)) return rec.id;
    if (!rec) { rec = { id: this.nextG++, ver }; this.geos.set(geo, rec); }
    rec.ver = ver;
    const def = { id: rec.id };
    const enc = (a) => Array.from(a.array, R);
    if (pos) def.p = enc(pos);
    if (geo.attributes.normal) def.n = enc(geo.attributes.normal);
    if (geo.attributes.color) def.c = enc(geo.attributes.color);
    if (geo.index) def.i = Array.from(geo.index.array);
    if (geo.drawRange.count !== Infinity) def.dr = [geo.drawRange.start, geo.drawRange.count];
    out.geos.push(def);
    return rec.id;
  }

  matId(mat, out) {
    let rec = this.mats.get(mat);
    if (!rec) { rec = { id: this.nextM++, sig: '' }; this.mats.set(mat, rec); }
    let def;
    if (mat.userData.netName) def = { id: rec.id, nm: mat.userData.netName };
    else {
      def = {
        id: rec.id, ty: mat.type, c: colorHex(mat.color), o: R(mat.opacity), tr: mat.transparent ? 1 : 0,
        sd: mat.side, dw: mat.depthWrite ? 1 : 0,
      };
      if (mat.emissive) { def.e = colorHex(mat.emissive); def.ei = R(mat.emissiveIntensity); }
      if (mat.flatShading) def.fs = 1;
      if (mat.vertexColors) def.vc = 1;
      if (mat.fog === false) def.nf = 1;
      if (mat.userData.netText) def.tx = mat.userData.netText;
    }
    const sig = JSON.stringify(def);
    if (sig !== rec.sig) { rec.sig = sig; out.mats.push(def); }
    return rec.id;
  }

  /** Returns a delta describing what changed since the last call (or everything after reset). */
  encode() {
    const out = { geos: [], mats: [], add: [], upd: [], re: [], rem: [], loc: [] };
    if (this.fresh) { out.reset = 1; this.fresh = false; }
    const seen = new Set();
    const walk = (obj, parentId) => {
      for (const child of obj.children) {
        let id = this.ids.get(child);
        const isNew = id === undefined;
        if (isNew) { id = this.nextId++; this.ids.set(child, id); }
        seen.add(id);
        const local = child.userData.netLocal;
        if (local) {
          // client-side effect (rain / snow): send parameters, not vertices
          const sig = JSON.stringify(local);
          const rec = this.live.get(id);
          if (!rec || rec.sig !== sig) out.loc.push([id, parentId, local]);
          this.live.set(id, { obj: child, sig, local: true });
          continue;
        }
        let rec = this.live.get(id);
        if (!rec) {
          const a = { id, p: parentId };
          if (child.isSprite) { a.k = 's'; a.m = this.matId(child.material, out); }
          else if (child.isLine) { a.k = 'l'; a.g = this.geoId(child.geometry, out); a.m = this.matId(child.material, out); }
          else if (child.isMesh) { a.k = 'm'; a.g = this.geoId(child.geometry, out); a.m = this.matId(child.material, out); if (child.castShadow) a.cs = 1; }
          else a.k = 'g';
          if (child.renderOrder) a.ro = child.renderOrder;
          out.add.push(a);
          rec = { obj: child, state: null, g: a.g, m: a.m };
          this.live.set(id, rec);
        } else if (child.isMesh || child.isLine) {
          const g = this.geoId(child.geometry, out);
          const m = this.matId(child.material, out);
          if (g !== rec.g || m !== rec.m) { rec.g = g; rec.m = m; out.re.push([id, g, m]); }
        } else if (child.isSprite) {
          this.matId(child.material, out);
        }
        const p = child.position, r = child.rotation, s = child.scale;
        const st = [R(p.x), R(p.y), R(p.z), R(r.x), R(r.y), R(r.z), R(s.x), R(s.y), R(s.z), child.visible ? 1 : 0];
        const prev = rec.state;
        let changed = !prev;
        if (prev) for (let i = 0; i < 10; i++) if (prev[i] !== st[i]) { changed = true; break; }
        if (changed) { rec.state = st; out.upd.push([id, ...st]); }
        walk(child, id);
      }
    };
    walk(this.root, 0);
    for (const [id] of this.live) {
      if (!seen.has(id)) { out.rem.push(id); this.live.delete(id); }
    }
    // drop empty arrays to keep packets small
    for (const k of Object.keys(out)) if (Array.isArray(out[k]) && !out[k].length) delete out[k];
    return out;
  }
}

/**
 * Client side: rebuilds and interpolates the host's hazard objects.
 */
export class SceneDecoder {
  constructor(game, root, named = {}) {
    this.game = game;
    this.root = root;
    this.named = named; // netName -> local material
    this.geos = new Map();
    this.mats = new Map();
    this.objs = new Map();
    this.locals = new Map();
    this.alphaStart = 0;
    this.interval = 0.05;
  }

  reset() {
    for (const o of this.objs.values()) o.parent?.remove(o);
    for (const l of this.locals.values()) l.dispose();
    for (const g of this.geos.values()) g.dispose();
    for (const m of this.mats.values()) if (!m.userData.shared) { m.map?.dispose(); m.dispose(); }
    this.geos.clear(); this.mats.clear(); this.objs.clear(); this.locals.clear();
  }

  makeMaterial(d) {
    if (d.nm) {
      const m = this.named[d.nm] || new THREE.MeshBasicMaterial({ color: 0xff0000 });
      m.userData.shared = true;
      return m;
    }
    let m;
    if (d.tx) {
      m = makeTextSprite(d.tx.text, d.tx.opts).material;
    } else {
      const Cls = MATERIALS[d.ty] || THREE.MeshBasicMaterial;
      m = new Cls();
      if (m.isMeshToonMaterial) m.gradientMap = TOON_GRADIENT;
    }
    this.applyMaterial(m, d);
    return m;
  }

  applyMaterial(m, d) {
    if (d.nm) return;
    if (d.c !== null && d.c !== undefined && m.color) m.color.setHex(d.c);
    m.opacity = d.o;
    m.transparent = !!d.tr;
    if (d.sd !== undefined) m.side = d.sd;
    m.depthWrite = !!d.dw;
    if (m.emissive && d.e !== undefined) { m.emissive.setHex(d.e); m.emissiveIntensity = d.ei; }
    if ('flatShading' in m && m.flatShading !== !!d.fs) { m.flatShading = !!d.fs; m.needsUpdate = true; }
    if (m.vertexColors !== !!d.vc) { m.vertexColors = !!d.vc; m.needsUpdate = true; }
    if (d.nf) m.fog = false;
  }

  makeGeometry(d) {
    const g = new THREE.BufferGeometry();
    if (d.p) g.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3));
    if (d.n) g.setAttribute('normal', new THREE.Float32BufferAttribute(d.n, 3));
    if (d.c) g.setAttribute('color', new THREE.Float32BufferAttribute(d.c, 3));
    if (d.i) g.setIndex(d.i);
    if (d.dr) g.setDrawRange(d.dr[0], d.dr[1]);
    g.computeBoundingSphere();
    return g;
  }

  apply(sc, makeLocal) {
    if (!sc) return;
    if (sc.reset) this.reset();
    for (const d of sc.geos || []) {
      const old = this.geos.get(d.id);
      const g = this.makeGeometry(d);
      this.geos.set(d.id, g);
      if (old) {
        for (const o of this.objs.values()) if (o.geometry === old) o.geometry = g;
        old.dispose();
      }
    }
    for (const d of sc.mats || []) {
      const m = this.mats.get(d.id);
      if (m) this.applyMaterial(m, d);
      else this.mats.set(d.id, this.makeMaterial(d));
    }
    for (const a of sc.add || []) {
      let o;
      const mat = this.mats.get(a.m);
      if (a.k === 'm') { o = new THREE.Mesh(this.geos.get(a.g), mat); o.castShadow = !!a.cs; }
      else if (a.k === 'l') o = new THREE.Line(this.geos.get(a.g), mat);
      else if (a.k === 's') o = new THREE.Sprite(mat);
      else o = new THREE.Group();
      if (a.ro) o.renderOrder = a.ro;
      o.frustumCulled = a.k !== 'l';
      (this.objs.get(a.p) || this.root).add(o);
      this.objs.set(a.id, o);
    }
    for (const [id, g, m] of sc.re || []) {
      const o = this.objs.get(id);
      if (!o) continue;
      if (g) o.geometry = this.geos.get(g);
      if (m) o.material = this.mats.get(m);
    }
    for (const u of sc.upd || []) {
      const o = this.objs.get(u[0]);
      if (!o) continue;
      const to = u.slice(1);
      const ud = o.userData;
      if (!ud.to) { ud.from = to; ud.to = to; this.set(o, to, to, 1); }
      else { ud.from = this.current(o); ud.to = to; }
    }
    for (const id of sc.rem || []) {
      const o = this.objs.get(id);
      if (o) { o.parent?.remove(o); this.objs.delete(id); }
      const l = this.locals.get(id);
      if (l) { l.dispose(); this.locals.delete(id); }
    }
    for (const [id, parentId, params] of sc.loc || []) {
      let l = this.locals.get(id);
      if (!l) {
        l = makeLocal(params, this.objs.get(parentId) || this.root);
        if (l) this.locals.set(id, l);
      } else l.set(params);
    }
    this.alphaStart = performance.now() / 1000;
  }

  current(o) {
    const p = o.position, r = o.rotation, s = o.scale;
    return [p.x, p.y, p.z, r.x, r.y, r.z, s.x, s.y, s.z, o.visible ? 1 : 0];
  }

  set(o, a, b, t) {
    const L = (i) => a[i] + (b[i] - a[i]) * t;
    const A = (i) => {
      let d = b[i] - a[i];
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return a[i] + d * t;
    };
    o.position.set(L(0), L(1), L(2));
    o.rotation.set(A(3), A(4), A(5));
    o.scale.set(L(6), L(7), L(8));
    o.visible = b[9] === 1;
  }

  /** Call every frame. */
  update(dt) {
    const t = Math.min(1, (performance.now() / 1000 - this.alphaStart) / this.interval);
    for (const o of this.objs.values()) {
      const ud = o.userData;
      if (ud.to && ud.from !== ud.to) {
        this.set(o, ud.from, ud.to, t);
        if (t >= 1) ud.from = ud.to;
      }
    }
    for (const l of this.locals.values()) l.update(dt);
  }
}
