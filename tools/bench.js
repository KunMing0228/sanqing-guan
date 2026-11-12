'use strict';

/**
 * 200 并发 WebSocket 压测（零依赖，手写 RFC6455 客户端）。
 * 用法：node tools/bench.js        默认 200 人 / 15 秒
 *      CLIENTS=400 DURATION=30000 node tools/bench.js
 *
 * 验收口径：连接成功率 100%、无掉线、tick 应用心跳 P95 < 200ms、
 * /healthz 在线数等于客户端数、服务端 RSS < 150MB。
 */
const net = require('node:net');
const crypto = require('node:crypto');
const http = require('node:http');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8080);
const CLIENTS = Number(process.env.CLIENTS || 200);
const DURATION = Number(process.env.DURATION || 15000);
const BATCH = 20;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function encodeFrame(text) {
  const payload = Buffer.from(String(text), 'utf8');
  const len = payload.length;
  const mask = crypto.randomBytes(4);
  let header;
  if (len < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x81; header[1] = 0x80 | len;
  } else {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x81; header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  }
  const masked = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i & 3];
  return Buffer.concat([header, mask, masked]);
}

function send(c, obj) {
  if (!c.sock || c.sock.destroyed) return false;
  try { c.sock.write(encodeFrame(JSON.stringify(obj))); return true; } catch { return false; }
}

function onFrame(c, fin, op, payload) {
  if (op === 0x8) { c.closed = true; return; }
  if (op === 0x9) {                        // 服务端 ping，回一个 pong（客户端必须 mask）
    if (!c.sock || c.sock.destroyed) return;
    const body = Buffer.from(payload);
    const mask = crypto.randomBytes(4);
    const h = Buffer.allocUnsafe(2);
    h[0] = 0x8A; h[1] = 0x80 | body.length;
    const masked = Buffer.allocUnsafe(body.length);
    for (let i = 0; i < body.length; i++) masked[i] = body[i] ^ mask[i & 3];
    try { c.sock.write(Buffer.concat([h, mask, masked])); } catch { /* ignore */ }
    return;
  }
  if (op !== 0x1 || !fin) return;
  let m;
  try { m = JSON.parse(payload.toString('utf8')); } catch { return; }
  if (m.t === 'welcome') { c.welcomeAt = Date.now(); c.name = m.you && m.you.name; c.hall = m.hall && m.hall.id; }
  else if (m.t === 'tick') c.ticks += 1;
  else if (m.t === 'pong' && m.ts) c.lat.push(Math.max(0, Date.now() - m.ts));
  else if (m.t === 'snapshot') c.snaps += 1;
  else if (m.t === 'full') c.full = m.reason;
}

function drain(c, chunk) {
  c.buf = c.buf.length ? Buffer.concat([c.buf, chunk]) : chunk;
  while (!c.closed && c.buf.length >= 2) {
    const b0 = c.buf[0], b1 = c.buf[1];
    const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f, off = 2;
    if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (c.buf.length < 10) return; len = Number(c.buf.readBigUInt64BE(2)); off = 10; }
    const maskLen = masked ? 4 : 0;
    if (c.buf.length < off + maskLen + len) return;
    let body = Buffer.from(c.buf.subarray(off + maskLen, off + maskLen + len));
    if (masked) {
      const mask = c.buf.subarray(off, off + 4);
      for (let i = 0; i < body.length; i++) body[i] ^= mask[i & 3];
    }
    c.buf = c.buf.subarray(off + maskLen + len);
    if (!c.up) continue;
    onFrame(c, fin, op, body);
  }
}

function makeClient(id) {
  return new Promise((resolve) => {
    const c = {
      id, buf: Buffer.alloc(0), up: false, closed: false, full: null,
      ticks: 0, snaps: 0, lat: [], welcomeAt: 0, name: '', hall: '', sock: null, error: null
    };
    const sock = net.connect(PORT, HOST, () => {
      const key = crypto.randomBytes(16).toString('base64');
      const g = id % 2 === 0 ? 'm' : 'f';    // 男女形象各半，覆盖两种外观路径
      sock.write(
        `GET /ws?g=${g} HTTP/1.1\r\n` +
        `Host: ${HOST}:${PORT}\r\n` +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Key: ${key}\r\n` +
        'Sec-WebSocket-Version: 13\r\n\r\n'
      );
    });
    c.sock = sock;
    sock.setNoDelay(true);
    sock.on('data', (d) => {
      if (!c.up) {
        c.buf = c.buf.length ? Buffer.concat([c.buf, d]) : d;
        const i = c.buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        const head = c.buf.subarray(0, i).toString();
        if (!/101 Switching Protocols/.test(head)) {
          c.error = '握手失败: ' + head.split('\r\n')[0];
          drainHandshakeFail(c);
          return;
        }
        const rest = c.buf.subarray(i + 4);
        c.buf = Buffer.alloc(0);
        c.up = true;
        if (rest.length) drain(c, rest);
        resolve(c);
      } else drain(c, d);
    });
    sock.on('error', (e) => { c.error = e.message; c.closed = true; resolve(c); });
    sock.on('close', () => { c.closed = true; if (!c.up) resolve(c); });
  });
  function drainHandshakeFail(c) { c.closed = true; try { c.sock.destroy(); } catch { /* ignore */ } resolve(c); }
}

function getJSON(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: HOST, port: PORT, path, timeout: 5000 }, (r) => {
      let b = '';
      r.on('data', d => b += d);
      r.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}

const POSES = ['stand', 'walk', 'sit', 'bow', 'palms', 'write', 'chant'];
function randomMsg(id) {
  const r = Math.random();
  if (r < .30) return { t: 'pose', p: POSES[Math.floor(Math.random() * POSES.length)] };
  if (r < .55) return { t: 'move', x: (Math.random() - .5) * 14, z: Math.random() * 15, r: 0 };
  if (r < .75) return { t: 'act', k: 'bead' };
  if (r < .88) return { t: 'act', k: 'bow' };
  if (r < .95) return { t: 'act', k: 'jump' };
  return { t: 'greet', e: Math.floor(Math.random() * 8), to: null, g: Math.random() < .3 ? 1 : 0 };
}

(async () => {
  console.log(`目标: ${CLIENTS} 个 WebSocket 客户端 @ ${HOST}:${PORT}，持续 ${DURATION / 1000}s`);
  const t0 = Date.now();
  const clients = [];
  for (let i = 0; i < CLIENTS; i += BATCH) {
    const batch = [];
    for (let j = i; j < Math.min(i + BATCH, CLIENTS); j++) batch.push(makeClient(j));
    clients.push(...await Promise.all(batch));
    await sleep(35);
  }
  const ok = clients.filter(c => c.up && !c.error && c.welcomeAt);
  const failed = clients.length - ok.length;
  const connectMs = Date.now() - t0;
  console.log(`握手完成: ${ok.length}/${CLIENTS} 成功，失败 ${failed}，耗时 ${connectMs}ms`);
  if (failed) {
    const sample = clients.filter(c => c.error).slice(0, 3).map(c => `#${c.id}: ${c.error}`);
    console.log('失败样例:', sample.join(' | ') || '(无 welcome)');
  }

  const actTimer = setInterval(() => {
    for (const c of ok) if (Math.random() < .38) send(c, randomMsg(c.id));
  }, 200);
  const pingTimer = setInterval(() => { for (const c of ok) send(c, { t: 'ping' }); }, 1000);

  await sleep(DURATION);
  clearInterval(actTimer);
  clearInterval(pingTimer);

  let health = null;
  try { health = await getJSON('/healthz'); } catch (e) { console.log('healthz 读取失败:', e.message); }

  const lats = ok.flatMap(c => c.lat).sort((a, b) => a - b);
  const p50 = lats.length ? lats[Math.floor(lats.length * .5)] : 0;
  const p95 = lats.length ? lats[Math.floor(lats.length * .95)] : 0;
  const p99 = lats.length ? lats[Math.floor(lats.length * .99)] : 0;
  const ticks = ok.reduce((s, c) => s + c.ticks, 0);
  const snaps = ok.reduce((s, c) => s + c.snaps, 0);
  const dropped = ok.filter(c => c.closed).length;
  const rss = health && health.mem ? health.mem.rss / 1048576 : 0;
  const halls = health ? health.halls.map(h => `${h.name}:${h.online}`).join('  ') : 'n/a';

  console.log('\n================ 压测结果 ================');
  console.log(`在线(服务端口径) : ${health ? health.online : 'n/a'} / ${CLIENTS}`);
  console.log(`各殿分布         : ${halls}`);
  console.log(`峰值在线         : ${health ? health.peak : 'n/a'}`);
  console.log(`掉线数           : ${dropped}`);
  console.log(`收到 tick / 快照 : ${ticks} / ${snaps}`);
  console.log(`RTT  P50/P95/P99 : ${p50}ms / ${p95}ms / ${p99}ms  (样本 ${lats.length})`);
  console.log(`服务端 RSS       : ${rss.toFixed(1)} MB`);
  console.log(`累计动作         : ${JSON.stringify(health && health.totals)}`);
  const pass = failed === 0 && dropped === 0 && p95 < 200 &&
    health && health.online === CLIENTS && rss < 150 && ticks > 0;
  console.log(`\n结论: ${pass ? 'PASS —— 达到 200 人同时在线验收口径' : 'FAIL —— 见上方异常项'}`);
  console.log('==========================================\n');

  for (const c of clients) { try { c.sock && c.sock.destroy(); } catch { /* ignore */ } }
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error('压测异常:', e); process.exit(1); });
