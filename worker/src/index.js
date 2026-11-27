/**
 * Super Winner: Cloudflare Worker (game website + online relay), in ONE file.
 *
 *   /room/<CODE>?name=…[&create=1]   WebSocket: join or create a room
 *   /health                          "Super Winner relay is running ✔"
 *   everything else                  the game itself (static files from ../../dist)
 *
 * Each room code maps to one Durable Object which only forwards messages between
 * the host's browser (which runs the game) and the other players.
 * Only Cloudflare's own `cloudflare:workers` module is imported, so this single file can also be
 * pasted into the Cloudflare dashboard editor.
 */
import { DurableObject } from 'cloudflare:workers';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
