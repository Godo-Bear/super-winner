/**
 * All sound effects are synthesised with the Web Audio API (no audio files).
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.loops = new Set();
    try { this.muted = localStorage.getItem('sw_muted') === '1'; } catch { /* ignore */ }
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.comp = this.ctx.createDynamicsCompressor();
      this.master.connect(this.comp);
      this.comp.connect(this.ctx.destination);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('sw_muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  get ok() { return !!this.ctx && this.ctx.state === 'running'; }

  // ---------- primitives ----------
  tone({ freq = 440, to = null, type = 'sine', dur = 0.2, vol = 0.3, attack = 0.005, delay = 0, vibrato = 0 }) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    if (vibrato) {
      const lfo = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      lfo.frequency.value = vibrato;
      lg.gain.value = freq * 0.06;
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.3, vol = 0.4, filter = 'lowpass', freq = 1000, to = null, q = 1, delay = 0, attack = 0.005 }) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  // ---------- effects ----------
  jump() { this.tone({ freq: 300, to: 620, type: 'square', dur: 0.12, vol: 0.08 }); }
  land() { this.noise({ dur: 0.08, vol: 0.1, freq: 400 }); }
  hurt() { this.tone({ freq: 380, to: 140, type: 'sawtooth', dur: 0.18, vol: 0.15 }); }
  coin() {
    this.tone({ freq: 988, type: 'square', dur: 0.08, vol: 0.08 });
    this.tone({ freq: 1319, type: 'square', dur: 0.22, vol: 0.08, delay: 0.07 });
  }
  pop() { this.tone({ freq: 500, to: 1200, type: 'sine', dur: 0.1, vol: 0.2 }); }
  boing() { this.tone({ freq: 150, to: 600, type: 'sine', dur: 0.35, vol: 0.3, vibrato: 18 }); }
  click() { this.tone({ freq: 1800 + Math.random() * 400, type: 'square', dur: 0.025, vol: 0.03 }); }
  explosion(size = 1) {
    this.noise({ dur: 0.9 * size, vol: 0.6, freq: 1800, to: 60, attack: 0.002 });
    this.tone({ freq: 90, to: 30, type: 'sine', dur: 0.7 * size, vol: 0.5 });
  }
  bigBoom() {
    this.noise({ dur: 3, vol: 0.9, freq: 1200, to: 30, attack: 0.002 });
    this.tone({ freq: 60, to: 20, type: 'sine', dur: 3, vol: 0.8 });
  }
  zap() {
    this.noise({ dur: 0.5, vol: 0.5, filter: 'highpass', freq: 3000, to: 500, attack: 0.001 });
    this.tone({ freq: 1200, to: 80, type: 'sawtooth', dur: 0.4, vol: 0.25 });
    this.noise({ dur: 1.6, vol: 0.5, freq: 300, to: 40, delay: 0.1 });
  }
  whoosh() { this.noise({ dur: 0.6, vol: 0.25, filter: 'bandpass', freq: 400, to: 2000, q: 2, attack: 0.2 }); }
  splash() { this.noise({ dur: 0.7, vol: 0.4, filter: 'bandpass', freq: 1500, to: 300, q: 0.8 }); }
  roar(pitch = 1) {
    this.tone({ freq: 110 * pitch, to: 60 * pitch, type: 'sawtooth', dur: 1.1, vol: 0.3, vibrato: 9, attack: 0.1 });
    this.noise({ dur: 1.0, vol: 0.25, filter: 'bandpass', freq: 500 * pitch, to: 200, q: 3, attack: 0.1 });
  }
  shot() { this.noise({ dur: 0.06, vol: 0.18, filter: 'highpass', freq: 1500, attack: 0.001 }); }
  laser() { this.tone({ freq: 1400, to: 200, type: 'square', dur: 0.15, vol: 0.07 }); }
  rumble(dur = 2) { this.noise({ dur, vol: 0.5, freq: 120, to: 60, attack: 0.4 }); }
  buzz(dur = 1.5) { this.tone({ freq: 210, type: 'sawtooth', dur, vol: 0.06, vibrato: 30, attack: 0.2 }); }
  siren(dur = 3) {
    if (!this.ok) return;
    for (let i = 0; i < dur / 1; i++) {
      this.tone({ freq: 500, to: 900, type: 'sawtooth', dur: 0.5, vol: 0.12, delay: i, attack: 0.05 });
      this.tone({ freq: 900, to: 500, type: 'sawtooth', dur: 0.5, vol: 0.12, delay: i + 0.5, attack: 0.05 });
    }
  }
  warn() { this.tone({ freq: 880, type: 'square', dur: 0.12, vol: 0.06 }); }
  announce() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.2, vol: 0.15, delay: i * 0.07 }));
  }
  typing() { this.click(); }
  writerTurn() {
    [784, 988, 1175].forEach((f, i) => this.tone({ freq: f, type: 'square', dur: 0.12, vol: 0.08, delay: i * 0.09 }));
  }
  death() {
    this.tone({ freq: 600, to: 80, type: 'square', dur: 0.5, vol: 0.12 });
    this.noise({ dur: 0.3, vol: 0.2, freq: 900 });
  }
  win() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone({ freq: f, type: 'square', dur: 0.25, vol: 0.1, delay: i * 0.13 }));
  }
  lose() {
    [392, 330, 262, 196].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.35, vol: 0.15, delay: i * 0.22 }));
  }
  powerup() {
    [440, 554, 659, 880].forEach((f, i) => this.tone({ freq: f, type: 'square', dur: 0.1, vol: 0.08, delay: i * 0.05 }));
  }
  slip() { this.tone({ freq: 900, to: 200, type: 'sine', dur: 0.4, vol: 0.2 }); }
  jaws() {
    for (let i = 0; i < 6; i++) this.tone({ freq: i % 2 ? 87 : 82, type: 'sawtooth', dur: 0.25, vol: 0.2, delay: i * 0.3 });
  }
  thunder() { this.noise({ dur: 2.2, vol: 0.45, freq: 260, to: 50, attack: 0.05 }); }
  bubble() { this.tone({ freq: 200 + Math.random() * 300, to: 800, type: 'sine', dur: 0.12, vol: 0.12 }); }
  eat() { this.noise({ dur: 0.12, vol: 0.2, filter: 'bandpass', freq: 1200, q: 2 }); this.tone({ freq: 600, to: 900, dur: 0.1, vol: 0.1, delay: 0.1 }); }
}
