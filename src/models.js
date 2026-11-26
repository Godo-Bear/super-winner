import * as THREE from 'three';
import { boxGeo, flatMat } from './utils.js';

/**
 * Blocky humanoid made from boxes. Forward is +Z. Feet at y=0.
 * Returns { group, parts, materials }. If `ownMaterials` is true each part gets
 * its own material so it can flash red when hurt.
 */
export function makeHumanoid({ skin = 0xffcc88, shirt = 0x3fa9ff, pants = 0x334488, hat = null, scale = 1, ownMaterials = false, eyes = 0x111111 } = {}) {
  const mats = [];
  const mat = (c) => {
    if (!ownMaterials) return flatMat(c);
    const m = new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    mats.push(m);
    return m;
  };
  const group = new THREE.Group();
  const root = new THREE.Group();
  root.scale.setScalar(scale);
  group.add(root);

  const mk = (w, h, d, m) => {
    const mesh = new THREE.Mesh(boxGeo(w, h, d), m);
    mesh.castShadow = true;
    return mesh;
  };
  const skinM = mat(skin), shirtM = mat(shirt), pantsM = mat(pants);

  const body = mk(0.9, 0.9, 0.5, shirtM);
  body.position.y = 1.25;
  root.add(body);

  const head = mk(0.62, 0.62, 0.62, skinM);
  head.position.y = 2.02;
  root.add(head);
  const eyeM = flatMat(eyes);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(boxGeo(0.1, 0.14, 0.04), eyeM);
    e.position.set(0.14 * s, 0.06, 0.32);
    head.add(e);
  }
  if (hat !== null) {
    const h = mk(0.7, 0.18, 0.7, mat(hat));
    h.position.y = 0.38;
    head.add(h);
  }

  const limb = (x, y, w, h, m) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = mk(w, h, w, m);
    mesh.position.y = -h / 2;
    pivot.add(mesh);
    root.add(pivot);
    return pivot;
  };
  const armL = limb(-0.6, 1.66, 0.28, 0.85, skinM);
  const armR = limb(0.6, 1.66, 0.28, 0.85, skinM);
  const legL = limb(-0.22, 0.8, 0.36, 0.8, pantsM);
  const legR = limb(0.22, 0.8, 0.36, 0.8, pantsM);

  return { group, root, parts: { body, head, armL, armR, legL, legR }, materials: mats };
}

/** Walk-cycle helper: phase advances with speed. */
export function animateHumanoid(parts, phase, amount, opts = {}) {
  const s = Math.sin(phase) * amount;
  parts.legL.rotation.x = s;
  parts.legR.rotation.x = -s;
  if (opts.zombie) {
    parts.armL.rotation.x = -1.4 + s * 0.15;
    parts.armR.rotation.x = -1.4 - s * 0.15;
  } else {
    parts.armL.rotation.x = -s * 0.9;
    parts.armR.rotation.x = s * 0.9;
  }
}
