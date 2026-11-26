import * as THREE from 'three';
import { clamp } from './utils.js';
import { terrainHeight } from './island.js';

/**
 * Keyboard / mouse / touch input for the local player plus the third-person orbit camera.
 */
export class PlayerController {
  constructor(game) {
    this.game = game;
    this.keys = new Set();
    this.yaw = 0.6;
    this.pitch = 0.42;
    this.dist = 10;
    this.camTarget = new THREE.Vector3(0, 2, 0);
    this.shakeOffset = new THREE.Vector3();
    this.joy = { x: 0, y: 0, id: null };
    this.touchSprint = false;
    this.touchJumpHeld = false;
    this.lookTouch = null;
    this.dragging = false;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.bind();
  }

  get typing() {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  }

  bind() {
    const el = this.game.renderer.domElement;
    addEventListener('keydown', (e) => {
      if (this.typing) return;
      this.keys.add(e.code);
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) this.jumpPressed = true;
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    el.addEventListener('mousedown', (e) => {
      if (this.game.state !== 'playing' || this.isTouch) return;
      this.dragging = true;
      if (!document.pointerLockElement && !this.game.writer?.playerWriting) {
        try {
          const p = el.requestPointerLock?.();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch { /* pointer lock unsupported */ }
      }
    });
    addEventListener('mouseup', () => (this.dragging = false));
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === el || this.dragging) this.look(e.movementX, e.movementY, 0.0028);
    });
    el.addEventListener('wheel', (e) => {
      this.dist = clamp(this.dist + Math.sign(e.deltaY) * 1.2, 5, 18);
    }, { passive: true });
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    // ----- touch: camera drag on the canvas -----
    el.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) if (this.lookTouch === null) this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (this.lookTouch && t.identifier === this.lookTouch.id) {
          this.look(t.clientX - this.lookTouch.x, t.clientY - this.lookTouch.y, 0.006);
          this.lookTouch.x = t.clientX;
          this.lookTouch.y = t.clientY;
        }
      }
    }, { passive: true });
    const endLook = (e) => {
      for (const t of e.changedTouches) if (this.lookTouch && t.identifier === this.lookTouch.id) this.lookTouch = null;
    };
    el.addEventListener('touchend', endLook);
    el.addEventListener('touchcancel', endLook);

    // ----- touch: joystick -----
    const zone = document.getElementById('joy-zone');
    const base = document.getElementById('joy-base');
    const knob = document.getElementById('joy-knob');
    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.joy.id = t.identifier;
      const zr = zone.getBoundingClientRect();
      base.style.left = `${t.clientX - zr.left - 65}px`;
      base.style.top = `${t.clientY - zr.top - 65}px`;
      base.style.bottom = 'auto';
      this.joy.ox = t.clientX;
      this.joy.oy = t.clientY;
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this.joy.id) continue;
        let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
        const l = Math.hypot(dx, dy), max = 50;
        if (l > max) { dx = (dx / l) * max; dy = (dy / l) * max; }
        setKnob(dx, dy);
        this.joy.x = dx / max;
        this.joy.y = dy / max;
      }
    }, { passive: false });
    const endJoy = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.joy.id) continue;
        this.joy.id = null; this.joy.x = 0; this.joy.y = 0;
        setKnob(0, 0);
      }
    };
    zone.addEventListener('touchend', endJoy);
    zone.addEventListener('touchcancel', endJoy);

    const jumpBtn = document.getElementById('touch-jump');
    jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.jumpPressed = true; this.touchJumpHeld = true; }, { passive: false });
    jumpBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.touchJumpHeld = false; }, { passive: false });
    const sprintBtn = document.getElementById('touch-sprint');
    sprintBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.touchSprint = !this.touchSprint;
      sprintBtn.classList.toggle('on', this.touchSprint);
    }, { passive: false });
  }

  look(dx, dy, sens) {
    this.yaw -= dx * sens;
    this.pitch = clamp(this.pitch + dy * sens, -0.15, 1.25);
  }

  releasePointer() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Writes movement intent into the player character. */
  applyInput(ch) {
    const k = this.keys;
    let f = 0, r = 0;
    if (!this.typing) {
      if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) r += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) r -= 1;
    }
    f -= this.joy.y;
    r += this.joy.x;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    ch.input.x = -sy * f + cy * r;
    ch.input.z = -cy * f - sy * r;
    ch.input.sprint = k.has('ShiftLeft') || k.has('ShiftRight') || this.touchSprint;
    if (this.jumpPressed) ch.input.jump = true;
    this.jumpPressed = false;
    ch.input.jumpHeld = (!this.typing && k.has('Space')) || this.touchJumpHeld;
  }

  /** Orbit camera around a target position. */
  updateCamera(dt, target, shake) {
    const cam = this.game.camera;
    const tx = target.x, ty = target.y + 1.7, tz = target.z;
    const s = 1 - Math.exp(-14 * dt);
    this.camTarget.x += (tx - this.camTarget.x) * s;
    this.camTarget.y += (ty - this.camTarget.y) * (1 - Math.exp(-8 * dt));
    this.camTarget.z += (tz - this.camTarget.z) * s;
    const cp = Math.cos(this.pitch);
    cam.position.set(
      this.camTarget.x + Math.sin(this.yaw) * cp * this.dist,
      this.camTarget.y + Math.sin(this.pitch) * this.dist,
      this.camTarget.z + Math.cos(this.yaw) * cp * this.dist,
    );
    const g = terrainHeight(cam.position.x, cam.position.z);
    if (g > -Infinity && cam.position.y < g + 0.6) cam.position.y = g + 0.6;
    if (shake > 0) {
      cam.position.x += (Math.random() - 0.5) * shake;
      cam.position.y += (Math.random() - 0.5) * shake;
      cam.position.z += (Math.random() - 0.5) * shake;
    }
    cam.lookAt(this.camTarget);
  }
}
