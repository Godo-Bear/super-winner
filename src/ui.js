import { isWordAllowed } from './filter.js';
import { describe, suggestExtra, interpret, EXTRA_WORD_COUNT } from './lexicon.js';
import { powerFor } from './powers.js';
import { DEFAULT_RELAY } from './net/connection.js';
import { ITEMS, SLOTS, isOwned, buy, DEFAULT_EQUIPPED } from './shop.js';
import { writeSave } from './save.js';
import { MODES } from './modes.js';
import { ITEMS as GAME_ITEMS } from './items.js';
import { ensureQuests, questInfo, xpForLevel } from './progress.js';
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
    $('spec-other').addEventListener('click', () => game.net.switchRoom());
    this.refreshMute();
    const fs = () => {
      const d = document;
      try {
        if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
        else {
          const r = (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen)?.call(d.documentElement);
          if (r && r.catch) r.catch(() => {});
        }
      } catch { /* not supported (e.g. iPhone Safari) */ }
    };
    $('btn-fullscreen').addEventListener('click', fs);
    $('touch-fullscreen').addEventListener('click', fs);
    if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) {
      $('btn-fullscreen').classList.add('hidden');
      $('touch-fullscreen').classList.add('hidden');
    }
    this.bindWriter();
    this.bindOnline();
    this.bindShop();
    this.bindPlayExtras();
  }

  // ---------------- Modes, quests, pause, emotes ----------------
  bindPlayExtras() {
    const g = this.game;
    const pickMode = (e) => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      g.setGameMode(b.dataset.mode);
      g.audio.unlock(); g.audio.pop();
      this.renderModes();
    };
    $('mode-picker').addEventListener('click', pickMode);
    $('room-mode').addEventListener('click', pickMode);
    $('btn-quests').addEventListener('click', () => { this.renderQuests(); $('quests').classList.remove('hidden'); });
    $('btn-pause').addEventListener('click', () => g.setPaused(true));
    $('pause-resume').addEventListener('click', () => g.setPaused(false));
    $('pause-quit').addEventListener('click', () => { g.setPaused(false); g.toLobby(); });
    $('pause-mute').addEventListener('click', () => { g.audio.setMuted(!g.audio.muted); this.refreshMute(); });
    $('btn-write').addEventListener('click', () => g.writer.freeWrite());
    $('btn-emote').addEventListener('click', () => $('emote-menu').classList.toggle('hidden'));
    $('emote-menu').addEventListener('click', (e) => {
      const b = e.target.closest('[data-emote]');
      if (!b) return;
      g.player.startEmote(Number(b.dataset.emote));
      $('emote-menu').classList.add('hidden');
    });
    $('hotbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-slot]');
      if (!b) return;
      const i = Number(b.dataset.slot);
      if (i === (g.player.held || 0)) g.useItem(i); else g.selectItem(i);
    });
    $('touch-use').addEventListener('touchstart', (e) => { e.preventDefault(); g.useItem(); }, { passive: false });
    $('touch-use').addEventListener('click', () => g.useItem());
    $('writer-close').addEventListener('click', () => { this.closeWriter(); g.writer.freeWriting = false; });
  }

  /** Item hotbar at the bottom of the screen. */
  renderHotbar() {
    const p = this.game.player;
    const items = (p && p.alive && p.items) || [];
    const key = items.map((i) => `${i.id}:${i.uses}`).join(',') + `|${p ? p.held : 0}`;
    if (key === this.hotbarKey) return;
    this.hotbarKey = key;
    $('hotbar').classList.toggle('hidden', !items.length);
    $('touch-use').classList.toggle('hidden', !items.some((i) => !GAME_ITEMS[i.id]?.passive));
    if (!items.length) return;
    $('hotbar').innerHTML = items.map((s, i) => {
      const it = GAME_ITEMS[s.id];
      const uses = Number.isFinite(s.uses) ? `<small>${s.uses}</small>` : it.passive ? '<small>auto</small>' : '';
      return `<button class="slot ${i === (p.held || 0) ? 'on' : ''}" data-slot="${i}" title="${esc(it.name)}">${it.icon}${uses}</button>`;
    }).join('') + '<span class="hb-hint">E use · Q switch</span>';
  }

  renderModes() {
    const g = this.game;
    const online = g.net.active;
    const html = Object.entries(MODES)
      .filter(([, m]) => !online || m.online)
      .map(([id, m]) => `<button class="mode ${g.gameMode === id ? 'on' : ''}" data-mode="${id}" title="${esc(m.desc)}"><b>${m.icon} ${esc(m.name)}</b><small>${esc(m.desc)}</small></button>`).join('');
    $('mode-picker').innerHTML = html;
    if (online && !g.net.isHost) {
      const m = MODES[g.gameMode] || MODES.classic;
      $('room-mode').innerHTML = `<div class="mode on static"><b>${m.icon} ${esc(m.name)}</b><small>${esc(m.desc)}</small></div>`;
    } else $('room-mode').innerHTML = html;
  }

  levelHtml() {
    const s = this.game.save;
    const need = xpForLevel(s.level || 1);
    const pct = Math.min(100, ((s.xp || 0) / need) * 100);
    return `<b>⭐ Level ${s.level || 1}</b><div class="xp-bar"><div style="width:${pct}%"></div></div><small>${s.xp || 0} / ${need} XP</small>`;
  }

  questsHtml() {
    const qs = ensureQuests(this.game.save);
    return qs.map((q) => {
      const info = questInfo(q);
      const pct = Math.min(100, (q.progress / q.goal) * 100);
      return `<div class="quest ${q.done ? 'done' : ''}"><span class="qi">${q.done ? '✅' : info.icon}</span><div class="qt"><b>${esc(info.text)}</b>
        <div class="xp-bar"><div style="width:${pct}%"></div></div><small>${q.progress}/${q.goal} · reward 🪙 ${q.reward}</small></div></div>`;
    }).join('');
  }

  renderQuests() {
    $('quest-level').innerHTML = this.levelHtml();
    $('quest-list').innerHTML = this.questsHtml();
  }

  showPause(on) {
    $('pause').classList.toggle('hidden', !on);
    if (on) { $('pause-quests').innerHTML = this.questsHtml(); $('pause-mute').textContent = this.game.audio.muted ? '🔇' : '🔊'; }
    this.refreshTouch();
  }

  // ---------------- Coin shop ----------------
  bindShop() {
    this.shopSlot = 'hat';
    const open = () => {
      this.game.audio.unlock();
      $('shop').classList.remove('hidden');
      $('lobby').classList.add('hidden');
      $('room').classList.add('hidden');
      this.game.shopPreview = true;
      this.renderShop();
    };
    $('btn-shop').addEventListener('click', open);
    $('room-shop').addEventListener('click', open);
    $('shop-close').addEventListener('click', () => this.closeShop());
    $('shop-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-slot]');
      if (!b) return;
      this.shopSlot = b.dataset.slot;
      this.renderShop();
    });
    $('shop-grid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-item]');
      if (!b) return;
      const g = this.game, save = g.save;
      const item = ITEMS.find((i) => i.id === b.dataset.item);
      if (!item) return;
      if (!isOwned(save, item)) {
        const err = buy(save, item);
        if (err) { $('shop-msg').textContent = err; g.audio.hurt(); return; }
        $('shop-msg').textContent = `Bought ${item.name}!`;
        g.audio.coin();
      } else {
        $('shop-msg').textContent = '';
        g.audio.pop();
      }
      save.equipped = { ...DEFAULT_EQUIPPED, ...save.equipped, [item.slot]: item.id };
      writeSave(save);
      g.lookChanged();
      this.renderShop();
    });
  }

  closeShop() {
    $('shop').classList.add('hidden');
    this.game.shopPreview = false;
    if (this.game.state === 'lobby') {
      this.game.player.mesh.visible = false;
      this.showLobby();
    }
  }

  renderShop() {
    const save = this.game.save;
    $('shop-coins').textContent = `🪙 ${save.coins}`;
    $('shop-tabs').innerHTML = Object.entries(SLOTS).map(([k, v]) =>
      `<button class="btn btn-small ${k === this.shopSlot ? 'active' : ''}" data-slot="${k}">${v.icon} ${v.name}</button>`).join('');
    const eq = { ...DEFAULT_EQUIPPED, ...save.equipped };
    $('shop-grid').innerHTML = ITEMS.filter((i) => i.slot === this.shopSlot).map((i) => {
      const owned = isOwned(save, i);
      const on = eq[i.slot] === i.id;
      const sw = i.slot === 'hat' ? `<span class="sw-icon">${i.icon}</span>` : `<span class="sw" style="background:#${i.color.toString(16).padStart(6, '0')}"></span>`;
      const label = on ? '✔ Wearing' : owned ? 'Wear' : `🪙 ${i.price}`;
      const cls = on ? 'on' : owned ? 'owned' : save.coins >= i.price ? 'buy' : 'locked';
      return `<button class="shop-item ${cls}" data-item="${i.id}">${sw}<b>${esc(i.name)}</b><span class="price">${label}</span></button>`;
    }).join('');
  }

  // ---------------- Online menus ----------------
  bindOnline() {
    const g = this.game;
    const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
    const read = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
    $('on-name').value = read('sw_name');
    $('on-server').value = read('sw_relay') || DEFAULT_RELAY;
    if (DEFAULT_RELAY && !read('sw_relay')) $('on-server-wrap').removeAttribute('open');
    else $('on-server-wrap').setAttribute('open', '');
    const params = new URLSearchParams(location.search);
    if (params.get('room')) {
      $('on-code').value = params.get('room').toUpperCase().slice(0, 8);
      $('online').classList.remove('hidden');
    }
    $('btn-online').addEventListener('click', () => { g.audio.unlock(); this.onlineStatus(''); $('online').classList.remove('hidden'); });
    $('on-code').addEventListener('input', () => { $('on-code').value = $('on-code').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    const details = () => {
      const name = $('on-name').value.trim().slice(0, 16);
      const server = $('on-server').value.trim();
      if (!name) { this.onlineStatus('Pick a name first!', true); return null; }
      if (!server) { this.onlineStatus('Enter the relay server address (your Cloudflare Worker URL).', true); $('on-server-wrap').setAttribute('open', ''); return null; }
      store('sw_name', name);
      store('sw_relay', server);
      return { name, server };
    };
    const busy = (b) => { $('on-create').disabled = b; $('on-join').disabled = b; };
    $('on-create').addEventListener('click', async () => {
      const d = details();
      if (!d) return;
      busy(true);
      this.onlineStatus('Creating room...');
      try { g.audio.unlock(); await g.net.create(d.server, d.name); $('online').classList.add('hidden'); } catch (e) { this.onlineStatus(e.message, true); }
      busy(false);
    });
    $('on-join').addEventListener('click', async () => {
      const d = details();
      if (!d) return;
      const code = $('on-code').value.trim();
      if (code.length < 4) { this.onlineStatus('Enter the room code your friend gave you.', true); return; }
      busy(true);
      this.onlineStatus('Joining...');
      try { g.audio.unlock(); await g.net.join(d.server, code, d.name); $('online').classList.add('hidden'); } catch (e) { this.onlineStatus(e.message, true); }
      busy(false);
    });
    $('room-start').addEventListener('click', () => g.startRound());
    $('room-leave').addEventListener('click', () => g.net.leave());
    $('room-copy').addEventListener('click', async () => {
      const url = `${location.origin}${location.pathname}?room=${g.net.code}`;
      try { await navigator.clipboard.writeText(url); this.toast('🔗 Invite link copied!'); $('room-copy').textContent = '✔ Copied'; }
      catch { $('room-link').textContent = url; }
    });
  }

  openOnline(text) {
    this.showLobby();
    $('online').classList.remove('hidden');
    this.onlineStatus(text || '');
    $('on-code').value = '';
    $('on-code').focus();
  }

  onlineStatus(text, error = false) {
    $('on-status').textContent = text;
    $('on-status').classList.toggle('red', error);
  }

  /** Room screen shown instead of the lobby while connected. */
  showRoom() {
    const net = this.game.net;
    if (!net.active || this.game.state !== 'lobby') return;
    $('lobby').classList.add('hidden');
    $('room').classList.remove('hidden');
    $('room-code').textContent = net.code;
    $('room-copy').textContent = '🔗 Copy invite link';
    $('room-players').innerHTML = net.players.map((p) =>
      `<li>${p.host ? '👑' : '🙂'} ${esc(p.name)}${p.id === net.conn.id ? ' <small>(you)</small>' : ''}</li>`).join('');
    const bots = Math.max(0, 12 - net.players.length);
    $('room-bots').textContent = bots ? `+ ${bots} bot${bots > 1 ? 's' : ''} will fill the island` : 'Full island!';
    $('room-start').classList.toggle('hidden', !net.isHost);
    this.renderModes();
    $('room-wait').classList.toggle('hidden', net.isHost);
    const playing = net.isClient && net.playing;
    $('room-wait').textContent = playing ? 'A round is in progress... you will join the next one.' : 'Waiting for the host to start the round...';
  }

  notice(text) {
    $('room').classList.add('hidden');
    this.showLobby();
    $('online').classList.remove('hidden');
    this.onlineStatus(text, true);
  }

  /** Show the on-screen joystick/buttons while playing in touch mode. */
  refreshTouch() {
    const g = this.game;
    const playing = (g.state === 'playing' || g.state === 'ending') && !$('hud').classList.contains('hidden');
    const show = g.controller.isTouch && playing && g.player.alive;
    $('touch').classList.toggle('hidden', !show);
    document.body.classList.toggle('touch-mode', g.controller.isTouch);
  }

  refreshMute() { $('btn-mute').textContent = this.game.audio.muted ? '🔇' : '🔊'; }

  // ---------------- Lobby ----------------
  showLobby() {
    if (this.game.net && this.game.net.active) {
      $('hud').classList.add('hidden');
      $('results').classList.add('hidden');
      $('touch').classList.add('hidden');
      this.closeWriter();
      this.countdown('');
      this.showRoom();
      return;
    }
    $('room').classList.add('hidden');
    const s = this.game.save;
    $('lobby-coins').textContent = s.coins;
    const total = this.game.dictionaryCount ?? 0;
    $('lobby-stats').textContent = `🏆 ${s.wins} wins · 🎮 ${s.games} games · 📖 ${s.discovered.length}/${total} words discovered`;
    $('lobby').classList.remove('hidden');
    $('lobby-level').innerHTML = this.levelHtml();
    this.renderModes();
    $('hud').classList.add('hidden');
    $('results').classList.add('hidden');
    $('touch').classList.add('hidden');
    this.closeWriter();
    this.countdown('');
  }

  showHUD() {
    if (!$('shop').classList.contains('hidden')) this.closeShop();
    $('lobby').classList.add('hidden');
    $('room').classList.add('hidden');
    $('online').classList.add('hidden');
    $('results').classList.add('hidden');
    $('index').classList.add('hidden');
    $('help').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('spectate').classList.add('hidden');
    $('killfeed').innerHTML = '';
    $('toasts').innerHTML = '';
    this.refreshTouch();
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
    html += `<div class="index-cat">🧠 Other words you've brought to life (${myst.length}) <small style="opacity:.6">· ${EXTRA_WORD_COUNT}+ more words to find</small></div>`;
    html += myst.length
      ? `<div class="index-grid">${myst.slice(-80).map((w) => {
        const d = interpret(w);
        const icon = d ? (d.entry ? d.entry.icon : d.icon) : '🫧';
        return `<div class="index-item"><div class="ic">${icon}</div><div class="nm">${esc(w)}</div><div class="ds">${d ? 'Word brain creation' : 'A one-of-a-kind Mystery Blob'}</div></div>`;
      }).join('')}</div>`
      : '<p>Try animals, food, objects, people, vehicles... or any word at all! Add a describing word like "giant" or "fire".</p>';
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
    $('btn-write').classList.toggle('hidden', !g.modeCfg.sandbox || g.mode === 'client');
    this.renderHotbar();
    $('btn-pause').classList.toggle('hidden', !g.canPause);
    const data = g.hudData();
    $('writer-status').textContent = data.writer;
    const ch = $('writer-chance');
    if (data.chance === null || data.chance === undefined) ch.textContent = '';
    else ch.textContent = `🎲 ${innerWidth < 700 ? 'Writer chance' : 'Your chance to be the next Writer'}: ${Math.round(data.chance * 100)}%`;

    const hz = data.hazards;
    $('hazard-count').textContent = `${hz.length}/${g.hazards.max}`;
    const key = hz.map((h) => `${h.uid}${h.recharging ? 'r' : ''}`).join(',');
    if (key !== this.lastHazardKey) {
      this.lastHazardKey = key;
      $('hazard-list').innerHTML = hz.slice().reverse().map((h) =>
        `<div class="hz-chip ${h.recharging ? 'recharging' : ''}" data-uid="${h.uid}">${h.icon} ${esc(h.label)}<span class="by">${esc(h.owner)}</span><div class="bar"></div></div>`).join('');
    }
    for (const h of hz) {
      const el = document.querySelector(`.hz-chip[data-uid="${h.uid}"] .bar`);
      if (el) el.style.width = `${h.frac * 100}%`;
    }
  }

  /** Screen-edge arrow toward the Writer when they're off-screen. */
  updateWriterPointer(w) {
    const el = $('writer-pointer');
    if (!w) { el.classList.add('hidden'); return; }
    const cam = this.game.camera;
    const v = (this._v ||= new w.pos.constructor());
    v.set(w.pos.x, w.pos.y + 2.4, w.pos.z).project(cam);
    let x = v.x, y = v.y;
    const behind = v.z > 1;
    if (behind) { x = -x; y = -y; }
    if (!behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.86) { el.classList.add('hidden'); return; }
    // push the point onto the screen border
    const k = 1 / Math.max(Math.abs(x) / 0.86, Math.abs(y) / 0.78, 1e-3);
    x *= k; y *= k;
    const px = (x * 0.5 + 0.5) * innerWidth, py = (-y * 0.5 + 0.5) * innerHeight;
    el.classList.remove('hidden');
    el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%)`;
    $('writer-pointer-arrow').style.transform = `rotate(${Math.atan2(-y, x)}rad)`;
    if (el.dataset.name !== w.name) { el.dataset.name = w.name; $('writer-pointer-name').textContent = `✍️ ${w.name}`; }
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
    const online = this.game.net.active;
    $('spec-lobby').textContent = online ? '🏠 Room' : '🏠 Lobby';
    $('spec-other').classList.toggle('hidden', !online || this.game.net.isHost);
    $('spec-note').textContent = online && !this.game.net.isHost ? "Wait here for the next round, or hop to a different room." : '';
    $('spectate').classList.remove('hidden');
    $('spectate-name').textContent = name;
  }

  showResults(title, lines) {
    $('btn-results-lobby').textContent = this.game.net.active ? 'Back to room' : 'Back to lobby';
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
      if (v && this.onWriterSubmit) this.onWriterSubmit(v, this.writeForSelf);
    });
    // ⚔️ Attack everyone / 🛡️ For me
    $('write-target').addEventListener('click', (e) => {
      const b = e.target.closest('[data-target]');
      if (!b) return;
      this.setWriteTarget(b.dataset.target === 'self');
      input.focus();
    });
    $('writer-suggest').addEventListener('click', (e) => {
      const el = e.target.closest('.sug');
      if (!el || !el.dataset.fill) return;
      input.value = el.dataset.fill;
      input.focus();
      if (this.onWriterSubmit) this.onWriterSubmit(el.dataset.fill, this.writeForSelf);
    });
  }

  refreshSuggestions() {
    const v = $('writer-input').value.trim();
    this.sugs = this.game.words.suggest(v, 6);
    if (this.sugs.length < 6) {
      const have = new Set(this.sugs.map((x) => x.fill));
      for (const x of suggestExtra(v.split(' ').pop(), 6)) {
        if (this.sugs.length >= 6) break;
        const fill = v.includes(' ') ? `${v.split(' ')[0]} ${x.fill}` : x.fill;
        if (!have.has(fill)) this.sugs.push({ fill, icon: x.icon });
      }
    }
    this.renderSuggestions();
  }

  renderSuggestions() {
    const v = $('writer-input').value.trim();
    let html = this.sugs.map((s, i) => `<span class="sug ${i === this.sugIndex ? 'active' : ''}" data-fill="${esc(s.fill)}">${s.icon} ${esc(s.fill)}</span>`).join('');
    if (v && !isWordAllowed(v)) html += '<span class="sug blocked">🚫 Not allowed</span>';
    else if (v && v.split(' ').length > 2) html += '<span class="sug blocked">Use 1 or 2 words</span>';
    else if (v && this.writeForSelf) {
      const m = interpret(v);
      if (m?.item) html += `<span class="sug mystery">${m.icon} You get a ${esc(m.label)}!</span>`;
      else if (m?.hazard === 'mapchange') html += '<span class="sug mystery">🗺️ Changes the map for everyone</span>';
      else {
        const p = powerFor(m, v);
        const what = p.type === 'ride' ? `You drive a ${p.label}!` : p.type === 'morph' ? `You become a ${p.label}!` : 'Shield + speed + health for you!';
        html += `<span class="sug mystery">🛡️ ${p.icon} ${esc(what)}</span>`;
      }
    } else if (v && !this.game.words.resolveWord(v)) {
      const d = describe(v);
      html += d ? `<span class="sug mystery">${d.icon} "${esc(v)}" works!</span>` : `<span class="sug mystery">🫧 "${esc(v)}" = Mystery Blob!</span>`;
    }
    $('writer-suggest').innerHTML = html;
  }

  setWriteTarget(self) {
    this.writeForSelf = self;
    document.querySelectorAll('#write-target [data-target]').forEach((b) => b.classList.toggle('on', (b.dataset.target === 'self') === self));
    this.renderSuggestions();
  }

  openWriter(onSubmit, { noTimer = false } = {}) {
    this.onWriterSubmit = onSubmit;
    this.writeForSelf = false;
    document.querySelectorAll('#write-target [data-target]').forEach((b) => b.classList.toggle('on', b.dataset.target === 'attack'));
    $('writer').classList.remove('hidden');
    $('writer-heading').textContent = noTimer ? '🧪 WRITE ANY WORD' : '✍️ YOU ARE THE WRITER!';
    $('writer-time').classList.toggle('hidden', noTimer);
    $('writer-close').classList.toggle('hidden', !noTimer);
    document.querySelector('.writer-timer').classList.toggle('hidden', noTimer);
    const input = $('writer-input');
    input.value = '';
    this.sugIndex = 0;
    this.refreshSuggestions();
    this.game.controller.releasePointer();
    this.game.controller.keys.clear();
    setTimeout(() => input.focus(), 30);
  }

  writerError(msg) {
    const box = document.getElementById('writer-suggest');
    box.innerHTML = `<span class="sug blocked">${esc(msg)}</span>`;
    const input = document.getElementById('writer-input');
    input.value = '';
    input.focus();
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
