'use strict';

/**
 * 房间 / 席位 / 状态同步。
 *
 * 设计要点（200 人在线的关键）：
 * 1. 不做「每帧全量广播」。100ms 一个 tick，把这段时间内发生的所有事件合成一条消息
 *    发一次；5s 才补一次全量快照兜底。这样 200 人时下行是 O(事件数) 而不是 O(人数²)。
 * 2. 按殿分广播域：200 人被分到 4 个殿，一次广播最多给 108 人，而不是全服。
 * 3. 席位与计数由服务端权威管理，客户端只上报「意图」，不接受客户端自报坐标以外的
 *    任何身份/统计/文字字段。
 * 4. 协议层没有 chat 类型：未知 t 一律丢弃。这是「禁止搭子聊天」的硬保证，
 *    不是靠前端藏输入框。表情只收整数 ID，地名由服务端生成，客户端传不进任何文字。
 */
const C = require('./config');
const { makeName, makeRobe, makeId } = require('./names');

const NPC_NAMES = ['守静道童', '听松童子', '扫云道人', '添香道姑', '击磬童子', '抱朴散人'];
const NPC_ROBES = ['玄青', '月白', '赭黄', '藕荷', '苍绿', '霜色'];
// 分散到不同行不同列，别让守观道童全挤在一侧（seat = row*9 + col）
const NPC_SEATS = [2, 16, 38, 52, 74, 95];

function clamp(v, min, max, def) {
  return (typeof v === 'number' && Number.isFinite(v)) ? Math.min(max, Math.max(min, v)) : def;
}
function rate(client) {
  const now = Date.now();
  if (now - client.tokenTs >= 1000) { client.tokens = C.MAX_MSG_PER_SEC; client.tokenTs = now; }
  if (client.tokens <= 0) return false;
  client.tokens--;
  return true;
}
function cool(client, key) {
  const now = Date.now();
  const ms = C.COOLDOWN[key] || 100;
  if (now - (client.lastAct[key] || 0) < ms) return false;
  client.lastAct[key] = now;
  return true;
}

class Hall {
  constructor(def) {
    this.id = def.id;
    this.name = def.name;
    this.subtitle = def.subtitle;
    this.clients = new Map();                                  // playerId -> client
    this.seats = new Array(C.SEATS_PER_HALL).fill(null);       // seatIndex -> playerId | 'npc'
    this.pending = [];
    this.talismans = [];
    this.paintings = [];     // 张贴到殿墙的画作（只保留最近 N 张，重启即清空）
    this.stats = { bows: 0, beads: 0, chants: 0, talismans: 0, jumps: 0, greets: 0, muyu: 0, paints: 0 };
    this.npcs = [];

    // 守观道童：一个人打开时殿里也不空。不计入在线人数，不占真实玩家席位。
    for (let i = 0; i < NPC_NAMES.length; i++) {
      const s = NPC_SEATS[i];
      const pos = C.SEATS[s];
      this.npcs.push({
        id: `npc_${this.id}_${i}`, name: NPC_NAMES[i], robe: NPC_ROBES[i],
        gender: i === 3 ? 'f' : 'm', npc: true, seat: s,
        x: pos.x, z: pos.z, r: 0,
        pose: i % 3 === 0 ? 'chant' : (i % 3 === 1 ? 'sit' : 'bow'),
        bows: 0, beads: 0, chants: 0, muyu: 0, merit: 0
      });
      this.seats[s] = 'npc';
    }
  }

  get online() { return this.clients.size; }

  freeSeat() {
    // 山寺式：新来的优先坐「殿中心靠前」的空蒲团，而不是从最左角落开始
    let best = -1, bestD = Infinity;
    for (let i = 0; i < this.seats.length; i++) {
      if (this.seats[i] !== null) continue;
      const p = C.SEATS[i];
      const d = p.x * p.x + (p.z + 6) * (p.z + 6);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  emit(ev) { this.pending.push(ev); }

  players() {
    const out = this.npcs.slice();
    for (const c of this.clients.values()) out.push(c.p);
    return out;
  }

  seatMask() { return this.seats.map(s => (s ? 1 : 0)); }

  broadcast(text) {
    for (const c of this.clients.values()) if (!c.conn.closed) c.conn.send(text);
  }
}

class Hub {
  constructor() {
    this.halls = C.HALLS.map(d => new Hall(d));
    this.clients = new Map();   // conn -> client
    this.totals = { bows: 0, beads: 0, chants: 0, talismans: 0, jumps: 0, greets: 0, muyu: 0, paints: 0, visits: 0 };
    this.peak = 0;
    this.startedAt = Date.now();
    this.timers = [];
  }

  start() {
    this.timers.push(setInterval(() => this.flush(), C.TICK_MS));
    this.timers.push(setInterval(() => this.snapshot(), C.SNAPSHOT_MS));
    this.timers.push(setInterval(() => this.statsTick(), C.STATS_MS));
    this.timers.push(setInterval(() => this.heartbeat(), C.HEARTBEAT_MS));
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    for (const c of this.clients.values()) c.conn.close(1001, 'server shutting down');
  }

  stats() {
    return {
      online: this.clients.size,
      peak: this.peak,
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      halls: this.halls.map(h => ({ id: h.id, name: h.name, subtitle: h.subtitle, online: h.online, seats: C.SEATS_PER_HALL })),
      totals: { ...this.totals }
    };
  }

  attach(conn, info) {
    if (this.clients.size >= C.MAX_CLIENTS) {
      conn.sendJSON({ t: 'full', reason: '观中人数已达上限' });
      conn.close(1013);
      return;
    }
    let hall = null;
    if (info.hall) hall = this.halls.find(h => h.id === info.hall && h.freeSeat() >= 0) || null;
    if (!hall) {
      hall = this.halls.filter(h => h.freeSeat() >= 0).sort((a, b) => a.online - b.online)[0] || null;
    }
    if (!hall) {
      conn.sendJSON({ t: 'full', reason: '四殿皆满，请稍后再来' });
      conn.close(1013);
      return;
    }

    const seat = hall.freeSeat();
    const gender = C.GENDERS.includes(info.gender) ? info.gender : 'm';
    const used = new Set(hall.players().map(p => p.name));
    const pos = C.SEATS[seat];
    const p = {
      id: makeId(), name: makeName(used, gender), robe: makeRobe(gender), gender,
      npc: false, seat, x: pos.x, z: pos.z, r: Math.PI, pose: 'sit',
      bows: 0, beads: 0, chants: 0, muyu: 0, merit: 0
    };
    hall.seats[seat] = p.id;

    const client = {
      conn, hall, p,
      geo: info.geo || { text: '未知地域', source: 'none' },
      tokens: C.MAX_MSG_PER_SEC, tokenTs: Date.now(),
      lastAct: {}, awaitsPing: false, removed: false, joinedAt: Date.now()
    };
    this.clients.set(conn, client);
    hall.clients.set(p.id, client);
    this.totals.visits++;
    this.peak = Math.max(this.peak, this.clients.size);

    conn.on('message', (m) => {
      // 单条坏消息只影响这一条，不能让异常冒泡打断整个连接
      try { this.handle(client, m); } catch { /* ignore malformed input */ }
    });
    conn.on('pong', () => { client.awaitsPing = false; });
    conn.on('close', () => this.remove(client));

    conn.sendJSON({
      t: 'welcome',
      you: { ...p },
      hall: { id: hall.id, name: hall.name, subtitle: hall.subtitle, online: hall.online, seats: C.SEATS_PER_HALL },
      halls: this.halls.map(h => ({ id: h.id, name: h.name, subtitle: h.subtitle, online: h.online, seats: C.SEATS_PER_HALL })),
      players: hall.players(),
      seats: C.SEATS,
      seatMask: hall.seatMask(),
      emojis: C.EMOJIS,
      genders: C.GENDERS,
      genderLabels: C.GENDER_LABEL,
      talismans: hall.talismans,
      paintings: hall.paintings,
      stats: this.stats(),
      geo: client.geo,                       // 只有自己能看到预览，不广播
      config: {
        tickMs: C.TICK_MS, greetBubbleMs: C.GREET_BUBBLE_MS,
        bounds: C.BOUNDS, hallZone: C.HALL_ZONE, seatsPerHall: C.SEATS_PER_HALL, version: '1.4.0'
      }
    });
    hall.emit({ o: 'join', p: { ...p } });
  }

  remove(client) {
    if (client.removed) return;
    client.removed = true;
    const { hall, p } = client;
    hall.clients.delete(p.id);
    if (p.seat !== null && p.seat !== undefined && hall.seats[p.seat] === p.id) hall.seats[p.seat] = null;
    this.clients.delete(client.conn);
    hall.emit({ o: 'leave', id: p.id });
  }

  handle(client, raw) {
    if (!rate(client)) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object' || Array.isArray(m)) return;

    const { conn, hall, p } = client;
    switch (m.t) {
      case 'ping':
        conn.sendJSON({ t: 'pong', ts: Date.now() });
        return;

      case 'pose': {
        if (!C.POSES.includes(m.p) || !cool(client, 'pose')) return;
        // 只有殿内能打坐：服务端也校验，改包在殿外坐下无效
        if (m.p === 'sit' && !C.insideHall(p.x, p.z)) return;
        p.pose = m.p;
        hall.emit({ o: 'pose', id: p.id, p: m.p });
        return;
      }

      case 'move': {
        if (!cool(client, 'move')) return;
        const b = C.BOUNDS;
        p.x = +clamp(m.x, b.minX, b.maxX, p.x).toFixed(3);
        p.z = +clamp(m.z, b.minZ, b.maxZ, p.z).toFixed(3);
        p.r = +clamp(m.r, -Math.PI, Math.PI, p.r).toFixed(3);
        hall.emit({ o: 'move', id: p.id, x: p.x, z: p.z, r: p.r });
        return;
      }

      case 'seat': {
        if (!cool(client, 'seat')) return;
        const n = m.n;
        // 起身 / 离席
        if (n === null || n === -1) {
          if (p.seat !== null && hall.seats[p.seat] === p.id) {
            const old = p.seat;
            hall.seats[old] = null;
            p.seat = null;
            hall.emit({ o: 'unseat', id: p.id, n: old });
          }
          return;
        }
        if (!Number.isInteger(n) || n < 0 || n >= C.SEATS_PER_HALL) return;
        if (hall.seats[n] !== null) return;             // 已被占，客户端不能抢
        if (p.seat !== null && hall.seats[p.seat] === p.id) hall.seats[p.seat] = null;
        hall.seats[n] = p.id;
        const pos = C.SEATS[n];
        p.seat = n; p.x = pos.x; p.z = pos.z; p.r = Math.PI; p.pose = 'sit';
        hall.emit({ o: 'seat', id: p.id, n, x: p.x, z: p.z, r: Math.PI, pose: 'sit' });
        return;
      }

      case 'act': {
        const k = m.k;
        // 'talisman' 由专门的 t:'talisman' 消息处理，避免重复计数
        if (!C.ACTS.includes(k) || k === 'talisman' || !cool(client, k)) return;
        // 叩拜 / 稽首 / 持诵一律面向三清，服务端也把朝向纠正回来
        if (k === 'bow' || k === 'palms' || k === 'chant') p.r = Math.PI;
        const field = { bow: 'bows', bead: 'beads', chant: 'chants', muyu: 'muyu' }[k];
        if (field) {
          p[field] += 1; p.merit += 1;
          this.totals[field] += 1; hall.stats[field] += 1;
        }
        if (k === 'jump') { this.totals.jumps += 1; hall.stats.jumps += 1; }
        if (k === 'palms') { /* 动作事件，不计功德 */ }
        hall.emit({
          o: 'act', id: p.id, k, r: p.r,
          v: { bows: p.bows, beads: p.beads, chants: p.chants, muyu: p.muyu, merit: p.merit }
        });
        return;
      }

      case 'look': {
        if (!C.GENDERS.includes(m.g) || !cool(client, 'look')) return;
        p.gender = m.g;
        p.robe = makeRobe(m.g);
        hall.emit({ o: 'look', id: p.id, gender: p.gender, robe: p.robe });
        return;
      }

      case 'rename': {
        if (!cool(client, 'rename')) return;
        const used = new Set(hall.players().filter(x => x.id !== p.id).map(x => x.name));
        p.name = makeName(used, p.gender);
        hall.emit({ o: 'rename', id: p.id, name: p.name });
        return;
      }

      case 'greet': {
        const e = m.e;
        if (!Number.isInteger(e) || e < 0 || e >= C.EMOJIS.length) return;
        let to = null;
        if (typeof m.to === 'string' && /^[0-9a-f]{12}$/.test(m.to) && hall.clients.has(m.to)) to = m.to;
        if (!cool(client, 'greet')) return;
        this.totals.greets += 1; hall.stats.greets += 1;
        const ev = { o: 'greet', from: p.id, name: p.name, e, to, ts: Date.now() };
        // 方位文本完全由服务端生成，客户端只能给一个 0/1 开关，传不进任何字符串
        if (m.g === 1 && C.GEO_ENABLED) ev.geo = client.geo.text;
        hall.emit(ev);
        return;
      }

      case 'talisman': {
        const d = m.d;
        if (typeof d !== 'string' || d.length > C.MAX_TALISMAN_CHARS) return;
        if (!d.startsWith('data:image/png;base64,')) return;   // 只收 PNG，杜绝 SVG/HTML 注入
        if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(d)) return;
        if (!cool(client, 'talisman')) return;
        this.totals.talismans += 1; hall.stats.talismans += 1; p.merit += 1;
        const item = { id: makeId(), name: p.name, src: d, ts: Date.now() };
        hall.talismans.push(item);
        if (hall.talismans.length > C.MAX_TALISMAN_KEEP) hall.talismans.shift();
        hall.emit({ o: 'talisman', item });
        return;
      }

      case 'paint': {
        // 画作：只收位图 dataURL，大小与格式都卡死；不含任何文字字段
        const d = m.d;
        if (typeof d !== 'string' || d.length > C.MAX_PAINT_CHARS) return;
        if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(d)) return;
        if (!cool(client, 'paint')) return;
        this.totals.paints += 1; hall.stats.paints += 1; p.merit += 1;
        const item = { id: makeId(), name: p.name, src: d, ts: Date.now() };
        hall.paintings.push(item);
        if (hall.paintings.length > C.MAX_PAINT_KEEP) hall.paintings.shift();
        hall.emit({ o: 'paint', item });
        hall.emit({ o: 'act', id: p.id, k: 'paint', r: p.r, v: { bows: p.bows, beads: p.beads, chants: p.chants, muyu: p.muyu, merit: p.merit } });
        return;
      }

      default:
        // 没有 chat / msg / private / match / friend 等任何类型。
        // 未知类型直接丢弃，因此「搭子聊天」在协议层不存在，改包也发不出文字。
        return;
    }
  }

  flush() {
    for (const h of this.halls) {
      if (!h.pending.length) continue;
      const ev = h.pending;
      h.pending = [];
      h.broadcast(JSON.stringify({ t: 'tick', e: ev }));
    }
  }

  snapshot() {
    for (const h of this.halls) {
      if (!h.clients.size) continue;
      h.broadcast(JSON.stringify({
        t: 'snapshot', players: h.players(), seatMask: h.seatMask(), stats: this.stats()
      }));
    }
  }

  statsTick() {
    if (!this.clients.size) return;
    const s = JSON.stringify({ t: 'stats', s: this.stats() });
    for (const c of this.clients.values()) if (!c.conn.closed) c.conn.send(s);
  }

  heartbeat() {
    const now = Date.now();
    for (const c of this.clients.values()) {
      if (now - c.conn.lastSeen > C.DEAD_MS || (c.awaitsPing && !c.conn.alive)) {
        c.conn.close(1001, 'timeout');
        continue;
      }
      c.conn.ping();
      c.awaitsPing = true;
    }
  }
}

module.exports = { Hub, Hall };
