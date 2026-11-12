// 线上并发压测：验证免费托管沙箱的 WebSocket 承载能力
// 用法: node tools/online-bench.js <host> <cookie> <并发数>
const tls = require('tls');
const crypto = require('crypto');

const HOST = process.argv[2];
const COOKIE = process.argv[3] || '';
const N = Number(process.argv[4] || 100);
const BATCH = 25;

function mkFrame(payload) {
  const data = Buffer.from(payload, 'utf8');
  const len = data.length;
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
  for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i & 3];
  return Buffer.concat([header, mask, masked]);
}

function connect(idx) {
  return new Promise((resolve) => {
    const key = crypto.randomBytes(16).toString('base64');
    const t0 = Date.now();
    const c = { idx, buf: Buffer.alloc(0), upgraded: false, welcome: null, msgs: [], t0 };
    const sock = tls.connect(443, HOST, { servername: HOST, rejectUnauthorized: false }, () => {
      const lines = [
        'GET /ws?g=m&hall=sanqing HTTP/1.1', `Host: ${HOST}`, 'Upgrade: websocket', 'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`, 'Sec-WebSocket-Version: 13',
        'Origin: https://' + HOST, 'User-Agent: sq-online-bench'
      ];
      if (COOKIE) lines.push('Cookie: ' + COOKIE);
      sock.write(lines.join('\r\n') + '\r\n\r\n');
    });
    c.sock = sock;
    c.send = (o) => { try { sock.write(mkFrame(JSON.stringify(o))); } catch { } };
    sock.on('data', (d) => {
      c.buf = Buffer.concat([c.buf, d]);
      if (!c.upgraded) {
        const i = c.buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        c.upgraded = true;
        c.hs = Date.now() - c.t0;
        c.buf = c.buf.subarray(i + 4);
        resolve(c);
      }
      for (;;) {
        if (c.buf.length < 2) return;
        const b1 = c.buf[1];
        let len = b1 & 0x7f, off = 2;
        if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (c.buf.length < 10) return; len = Number(c.buf.readBigUInt64BE(2)); off = 10; }
        if (c.buf.length < off + len) return;
        const body = c.buf.subarray(off, off + len).toString('utf8');
        c.buf = c.buf.subarray(off + len);
        let m; try { m = JSON.parse(body); } catch { continue; }
        if (m.t === 'welcome') { c.welcome = m; c.id = m.you.id; }
        c.msgs.push(m);
      }
    });
    sock.on('error', () => resolve(c));
    sock.on('close', () => resolve(c));
    setTimeout(() => { if (!c.upgraded) resolve(c); }, 30000);
  });
}

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * p))];
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log(`目标 ${HOST} · 并发 ${N}`);
  const cs = [];
  const t0 = Date.now();
  for (let i = 0; i < N; i += BATCH) {
    const batch = [];
    for (let j = i; j < Math.min(i + BATCH, N); j++) batch.push(connect(j));
    cs.push(...await Promise.all(batch));
  }
  const total = Date.now() - t0;
  const ok = cs.filter(c => c.upgraded && c.welcome);
  const hs = ok.map(c => c.hs);
  console.log(`建立完成: ${ok.length}/${N}  用时 ${total}ms`);
  console.log(`握手耗时  P50 ${pct(hs, .5)}ms  P95 ${pct(hs, .95)}ms  max ${Math.max(0, ...hs)}ms`);

  const last = ok[ok.length - 1];
  if (last) {
    console.log(`最后加入者看到本殿在线: ${last.welcome.hall.online} | players(含NPC): ${last.welcome.players.length}`);
  }

  // 广播延迟：随机取一个已连接者叩拜，看最后一个连接多久收到
  await sleep(1500);
  const sender = ok[0];
  const probe = ok[ok.length - 1];
  let recvAt = 0;
  const tSend = Date.now();
  probe._watch = true;
  const iv = setInterval(() => {
    const hit = probe.msgs.some(m => Array.isArray(m.e) && m.e.some(e => e.o === 'act' && e.id === sender.id));
    if (hit && !recvAt) recvAt = Date.now();
  }, 20);
  sender.send({ t: 'act', k: 'bow' });
  await sleep(3000);
  clearInterval(iv);
  console.log('广播延迟:', recvAt ? (recvAt - tSend) + 'ms' : '未收到');

  const lat = ok.length / N;
  console.log(`承载结论: ${lat >= 0.95 ? 'PASS' : 'LIMITED'} 成功 ${Math.round(lat * 100)}%`);
  cs.forEach(c => { try { c.sock.destroy(); } catch { } });
  process.exit(0);
})();
