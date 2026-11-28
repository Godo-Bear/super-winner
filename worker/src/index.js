/**
 * Super Winner: Cloudflare Worker (game website + online relay), in ONE file.
 *
 *   /room/<CODE>?name=…[&create=1]   WebSocket: join or create a room
 *   /health                          "Super Winner relay is running ✔"
 *   /api/register /api/login /api/me /api/save /api/logout   optional accounts (save progress across devices)
 *   everything else                  the game itself (static files from ../../dist)
 *
 * Each room code maps to one Durable Object which only forwards messages between
 * the host's browser (which runs the game) and the other players.
 * Only Cloudflare's own `cloudflare:workers` module is imported, so this single file can also be
 * pasted into the Cloudflare dashboard editor.
 */
import { DurableObject } from 'cloudflare:workers';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (!env.ACCOUNTS) return json({ error: 'Accounts are not set up on this server.' }, 501);
      // all accounts live in one Durable Object (SQLite storage)
      const res = await env.ACCOUNTS.get(env.ACCOUNTS.idFromName('accounts')).fetch(request);
      const out = new Response(res.body, res);
      for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
      return out;
    }
    const match = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,8})$/);
    if (match) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket upgrade', { status: 426 });
      }
      const code = match[1].toUpperCase();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(request);
    }
    if (url.pathname === '/health' || (url.pathname === '/' && !env.ASSETS)) {
      return new Response('Super Winner relay is running ✔', {
        headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' },
      });
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};

/** One room. Uses the WebSocket Hibernation API so idle rooms cost nothing. */
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.state = ctx;
    this.relay = new Relay({
      list: () => this.state.getWebSockets().map((ws) => ({ ws, meta: ws.deserializeAttachment() })),
      setMeta: (ws, meta) => { try { ws.serializeAttachment(meta); } catch { /* socket closing */ } },
      getMeta: (ws) => ws.deserializeAttachment(),
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    this.relay.open(server, {
      name: url.searchParams.get('name'),
      create: url.searchParams.get('create') === '1',
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    this.relay.message(ws, message);
  }

  async webSocketClose(ws, code) {
    this.relay.close(ws);
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch { /* already closed */ }
  }

  async webSocketError(ws) {
    this.relay.close(ws);
  }
}

// ---------------------------------------------------------------------------------------
// Room relay logic (also used by scripts/dev-relay.mjs for local testing).
//
// The first socket to create a room is the host; everyone else is a client.
// Host messages are "<target>|<json>" and go to one client or "all"; client messages go to
// the host wrapped as {"t":"from","from":<id>,"d":<json>}.
// ---------------------------------------------------------------------------------------
const MAX_PLAYERS = 12;
const MAX_HOST_MSG = 512 * 1024;
const MAX_CLIENT_MSG = 4 * 1024;

function safeSend(ws, data) {
  try { ws.send(typeof data === 'string' ? data : JSON.stringify(data)); } catch { /* socket already gone */ }
}

function cleanName(name) {
  const n = String(name || '').replace(/[^\p{L}\p{N} _.\-!?]/gu, '').trim().slice(0, 16);
  return n || 'Player';
}

export class Relay {
  constructor(room) {
    this.room = room;
  }

  peers(except = null) {
    return this.room.list().filter((p) => p.ws !== except && p.meta && !p.meta.left);
  }

  host() { return this.peers().find((p) => p.meta.host) || null; }

  reject(ws, code, message) {
    safeSend(ws, { t: 'error', code, message });
    try { ws.close(1000, code); } catch { /* ignore */ }
  }

  open(ws, { name, create }) {
    const others = this.peers(ws);
    const host = others.find((p) => p.meta.host);
    if (create && host) return this.reject(ws, 'exists', 'That room code is already taken. Try again!');
    if (!create && !host) return this.reject(ws, 'notfound', 'Room not found. Check the code (and that the host is still there).');
    if (others.length >= MAX_PLAYERS) return this.reject(ws, 'full', `Room is full (${MAX_PLAYERS} players max).`);
    const id = others.reduce((m, p) => Math.max(m, p.meta.id), 0) + 1;
    const meta = { id, name: cleanName(name), host: !!create };
    this.room.setMeta(ws, meta);
    safeSend(ws, { t: 'welcome', id, host: create ? id : host.meta.id, isHost: !!create, name: meta.name });
    if (!create) safeSend(host.ws, { t: 'join', id, name: meta.name });
  }

  message(ws, raw) {
    const meta = this.room.getMeta(ws);
    if (!meta || typeof raw !== 'string') return;
    if (meta.host) {
      if (raw.length > MAX_HOST_MSG) return;
      const bar = raw.indexOf('|');
      if (bar < 1) return;
      const target = raw.slice(0, bar);
      const data = raw.slice(bar + 1);
      for (const p of this.peers(ws)) {
        if (target === 'all' || String(p.meta.id) === target) safeSend(p.ws, data);
      }
    } else {
      if (raw.length > MAX_CLIENT_MSG) return;
      try { JSON.parse(raw); } catch { return; }
      const host = this.host();
      if (host) safeSend(host.ws, `{"t":"from","from":${meta.id},"d":${raw}}`);
    }
  }

  close(ws) {
    const meta = this.room.getMeta(ws);
    if (!meta || meta.left) return;
    meta.left = true;
    this.room.setMeta(ws, meta);
    if (meta.host) {
      for (const p of this.peers(ws)) {
        safeSend(p.ws, { t: 'closed' });
        try { p.ws.close(1000, 'host left'); } catch { /* ignore */ }
      }
    } else {
      const host = this.host();
      if (host) safeSend(host.ws, { t: 'leave', id: meta.id });
    }
  }
}

// ---------------------------------------------------------------------------------------
// Optional accounts: username + password, saves progress (coins, shop, levels...) to the cloud.
// Passwords are hashed with PBKDF2 (never stored as plain text); sessions are random tokens.
// ---------------------------------------------------------------------------------------
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const MAX_SAVE = 64 * 1024;
const SESSION_DAYS = 60;
// a small block-list for usernames (the game's word filter also runs in the browser)
const BAD_NAME = /(fuck|shit|cunt|bitch|nigg|fag|dick|pussy|porn|sex|rape|nazi|hitler|slut|whore|penis|vagina|cock|asshole)/i;

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return hex(bits);
}
async function sha256(text) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(text))); }

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export class Accounts extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, display TEXT, salt TEXT, hash TEXT, save TEXT, created INTEGER, updated INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, name TEXT, expires INTEGER)`);
    this.fails = new Map(); // name -> { n, until }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const route = url.pathname.replace('/api/', '');
    try {
      if (request.method === 'POST' && route === 'register') return await this.register(await request.json());
      if (request.method === 'POST' && route === 'login') return await this.login(await request.json());
      const user = await this.auth(request);
      if (!user) return json({ error: 'Please log in again.' }, 401);
      if (request.method === 'GET' && route === 'me') return json({ username: user.display, save: user.save ? JSON.parse(user.save) : null });
      if (request.method === 'PUT' && route === 'save') {
        const text = await request.text();
        if (text.length > MAX_SAVE) return json({ error: 'Save is too big.' }, 413);
        JSON.parse(text); // must be valid JSON
        this.sql.exec('UPDATE users SET save = ?, updated = ? WHERE name = ?', text, Date.now(), user.name);
        return json({ ok: true });
      }
      if (request.method === 'POST' && route === 'logout') {
        this.sql.exec('DELETE FROM sessions WHERE token = ?', await sha256(this.bearer(request)));
        return json({ ok: true });
      }
      return json({ error: 'Not found' }, 404);
    } catch {
      return json({ error: 'Something went wrong. Try again.' }, 400);
    }
  }

  bearer(request) { return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim(); }

  async auth(request) {
    const token = this.bearer(request);
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const row = this.sql.exec('SELECT u.name, u.display, u.save, s.expires FROM sessions s JOIN users u ON u.name = s.name WHERE s.token = ?', await sha256(token)).toArray()[0];
    if (!row || row.expires < Date.now()) return null;
    return row;
  }

  checkCreds(body) {
    const display = String(body?.username || '').trim();
    const password = String(body?.password || '');
    if (!/^[A-Za-z0-9_]{3,16}$/.test(display)) return { error: 'Usernames are 3–16 letters, numbers or _' };
    if (BAD_NAME.test(display)) return { error: "That username isn't allowed." };
    if (password.length < 6 || password.length > 64) return { error: 'Passwords need 6–64 characters.' };
    return { display, name: display.toLowerCase(), password };
  }

  async newSession(name) {
    const token = randomHex(32);
    this.sql.exec('INSERT INTO sessions (token, name, expires) VALUES (?, ?, ?)', await sha256(token), name, Date.now() + SESSION_DAYS * 864e5);
    this.sql.exec('DELETE FROM sessions WHERE expires < ?', Date.now());
    return token;
  }

  async register(body) {
    const c = this.checkCreds(body);
    if (c.error) return json({ error: c.error }, 400);
    if (this.sql.exec('SELECT 1 FROM users WHERE name = ?', c.name).toArray().length) return json({ error: 'That username is taken.' }, 409);
    const salt = randomHex(16);
    const save = body.save && JSON.stringify(body.save).length <= MAX_SAVE ? JSON.stringify(body.save) : null;
    this.sql.exec('INSERT INTO users (name, display, salt, hash, save, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?)', c.name, c.display, salt, await hashPassword(c.password, salt), save, Date.now(), Date.now());
    return json({ token: await this.newSession(c.name), username: c.display, save: save ? JSON.parse(save) : null });
  }

  async login(body) {
    const c = this.checkCreds(body);
    if (c.error) return json({ error: 'Wrong username or password.' }, 401);
    const f = this.fails.get(c.name);
    if (f && f.n >= 8 && f.until > Date.now()) return json({ error: 'Too many tries. Wait a few minutes.' }, 429);
    const row = this.sql.exec('SELECT name, display, salt, hash, save FROM users WHERE name = ?', c.name).toArray()[0];
    const ok = row && timingSafeEqual(await hashPassword(c.password, row.salt), row.hash);
    if (!ok) {
      const n = (f && f.until > Date.now() ? f.n : 0) + 1;
      this.fails.set(c.name, { n, until: Date.now() + 10 * 60e3 });
      return json({ error: 'Wrong username or password.' }, 401);
    }
    this.fails.delete(c.name);
    return json({ token: await this.newSession(row.name), username: row.display, save: row.save ? JSON.parse(row.save) : null });
  }
}
