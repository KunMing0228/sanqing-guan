import * as THREE from 'three';
import { buildScene, localSeats } from './scene.js';
import { Avatar, offlineNPCs } from './avatar.js';
import { TaoAudio } from './audio.js';
import { Net } from './net.js';
import { TalismanPaper } from './talisman.js';
import { PaintCanvas } from './paint.js';
import { UI } from './ui.js';
import { QINGJING_TITLE, MANTRAS } from './scripture.js';
import { groundHeight, insideHall, resolveCollision, DEITY_FACING } from './terrain.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl');

// 与 server/config.js 保持一致的兜底值（运行时以 welcome.config / welcome.seats 为准）
const DEFAULT_EMOJIS = [
  { id: 0, glyph: '☯', label: '太极' }, { id: 1, glyph: '稽', label: '稽首' },
  { id: 2, glyph: '莲', label: '青莲' }, { id: 3, glyph: '云', label: '祥云' },
  { id: 4, glyph: '鹤', label: '白鹤' }, { id: 5, glyph: '香', label: '心香' },
  { id: 6, glyph: '静', label: '清静' }, { id: 7, glyph: '安', label: '安泰' }
];
const DEFAULT_BOUNDS = { minX: -78, maxX: 78, minZ: -52, maxZ: 104 };
const FALLBACK_HALLS = [
  { id: 'sanqing', name: '三清殿', online: 0 }, { id: 'yuxu', name: '玉虚殿', online: 0 },
  { id: 'zixiao', name: '紫霄殿', online: 0 }, { id: 'qingwei', name: '清微殿', online: 0 }
];

let world, net, me, ui, audio, talisman, paint;
let avatarLayer = new THREE.Group();
let renderer;

let meId = null, hallId = null, gender = 'm';
let players = new Map();          // id -> Avatar
let infos = [];                   // 同殿玩家公开信息（用于打招呼下拉）
let seats = localSeats;
let seatMask = new Array(108).fill(0);
let bounds = { ...DEFAULT_BOUNDS };
let emojis = DEFAULT_EMOJIS;
let counters = { bows: 0, beads: 0, muyu: 0, chants: 0, merit: 0 };
let currentPose = 'sit';
let geoText = '未知地域';
let netReady = false, offline = false;
let quality = 'high', reducedMotion = false;
let greetBubbleSec = 3.5;
let lastActAt = {}, lastMoveSend = 0;
let chantTimer = null, chantIndex = 0;
let dragging = false, dragMoved = 0, lastX = 0, lastY = 0, downX = 0, downY = 0;
let sprinting = false, lastMoveKey = '', lastMoveKeyAt = 0;
const keys = new Set();
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const nowMs = () => performance.now();

try {
  quality = localStorage.getItem('sq_quality') || 'high';
} catch { quality = 'high'; }
reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------- WebGL 初始化 ----------------
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  world = buildScene(renderer, quality);
  world.scene.add(avatarLayer);
} catch (err) {
  $('stateTitle').textContent = '无法启动 3D 画面';
  $('stateText').textContent = '请换用支持 WebGL 的浏览器（Chrome / Edge / Safari）';
  $('stateOverlay').classList.remove('hidden');
  $('gate').classList.add('hidden');
  throw err;
}

audio = new TaoAudio();
audio.onModeChange = (mode, note) => ui && ui.setAudioMode(mode, note);

// ---------------- 业务动作 ----------------
function mePos(extraY = .4) {
  return me ? me.group.position.clone().add(new THREE.Vector3(0, extraY, 0)) : new THREE.Vector3();
}

function freeSeat() {
  const i = seatMask.findIndex(v => !v);
  return i >= 0 ? i : -1;
}

/** 打坐就近入座：选离当前位置最近的空蒲团，不再总是坐第一个 */
function nearestFreeSeat(x, z) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < seats.length; i++) {
    if (seatMask[i]) continue;
    const d = (seats[i].x - x) ** 2 + (seats[i].z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

let lastZoneName = '';
function updateZoneHint(x, z) {
  const el = $('zoneHint');
  if (!el) return;
  let found = null;
  for (const zone of (world.constructionZones || [])) {
    if (Math.hypot(x - zone.x, z - zone.z) < zone.r) { found = zone; break; }
  }
  if (found) {
    if (lastZoneName !== found.name) {
      el.textContent = found.name + ' · 建造中，暂未开放';
      lastZoneName = found.name;
    }
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
    lastZoneName = '';
  }
}

function bumpLocal(k) {
  if (!offline) return;   // 在线模式以服务端回传的权威计数为准
  if (k === 'bow') { counters.bows++; counters.merit++; }
  else if (k === 'bead') { counters.beads++; counters.merit++; }
  else if (k === 'muyu') { counters.muyu++; counters.merit++; }
  else if (k === 'chant') { counters.chants++; counters.merit++; }
  ui.setCounters(counters);
}

/** 当前是否站在殿内（打坐、敲木鱼都要求在大殿里） */
function meInHall() {
  if (!me) return false;
  return insideHall(me.group.position.x, me.group.position.z);
}

function doAct(k) {
  const cd = {
    bow: 260, bead: 70, palms: 320, jump: 700, sit: 300, talisman: 200,
    chant: 200, greet: 200, muyu: 95, paint: 200
  };
  const t = nowMs();
  if (t - (lastActAt[k] || 0) < (cd[k] || 150)) return;
  lastActAt[k] = t;

  switch (k) {
    case 'bow':
      // 走动中不许乱拜：先站定，再强制转向三清
      if (currentPose === 'walk') { currentPose = 'stand'; me && me.setPose('stand'); }
      me && me.setFacing(DEITY_FACING, true);
      me && me.setPose('bow');
      net.send({ t: 'act', k: 'bow' });
      audio.bow();
      world.sparks.burst(mePos(.15), 12, .8);
      bumpLocal('bow');
      setTimeout(() => { if (me && me.pose === 'bow') me.setPose(currentPose); }, 620);
      break;
    case 'jump':
      me && me.jump();
      net.send({ t: 'act', k: 'jump' });
      audio.jump();
      world.sparks.burst(mePos(.05), 10, .7);
      break;
    case 'palms':
      me && me.setPose('palms');
      net.send({ t: 'act', k: 'palms' });
      audio.qing(.4);
      setTimeout(() => { if (me && me.pose === 'palms') me.setPose(currentPose); }, 900);
      break;
    case 'sit': {
      const next = currentPose === 'sit' || currentPose === 'muyu' ? 'stand' : 'sit';
      // 只有大殿里才能打坐：殿外（广场、山道、建造区）按了只提示，不坐下
      if (next === 'sit' && !meInHall()) {
        ui.toast('要先走进大殿，才能打坐');
        return;
      }
      currentPose = next;
      me && me.setPose(next);
      net.send({ t: 'pose', p: next });
      if (next === 'stand') net.send({ t: 'seat', n: -1 });
      else {
        const px = me ? me.group.position.x : 0;
        const pz = me ? me.group.position.z : 0;
        const n = nearestFreeSeat(px, pz);
        if (n >= 0) {
          net.send({ t: 'seat', n });
          me && me.setFacing(DEITY_FACING, true);
          me && me.setGroundY(groundHeight(seats[n].x, seats[n].z));
          if (offline && me) me.setPosition(seats[n].x, seats[n].z, 0);
        } else ui.toast('殿内蒲团都坐满了');
      }
      ui.toast(next === 'sit' ? '已入座，静一静' : '起身了');
      break;
    }
    case 'bead':
      net.send({ t: 'act', k: 'bead' });
      audio.woodfish();
      bumpLocal('bead');
      break;
    case 'muyu': {
      // 敲木鱼：必须在大殿里。第一次按自动就近落座并摆出木鱼，之后每按一记。
      if (!meInHall()) { ui.toast('木鱼在殿内，先走进大殿'); return; }
      if (currentPose !== 'muyu') {
        const px = me ? me.group.position.x : 0;
        const pz = me ? me.group.position.z : 0;
        const n = nearestFreeSeat(px, pz);
        currentPose = 'muyu';
        me && me.setPose('muyu');
        me && me.setFacing(DEITY_FACING, true);
        net.send({ t: 'pose', p: 'muyu' });
        if (n >= 0) {
          net.send({ t: 'seat', n });
          if (offline && me) me.setPosition(seats[n].x, seats[n].z, 0);
        }
        ui.toast('木鱼已摆好，敲吧');
      }
      me && me.strikeMuyu();
      net.send({ t: 'act', k: 'muyu' });
      audio.woodfish();
      bumpLocal('muyu');
      break;
    }
    case 'talisman':
      ui.openPanel('panelTalisman');
      currentPose = 'write'; me && me.setPose('write');
      net.send({ t: 'pose', p: 'write' });
      break;
    case 'paint':
      ui.openPanel('panelPaint');
      currentPose = 'write'; me && me.setPose('write');
      net.send({ t: 'pose', p: 'write' });
      break;
    case 'chant':
      ui.openPanel('panelScripture');
      break;
    case 'greet':
      ui.openPanel('panelGreet');
      ui.setGreetTargets(infos, meId);
      break;
    default: break;
  }
}

function doGreet({ e, to, g }) {
  const item = emojis.find(x => x.id === e) || emojis[0];
  const withGeo = g === 1;
  if (offline) {
    me && me.showBubble(item.glyph, item.label, withGeo ? geoText : '', greetBubbleSec);
    ui.toast(withGeo ? `单人静修 · ${item.label}（方位未连接服务）` : `单人静修 · ${item.label}`);
  } else {
    // 客户端只发整数 ID 与 0/1 开关，地名由服务端生成，任何文字都传不上去
    net.send({ t: 'greet', e, to: to || null, g: withGeo ? 1 : 0 });
  }
  audio.greet();
  ui.closePanel('panelGreet');
}

function handleGreet(ev) {
  const visible = ev.to === null || ev.to === meId || ev.from === meId;
  if (!visible) return;
  const item = emojis.find(x => x.id === ev.e) || emojis[0];
  const a = ev.from === meId ? me : players.get(ev.from);
  if (a) a.showBubble(item.glyph, item.label, ev.geo || '', greetBubbleSec);
  if (ev.from === meId && ev.geo) ui.toast(`已发出 ${item.glyph} · ${ev.geo}`);
  else if (ev.from !== meId) ui.toast(ev.to === meId ? `${ev.name} 向你 ${item.glyph} ${item.label}` : `${ev.name} ${item.glyph} ${item.label}`);
  audio.greet();
}

function toggleChant(v) {
  clearInterval(chantTimer);
  chantTimer = null;
  if (!v) return;
  chantIndex = 0;
  const step = () => {
    const lines = ui.currentChantLines();
    const i = chantIndex % lines.length;
    ui.setChantLine(i, lines[i]);
    audio.chantBeat();
    net.send({ t: 'act', k: 'chant' });
    bumpLocal('chant');
    chantIndex++;
  };
  step();
  chantTimer = setInterval(step, 2400);
}

// ---------------- 网络事件 ----------------
function clearPlayers() {
  for (const a of players.values()) a.dispose();
  players.clear();
  infos = [];
}

function addPlayer(p) {
  if (!p || !p.id || players.has(p.id)) return null;
  const a = new Avatar(p);
  a.setGroundY(groundHeight(p.x || 0, p.z || 0));
  avatarLayer.add(a.group);
  players.set(p.id, a);
  return a;
}

function rebuildInfos(list) {
  infos = (list || []).filter(p => p.id !== meId).map(p => ({
    id: p.id, name: p.name, npc: !!p.npc, gender: p.gender
  }));
  ui.setGreetTargets(infos.concat([{ id: meId, name: '我' }]), meId);
}

function handleWelcome(w) {
  offline = false;
  netReady = true;
  meId = w.you.id;
  hallId = w.hall.id;
  gender = w.you.gender;
  seats = w.seats || localSeats;
  seatMask = (w.seatMask || []).slice();
  bounds = (w.config && w.config.bounds) || { ...DEFAULT_BOUNDS };
  emojis = w.emojis || DEFAULT_EMOJIS;
  greetBubbleSec = (w.config && w.config.greetBubbleMs ? w.config.greetBubbleMs : 3500) / 1000;
  geoText = (w.geo && w.geo.text) || '未知地域';
  counters = { bows: w.you.bows || 0, beads: w.you.beads || 0, muyu: w.you.muyu || 0, chants: w.you.chants || 0, merit: w.you.merit || 0 };
  currentPose = w.you.pose || 'sit';

  clearPlayers();
  if (me) { me.dispose(); me = null; }
  for (const p of (w.players || [])) if (p.id !== meId) addPlayer(p);
  me = new Avatar(w.you);
  me.setGroundY(groundHeight(w.you.x, w.you.z));
  me.setFacing(DEITY_FACING, true);
  avatarLayer.add(me.group);
  world.snapFollow(w.you.x, w.you.z);
  world.setPaintings(w.paintings || []);

  rebuildInfos(w.players || []);
  ui.setWelcome(w);
  ui.clearOffline();
  ui.clearState();
  ui.setLookActive(gender);
  ui.toast(`已入 ${w.hall.name} · 道号「${w.you.name}」`);
  // 自检钩子：无头环境靠事件而不是定时轮询，避免虚拟时钟把轮询瞬间跑完
  window.dispatchEvent(new Event('sq:ready'));
}

function handleEvent(ev) {
  if (!ev || !ev.o) return;
  switch (ev.o) {
    case 'join': {
      if (ev.p && ev.p.id !== meId) {
        addPlayer(ev.p);
        rebuildInfos([...infos, ev.p]);
      }
      break;
    }
    case 'leave': {
      const a = players.get(ev.id);
      if (a) { a.dispose(); players.delete(ev.id); }
      rebuildInfos(infos.filter(p => p.id !== ev.id));
      break;
    }
    case 'pose': {
      const a = players.get(ev.id);
      if (a) a.setPose(ev.p);
      break;
    }
    case 'move': {
      const a = players.get(ev.id);
      if (a) {
        a.setPosition(ev.x, ev.z, ev.r);
        a.setGroundY(groundHeight(ev.x, ev.z));
        a.setFacing(ev.r, false);
      }
      break;
    }
    case 'seat': {
      const a = ev.id === meId ? me : players.get(ev.id);
      if (a) { a.setPosition(ev.x, ev.z, 0); a.setPose('sit'); a.setSeated(true);
               a.setGroundY(0); a.setFacing(DEITY_FACING, true); }
      if (typeof ev.n === 'number') seatMask[ev.n] = 1;
      break;
    }
    case 'unseat': {
      if (typeof ev.n === 'number') seatMask[ev.n] = 0;
      const a = ev.id === meId ? me : players.get(ev.id);
      if (a) a.setSeated(false);
      break;
    }
    case 'act': {
      const a = ev.id === meId ? me : players.get(ev.id);
      if (a && typeof ev.r === 'number' && ev.k !== 'jump' && ev.k !== 'bead') {
        a.setFacing(ev.r, true);
      }
      if (a) {
        if (ev.k === 'jump') a.jump();
        else if (ev.k === 'bow') {
          a.setPose('bow');
          setTimeout(() => { if (a.pose === 'bow') a.setPose('sit'); }, 620);
        } else if (ev.k === 'palms') {
          a.setPose('palms');
          setTimeout(() => { if (a.pose === 'palms') a.setPose('sit'); }, 900);
        }
      }
      if (ev.id === meId && ev.v) { counters = ev.v; ui.setCounters(counters); }
      break;
    }
    case 'look': {
      const a = ev.id === meId ? me : players.get(ev.id);
      if (a) a.setAppearance({ gender: ev.gender, robe: ev.robe });
      break;
    }
    case 'rename': {
      const a = ev.id === meId ? me : players.get(ev.id);
      if (a) { a.name = ev.name; a.setNameTexture(); }
      if (ev.id === meId) $('myName').textContent = ev.name;
      rebuildInfos(infos.map(p => p.id === ev.id ? { ...p, name: ev.name } : p));
      break;
    }
    case 'greet': handleGreet(ev); break;
    case 'talisman': if (ev.item) ui.addWallItem(ev.item); break;
    case 'paint': {
      if (ev.item) {
        world.addPainting(ev.item);
        ui.addPainting(ev.item);
        if (ev.item.name && me && ev.item.name !== me.name) ui.toast(`${ev.item.name} 贴了一幅画到殿墙`);
      }
      break;
    }
    case 'stats': ui.setStats(ev.s); break;
    default: break;
  }
}

function handleSnapshot(s) {
  if (!s || !Array.isArray(s.players)) return;
  seatMask = (s.seatMask || seatMask).slice();
  ui.setStats(s.stats);
  const seen = new Set();
  for (const p of s.players) {
    if (p.id === meId) {
      if (p.bows !== undefined) { counters = { bows: p.bows, beads: p.beads, muyu: p.muyu || 0, chants: p.chants, merit: p.merit }; ui.setCounters(counters); }
      continue;
    }
    seen.add(p.id);
    const a = players.get(p.id);
    if (a) {
      a.setPosition(p.x, p.z, p.r);
      a.setPose(p.pose);
      a.setSeated(p.seat !== null && p.seat !== undefined);
      a.setGroundY(groundHeight(p.x, p.z));
      if (a.gender !== p.gender || a.robe !== p.robe) a.setAppearance({ gender: p.gender, robe: p.robe, name: p.name });
    } else addPlayer(p);
  }
  for (const [id, a] of [...players.entries()]) {
    if (!seen.has(id)) { a.dispose(); players.delete(id); }
  }
  rebuildInfos(s.players);
}

/** 连不上服务（含 GitHub Pages 纯静态托管）→ 单人静修模式，画面与本地交互全部保留 */
function enterOffline(reason) {
  if (offline) return;
  offline = true;
  netReady = false;
  ui.setOffline(reason);
  ui.clearState();
  ui.showHUD();
  clearPlayers();
  if (me) { me.dispose(); me = null; }
  const npcs = offlineNPCs();
  npcs.forEach(p => addPlayer(p));
  meId = 'offline_me';
  gender = ui.gender;
  const seat = 40;
  const wYou = {
    id: meId, name: '清虚散人', robe: gender === 'f' ? '藕荷' : '玄青', gender, npc: false,
    seat, x: seats[seat].x, z: seats[seat].z, r: 0, pose: 'sit',
    bows: 0, beads: 0, chants: 0, merit: 0
  };
  me = new Avatar(wYou);
  avatarLayer.add(me.group);
  world.snapFollow(wYou.x, wYou.z);
  currentPose = 'sit';
  counters = { bows: 0, beads: 0, muyu: 0, chants: 0, merit: 0 };
  emojis = DEFAULT_EMOJIS;
  geoText = '未连接 · 无方位';
  world.setPaintings([]);
  ui.setWelcome({
    you: wYou,
    hall: { id: 'offline', name: '三清殿', subtitle: '单人静修', online: 1, seats: 108 },
    halls: [], players: [...npcs, wYou], seats, seatMask: new Array(108).fill(0),
    emojis, genders: ['m', 'f'], genderLabels: { m: '道士', f: '道姑' },
    talismans: [],
    paintings: [],
    stats: { online: 1, peak: 1, uptime: 0, halls: [], totals: { bows: 0, beads: 0, chants: 0 } },
    geo: { text: geoText },
    config: { greetBubbleMs: 3500, bounds: DEFAULT_BOUNDS, seatsPerHall: 108 }
  });
  ui.setStats({ online: 1, totals: {} });
  ui.toast('已进入单人静修模式');
  window.dispatchEvent(new Event('sq:ready'));
}

// ---------------- 装配 ----------------
net = new Net({
  onWelcome: handleWelcome,
  onTick: handleEvent,
  onSnapshot: handleSnapshot,
  onStats: (s) => ui.setStats(s),
  onFull: (m) => ui.setState('观中已满', m.reason || '请稍后再来', '☯'),
  onClose: () => { if (!offline) ui.toast('连接断开，正在重连…'); },
  onOffline: enterOffline
});

ui = new UI({
  onEnter: ({ gender: g, hall }) => {
    gender = g;
    ui.hideGate();
    ui.showHUD();
    // 必须在用户手势链里解锁音频，否则浏览器会拦截自动播放
    audio.unlock().then(() => ui.setAudioMode(audio.mode, audio.trackNote));
    ui.setState('正在入观…', '正在安排蒲团');
    net.connect({ gender: g, hall });
  },
  onAct: doAct,
  onGreet: doGreet,
  onLook: (g) => {
    gender = g;
    me && me.setAppearance({ gender: g, robe: g === 'f' ? '藕荷' : '玄青' });
    ui.setLookActive(g);
    net.send({ t: 'look', g });
    ui.toast(g === 'f' ? '已换作小道姑' : '已换作小道士');
  },
  onRename: () => {
    net.send({ t: 'rename' });
    if (offline) {
      const n = ['云水道人', '松风散人', '澄心道童', '抱朴居士'][Math.floor(Math.random() * 4)];
      me.name = n; me.setNameTexture(); $('myName').textContent = n;
    }
  },
  onVolume: (v) => audio.setVolume(v),
  onToggleMute: () => ui.setMuted(audio.toggleMute()),
  onQuality: (q) => {
    quality = q; world.setQuality(q); ui.setQuality(q);
    try { localStorage.setItem('sq_quality', q); } catch { /* ignore */ }
  },
  onHallChange: (h) => {
    if (offline) { ui.toast('单人静修模式无法换殿'); return; }
    net.close();
    ui.setState('正在换殿…', '正在重新安排蒲团');
    net.connect({ gender, hall: h });
  },
  onChantToggle: toggleChant,
  onPostTalisman: (url) => {
    if (offline) ui.addWallItem({ src: url, name: '我' });
    else net.send({ t: 'talisman', d: url });   // 等服务端广播回来再上墙，避免重复
    audio.seal();
    ui.toast('符箓已张贴');
  },
  onPostPaint: (url) => {
    // 画作：在线等服务端广播回来再上墙；离线直接挂本地
    if (offline) {
      const item = { id: 'local_' + Date.now(), src: url, name: '我' };
      world.addPainting(item);
      ui.addPainting(item);
    } else {
      net.send({ t: 'paint', d: url });
    }
    ui.toast('画作已贴到殿墙，同殿的人都能看到');
    ui.closePanel('panelPaint');
  },
  onMotionToggle: (v) => { reducedMotion = v; },
  onRecitation: (action, tab, idx) => {
    if (action === 'stop') { audio.stopRecitation(); ui.setRecitationState('诵读已停止'); return; }
    const file = tab === 'zhou'
      ? ['./audio/scripture/mantra_' + idx + '.mp3', './audio/scripture/mantras.mp3']
      : ['./audio/scripture/qingjingjing.mp3'];
    const label = tab === 'zhou' ? (MANTRAS[idx] || MANTRAS[0]).name : '太上清静经';
    audio.playRecitation(file, label);
    ui.setRecitationState('正在播放：' + label);
  }
});

audio.onRecitationMissing = (label) => {
  ui.setRecitationState('未找到「' + label + '」诵读音轨');
  ui.toast('把标准朗读 mp3 放进 public/audio/scripture/ 即可收听');
};
audio.onRecitationEnd = () => ui.setRecitationState('诵读完毕');

talisman = new TalismanPaper($('talismanCanvas'), {
  onSound: () => audio.seal(),
  onPost: () => { /* 由 UI 的按钮统一走 onPostTalisman */ }
});
ui.attachTalisman(talisman);

paint = new PaintCanvas($('paintCanvas'), { onSound: () => audio.seal() });
ui.attachPaint(paint);
ui.setQuality(quality);
ui.setAudioMode('pending', '点击「入观」后解锁音频');
ui.setChanting(false);
ui.setScriptureLine('人能常清静，天地悉皆归。', QINGJING_TITLE);

// 殿列表：静态托管时接口不存在，回落到本地兜底，不报错
fetch('./api/halls')
  .then(r => r.ok ? r.json() : Promise.reject(new Error('no api')))
  .then(j => ui.setGateHalls(j.halls || FALLBACK_HALLS))
  .catch(() => ui.setGateHalls(FALLBACK_HALLS));

// ---------------- 相机与输入 ----------------
canvas.addEventListener('pointerdown', (e) => {
  dragging = true; dragMoved = 0;
  lastX = downX = e.clientX; lastY = downY = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  world.orbit(dx, dy);
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('pointerup', (e) => {
  dragging = false;
  if (dragMoved < 8) pickSeat(e);
});
canvas.addEventListener('pointercancel', () => { dragging = false; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  world.zoom(e.deltaY);
}, { passive: false });

function pickSeat(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, world.camera);
  const hit = raycaster.intersectObject(world.cushions, false);
  if (!hit.length || hit[0].instanceId === undefined) return;
  const n = hit[0].instanceId;
  if (offline) {
    me && me.setPosition(seats[n].x, seats[n].z, 0);
    me && me.setPose('sit');
    currentPose = 'sit';
    ui.toast(`坐到了第 ${n + 1} 个蒲团`);
    return;
  }
  net.send({ t: 'seat', n });
  net.send({ t: 'pose', p: 'sit' });
  currentPose = 'sit';
  me && me.setPosition(seats[n].x, seats[n].z, 0);
  me && me.setPose('sit');
}

window.addEventListener('keydown', (e) => {
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.code === 'Space') { e.preventDefault(); doAct('jump'); return; }
  const moveKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];
  if (moveKeys.includes(e.code)) {
    const t = nowMs();
    // 只有「双击前进键」才疾行；左右、后退键双击不长脸，长按任何时候都只是慢走
    const isForward = e.code === 'KeyW' || e.code === 'ArrowUp';
    if (isForward && e.code === lastMoveKey && t - lastMoveKeyAt < 340 && !sprinting) {
      sprinting = true;
      me && me.setRunning(true);
      ui.toast('疾行中 · 松开前进键恢复慢走');
    }
    lastMoveKey = e.code; lastMoveKeyAt = t;
    keys.add(e.code); e.preventDefault(); return;
  }
  const m = /^Digit([1-8])$/.exec(e.code);
  if (m) doGreet({ e: Number(m[1]) - 1, to: null, g: 0 });
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (keys.size === 0 && sprinting) {
    sprinting = false;
    me && me.setRunning(false);
  }
});
window.addEventListener('blur', () => keys.clear());

function tickMove(dt) {
  if (!me) return;
  // 相机相对移动：前进永远朝镜头看的方向，A/D 沿镜头左右；镜头 360° 转，方向跟着转
  const yaw = world.getYaw();
  const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
  let forward = 0, strafe = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) strafe += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) strafe -= 1;
  const dx = fwdX * forward + rightX * strafe;
  const dz = fwdZ * forward + rightZ * strafe;
  // 疾行只跟「双击前进」绑定：前进键松开、或只剩左右/后退，就回慢走
  if (sprinting && forward <= 0) { sprinting = false; me.setRunning(false); }
  const moving = !!(dx || dz);
  if (moving) {
    const len = Math.hypot(dx, dz);
    const sp = (sprinting ? 8.6 : 3.2) * dt;
    const wantX = clamp(me.group.position.x + (dx / len) * sp, bounds.minX, bounds.maxX);
    const wantZ = clamp(me.group.position.z + (dz / len) * sp, bounds.minZ, bounds.maxZ);
    // 墙体 / 柱子 / 供案 / 神像区 / 建造区：撞上就贴着走，穿不过去
    const fixed = resolveCollision(wantX, wantZ, world.colliders, 0.42);
    const nx = clamp(fixed.x, bounds.minX, bounds.maxX);
    const nz = clamp(fixed.z, bounds.minZ, bounds.maxZ);
    me.group.position.x = nx; me.group.position.z = nz;
    me.group.rotation.y = Math.atan2(dx / len, dz / len);
    me.setFacing(me.group.rotation.y, false);
    if (currentPose !== 'walk') {
      currentPose = 'walk'; me.setPose('walk'); me.setSeated(false);
      net.send({ t: 'pose', p: 'walk' });
      net.send({ t: 'seat', n: -1 });
    }
    const t = nowMs();
    if (t - lastMoveSend > (sprinting ? 65 : 95)) {
      lastMoveSend = t;
      net.send({ t: 'move', x: +nx.toFixed(3), z: +nz.toFixed(3), r: +me.group.rotation.y.toFixed(3) });
    }
  } else if (currentPose === 'walk') {
    currentPose = 'stand'; me.setPose('stand');
    net.send({ t: 'pose', p: 'stand' });
  }
}

// ---------------- 主循环 ----------------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  world.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

let lastFrame = performance.now(), clock = 0;
function frame(now) {
  const dt = Math.min(.05, Math.max(.001, (now - lastFrame) / 1000));
  lastFrame = now;
  clock += dt;
  tickMove(dt);
  if (me) {
    const mx = me.group.position.x, mz = me.group.position.z;
    me.setGroundY(groundHeight(mx, mz));
    world.setFollow(mx, mz);
    updateZoneHint(mx, mz);
  }
  world.update(reducedMotion ? dt * .35 : dt, clock);
  if (me) {
    me.update(dt, clock);
    me.setLOD(0);
  }
  const cam = world.camera.position;
  for (const a of players.values()) {
    a.update(dt, clock);
    const d = a.group.position.distanceTo(cam);
    a.setLOD(d > 26 ? 2 : (d > 15 ? 1 : 0));
  }
  renderer.render(world.scene, world.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 便于在控制台验收：暴露只读状态，不提供任何聊天入口
window.__sanqing = {
  get state() {
    return { offline, netReady, meId, hallId, players: players.size, counters, audio: audio.mode };
  }
};

// 运行期错误留在 DOM 上，方便无头浏览器 / 监控脚本一眼发现（不写日志、不外发）
window.addEventListener('error', (e) => {
  document.body.dataset.runtimeError = String(e.message || e.error || 'unknown');
});
window.addEventListener('unhandledrejection', (e) => {
  document.body.dataset.runtimeError = String((e.reason && e.reason.message) || e.reason || 'rejection');
});

// ?preview=1 自动入观：用于部署后自检与无头截图，不影响正常访问路径
// 可加 &yaw=3.14 把镜头转到指定角度，验证 360° 旋转与殿口门
const previewParams = new URLSearchParams(location.search);
if (previewParams.get('preview') === '1') {
  const startYaw = Number(previewParams.get('yaw') || 0);
  setTimeout(() => {
    ui.hideGate();
    ui.showHUD();
    audio.unlock().then(() => ui.setAudioMode(audio.mode, audio.trackNote)).catch(() => {});
    if (startYaw) world.orbit(-startYaw / 0.0042, 0);
    net.connect({ gender: 'm', hall: null });
  }, 200);
  // 目检辅助：?pose=walk 定姿态、?dist=-600 推镜头、?x=0&z=30 把人放到指定位置看殿外
  window.addEventListener('sq:ready', () => {
    const pose = previewParams.get('pose');
    const px = Number(previewParams.get('x'));
    const pz = Number(previewParams.get('z'));
    if (previewParams.has('x') && previewParams.has('z')
      && Number.isFinite(px) && Number.isFinite(pz) && me) {
      me.setPosition(px, pz, 0);
      me.setGroundY(groundHeight(px, pz));
      world.snapFollow(px, pz);
      if (currentPose !== 'walk') net.send({ t: 'seat', n: -1 });
    }
    if (pose && me) { currentPose = pose; me.setPose(pose); }
    const dist = Number(previewParams.get('dist') || 0);
    if (dist) { world.zoom(dist); for (let i = 0; i < 40; i++) world.update(0.05, i * 0.05); }
  }, { once: true });
}

// ?preview=1&selftest=check 自检：撞墙 / 殿外不能打坐 / 殿内能打坐 / 木鱼 / 画作上墙
// 全部走正式代码路径（tickMove / doAct / world.addPainting），结果写进 body[data-selftest]。
if (previewParams.get('selftest') === 'check') {
  const runCheck = () => {
    if (!me) { document.body.dataset.selftest = 'no-avatar'; return; }
    const out = {};

    // 1) 撞墙：镜头转到朝 +X，一路按前进，看看能不能穿过右墙（墙在 x=14.6）
    me.setPose('stand'); currentPose = 'stand';
    me.setPosition(0, 0, 0);
    world.orbit(Math.PI / 2 / 0.0042, 0);                 // 相机转到 +X 侧，前进方向 = +X
    for (let i = 1; i <= 24; i++) world.update(0.05, i * 0.05);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    for (let i = 0; i < 160; i++) tickMove(0.05);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    out.wall = {
      x: +me.group.position.x.toFixed(2),
      z: +me.group.position.z.toFixed(2),
      blocked: me.group.position.x < 14.6
    };

    // 2) 殿外按打坐：不应坐下
    me.setPosition(0, 40, 0);
    currentPose = 'stand'; me.setPose('stand');
    lastActAt.sit = 0;
    doAct('sit');
    out.sitOutside = { pose: currentPose, allowed: currentPose === 'sit' };

    // 3) 殿内按打坐：应当坐下
    me.setPosition(0, 0, 0);
    currentPose = 'stand'; me.setPose('stand');
    lastActAt.sit = 0;
    doAct('sit');
    out.sitInside = { pose: currentPose, ok: currentPose === 'sit' };

    // 4) 敲木鱼：殿内能摆出木鱼并击打
    lastActAt.muyu = 0;
    doAct('muyu');
    out.muyu = { pose: currentPose, propVisible: !!(me && me.muyuProp && me.muyuProp.visible) };

    // 5) 疾行：双击「左右」不该触发；双击「前进」才触发；长按只是慢走
    const down = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
    const up = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    const resetSprint = () => { sprinting = false; me.setRunning(false); lastMoveKey = ''; lastMoveKeyAt = 0; };

    // 双击左右：第二次按下后仍不应疾行
    resetSprint();
    down('KeyD'); up('KeyD'); down('KeyD');
    out.sprintBySide = sprinting;                    // 期望 false
    up('KeyD');

    // 双击前进：第二次按下后应进入疾行（keyup 会立刻取消，所以要在 keyup 前读）
    resetSprint();
    down('KeyW'); up('KeyW'); down('KeyW');
    out.sprintByForward = sprinting;                 // 期望 true
    up('KeyW');

    // 只按一次并长按：不应疾行
    resetSprint();
    down('KeyW');
    out.sprintOnHold = sprinting;                    // 期望 false
    up('KeyW');
    resetSprint();

    // 6) 画作上墙：画两笔 → 导出 → 贴到画墙
    paint.strokes.push({ color: '#3a5b8c', width: 10, pts: [{ x: 80, y: 120 }, { x: 300, y: 260 }, { x: 200, y: 460 }] });
    paint.redraw();
    const url = paint.post();
    out.paint = { bytes: url ? url.length : 0, isJpeg: !!url && url.startsWith('data:image/jpeg;') };
    if (url) world.addPainting({ id: 'selftest_1', src: url, name: '自检' });
    out.paint.onWall = !!(world.paintSlots && world.paintSlots[0] && world.paintSlots[0].material.map);

    // 6) 碰撞体数量（墙 5 + 供案 + 神像 + 8 个建造区 = 15 个盒体，8 根檐柱）
    out.colliders = {
      boxes: (world.colliders.boxes || []).length,
      circles: (world.colliders.circles || []).length
    };

    out.pass = out.wall.blocked && !out.sitOutside.allowed && out.sitInside.ok
      && out.muyu.propVisible && out.paint.isJpeg && out.paint.onWall
      && out.sprintByForward && !out.sprintBySide && !out.sprintOnHold
      && out.colliders.boxes >= 15 && out.colliders.circles >= 8;
    document.body.dataset.selftest = JSON.stringify(out);
  };
  if (me) runCheck(); else window.addEventListener('sq:ready', runCheck, { once: true });
}

// ?preview=1&selftest=move 自检：验证「前进方向 = 镜头朝向」
// 把镜头转到 90°，按住前进键推进若干帧，比较位移方向与镜头前向是否一致。
// 结果写在 body[data-selftest]，供无头浏览器与部署后回归读取，不影响正常访问。
// 说明：无头环境的 requestAnimationFrame 常被虚拟时钟冻结，所以这里手动推进
// world.update / tickMove——走的仍是正式代码路径，不是另写一套假逻辑。
if (previewParams.get('selftest') === 'move') {
  const runMove = () => {
    if (!me) { document.body.dataset.selftest = 'no-avatar'; return; }
    world.orbit(-Math.PI / 2 / 0.0042, 0);          // 镜头转到 90°
    for (let i = 1; i <= 20; i++) world.update(0.05, i * 0.05);  // 让阻尼收敛
    const yaw = world.getYaw();
    const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const p0 = { x: me.group.position.x, z: me.group.position.z };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    for (let i = 0; i < 12; i++) tickMove(0.05);     // 按前进键推进 0.6 秒
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    const dx = me.group.position.x - p0.x, dz = me.group.position.z - p0.z;
    const len = Math.hypot(dx, dz);
    const dot = len > 0.01 ? (dx / len) * fwd.x + (dz / len) * fwd.z : 0;
    document.body.dataset.selftest = JSON.stringify({
      yaw: +yaw.toFixed(3),
      camForward: { x: +fwd.x.toFixed(3), z: +fwd.z.toFixed(3) },
      moved: { dx: +dx.toFixed(3), dz: +dz.toFixed(3) },
      alignDot: +dot.toFixed(3),
      pass: dot > 0.99 && len > 0.5
    });
  };
  if (me) runMove(); else window.addEventListener('sq:ready', runMove, { once: true });
}
