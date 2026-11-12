'use strict';

/**
 * 全局配置。所有常量前后端必须一致，席位坐标由服务端下发，前端不自行推算。
 * 改这里就能调容量：HALLS.length * SEATS_PER_HALL 即总席位。
 */
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const SEATS_PER_HALL = 108;          // 呼应一百零八，也方便承载 200 人
const SEAT_COLS = 9;
const SEAT_GAP_X = 2.00;
const SEAT_GAP_Z = 1.90;
const SEAT_Z0 = -11.0;

const HALLS = [
  { id: 'sanqing', name: '三清殿', subtitle: '玉清 · 上清 · 太清' },
  { id: 'yuxu',    name: '玉虚殿', subtitle: '静室 · 清微' },
  { id: 'zixiao',  name: '紫霄殿', subtitle: '静室 · 紫霄' },
  { id: 'qingwei', name: '清微殿', subtitle: '静室 · 清虚' }
];

// 席位坐标：服务端权威，前端只按 index 取用
function seatPos(i) {
  const col = i % SEAT_COLS;
  const row = Math.floor(i / SEAT_COLS);
  return {
    i,
    x: +((col - (SEAT_COLS - 1) / 2) * SEAT_GAP_X).toFixed(3),
    z: +(SEAT_Z0 + row * SEAT_GAP_Z).toFixed(3)
  };
}
const SEATS = Array.from({ length: SEATS_PER_HALL }, (_, i) => seatPos(i));

const TICK_MS = 100;               // 10Hz 增量广播
const SNAPSHOT_MS = 5000;          // 全量快照兜底
const STATS_MS = 2000;             // 全局共修统计
const HEARTBEAT_MS = 20000;        // 心跳
const DEAD_MS = 45000;             // 无响应判定
const MAX_MSG_PER_SEC = 20;        // 上行令牌桶
const MAX_TALISMAN_CHARS = 120 * 1024;
const MAX_TALISMAN_KEEP = 12;
// 画作：JPEG 白纸底，400×520 大约 30~60KB base64，给到 190KB 余量
const MAX_PAINT_CHARS = 190 * 1024;
const MAX_PAINT_KEEP = 8;
const MAX_MESSAGE_BYTES = 320 * 1024;
const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const MAX_CLIENTS = 1000;          // 硬上限，防单机被打爆

const POSES = ['stand', 'walk', 'sit', 'bow', 'bow3', 'palms', 'write', 'chant', 'muyu'];
// jump 是一次性动作（不是持续姿态），所以放在 ACTS 里由事件触发
const ACTS = ['bow', 'bead', 'chant', 'talisman', 'palms', 'jump', 'muyu'];
// 动作冷却（毫秒）：防止脚本刷功德，也让画面动作不抽搐
const COOLDOWN = {
  bow: 260, bead: 70, chant: 420, talisman: 1500, palms: 320, jump: 700,
  muyu: 100, paint: 4000,
  pose: 110, move: 60, seat: 300, greet: 2200, look: 600, rename: 1200
};
// 可走动范围：跟着扩建后的山林一起放大（地图 156×156 步）
const BOUNDS = { minX: -78, maxX: 78, minZ: -52, maxZ: 104 };
// 大殿内部范围：只有站在这里才能打坐（殿外按打坐只提示、不落座）
const HALL_ZONE = { halfX: 14.6, backZ: -27.0, frontZ: 15.0 };
function insideHall(x, z) {
  return Math.abs(x) <= HALL_ZONE.halfX && z >= HALL_ZONE.backZ && z <= HALL_ZONE.frontZ;
}

// 形象：道士 / 道姑。只是外观枚举，不涉及账号、性别资料采集。
const GENDERS = ['m', 'f'];
const GENDER_LABEL = { m: '道士', f: '道姑' };

// 表情是枚举 ID，客户端只能传 0..7 的整数，不能传任何文字。
// 用汉字/道门符号而不是 emoji，避免跨设备字体差异，也更贴题材。
const EMOJIS = [
  { id: 0, glyph: '☯', label: '太极' },
  { id: 1, glyph: '稽', label: '稽首' },
  { id: 2, glyph: '莲', label: '青莲' },
  { id: 3, glyph: '云', label: '祥云' },
  { id: 4, glyph: '鹤', label: '白鹤' },
  { id: 5, glyph: '香', label: '心香' },
  { id: 6, glyph: '静', label: '清静' },
  { id: 7, glyph: '安', label: '安泰' }
];
const GREET_BUBBLE_MS = 3500;

// IP 归属地：只信任「来自本机 / 私网反代」的 X-Forwarded-For（等价 Express 的
// loopback, linklocal, uniquelocal），公网直连永远不信任，所以外部访客伪造不了国家省份。
// 云平台 / Nginx / Docker 反代都能因此读到真实访客 IP；设 TRUST_PROXY=false 可完全关闭。
const TRUST_PROXY = process.env.TRUST_PROXY !== 'false';
const TRUSTED_PROXIES = (process.env.TRUSTED_PROXIES || '127.0.0.1,::1').split(',').map(s => s.trim()).filter(Boolean);
const GEO_ENABLED = process.env.GEO_ENABLED !== 'false';

module.exports = {
  PORT, HOST, HALLS, SEATS, SEATS_PER_HALL, SEAT_COLS,
  TICK_MS, SNAPSHOT_MS, STATS_MS, HEARTBEAT_MS, DEAD_MS,
  MAX_MSG_PER_SEC, MAX_TALISMAN_CHARS, MAX_TALISMAN_KEEP,
  MAX_PAINT_CHARS, MAX_PAINT_KEEP,
  MAX_MESSAGE_BYTES, MAX_FRAME_BYTES, MAX_CLIENTS,
  POSES, ACTS, COOLDOWN, BOUNDS, HALL_ZONE, insideHall, seatPos,
  GENDERS, GENDER_LABEL, EMOJIS, GREET_BUBBLE_MS,
  TRUST_PROXY, TRUSTED_PROXIES, GEO_ENABLED
};
