'use strict';

/**
 * 冒烟检查：① 所有 JS 文件语法（复制成 .mjs 后 node --check）
 * ② 关键静态资源与 HTTP 端点是否可访问 ③ 目录结构完整性。
 * 不依赖任何 npm 包。
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8080);
let failures = 0;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

console.log('--- 目录结构 ---');
const required = [
  'server/index.js', 'server/ws.js', 'server/room.js', 'server/geoip.js', 'server/config.js', 'server/names.js',
  'public/index.html', 'public/css/style.css', 'public/vendor/three.module.min.js',
  'public/js/main.js', 'public/js/scene.js', 'public/js/avatar.js', 'public/js/fx.js',
  'public/js/audio.js', 'public/js/net.js', 'public/js/ui.js', 'public/js/talisman.js', 'public/js/scripture.js',
  'data/ip2region_v4.xdb', 'PROMPT.md', 'ASSET_PROMPTS.md', 'package.json'
];
for (const f of required) {
  const p = path.join(ROOT, f);
  const ok = fs.existsSync(p);
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'MISS'} ${f}${ok ? ` (${fs.statSync(p).size} B)` : ''}`);
}

console.log('\n--- JS 语法检查 ---');
const jsFiles = [
  ...walk(path.join(ROOT, 'server')).filter(f => f.endsWith('.js')),
  ...walk(path.join(ROOT, 'public', 'js')).filter(f => f.endsWith('.js')),
  ...walk(path.join(ROOT, 'tools')).filter(f => f.endsWith('.js'))
];
const tmp = path.join(os.tmpdir(), 'sanqing-syntax');
fs.mkdirSync(tmp, { recursive: true });
for (const f of jsFiles) {
  const mjs = path.join(tmp, path.relative(ROOT, f).replace(/[\\/]/g, '_').replace(/\.js$/, '.mjs'));
  fs.copyFileSync(f, mjs);
  try {
    execFileSync(process.execPath, ['--check', mjs], { stdio: 'pipe' });
  } catch (e) {
    failures++;
    console.log(`FAIL ${path.relative(ROOT, f)}\n${String(e.stderr || e.message).slice(0, 600)}`);
  }
}
console.log(`检查了 ${jsFiles.length} 个 JS 文件，语法错误 ${failures ? '见上' : '0 个'}`);

function get(p) {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: p, timeout: 4000 }, (r) => {
      let size = 0;
      r.on('data', d => size += d.length);
      r.on('end', () => resolve({ status: r.statusCode, size }));
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
  });
}

(async () => {
  console.log('\n--- HTTP 端点（需先启动服务）---');
  const checks = [
    ['/', 200], ['/css/style.css', 200], ['/js/main.js', 200],
    ['/js/scene.js', 200], ['/vendor/three.module.min.js', 200],
    ['/healthz', 200], ['/api/halls', 200], ['/metrics', 200],
    ['/audio/qingjingjing.mp3', 404], ['/../server/index.js', 404]
  ];
  for (const [p, expect] of checks) {
    const r = await get(p);
    const ok = r.status === expect;
    if (!ok) failures++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${p.padEnd(34)} ${r.status} ${r.size || ''} ${r.error || ''} (期望 ${expect})`);
  }
  try {
    const h = await new Promise((resolve, reject) => {
      http.get({ host: HOST, port: PORT, path: '/healthz', timeout: 4000 }, (r) => {
        let b = ''; r.on('data', d => b += d); r.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
      }).on('error', reject);
    });
    console.log(`\nhealthz: ok=${h.ok} 在线=${h.online} 殿数=${h.halls.length} IP库=${h.geo.loaded ? '已加载' : '未加载'} RSS=${(h.mem.rss / 1048576).toFixed(1)}MB`);
    console.log(`          总席位=${h.halls.reduce((s, x) => s + x.seats, 0)}`);
  } catch (e) { failures++; console.log('healthz 解析失败:', e.message); }

  console.log(`\n结论: ${failures === 0 ? 'PASS' : `FAIL（${failures} 项异常）`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
