import * as THREE from 'three';

/**
 * 程序化贴图与粒子。
 * 为什么全部用 Canvas 现画：不依赖任何外部图片、不消耗额度、离线可跑，
 * 换风格只要改这里的绘制函数，不需要重新导出资产。
 */

const FONT = '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
const KAITI = '"KaiTi","STKaiti","SimSun","Songti SC",serif';

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTex(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  return t;
}

function rand(seed) {
  // 固定种子的伪随机，保证每次刷新纹理一致，不会有闪烁感
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function noise(ctx, w, h, count, seed, alpha = 0.05) {
  const r = rand(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h;
    ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    ctx.fillRect(x, y, 1 + r() * 2, 1 + r() * 2);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function brick() {
  const c = cv(512, 512), x = c.getContext('2d'), r = rand(11);
  x.fillStyle = '#bab7a6'; x.fillRect(0, 0, 512, 512);
  const bh = 64, bw = 128;
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? -bw / 2 : 0;
    for (let col = -1; col < 5; col++) {
      const px = col * bw + off + 3, py = row * bh + 3;
      const v = 170 + Math.floor(r() * 18);
      x.fillStyle = `rgb(${v + 6},${v + 4},${v - 8})`;
      x.fillRect(px, py, bw - 6, bh - 6);
      x.strokeStyle = 'rgba(120,110,92,.40)'; x.lineWidth = 2;
      x.strokeRect(px, py, bw - 6, bh - 6);
      x.fillStyle = `rgba(120,140,110,${0.02 + r() * 0.035})`;
      x.fillRect(px + 4, py + bh - 14, bw - 14, 6);
    }
  }
  noise(x, 512, 512, 4200, 77, 0.035);
  return toTex(c, 20, 20);
}

function wood() {
  const c = cv(256, 512), x = c.getContext('2d'), r = rand(23);
  x.fillStyle = '#953e2d'; x.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 90; i++) {
    const px = r() * 256;
    x.strokeStyle = `rgba(${40 + r() * 40},${10 + r() * 15},${8 + r() * 12},${0.12 + r() * 0.2})`;
    x.lineWidth = 0.5 + r() * 2;
    x.beginPath(); x.moveTo(px, 0);
    for (let y = 0; y <= 512; y += 32) x.lineTo(px + Math.sin(y / 60 + i) * 3, y);
    x.stroke();
  }
  x.fillStyle = 'rgba(255,190,140,.08)'; x.fillRect(0, 0, 14, 512);
  noise(x, 256, 512, 1600, 31, 0.05);
  return toTex(c, 1, 2);
}

function tile() {
  const c = cv(256, 256), x = c.getContext('2d');
  x.fillStyle = '#8d98a0'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    const px = i * 32;
    const g = x.createLinearGradient(px, 0, px + 32, 0);
    g.addColorStop(0, '#717e89'); g.addColorStop(.45, '#b0bbc0'); g.addColorStop(1, '#717e89');
    x.fillStyle = g; x.fillRect(px, 0, 30, 256);
    x.strokeStyle = 'rgba(70,80,90,.48)'; x.lineWidth = 2;
    x.strokeRect(px, 0, 30, 256);
  }
  for (let y = 0; y < 256; y += 64) {
    x.fillStyle = 'rgba(20,26,34,.35)'; x.fillRect(0, y, 256, 3);
  }
  noise(x, 256, 256, 1800, 41, 0.04);
  return toTex(c, 8, 3);
}

function paper() {
  const c = cv(512, 720), x = c.getContext('2d'), r = rand(59);
  x.fillStyle = '#e9d395'; x.fillRect(0, 0, 512, 720);
  for (let i = 0; i < 900; i++) {
    x.strokeStyle = `rgba(${140 + r() * 40},${110 + r() * 40},${60 + r() * 40},${0.03 + r() * 0.05})`;
    x.lineWidth = 0.6;
    const px = r() * 512, py = r() * 720;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + r() * 30, py + r() * 6); x.stroke();
  }
  for (let i = 0; i < 26; i++) {
    x.fillStyle = `rgba(150,110,60,${0.02 + r() * 0.035})`;
    x.beginPath(); x.arc(r() * 512, r() * 720, 8 + r() * 28, 0, Math.PI * 2); x.fill();
  }
  const v = x.createRadialGradient(256, 360, 180, 256, 360, 430);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(90,60,20,.20)');
  x.fillStyle = v; x.fillRect(0, 0, 512, 720);
  x.strokeStyle = 'rgba(120,80,30,.35)'; x.lineWidth = 4;
  x.strokeRect(14, 14, 484, 692);
  return toTex(c);
}

function plaque(text = '三清殿') {
  const c = cv(1024, 256), x = c.getContext('2d');
  x.fillStyle = '#141a24'; x.fillRect(0, 0, 1024, 256);
  x.strokeStyle = '#c9a45c'; x.lineWidth = 10; x.strokeRect(14, 14, 996, 228);
  x.strokeStyle = 'rgba(201,164,92,.45)'; x.lineWidth = 2; x.strokeRect(30, 30, 964, 196);
  x.font = `bold 148px ${KAITI}`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#e6c67c';
  x.shadowColor = 'rgba(230,198,124,.55)'; x.shadowBlur = 24;
  x.fillText(text, 512, 134);
  x.shadowBlur = 0;
  // 两端云纹
  x.strokeStyle = 'rgba(201,164,92,.5)'; x.lineWidth = 5;
  for (const bx of [70, 954]) {
    x.beginPath();
    x.arc(bx, 128, 26, 0.4, 5.4);
    x.arc(bx + (bx < 500 ? 22 : -22), 128, 18, 3.4, 8.2);
    x.stroke();
  }
  return toTex(c);
}

function couplet(text) {
  const c = cv(128, 768), x = c.getContext('2d');
  x.fillStyle = '#3a1d18'; x.fillRect(0, 0, 128, 768);
  x.strokeStyle = '#c9a45c'; x.lineWidth = 5; x.strokeRect(9, 9, 110, 750);
  x.font = `bold 52px ${KAITI}`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#e3c27e';
  const chars = [...text];
  const step = Math.min(66, 700 / chars.length);
  const start = (768 - (chars.length - 1) * step) / 2;
  chars.forEach((ch, i) => x.fillText(ch, 64, start + i * step));
  return toTex(c);
}

function banner(text = '道炁长存') {
  const c = cv(128, 768), x = c.getContext('2d'), r = rand(87);
  x.fillStyle = '#1e3348'; x.fillRect(0, 0, 128, 768);
  x.strokeStyle = 'rgba(214,183,110,.5)'; x.lineWidth = 3;
  for (let y = 40; y < 768; y += 96) {
    x.beginPath(); x.arc(64, y, 26, 0.2, 2.9); x.stroke();
    x.beginPath(); x.arc(30, y + 40, 14, 3.2, 6.1); x.stroke();
  }
  x.fillStyle = 'rgba(10,18,30,.55)'; x.fillRect(20, 90, 88, 560);
  x.font = `bold 50px ${KAITI}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#e0c17e';
  const chars = [...text];
  const step = Math.min(72, 500 / chars.length);
  const start = (768 - (chars.length - 1) * step) / 2;
  chars.forEach((ch, i) => x.fillText(ch, 64, start + i * step));
  noise(x, 128, 768, 600, 91, 0.03);
  return toTex(c);
}

function taiji() {
  const c = cv(512, 512), x = c.getContext('2d');
  x.fillStyle = '#101d30'; x.fillRect(0, 0, 512, 512);
  x.translate(256, 256);
  // 八卦
  const trigrams = [
    [1, 1, 1], [0, 1, 1], [1, 0, 1], [0, 0, 1],
    [1, 1, 0], [0, 1, 0], [1, 0, 0], [0, 0, 0]
  ];
  x.strokeStyle = '#c9a45c'; x.lineWidth = 7;
  for (let i = 0; i < 8; i++) {
    x.save(); x.rotate((i * Math.PI) / 4);
    for (let j = 0; j < 3; j++) {
      const y = -206 + j * 22;
      const t = trigrams[i][j];
      if (t) { x.beginPath(); x.moveTo(-42, y); x.lineTo(42, y); x.stroke(); }
      else {
        x.beginPath(); x.moveTo(-42, y); x.lineTo(-10, y); x.stroke();
        x.beginPath(); x.moveTo(10, y); x.lineTo(42, y); x.stroke();
      }
    }
    x.restore();
  }
  x.beginPath(); x.arc(0, 0, 150, 0, Math.PI * 2);
  x.strokeStyle = '#c9a45c'; x.lineWidth = 6; x.stroke();
  // 阴阳鱼
  x.fillStyle = '#e8dcc0'; x.beginPath(); x.arc(0, 0, 142, -Math.PI / 2, Math.PI / 2); x.fill();
  x.fillStyle = '#132238'; x.beginPath(); x.arc(0, 0, 142, Math.PI / 2, Math.PI * 1.5); x.fill();
  x.fillStyle = '#e8dcc0'; x.beginPath(); x.arc(0, -71, 71, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#132238'; x.beginPath(); x.arc(0, 71, 71, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#132238'; x.beginPath(); x.arc(0, -71, 20, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#e8dcc0'; x.beginPath(); x.arc(0, 71, 20, 0, Math.PI * 2); x.fill();
  return toTex(c);
}

function halo() {
  const c = cv(512, 512), x = c.getContext('2d');
  const g = x.createRadialGradient(256, 256, 10, 256, 256, 250);
  g.addColorStop(0, 'rgba(255,238,190,.95)');
  g.addColorStop(.25, 'rgba(255,205,120,.55)');
  g.addColorStop(.6, 'rgba(226,166,72,.18)');
  g.addColorStop(1, 'rgba(226,166,72,0)');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function softDot(color = '255,255,255') {
  const c = cv(128, 128), x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, `rgba(${color},.85)`);
  g.addColorStop(.35, `rgba(${color},.28)`);
  g.addColorStop(1, `rgba(${color},0)`);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeNameTexture(name, gender = 'm') {
  const c = cv(512, 128), x = c.getContext('2d');
  const accent = gender === 'f' ? '#e0a9c0' : '#9fc4d8';
  x.fillStyle = 'rgba(9,16,27,.80)';
  roundRect(x, 8, 14, 496, 98, 44); x.fill();
  x.strokeStyle = accent; x.lineWidth = 3; x.stroke();
  x.font = `bold 52px ${FONT}`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#f2e6cf';
  x.fillText(String(name || '道童').slice(0, 8), 256, 65);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 表情气泡：只有服务端下发的枚举图形 + 可选方位文本，永不含用户自由输入 */
export function makeBubbleTexture(glyph, label, geoText) {
  const c = cv(640, 224), x = c.getContext('2d');
  x.fillStyle = 'rgba(246,238,216,.96)';
  roundRect(x, 10, 10, 620, 168, 44); x.fill();
  x.strokeStyle = '#b98b45'; x.lineWidth = 5; x.stroke();
  // 小尖角
  x.beginPath(); x.moveTo(290, 176); x.lineTo(320, 216); x.lineTo(350, 176); x.closePath();
  x.fillStyle = 'rgba(246,238,216,.96)'; x.fill();
  x.font = `bold 92px ${KAITI}`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#a4342c';
  x.fillText(String(glyph || '☯').slice(0, 1), 96, 96);
  x.textAlign = 'left';
  x.font = `bold 46px ${FONT}`; x.fillStyle = '#3a2b1c';
  x.fillText(String(label || '').slice(0, 6), 178, 72);
  if (geoText) {
    x.font = `30px ${FONT}`; x.fillStyle = '#7a6245';
    x.fillText(String(geoText).slice(0, 18), 178, 130);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let _tex = null;
export function TEX() {
  if (_tex) return _tex;
  _tex = {
    brick: brick(), wood: wood(), tile: tile(), paper: paper(),
    plaque: plaque(),
    coupletL: couplet('道生一一生二二生三三生万物'),
    coupletR: couplet('人法地地法天天法道道法自然'),
    bannerA: banner('道炁长存'), bannerB: banner('清静无为'),
    taiji: taiji(), halo: halo(), glow: softDot('255,238,200'),
    smoke: softDot('205,214,224'), star: softDot('220,235,255')
  };
  return _tex;
}

/** 香烟：从香炉向上飘，带横向摆动；低画质时粒子数减半 */
export class Smoke {
  constructor(scene, origin = new THREE.Vector3(0, 1.9, -6.4), quality = 'high') {
    this.origin = origin.clone();
    this.count = quality === 'low' ? 46 : 120;
    this.pos = new Float32Array(this.count * 3);
    this.speed = new Float32Array(this.count);
    this.seed = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) this.reset(i, Math.random() * 3.6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({
      map: TEX().smoke, size: 0.42, transparent: true, opacity: 0.20,
      depthWrite: false, sizeAttenuation: true, color: 0xb9c6d4
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  reset(i, y = 0) {
    const k = i * 3;
    this.pos[k] = this.origin.x + (Math.random() - .5) * .28;
    this.pos[k + 1] = this.origin.y + y;
    this.pos[k + 2] = this.origin.z + (Math.random() - .5) * .28;
    this.speed[i] = .20 + Math.random() * .30;
    this.seed[i] = Math.random() * 10;
  }
  update(dt, t) {
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      this.pos[k + 1] += this.speed[i] * dt;
      this.pos[k] = this.origin.x + Math.sin(t * .6 + this.seed[i] + this.pos[k + 1] * .8) * (.10 + this.pos[k + 1] * .035);
      this.pos[k + 2] = this.origin.z + Math.cos(t * .4 + this.seed[i]) * .09;
      if (this.pos[k + 1] > this.origin.y + 3.8) this.reset(i, 0);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
  setVisible(v) { this.points.visible = v; }
}

/** 环境灵光：缓慢漂浮的金色微粒 */
export class Fireflies {
  constructor(scene, quality = 'high') {
    this.count = quality === 'low' ? 30 : 110;
    this.pos = new Float32Array(this.count * 3);
    this.phase = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3] = (Math.random() - .5) * 26;
      this.pos[i * 3 + 1] = .4 + Math.random() * 6.5;
      this.pos[i * 3 + 2] = -12 + Math.random() * 30;
      this.phase[i] = Math.random() * 10;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({
      map: TEX().glow, size: 0.17, transparent: true, opacity: .65,
      depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd58a
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  update(dt, t) {
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      this.pos[k + 1] += Math.sin(t * .5 + this.phase[i]) * dt * .12;
      this.pos[k] += Math.cos(t * .3 + this.phase[i]) * dt * .08;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
  setVisible(v) { this.points.visible = v; }
}

/** 一次性金光：叩拜、跳跃落地、敕符时触发 */
export class Sparks {
  constructor(scene, max = 90) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -999;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({
      map: TEX().glow, size: .22, transparent: true, opacity: .9,
      depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffcf7a
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
  }
  burst(p, n = 14, power = 1) {
    for (let j = 0; j < n; j++) {
      const i = this.cursor++ % this.max, k = i * 3;
      this.pos[k] = p.x; this.pos[k + 1] = p.y; this.pos[k + 2] = p.z;
      const a = Math.random() * Math.PI * 2;
      const s = (.45 + Math.random() * .9) * power;
      this.vel[k] = Math.cos(a) * s;
      this.vel[k + 1] = (.7 + Math.random() * 1.3) * power;
      this.vel[k + 2] = Math.sin(a) * s;
      this.life[i] = .6 + Math.random() * .5;
    }
  }
  update(dt) {
    let dirty = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      dirty = true;
      const k = i * 3;
      this.life[i] -= dt;
      this.vel[k + 1] -= dt * 2.2;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.life[i] <= 0) this.pos[k + 1] = -999;
    }
    if (dirty) this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** 带文字的平面（匾额、楹联、幡），统一走这里方便复用 */
export function textPlane(texture, w, h, opts = {}) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: texture, transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
      side: THREE.DoubleSide, depthWrite: opts.depthWrite ?? true,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending
    })
  );
  return m;
}


/** 晨光天空：上蓝下暖的竖向渐变，直接作为 scene.background 铺满。 */
export function makeSkyTexture() {
  const c = cv(512, 512), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#6ea9d2');
  g.addColorStop(.40, '#b6dcea');
  g.addColorStop(.72, '#e8eee0');
  g.addColorStop(1, '#f7e3bd');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  // 几缕淡云，避免纯色天空太板
  x.globalAlpha = .16; x.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) {
    x.beginPath();
    x.ellipse(60 + i * 88, 150 + (i % 3) * 46, 90, 13, 0, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
