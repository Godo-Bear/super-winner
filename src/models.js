import * as THREE from 'three';
import { boxGeo, flatMat } from './utils.js';

/**
 * Blocky humanoid made from boxes. Forward is +Z. Feet at y=0.
 * Returns { group, parts, materials }. If `ownMaterials` is true each part gets
 * its own material so it can flash red when hurt.
 */
export function makeHumanoid({ skin = 0xffcc88, shirt = 0x3fa9ff, pants = 0x334488, hat = null, hatStyle = 'cap', scale = 1, ownMaterials = false, eyes = 0x111111 } = {}) {
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
  if (hat !== null) addHat(head, hatStyle || 'cap', mat(hat), mk);

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

const partyGeo = new THREE.ConeGeometry(0.28, 0.7, 6);
const haloGeo = new THREE.TorusGeometry(0.34, 0.05, 6, 16);

/** Hat shapes for the coin shop. All blocky, all primitives. */
function addHat(head, style, m, mk) {
  const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); head.add(mesh); return mesh; };
  switch (style) {
    case 'party': {
      const c = new THREE.Mesh(partyGeo, m);
      c.castShadow = true;
      at(c, 0, 0.66, 0);
      at(mk(0.12, 0.12, 0.12, flatMat(0xffffff)), 0, 1.03, 0);
      break;
    }
    case 'tophat':
      at(mk(0.82, 0.07, 0.82, m), 0, 0.34, 0);
      at(mk(0.52, 0.55, 0.52, m), 0, 0.64, 0);
      at(mk(0.54, 0.1, 0.54, flatMat(0xc0392b)), 0, 0.42, 0);
      break;
    case 'chef':
      at(mk(0.6, 0.25, 0.6, m), 0, 0.42, 0);
      at(mk(0.76, 0.32, 0.76, m), 0, 0.68, 0);
      break;
    case 'horns':
      for (const sx of [-1, 1]) {
        const h = at(mk(0.12, 0.34, 0.12, m), sx * 0.22, 0.44, 0.05);
        h.rotation.z = -sx * 0.4;
      }
      break;
    case 'propeller': {
      at(mk(0.66, 0.16, 0.66, m), 0, 0.38, 0);
      at(mk(0.06, 0.18, 0.06, flatMat(0x333333)), 0, 0.55, 0);
      const blade = at(mk(0.9, 0.04, 0.12, flatMat(0xffd23f)), 0, 0.65, 0);
      blade.userData.spin = true;
      break;
    }
    case 'crown':
      at(mk(0.68, 0.16, 0.68, m), 0, 0.38, 0);
      for (const [x, z] of [[-0.27, -0.27], [0.27, -0.27], [-0.27, 0.27], [0.27, 0.27], [0, 0.3]]) at(mk(0.13, 0.2, 0.13, m), x, 0.55, z);
      at(mk(0.1, 0.1, 0.06, flatMat(0xd62828)), 0, 0.4, 0.35);
      break;
    case 'halo': {
      const h = new THREE.Mesh(haloGeo, m);
      h.rotation.x = Math.PI / 2;
      at(h, 0, 0.62, 0);
      break;
    }
    default:
      at(mk(0.7, 0.18, 0.7, m), 0, 0.38, 0);
  }
}
