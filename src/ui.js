const $ = (id) => document.getElementById(id);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * All DOM overlays: lobby, HUD, writer box, announcements, kill feed, results, index.
 */
export class UI {
  constructor(game) {
    this.game = game;
    this.hudTimer = 0;
    this.lastHazardKey = '';
    this.sugIndex = 0;
    this.sugs = [];
    $('btn-play').addEventListener('click', () => game.startRound());
    $('btn-index').addEventListener('click', () => { this.renderIndex(); $('index').classList.remove('hidden'); });
    $('btn-help').addEventListener('click', () => $('help').classList.remove('hidden'));
    $('btn-mute').addEventListener('click', () => {
      game.audio.unlock();
      game.audio.setMuted(!game.audio.muted);
      this.refreshMute();
    });
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => $(b.dataset.close).classList.add('hidden')));
    $('btn-results-lobby').addEventListener('click', () => game.toLobby());
    $('spec-prev').addEventListener('click', () => game.cycleSpectate(-1));
    $('spec-next').addEventListener('click', () => game.cycleSpectate(1));
    $('spec-lobby').addEventListener('click', () => game.toLobby());
    this.refreshMute();
    this.bindWriter();
  }

  refreshMute() { $('btn-mute').textContent = this.game.audio.muted ? '🔇' : '🔊'; }

  // ---------------- Lobby ----------------
  showLobby() {
    const s = this.game.save;
    $('lobby-coins').textContent = s.coins;
    const total = this.game.dictionaryCount ?? 0;
    $('lobby-stats').textContent = `🏆 ${s.wins} wins · 🎮 ${s.games} games · 📖 ${s.discovered.length}/${total} words discovered`;
    $('lobby').classList.remove('hidden');
    $('hud').classList.add('hidden');
    $('results').classList.add('hidden');
    $('touch').classList.add('hidden');
    this.closeWriter();
    this.countdown('');
  }

  showHUD() {
    $('lobby').classList.add('hidden');
    $('results').classList.add('hidden');
    $('index').classList.add('hidden');
    $('help').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('spectate').classList.add('hidden');
    $('killfeed').innerHTML = '';
    $('toasts').innerHTML = '';
    if (this.game.controller.isTouch) $('touch').classList.remove('hidden');
    this.lastHazardKey = '';
  }

  renderIndex() {
    const { DICTIONARY, CATEGORIES } = this.game.words;
    const found = new Set(this.game.save.discovered);
    $('index-count').textContent = `${found.size}/${DICTIONARY.length} discovered`;
    let html = '';
    for (const [cat, info] of Object.entries(CATEGORIES)) {
      const entries = DICTIONARY.filter((e) => e.category === cat);
      if (!entries.length) continue;
      html += `<div class="index-cat">${info.icon} ${esc(info.name)}</div><div class="index-grid">`;
      for (const e of entries) {
        if (found.has(e.id)) {
          html += `<div class="index-item"><div class="ic">${e.icon}</div><div class="nm">${esc(e.name)}</div><div class="ds">${esc(e.desc)}</div></div>`;
        } else {
          html += `<div class="index-item locked"><div class="ic">❔</div><div class="nm">???</div><div class="ds">${esc(info.name)} · not yet discovered</div></div>`;
        }
      }
      html += '</div>';
    }
    const myst = this.game.save.mysteries;
    html += `<div class="index-cat">🫧 Mystery Blobs (${myst.length})</div>`;
    html += myst.length
      ? `<div class="index-grid">${myst.slice(-60).map((w) => `<div class="index-item"><div class="ic">🫧</div><div class="nm">${esc(w)}</div><div class="ds">A one-of-a-kind blob</div></div>`).join('')}</div>`
      : '<p>Type a word that is not in the dictionary to create a Mystery Blob!</p>';
    $('index-body').innerHTML = html;
  }

  // ---------------- HUD ----------------
  updateHUD(dt) {
    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.1;
    const g = this.game, p = g.player;
    const hp = Math.max(0, Math.ceil(p.hp));
    $('hp-fill').style.width = `${p.alive ? hp : 0}%`;
    $('shield-fill').style.width = `${Math.min(100, p.shield)}%`;
    $('hp-text').textContent = p.alive ? `${hp}` : '💀';
    $('hud-coins').textContent = `🪙 ${g.save.coins}`;
    const fx = [];
    if (p.shield > 0) fx.push('🛡️');
    if (p.jetpack > 0) fx.push(`🚀${Math.ceil(p.jetpack)}`);
    if (p.speedBoost > 0) fx.push(`⚡${Math.ceil(p.speedBoost)}`);
    $('hud-effects').textContent = fx.join(' ');
    const alive = g.characters.filter((c) => c.alive).length;
    $('alive').textContent = `👥 ${alive} alive`;
    $('writer-status').textContent = g.writer ? g.writer.statusText() : '';

    const hz = g.hazards.list;
    $('hazard-count').textContent = `${hz.length}/${g.hazards.max}`;
    const key = hz.map((h) => h.uid).join(',');
    if (key !== this.lastHazardKey) {
      this.lastHazardKey = key;
      $('hazard-list').innerHTML = hz.slice().reverse().map((h) =>
        `<div class="hz-chip" data-uid="${h.uid}">${h.icon} ${esc(h.label)}<span class="by">${esc(h.owner ? h.owner.name : '')}</span><div class="bar"></div></div>`).join('');
    }
    for (const h of hz) {
      const el = document.querySelector(`.hz-chip[data-uid="${h.uid}"] .bar`);
      if (el) el.style.width = `${Math.max(0, 1 - h.t / h.duration) * 100}%`;
    }
  }

  announce(by, word, hint = '', color = '#ffd23f') {
    const a = $('announce');
    $('announce-by').textContent = by;
    $('announce-word').textContent = word;
    $('announce-word').style.color = color;
    $('announce-hint').textContent = hint;
    a.classList.remove('show');
    void a.offsetWidth;
    a.classList.add('show');
  }

  killFeed(html) {
    const kf = $('killfeed');
    const d = document.createElement('div');
    d.className = 'kf';
    d.innerHTML = html;
    kf.appendChild(d);
    while (kf.children.length > 6) kf.removeChild(kf.firstChild);
    setTimeout(() => d.remove(), 7000);
  }

  toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  flash(color = '#ffffff', strength = 1, dur = 400) {
    const f = $('flash');
    f.style.transition = 'none';
    f.style.background = color;
    f.style.opacity = String(strength);
    void f.offsetWidth;
    f.style.transition = `opacity ${dur}ms ease-out`;
    f.style.opacity = '0';
  }

  hurt(amount) {
    const v = $('vignette');
    v.style.opacity = String(Math.min(1, 0.3 + amount / 40));
    clearTimeout(this.hurtT);
    this.hurtT = setTimeout(() => (v.style.opacity = '0'), 160);
  }

  countdown(text, sub = '') {
    $('countdown').innerHTML = text ? `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}` : '';
  }

  showSpectate(name) {
    $('spectate').classList.remove('hidden');
    $('spectate-name').textContent = name;
  }

  showResults(title, lines) {
    $('results-title').textContent = title;
    $('results-body').innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
    $('results').classList.remove('hidden');
    $('touch').classList.add('hidden');
  }

  // ---------------- Writer box ----------------
  bindWriter() {
    const input = $('writer-input');
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^a-zA-Z ]/g, '').toLowerCase();
      this.sugIndex = 0;
      this.refreshSuggestions();
      this.game.audio.typing();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.key === 'ArrowRight') {
        if (this.sugs.length && (e.key === 'Tab' || input.selectionStart === input.value.length)) {
          e.preventDefault();
          input.value = this.sugs[this.sugIndex].fill;
          this.refreshSuggestions();
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.sugs.length) { this.sugIndex = (this.sugIndex + 1) % this.sugs.length; this.renderSuggestions(); }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.sugs.length) { this.sugIndex = (this.sugIndex - 1 + this.sugs.length) % this.sugs.length; this.renderSuggestions(); }
      }
      e.stopPropagation();
    });
    $('writer-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (v && this.onWriterSubmit) this.onWriterSubmit(v);
    });
    $('writer-suggest').addEventListener('click', (e) => {
      const el = e.target.closest('.sug');
      if (!el || !el.dataset.fill) return;
      input.value = el.dataset.fill;
      input.focus();
      if (this.onWriterSubmit) this.onWriterSubmit(el.dataset.fill);
    });
  }

  refreshSuggestions() {
    const v = $('writer-input').value.trim();
    this.sugs = this.game.words.suggest(v, 6);
    this.renderSuggestions();
  }

  renderSuggestions() {
    const v = $('writer-input').value.trim();
    let html = this.sugs.map((s, i) => `<span class="sug ${i === this.sugIndex ? 'active' : ''}" data-fill="${esc(s.fill)}">${s.icon} ${esc(s.fill)}</span>`).join('');
    if (v && !this.game.words.resolveWord(v)) html += `<span class="sug mystery">🫧 "${esc(v)}" = Mystery Blob!</span>`;
    $('writer-suggest').innerHTML = html;
  }

  openWriter(onSubmit) {
    this.onWriterSubmit = onSubmit;
    $('writer').classList.remove('hidden');
    const input = $('writer-input');
    input.value = '';
    this.sugIndex = 0;
    this.refreshSuggestions();
    this.game.controller.releasePointer();
    this.game.controller.keys.clear();
    setTimeout(() => input.focus(), 30);
  }

  setWriterTime(t, frac) {
    $('writer-time').textContent = Math.ceil(Math.max(0, t));
    $('writer-timer-fill').style.width = `${Math.max(0, frac) * 100}%`;
  }

  closeWriter() {
    this.onWriterSubmit = null;
    $('writer').classList.add('hidden');
    const input = $('writer-input');
    if (document.activeElement === input) input.blur();
  }
}

export { esc };
