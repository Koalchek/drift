// Мультиплеер-сервер для «Дрифт 3D: Черкассы» (WebSocket-релей на Render)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 16;
const INDEX = path.join(__dirname, '..', 'index.html');

// HTTP: отдаёт игру (если index.html лежит рядом) и /health для Render
const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); return res.end('ok'); }
  fs.readFile(INDEX, (err, data) => {
    if (err) { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Drift 3D server is running'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 2048 });
const players = new Map(); // id -> { ws, name, last, lastFx }
let nextId = 1;

const num = (v, lim = 5000) => typeof v === 'number' && isFinite(v) && Math.abs(v) < lim;
const cleanName = (n) => String(n || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 12) || 'Гравец';
function sendAll(obj, exceptId) {
  const msg = JSON.stringify(obj);
  for (const [id, p] of players) if (id !== exceptId && p.ws.readyState === 1) p.ws.send(msg);
}

wss.on('connection', (ws) => {
  if (players.size >= MAX_PLAYERS) { ws.close(1013, 'full'); return; }
  const id = nextId++;
  const me = { ws, name: 'Гравец', last: null, lastMsg: 0, lastFx: 0 };
  players.set(id, me);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // новому игроку — его id и текущее состояние остальных
  const others = [];
  for (const [pid, p] of players) if (pid !== id && p.last) others.push({ t: 'p', id: pid, n: p.name, ...p.last });
  ws.send(JSON.stringify({ t: 'init', id, players: others }));

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const now = Date.now();
    if (m.t === 'join' || m.t === 'name') { me.name = cleanName(m.name); return; }
    if (m.t === 's') {
      if (now - me.lastMsg < 30) return; me.lastMsg = now;
      if (![m.x, m.y, m.z].every((v) => num(v)) || !num(m.a, 100)) return;
      const v = m.v === 1 || m.v === 2 ? m.v : 0;
      const c = /^#[0-9a-f]{6}$/i.test(m.c) ? m.c : '#ff5d73';
      me.last = { x: m.x, y: m.y, z: m.z, a: m.a, v, b: m.b ? 1 : 0, c, d: m.d ? 1 : 0 };
      sendAll({ t: 'p', id, n: me.name, ...me.last }, id);
    } else if (m.t === 'fx') {
      if (now - me.lastFx < 150) return; me.lastFx = now;
      if (![m.x, m.y, m.z].every((v) => num(v))) return;
      sendAll({ t: 'fx', x: m.x, y: m.y, z: m.z }, id);
    }
  });

  ws.on('close', () => { players.delete(id); sendAll({ t: 'leave', id }); });
  ws.on('error', () => {});
});

// пинг каждые 25 с: убирает «мёртвые» соединения и не даёт Render закрыть сокет
setInterval(() => {
  for (const [, p] of players) {
    if (!p.ws.isAlive) { p.ws.terminate(); continue; }
    p.ws.isAlive = false; p.ws.ping();
  }
}, 25000);

server.listen(PORT, () => console.log('Drift 3D server on port ' + PORT));
