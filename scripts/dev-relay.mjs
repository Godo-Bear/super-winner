// Local stand-in for the Cloudflare Worker, for testing online play on your own machine/LAN.
//   npm run relay            -> ws://localhost:8787
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { Relay } from '../worker/src/relay.js';

const PORT = Number(process.env.PORT || 8787);
const rooms = new Map(); // code -> { sockets: Map<ws, meta>, relay }

function getRoom(code) {
  let r = rooms.get(code);
  if (!r) {
    const sockets = new Map();
    r = {
      sockets,
      relay: new Relay({
        list: () => [...sockets.entries()].map(([ws, meta]) => ({ ws, meta })),
        setMeta: (ws, meta) => sockets.set(ws, meta),
        getMeta: (ws) => sockets.get(ws) || null,
      }),
    };
    rooms.set(code, r);
  }
  return r;
}

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end('Super Winner relay is running ✔ (local)');
});
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const m = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,8})$/);
  if (!m) { ws.close(1008, 'bad path'); return; }
  const code = m[1].toUpperCase();
  const room = getRoom(code);
  room.sockets.set(ws, null);
  room.relay.open(ws, { name: url.searchParams.get('name'), create: url.searchParams.get('create') === '1' });
  ws.on('message', (data, isBinary) => { if (!isBinary) room.relay.message(ws, data.toString()); });
  ws.on('close', () => {
    room.relay.close(ws);
    room.sockets.delete(ws);
    if (room.sockets.size === 0) rooms.delete(code);
  });
});

server.listen(PORT, () => console.log(`Super Winner relay listening on ws://localhost:${PORT}`));
