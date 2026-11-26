import { DurableObject } from 'cloudflare:workers';
import { Relay } from './relay.js';

/**
 * Super Winner online relay.
 *
 *   GET /                    -> health check
 *   GET /room/<CODE>?name=…[&create=1]  (WebSocket upgrade) -> joins that room
 *
 * Each room code maps to one Durable Object which simply forwards messages
 * between the host's browser (which runs the game) and the other players.
 */
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
    if (url.pathname === '/') {
      return new Response('Super Winner relay is running ✔', {
        headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' },
      });
    }
    return new Response('Not found', { status: 404 });
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.relay = new Relay({
      list: () => this.ctx.getWebSockets().map((ws) => ({ ws, meta: ws.deserializeAttachment() })),
      setMeta: (ws, meta) => { try { ws.serializeAttachment(meta); } catch { /* socket closing */ } },
      getMeta: (ws) => ws.deserializeAttachment(),
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Hibernation API: the object can sleep between messages without dropping sockets.
    this.ctx.acceptWebSocket(server);
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
