/**
 * Thin WebSocket wrapper around the relay (Cloudflare Worker or `npm run relay`).
 *
 * Protocol (all JSON):
 *   server → anyone : {t:'welcome', id, host, isHost} | {t:'error', code, message} | {t:'closed'}
 *   server → host   : {t:'join', id, name} | {t:'leave', id} | {t:'from', from, d}
 *   host   → server : "<target>|<json>"  where target is "all" or a client id
 *   client → server : "<json>" (forwarded to the host as {t:'from'})
 */
export const DEFAULT_RELAY = import.meta.env.VITE_RELAY_URL || '';

export function normalizeRelayUrl(url) {
  let u = String(url || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) u = u.replace(/^http/i, 'ws');
  else if (!/^wss?:\/\//i.test(u)) u = (location.protocol === 'https:' || !/^(localhost|127\.)/.test(u) ? 'wss://' : 'ws://') + u;
  return u;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomRoomCode(n = 5) {
  let s = '';
  for (let i = 0; i < n; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export class Connection {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.id = null;
    this.isHost = false;
  }

  on(type, fn) { this.handlers[type] = fn; }

  /** Resolves with the welcome message, rejects with an Error whose message is user-readable. */
  connect(relayUrl, code, name, create) {
    const base = normalizeRelayUrl(relayUrl);
    if (!base) return Promise.reject(new Error('Enter your relay server address first.'));
    const url = `${base}/room/${encodeURIComponent(code)}?name=${encodeURIComponent(name)}${create ? '&create=1' : ''}`;
    return new Promise((resolve, reject) => {
      let settled = false;
      let ws;
      try { ws = new WebSocket(url); } catch { reject(new Error('Bad server address.')); return; }
      this.ws = ws;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('Could not reach the server (timed out).')); try { ws.close(); } catch { /* ignore */ } }
      }, 8000);
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (!settled) {
          if (msg.t === 'welcome') {
            settled = true;
            clearTimeout(timer);
            this.id = msg.id;
            this.isHost = msg.isHost;
            this.hostId = msg.host;
            resolve(msg);
          } else if (msg.t === 'error') {
            settled = true;
            clearTimeout(timer);
            reject(new Error(msg.message || 'Could not join.'));
          }
          return;
        }
        this.handlers[msg.t]?.(msg);
        this.handlers.any?.(msg);
      };
      ws.onerror = () => {
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error('Could not connect to the server.')); }
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (!settled) { settled = true; reject(new Error('Connection closed.')); return; }
        if (this.ws === ws) this.handlers.disconnect?.();
      };
    });
  }

  get open() { return this.ws && this.ws.readyState === WebSocket.OPEN; }

  /** Client → host. */
  send(obj) { if (this.open) this.ws.send(JSON.stringify(obj)); }

  /** Host → one client id, or 'all'. */
  sendTo(target, obj) { if (this.open) this.ws.send(`${target}|${JSON.stringify(obj)}`); }

  close() {
    const ws = this.ws;
    this.ws = null;
    if (ws) try { ws.close(); } catch { /* ignore */ }
  }
}
