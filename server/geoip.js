'use strict';

/**
 * 离线 IP 归属地解析（国家 / 省份 / 城市）。
 *
 * 依据 ip2region v4 xdb 官方 JS binding 的字节布局实现的零依赖读取器：
 *   header 256B: version(2) policy(2) createdAt(4) startPtr(4) endPtr(4)
 *                ipVersion(2) runtimePtrBytes(2)
 *   vector index: 256*256*8 = 524288B，紧接 header
 *   segment index 项 = 14B: startIp(4, 小端) endIp(4, 小端) dataLen(2) dataPtr(4)
 *   region 记录: 国家|省份|城市|ISP|iso-alpha2-code，"0" 表示空
 *
 * 隐私与防伪造（重要）：
 *   - IP 只在内存里即时解析，不写日志、不落盘、不出现在任何广播消息里。
 *   - 对外只暴露到「城市级」的地名文本，不暴露 IP、经纬度、ISP。
 *   - 默认只信直连 IP；X-Forwarded-For / X-Geo-* 头仅在「直连来自可信反代」时读取，
 *     否则任何人都能伪造国家省份。
 *   - 解析不到就如实返回「未知地域」，绝不编造地名。
 */
const fs = require('node:fs');
const path = require('node:path');
const C = require('./config');

const HEADER_LEN = 256;
const VECTOR_COLS = 256;
const VECTOR_SIZE = 8;
const INDEX_SIZE = 14;

let db = null;
let header = null;
let customRanges = [];

function parseIPv4(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s || '').trim());
  if (!m) return null;
  const b = m.slice(1).map(Number);
  if (b.some(v => v > 255)) return null;
  return b;
}
function ipInt(b) { return (((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0); }

function clean(s) {
  if (s === undefined || s === null) return '';
  const t = String(s).trim();
  if (!t || t === '0' || t === '-' || t === '未知' || t === 'null' || t === 'NULL') return '';
  return t.slice(0, 32);
}

function fromFields(country, province, city, source) {
  let c = clean(country);
  // 中国香港 / 澳门 / 台湾一律作为中国的一部分展示，不呈现为独立国家
  if (c && !c.startsWith('中国') && /香港|澳门|台湾|Hong\s?Kong|Macao|Macau|Taiwan/i.test(c)) {
    c = '中国' + c;
  }
  const p = clean(province);
  const t = clean(city);
  const text = [c, p, t].filter(Boolean).join(' · ');
  return {
    country: c, province: p, city: t,
    text: text || '未知地域', source, available: Boolean(text)
  };
}

function parseRegion(region) {
  const parts = String(region).split('|');
  return fromFields(parts[0], parts[1], parts[2], 'ip2region-v4');
}

function loadCustom() {
  try {
    const p = path.resolve(__dirname, '..', 'data', 'geoip.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const list = Array.isArray(j.ranges) ? j.ranges : [];
    customRanges = list.map(r => ({
      s: ipInt(parseIPv4(r[0]) || [0, 0, 0, 0]),
      e: ipInt(parseIPv4(r[1]) || [0, 0, 0, 0]),
      country: r[2] || '', province: r[3] || '', city: r[4] || ''
    })).filter(r => r.e >= r.s).sort((a, b) => a.s - b.s);
  } catch { customRanges = []; }
}

function load() {
  try {
    const p = path.resolve(__dirname, '..', 'data', 'ip2region_v4.xdb');
    db = fs.readFileSync(p);
    header = {
      version: db.readUInt16LE(0),
      policy: db.readUInt16LE(2),
      createdAt: db.readUInt32LE(4),
      startPtr: db.readUInt32LE(8),
      endPtr: db.readUInt32LE(12),
      ipVersion: db.readUInt16LE(16),
      ptrBytes: db.readUInt16LE(18)
    };
    if (header.version !== 3 || header.ipVersion !== 4 || db.length < HEADER_LEN + VECTOR_COLS * VECTOR_COLS * VECTOR_SIZE) {
      throw new Error('xdb 结构不是预期中的 structure30 / IPv4');
    }
  } catch (e) {
    db = null; header = null;
    console.warn('[geo] 离线 IP 库不可用，方位功能自动降级：' + e.message);
  }
  loadCustom();
}

function search(ipStr) {
  if (!db) return null;
  const b = parseIPv4(ipStr);
  if (!b) return null;
  const target = ipInt(b);
  const idx = HEADER_LEN + (b[0] * VECTOR_COLS + b[1]) * VECTOR_SIZE;
  if (idx + VECTOR_SIZE > db.length) return null;
  const sPtr = db.readUInt32LE(idx);
  const ePtr = db.readUInt32LE(idx + 4);
  if (!sPtr || !ePtr || sPtr > db.length || ePtr > db.length || ePtr <= sPtr) return null;

  let l = 0;
  let h = Math.floor((ePtr - sPtr) / INDEX_SIZE);
  let dLen = 0, dPtr = 0;
  while (l <= h) {
    const m = (l + h) >> 1;
    const p = sPtr + m * INDEX_SIZE;
    if (p + INDEX_SIZE > db.length) break;
    const start = db.readUInt32LE(p);
    const end = db.readUInt32LE(p + 4);
    if (target < start) h = m - 1;
    else if (target > end) l = m + 1;
    else { dLen = db.readUInt16LE(p + 8); dPtr = db.readUInt32LE(p + 10); break; }
  }
  if (!dLen || !dPtr || dPtr + dLen > db.length) return null;
  return db.toString('utf8', dPtr, dPtr + dLen);
}

function customLookup(ipStr) {
  const b = parseIPv4(ipStr);
  if (!b || !customRanges.length) return null;
  const t = ipInt(b);
  let l = 0, h = customRanges.length - 1;
  while (l <= h) {
    const m = (l + h) >> 1;
    const r = customRanges[m];
    if (t < r.s) h = m - 1;
    else if (t > r.e) l = m + 1;
    else return fromFields(r.country, r.province, r.city, 'custom');
  }
  return null;
}

function ipKind(ip) {
  if (!ip) return 'unknown';
  if (ip === '::1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.')) return 'loopback';
  if (/^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return 'lan';
  const m = /^172\.(\d+)\./.exec(ip);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return 'lan';
  if (ip.includes(':')) return 'ipv6';
  return 'public';
}

function normalizeProxy(p) { return String(p).trim().replace(/^::ffff:/, ''); }

function isTrustedPeer(ip) {
  if (!C.TRUST_PROXY) return false;               // 总开关：默认完全不读 XFF
  if (C.TRUSTED_PROXIES.some(p => normalizeProxy(p) === ip)) return true;
  // 开启后，来自本机 / 私网的直连视为可信反代（Docker、K8s、本机 Nginx）。
  // 公网直连永远不信任 XFF，因此外部访客伪造不了国家省份。
  const k = ipKind(ip);
  return k === 'loopback' || k === 'lan';
}

/**
 * 从一个 HTTP upgrade 请求里解析出方位。
 * 返回值里的 ip 只留在内存中，调用方不得把它放进任何对外消息或日志。
 */
function resolve(req) {
  const remote = normalizeProxy(String(req.socket.remoteAddress || ''));
  const trusted = isTrustedPeer(remote);
  let ip = remote;

  if (trusted) {
    const xff = normalizeProxy(String(req.headers['x-forwarded-for'] || '').split(',')[0].trim());
    if (xff && (parseIPv4(xff) || xff.includes(':'))) ip = xff;
  }

  if (!C.GEO_ENABLED) {
    return { ip, trusted, geo: { text: '方位已隐藏', country: '', province: '', city: '', source: 'disabled', available: false } };
  }

  const kind = ipKind(ip);
  if (kind === 'loopback') {
    return { ip, trusted, geo: { text: '本机 · 内网', country: '', province: '', city: '', source: 'local', available: true } };
  }
  if (kind === 'lan') {
    return { ip, trusted, geo: { text: '局域网 · 内网', country: '', province: '', city: '', source: 'local', available: true } };
  }
  if (kind === 'ipv6') {
    return { ip, trusted, geo: { text: 'IPv6 · 未收录', country: '', province: '', city: '', source: 'none', available: false } };
  }

  // 1) 可信反代提供的地理头（Cloudflare / Nginx geoip2 场景）
  if (trusted) {
    const c = clean(req.headers['x-geo-country'] || req.headers['cf-ipcountry']);
    if (c) {
      return {
        ip, trusted,
        geo: fromFields(c, req.headers['x-geo-province'], req.headers['x-geo-city'], 'proxy-header')
      };
    }
  }
  // 2) 部署者自定义网段覆盖
  const custom = customLookup(ip);
  if (custom) return { ip, trusted, geo: custom };
  // 3) 离线 xdb
  const region = search(ip);
  if (region) return { ip, trusted, geo: parseRegion(region) };

  return { ip, trusted, geo: { text: '未知地域', country: '', province: '', city: '', source: 'none', available: false } };
}

function status() {
  return {
    loaded: Boolean(db),
    header: header ? { ...header } : null,
    dbBytes: db ? db.length : 0,
    customRanges: customRanges.length,
    trustProxy: C.TRUST_PROXY,
    geoEnabled: C.GEO_ENABLED
  };
}

load();
module.exports = { resolve, search, status, parseRegion, loadCustom };
