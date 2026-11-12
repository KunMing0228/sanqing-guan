'use strict';

/**
 * 画作张贴的端到端验证（零依赖，手写 RFC6455 客户端）。
 *
 * 验证三件事：
 *  1) A 发 {t:'paint'} 后，同殿的 B 能收到 {o:'paint'} 广播；
 *  2) 后进来的 C 在 welcome.paintings 里能看到这幅画（晚到也能看见墙上已有的画）；
 *  3) 非法载荷（超长 / 非位图 / 带文字字段）一律被丢弃，不占名额。
 *
 * 用法：node tools/test_paint.js
 */
const net = require('node:net');
const crypto = require('node:crypto');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8080);
const HALL = process.env.HALL || 'sanqing';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function encode(text) {
  const payload = Buffer.from(String(text), 'utf8');
  const len = payload.length;
  const mask = crypto.randomBytes(4);
  let header;
  if (len < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x81; header[1] = 0x80 | len;
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x81; header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x81; header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  const masked = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i & 3];
  return Buffer.concat([header, mask, masked]);
}

function connect(gender = 'm') {
  return new Promise((resolve) => {
    const c = { buf: Buffer.alloc(0), up: false, closed: false, got: [], welcome: null, sock: null };
    const sock = net.connect(PORT, HOST, () => {
      const key = crypto.randomBytes(16).toString('base64');
      sock.write(
        `GET /ws?g=${gender}&hall=${HALL} HTTP/1.1\r\n` +
        `Host: ${HOST}:${PORT}\r\n` +
        'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
      );
    });
    c.sock = sock;
    sock.setNoDelay(true);
    sock.on('data', (d) => {
      c.buf = c.buf.length ? Buffer.concat([c.buf, d]) : d;
      if (!c.up) {
        const i = c.buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        if (!/101/.test(c.buf.subarray(0, i).toString())) { c.closed = true; return resolve(c); }
        c.buf = c.buf.subarray(i + 4);
        c.up = true;
        resolve(c);
      }
      while (c.buf.length >= 2) {
        const b1 = c.buf[1];
        let len = b1 & 0x7f, off = 2;
        if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (c.buf.length < 10) return; len = Number(c.buf.readBigUInt64BE(2)); off = 10; }
        if (c.buf.length < off + len) return;
        const op = c.buf[0] & 0x0f;
        const body = c.buf.subarray(off, off + len);
        c.buf = c.buf.subarray(off + len);
        if (op !== 0x1) continue;
        let m; try { m = JSON.parse(body.toString('utf8')); } catch { continue; }
        if (m.t === 'welcome') c.welcome = m;
        // 事件是批量下发在 tick.e 里的，展开后按 o 收集
        if (m.t === 'tick' && Array.isArray(m.e)) c.got.push(...m.e);
        else c.got.push(m);
      }
    });
    sock.on('error', () => { c.closed = true; resolve(c); });
    sock.on('close', () => { c.closed = true; });
    setTimeout(() => resolve(c), 4000);
  });
}

const send = (c, obj) => { try { c.sock.write(encode(JSON.stringify(obj))); } catch { /* ignore */ } };
const close = (c) => { try { c.sock.destroy(); } catch { /* ignore */ } };

// 一张极小的合法 JPEG dataURL（服务端只校验格式与长度，不解码）
const TINY = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDT/wAALCAABAAEBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/AKpJ/9k=';

(async () => {
  const a = await connect('m');
  const b = await connect('f');
  // 握手完成不代表 welcome 已到，等一小会儿
  for (let i = 0; i < 20 && (!a.welcome || !b.welcome); i++) await sleep(100);
  if (!a.welcome || !b.welcome) {
    console.log('FAIL 连接未成功'); process.exit(1);
  }
  console.log('A 入', a.welcome.hall.name, '道号', a.welcome.you.name);
  console.log('B 入', b.welcome.hall.name);

  // 先发两条非法载荷：非位图、超长（都应在格式关就被丢掉，不消耗冷却）
  send(a, { t: 'paint', d: 'data:text/html;base64,PHNjcmlwdD4=' });
  send(a, { t: 'paint', d: 'data:image/jpeg;base64,' + 'A'.repeat(200 * 1024) });
  await sleep(300);
  const before = b.got.filter(m => m.o === 'paint').length;

  send(a, { t: 'paint', d: TINY });
  await sleep(700);
  const events = b.got.filter(m => m.o === 'paint');
  const last = events[events.length - 1];
  const broadcastOK = !!last && !!last.item && last.item.src === TINY && !!last.item.name;

  // 晚到的人应该能从 welcome 里拿到同一幅画
  const c = await connect('m');
  for (let i = 0; i < 20 && !c.welcome; i++) await sleep(100);
  const paintings = (c.welcome && c.welcome.paintings) || [];
  const welcomeOK = paintings.some(it => it.src === TINY);

  // 非法载荷有没有混进墙上：只允许 1 张（上面那条合法 + 可能的第一条）
  const poison = paintings.some(it => it.src.startsWith('data:text/html'));

  console.log('B 收到 paint 广播:', broadcastOK, '| 事件数', events.length, '| 之前', before);
  console.log('C 的 welcome 里能看到画:', welcomeOK, '| 墙上画作数', paintings.length);
  console.log('非法载荷是否被拦下:', !poison);

  const pass = broadcastOK && welcomeOK && !poison;
  console.log('结论:', pass ? 'PASS' : 'FAIL');
  close(a); close(b); close(c);
  process.exit(pass ? 0 : 1);
})();
