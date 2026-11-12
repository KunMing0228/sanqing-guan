'use strict';

/**
 * 《三清观》单进程服务：静态站点 + WebSocket 多人同步。
 * 零 npm 依赖，直接 `node server/index.js` 即可运行。
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./config');
const { attachWebSocket } = require('./ws');
const { Hub } = require('./room');
const geo = require('./geoip');

const ROOT = path.resolve(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function baseHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // 允许 inline 的 importmap；禁止任何外部脚本/样式/字体，保证离线可用
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'"
  };
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...baseHeaders()
  });
  res.end(body);
}

const hub = new Hub();

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', ...baseHeaders() });
    return res.end();
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { return sendJSON(res, 400, { error: 'bad path' }); }
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  // 路径穿越防护：解析后的绝对路径必须仍在 public 目录内
  const full = path.resolve(ROOT, '.' + pathname);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
    return sendJSON(res, 403, { error: 'forbidden' });
  }

  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) return sendJSON(res, 404, { error: 'not found' });
    const ext = path.extname(full).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const size = st.size;
    const isVendor = pathname.startsWith('/vendor/') || pathname.startsWith('/models/');
    const headers = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': isVendor ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...baseHeaders()
    };

    // 音频<audio loop>会发 Range 请求，必须支持 206，否则部分浏览器无法循环播放
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      if (m) {
        const start = Number(m[1]);
        const end = m[2] ? Number(m[2]) : size - 1;
        const last = Math.min(end, size - 1);
        if (start <= last && start < size) {
          res.writeHead(206, {
            ...headers,
            'Content-Range': `bytes ${start}-${last}/${size}`,
            'Content-Length': last - start + 1
          });
          if (req.method === 'HEAD') return res.end();
          return fs.createReadStream(full, { start, end: last }).pipe(res);
        }
      }
      res.writeHead(416, { 'Content-Range': `bytes */${size}`, ...baseHeaders() });
      return res.end();
    }

    res.writeHead(200, { ...headers, 'Content-Length': size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(full).pipe(res);
  });
}

function metricsText() {
  const s = hub.stats();
  const lines = [
    '# HELP sanqing_online Current websocket players',
    '# TYPE sanqing_online gauge',
    `sanqing_online ${s.online}`,
    '# HELP sanqing_peak Peak concurrent players since start',
    '# TYPE sanqing_peak gauge',
    `sanqing_peak ${s.peak}`,
    '# HELP sanqing_uptime_seconds Process uptime',
    '# TYPE sanqing_uptime_seconds counter',
    `sanqing_uptime_seconds ${s.uptime}`
  ];
  for (const h of s.halls) lines.push(`sanqing_hall_online{hall="${h.id}"} ${h.online}`);
  for (const [k, v] of Object.entries(s.totals)) lines.push(`sanqing_total_${k} ${v}`);
  return lines.join('\n') + '\n';
}

const server = http.createServer((req, res) => {
  let pathname = '/';
  try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { /* keep */ }

  if (pathname === '/healthz') {
    const mem = process.memoryUsage();
    return sendJSON(res, 200, {
      ok: true, geo: geo.status(), ...hub.stats(),
      mem: { rss: mem.rss, heapUsed: mem.heapUsed, external: mem.external }
    });
  }
  if (pathname === '/metrics') {
    const body = metricsText();
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
    return res.end(body);
  }
  if (pathname === '/api/halls') return sendJSON(res, 200, { halls: hub.stats().halls, version: '1.0.0' });
  return serveStatic(req, res);
});

server.on('clientError', (err, socket) => {
  // 只结束连接，不打错误堆栈（避免把客户端输入写进日志）
  try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch { /* ignore */ }
});

attachWebSocket(server, (conn, url) => {
  const info = geo.resolve(conn.req);
  hub.attach(conn, {
    gender: url.searchParams.get('g'),
    hall: url.searchParams.get('hall'),
    geo: info.geo
  });
}, {
  path: '/ws',
  maxMessageBytes: C.MAX_MESSAGE_BYTES,
  maxFrameBytes: C.MAX_FRAME_BYTES
});

hub.start();

server.listen(C.PORT, C.HOST, () => {
  const g = geo.status();
  console.log('==============================================');
  console.log('  三清观 v1.0  已启动');
  console.log(`  本机访问: http://localhost:${C.PORT}`);
  console.log(`  局域网:   http://<本机IP>:${C.PORT}`);
  console.log(`  殿数/席位: ${C.HALLS.length} 殿 × ${C.SEATS_PER_HALL} 席 = ${C.HALLS.length * C.SEATS_PER_HALL} 席`);
  console.log(`  离线 IP 库: ${g.loaded ? `已加载 ${(g.dbBytes / 1048576).toFixed(1)} MB` : '未加载（方位功能降级）'}`);
  console.log(`  可信反代: ${C.TRUST_PROXY ? '开启' : '关闭（只信直连 IP）'}`);
  console.log('  零社交：协议层无 chat 类型，禁止搭子聊天');
  console.log('==============================================');
});

function shutdown(signal) {
  console.log(`\n[${signal}] 正在关闭…`);
  hub.stop();
  try { server.close(); } catch { /* ignore */ }
  setTimeout(() => process.exit(0), 300).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (e) => {
  // 不打印请求内容，只记录错误类型，防止敏感信息进日志
  console.error('[fatal]', e && e.name, e && e.message);
});
