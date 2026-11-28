import * as THREE from 'three';
import { boxGeo, flatMat, newToon } from './utils.js';

/** Shared cartoon outline material (inverted hull). */
export const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x1b1530, side: THREE.BackSide });

/**
 * Blocky humanoid made from boxes. Forward is +Z. Feet at y=0.
 * Returns { group, root, parts, materials }. If `ownMaterials` is true each part gets
 * its own material so it can flash red when hurt.
 */
export function makeHumanoid({
  skin = 0xffcc88, shirt = 0x3fa9ff, pants = 0x334488, hat = null, hatStyle = 'cap', hair = 0x4a2f1b, back = null, backColor = null,
  scale = 1, ownMaterials = false, eyes = 0x111111, outline = true, face = true,
} = {}) {
  const mats = [];
  const mat = (c) => {
    if (!ownMaterials) return flatMat(c);
    const m = newToon(c);
    mats.push(m);
    return m;
  };
  const group = new THREE.Group();
  const root = new THREE.Group();
  root.scale.setScalar(scale);
  group.add(root);

  // a box with an optional black outline shell (makes the characters pop)
  const mk = (w, h, d, m, line = false) => {
    const mesh = new THREE.Mesh(boxGeo(w, h, d), m);
    mesh.castShadow = true;
    if (line && outline) {
      const o = new THREE.Mesh(boxGeo(w + 0.07, h + 0.07, d + 0.07), OUTLINE_MAT);
      o.userData.outline = true;
      mesh.add(o);
    }
    return mesh;
  };
  const skinM = mat(skin), shirtM = mat(shirt), pantsM = mat(pants);
  const shade = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();

  // torso (slightly wider at the shoulders) + belt
  const body = new THREE.Group();
  body.position.y = 1.25;
  root.add(body);
  body.add(mk(0.92, 0.86, 0.5, shirtM, true));
  const stripe = mk(0.94, 0.12, 0.52, mat(new THREE.Color(shirt).lerp(new THREE.Color(0xffffff), 0.45).getHex()));
  stripe.position.y = 0.12;
  body.add(stripe);
  const collar = mk(0.46, 0.1, 0.06, mat(shade(shirt, 0.75)));
  collar.position.set(0, 0.38, 0.25);
  body.add(collar);
  const belt = mk(0.94, 0.1, 0.52, flatMat(0x2b1d14));
  belt.position.y = -0.4;
  body.add(belt);
  const buckle = mk(0.14, 0.1, 0.04, flatMat(0xffd23f));
  buckle.position.set(0, -0.4, 0.27);
  body.add(buckle);

  // head + face
  const head = mk(0.62, 0.62, 0.62, skinM, true);
  head.position.y = 2.02;
  root.add(head);
  const faceParts = { eyes: [] };
  if (face) {
    const white = flatMat(0xffffff), dark = flatMat(eyes), shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(0.14 * sx, 0.05, 0.312);
      const ball = new THREE.Mesh(boxGeo(0.15, 0.19, 0.03), white);
      const pupil = new THREE.Mesh(boxGeo(0.09, 0.13, 0.03), dark);
      pupil.position.set(0.015 * sx, -0.01, 0.012);
      const glint = new THREE.Mesh(boxGeo(0.035, 0.035, 0.02), shine);
      glint.position.set(0.035 * sx, 0.035, 0.026);
      eye.add(ball, pupil, glint);
      head.add(eye);
      faceParts.eyes.push(eye);
      const brow = new THREE.Mesh(boxGeo(0.15, 0.035, 0.03), flatMat(hair !== null && hat === null ? hair : 0x3b2a20));
      brow.position.set(0.14 * sx, 0.2, 0.314);
      brow.rotation.z = -sx * 0.12;
      head.add(brow);
      faceParts[sx < 0 ? 'browL' : 'browR'] = brow;
      const cheek = new THREE.Mesh(boxGeo(0.1, 0.05, 0.02), flatMat(0xff8fa3));
      cheek.position.set(0.225 * sx, -0.09, 0.312);
      head.add(cheek);
    }
    // a little smile: middle + two raised corners
    const mouth = new THREE.Group();
    mouth.position.set(0, -0.15, 0.313);
    const mid = new THREE.Mesh(boxGeo(0.12, 0.035, 0.02), dark);
    mouth.add(mid);
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(boxGeo(0.04, 0.035, 0.02), dark);
      c.position.set(0.075 * sx, 0.025, 0);
      mouth.add(c);
    }
    mouth.userData.mouth = true;
    head.add(mouth);
    faceParts.mouth = mouth;
  }
  if (hat !== null) addHat(head, hatStyle || 'cap', mat(hat), mk);
  if (back) addBack(body, back, backColor ?? 0xd62828, mk);
  else if (hair !== null) {
    const hm = flatMat(hair);
    const top = mk(0.66, 0.14, 0.66, hm);
    top.position.y = 0.36;
    head.add(top);
    const back = mk(0.66, 0.36, 0.12, hm);
    back.position.set(0, 0.14, -0.3);
    head.add(back);
    const fringe = mk(0.5, 0.1, 0.06, hm);
    fringe.position.set(-0.04, 0.27, 0.31);
    head.add(fringe);
  }

  // arms: sleeve + forearm + hand, pivoting at the shoulder
  const arm = (x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.62, 0);
    const sleeve = mk(0.3, 0.38, 0.3, shirtM, true);
    sleeve.position.y = -0.16;
    pivot.add(sleeve);
    const cuff = mk(0.31, 0.08, 0.31, mat(new THREE.Color(shirt).lerp(new THREE.Color(0xffffff), 0.45).getHex()));
    cuff.position.y = -0.36;
    pivot.add(cuff);
    const fore = mk(0.25, 0.34, 0.25, skinM, true);
    fore.position.y = -0.54;
    pivot.add(fore);
    const hand = mk(0.3, 0.2, 0.3, skinM, true);
    hand.position.y = -0.78;
    pivot.add(hand);
    root.add(pivot);
    return pivot;
  };
  const armL = arm(-0.62), armR = arm(0.62);

  // legs: trousers + shoes, pivoting at the hip
  const shoeM = flatMat(0x2d2d3a);
  const leg = (x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.82, 0);
    const p = mk(0.36, 0.68, 0.36, pantsM, true);
    p.position.y = -0.34;
    pivot.add(p);
    const shoe = mk(0.4, 0.16, 0.48, shoeM, true);
    shoe.position.set(0, -0.72, 0.05);
    pivot.add(shoe);
    const sole = mk(0.42, 0.06, 0.5, flatMat(0xf5f5f5));
    sole.position.set(0, -0.8, 0.05);
    pivot.add(sole);
    root.add(pivot);
    return pivot;
  };
  const legL = leg(-0.22), legR = leg(0.22);

  return { group, root, parts: { body, head, armL, armR, legL, legR, face: faceParts }, materials: mats };
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
const wizardGeo = new THREE.ConeGeometry(0.34, 0.95, 6);
const helmetGeo = new THREE.SphereGeometry(0.52, 12, 8);

/** Things worn on the back (coin shop "Back" slot). */
function addBack(body, style, color, mk) {
  const m = flatMat(color);
  const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); body.add(mesh); return mesh; };
  if (style === 'cape') {
    const c = at(mk(0.86, 1.25, 0.06, m, true), 0, -0.3, -0.3);
    c.rotation.x = 0.12;
  } else if (style === 'wings') {
    for (const sx of [-1, 1]) {
      const w = at(mk(0.9, 0.55, 0.06, m, true), sx * 0.55, 0.15, -0.32);
      w.rotation.z = sx * 0.35;
      w.userData.flap = sx;
    }
  } else if (style === 'backpack') {
    at(mk(0.6, 0.65, 0.3, m, true), 0, 0, -0.4);
    at(mk(0.4, 0.25, 0.1, flatMat(0xffffff)), 0, -0.1, -0.57);
  } else if (style === 'jetpack') {
    for (const sx of [-1, 1]) at(mk(0.26, 0.62, 0.26, m, true), sx * 0.18, 0, -0.4);
    for (const sx of [-1, 1]) at(mk(0.18, 0.14, 0.18, flatMat(0xff5a1f)), sx * 0.18, -0.36, -0.4);
  } else if (style === 'shell') {
    at(mk(0.9, 0.8, 0.35, m, true), 0, 0, -0.42);
    at(mk(0.5, 0.45, 0.06, flatMat(0xf4c542)), 0, 0, -0.6);
  }
}

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
    case 'beanie':
      at(mk(0.68, 0.3, 0.68, m, true), 0, 0.36, 0);
      at(mk(0.18, 0.14, 0.18, flatMat(0xffffff)), 0, 0.57, 0);
      break;
    case 'cowboy':
      at(mk(1.05, 0.06, 1.05, m), 0, 0.33, 0);
      at(mk(0.56, 0.36, 0.56, m, true), 0, 0.52, 0);
      at(mk(0.58, 0.08, 0.58, flatMat(0x3e2723)), 0, 0.4, 0);
      break;
    case 'wizard': {
      at(mk(0.95, 0.06, 0.95, m), 0, 0.33, 0);
      const c = new THREE.Mesh(wizardGeo, m);
      c.castShadow = true;
      at(c, 0, 0.85, 0);
      at(mk(0.12, 0.12, 0.04, flatMat(0xffe066)), 0.1, 0.75, 0.25);
      break;
    }
    case 'pirate':
      at(mk(0.9, 0.3, 0.5, m, true), 0, 0.45, 0);
      at(mk(0.16, 0.12, 0.04, flatMat(0xffffff)), 0, 0.48, 0.26);
      break;
    case 'santa': {
      at(mk(0.72, 0.14, 0.72, flatMat(0xffffff)), 0, 0.34, 0);
      const c = new THREE.Mesh(partyGeo, m);
      c.rotation.z = -0.4;
      at(c, 0.12, 0.7, 0);
      at(mk(0.16, 0.16, 0.16, flatMat(0xffffff)), 0.34, 0.95, 0);
      break;
    }
    case 'bunny':
      for (const sx of [-1, 1]) { const e = at(mk(0.14, 0.6, 0.08, m, true), sx * 0.16, 0.6, 0); e.rotation.z = -sx * 0.15; at(mk(0.07, 0.42, 0.02, flatMat(0xff8fa3)), sx * 0.16, 0.6, 0.05); }
      break;
    case 'cat':
      for (const sx of [-1, 1]) { const e = at(mk(0.18, 0.2, 0.08, m, true), sx * 0.2, 0.4, 0); e.rotation.z = -sx * 0.5; }
      break;
    case 'headphones':
      at(mk(0.74, 0.08, 0.16, m, true), 0, 0.36, 0);
      for (const sx of [-1, 1]) at(mk(0.1, 0.26, 0.26, m, true), sx * 0.36, 0.05, 0);
      break;
    case 'flower':
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; at(mk(0.13, 0.13, 0.13, flatMat([0xff8fa3, 0xffe066, 0xc77dff][i % 3])), Math.cos(a) * 0.3, 0.34, Math.sin(a) * 0.3); }
      break;
    case 'helmet': {
      const h = new THREE.Mesh(helmetGeo, new THREE.MeshBasicMaterial({ color: 0xa8e0ff, transparent: true, opacity: 0.35, depthWrite: false }));
      at(h, 0, 0.02, 0);
      at(mk(0.8, 0.1, 0.8, m), 0, -0.34, 0);
      break;
    }
    default:
      at(mk(0.7, 0.18, 0.7, m, true), 0, 0.38, 0);
      at(mk(0.7, 0.07, 0.3, m), 0, 0.31, 0.45);
  }
}
