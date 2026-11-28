import { DEFAULT_RELAY } from './net/connection.js';
import { onSave, writeSave, mergeSave } from './save.js';

/**
 * Optional accounts. Without logging in, progress is saved in this browser only.
 * With an account (username + password, nothing else) it's saved on the game's server too,
 * so it follows you to any device. The server is the same Cloudflare Worker that runs online play.
 */
const read = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const store = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* ignore */ } };

export function apiBase() {
  const server = read('sw_relay') || DEFAULT_RELAY;
  if (!server) return '';
  let u = server.trim().replace(/\/+$/, '');
  if (/^wss?:\/\//i.test(u)) u = u.replace(/^ws/i, 'http');
  else if (!/^https?:\/\//i.test(u)) u = (/^(localhost|127\.)/.test(u) ? 'http://' : 'https://') + u;
  return u;
}

export class Account {
  constructor(game) {
    this.game = game;
    this.token = read('sw_token');
    this.username = read('sw_user');
    this.syncTimer = null;
    this.status = '';
    onSave(() => this.queueSync());
  }

  get loggedIn() { return !!this.token; }

  async call(path, { method = 'GET', body, auth = true } = {}) {
    const base = apiBase();
    if (!base) throw new Error('No server set. Deploy the game (npm run deploy) or set the server under Play with friends.');
    let res;
    try {
      res = await fetch(`${base}/api/${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(auth && this.token ? { authorization: `Bearer ${this.token}` } : {}) },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      });
    } catch {
      throw new Error('Could not reach the server.');
    }
    let data = {};
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) {
      if (res.status === 401 && auth) this.forget();
      throw new Error(data.error || `Server error (${res.status})`);
    }
    return data;
  }

  /** Create an account. Your current progress becomes the account's starting save. */
  async register(username, password) {
    const data = await this.call('register', { method: 'POST', body: { username, password, save: this.game.save }, auth: false });
    this.remember(data);
    this.adopt(data.save);
    return data;
  }

  async login(username, password) {
    const data = await this.call('login', { method: 'POST', body: { username, password }, auth: false });
    this.remember(data);
    this.adopt(data.save);
    return data;
  }

  async logout() {
    try { await this.call('logout', { method: 'POST' }); } catch { /* already gone */ }
    this.forget();
  }

  /** On startup: refresh from the server if we have a session. */
  async refresh() {
    if (!this.loggedIn) return;
    try {
      const data = await this.call('me');
      this.username = data.username;
      store('sw_user', data.username);
      this.adopt(data.save);
      this.status = 'synced';
    } catch (e) {
      this.status = this.loggedIn ? 'offline' : '';
    }
    this.game.ui.renderAccount();
  }

  remember(data) {
    this.token = data.token;
    this.username = data.username;
    store('sw_token', data.token);
    store('sw_user', data.username);
    this.status = 'synced';
  }

  forget() {
    this.token = '';
    this.username = '';
    store('sw_token', '');
    store('sw_user', '');
    this.status = '';
    this.game.ui.renderAccount();
  }

  /** Use the account's save (keeps whichever has more progress if the account is brand new). */
  adopt(serverSave) {
    const g = this.game;
    if (!serverSave || (serverSave.games || 0) === 0 && (g.save.games || 0) > 0) {
      this.syncNow();
      return;
    }
    mergeSave(g.save, serverSave);
    writeSave(g.save, { silent: true });
    g.lookChanged?.();
    g.ui.showLobby();
  }

  queueSync() {
    if (!this.loggedIn) return;
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.syncNow(), 2500);
  }

  async syncNow() {
    if (!this.loggedIn) return;
    try {
      await this.call('save', { method: 'PUT', body: JSON.stringify(this.game.save) });
      this.status = 'synced';
    } catch {
      this.status = this.loggedIn ? 'offline' : '';
    }
    this.game.ui.renderAccount?.();
  }
}
