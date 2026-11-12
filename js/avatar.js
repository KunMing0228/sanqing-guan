import * as THREE from 'three';
import { TEX, makeNameTexture, makeBubbleTexture } from './fx.js';

/**
 * Q 版卡通道童（三头身幼态）。
 * 硬性口径：圆头短身、圆点眼、腮红，没有鼻梁/嘴唇/成熟眉眼/写实比例/成人身形。
 * 道士与道姑只靠发髻 / 莲花冠 / 裙裾 / 配色区分，可爱度完全一致。
 *
 * 结构上分两层：外层 group 只放世界坐标与朝向（由网络层驱动），
 * 内层 inner 承担所有动画偏移，这样动画永远不会覆盖同步过来的位置。
 */

export const ROBE_COLORS = {
  '玄青': 0x2b425d, '月白': 0xdde3dd, '赭黄': 0xb8843c, '苍绿': 0x4f7d6a,
  '藕荷': 0xc98fa8, '霜色': 0xc6d2da, '墨蓝': 0x20304f, '檀褐': 0x8a6247,
  '杏黄': 0xd7b45e, '黛紫': 0x6b5888
};
export const DEFAULT_ROBE = '玄青';

const GEO = {};
const MAT = {};

function g() {
  if (GEO.ready) return GEO;
  // 道袍轮廓：下摆宽、肩窄，用 Lathe 旋转成型
  // 下摆抬到 0.26（膝上），露出下面两条小腿和布鞋——走路时能看见腿交替在动
  const robeM = [
    [0.00, 0.26], [0.30, 0.26], [0.33, 0.30], [0.30, 0.38],
    [0.25, 0.46], [0.21, 0.53], [0.19, 0.58], [0.00, 0.60]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const robeF = [
    [0.00, 0.26], [0.36, 0.26], [0.38, 0.30], [0.33, 0.39],
    [0.26, 0.47], [0.21, 0.54], [0.19, 0.58], [0.00, 0.60]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  GEO.robeM = new THREE.LatheGeometry(robeM, 18);
  GEO.robeF = new THREE.LatheGeometry(robeF, 18);
  GEO.head = new THREE.SphereGeometry(0.34, 20, 16);
  GEO.hairCap = new THREE.SphereGeometry(0.348, 20, 12, 0, Math.PI * 2, 0, 1.02);
  GEO.bun = new THREE.SphereGeometry(0.115, 12, 10);
  GEO.eye = new THREE.SphereGeometry(0.033, 10, 8);
  GEO.blush = new THREE.SphereGeometry(0.058, 10, 8);
  GEO.hand = new THREE.SphereGeometry(0.088, 12, 10);
  GEO.sleeve = new THREE.SphereGeometry(0.135, 12, 10);
  GEO.foot = new THREE.SphereGeometry(0.105, 10, 8);
  GEO.leg = new THREE.CylinderGeometry(0.075, 0.066, 0.28, 8);
  GEO.muyu = new THREE.SphereGeometry(0.155, 14, 12);
  GEO.mallet = new THREE.CylinderGeometry(0.022, 0.022, 0.26, 6);
  GEO.malletHead = new THREE.SphereGeometry(0.062, 10, 8);
  GEO.belt = new THREE.TorusGeometry(0.245, 0.026, 8, 20);
  GEO.skirtEdge = new THREE.TorusGeometry(0.345, 0.028, 8, 24);
  GEO.pin = new THREE.CylinderGeometry(0.014, 0.014, 0.40, 8);
  GEO.crown = new THREE.ConeGeometry(0.14, 0.16, 8);
  GEO.collar = new THREE.BoxGeometry(0.055, 0.30, 0.02);
  GEO.ready = true;
  return GEO;
}

function m() {
  if (MAT.ready) return MAT;
  MAT.skin = new THREE.MeshStandardMaterial({ color: 0xf6d9bd, roughness: .9, metalness: 0 });
  MAT.hair = new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: .85 });
  MAT.eye = new THREE.MeshBasicMaterial({ color: 0x241f1e });
  MAT.blush = new THREE.MeshBasicMaterial({ color: 0xef9b9b, transparent: true, opacity: .72 });
  MAT.belt = new THREE.MeshStandardMaterial({ color: 0xd9b46a, roughness: .6, metalness: .2 });
  MAT.pin = new THREE.MeshStandardMaterial({ color: 0xb99a6a, roughness: .7 });
  MAT.crown = new THREE.MeshStandardMaterial({ color: 0xe6c984, roughness: .5, metalness: .35 });
  MAT.woodFish = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: .72 });
  MAT.leg = new THREE.MeshStandardMaterial({ color: 0x4a4653, roughness: .9 });
  MAT.woodLight = new THREE.MeshStandardMaterial({ color: 0xc79a5c, roughness: .7 });
  MAT.robes = new Map();
  MAT.ready = false; // 下面再置 true，避免和 GEO.ready 混淆
  MAT.ready = true;
  return MAT;
}

function robeMaterial(name) {
  const M = m();
  const key = ROBE_COLORS[name] !== undefined ? name : DEFAULT_ROBE;
  if (!M.robes.has(key)) {
    M.robes.set(key, new THREE.MeshStandardMaterial({
      color: ROBE_COLORS[key], roughness: .86, metalness: .02,
      flatShading: false
    }));
  }
  return M.robes.get(key);
}

function lerp(a, b, t) { return a + (b - a) * t; }

export class Avatar {
  constructor(info = {}) {
    g(); m();
    this.id = info.id || 'local';
    this.name = info.name || '清虚散人';
    this.gender = info.gender === 'f' ? 'f' : 'm';
    this.robe = info.robe || DEFAULT_ROBE;
    this.pose = info.pose || 'sit';
    this.npc = !!info.npc;
    // 坐在蒲团上的人要抬到蒲团顶面(y≈0.17)，站着的贴地；由 seat/unseat 事件同步。
    this.seated = !(info.seat === null || info.seat === undefined);
    this.groundY = 0;           // 平滑后的地面高度
    this.groundTarget = 0;     // 目标地面高度（由 main.js 按坐标算出）
    this.faceLocked = true;    // 打坐/叩拜时锁死朝向三清
    this.faceTarget = Math.PI; // 面朝 -Z
    this.running = false;
    this.lod = 0;
    this.jumpT = -1;
    this.bubbleT = 0;
    this.phase = Math.random() * 10;

    this.group = new THREE.Group();
    this.group.position.set(info.x || 0, 0, info.z || 0);
    this.group.rotation.y = info.r || 0;
    this.inner = new THREE.Group();
    this.group.add(this.inner);

    // ---- 身体 ----
    this.robeMesh = new THREE.Mesh(this.gender === 'f' ? GEO.robeF : GEO.robeM, robeMaterial(this.robe));
    this.robeMesh.castShadow = false;
    this.inner.add(this.robeMesh);

    this.belt = new THREE.Mesh(GEO.belt, MAT.belt);
    this.belt.rotation.x = Math.PI / 2;
    this.belt.position.y = 0.35;
    this.inner.add(this.belt);

    this.skirtEdge = new THREE.Mesh(GEO.skirtEdge, MAT.belt);
    this.skirtEdge.rotation.x = Math.PI / 2;
    this.skirtEdge.position.y = 0.26;
    this.skirtEdge.visible = this.gender === 'f';
    this.inner.add(this.skirtEdge);

    // 交领 / 对襟：两条细色块，不做写实布料
    this.collarA = new THREE.Mesh(GEO.collar, MAT.belt);
    this.collarB = new THREE.Mesh(GEO.collar, MAT.belt);
    this.collarA.position.set(-0.075, 0.50, 0.185);
    this.collarB.position.set(0.075, 0.50, 0.185);
    this.collarA.rotation.z = 0.42;
    this.collarB.rotation.z = -0.42;
    this.inner.add(this.collarA, this.collarB);
    this.setCollarStyle();

    this.sleeveL = new THREE.Mesh(GEO.sleeve, robeMaterial(this.robe));
    this.sleeveR = new THREE.Mesh(GEO.sleeve, robeMaterial(this.robe));
    this.sleeveL.scale.set(1, .8, 1);
    this.sleeveR.scale.set(1, .8, 1);
    this.inner.add(this.sleeveL, this.sleeveR);

    this.handL = new THREE.Mesh(GEO.hand, MAT.skin);
    this.handR = new THREE.Mesh(GEO.hand, MAT.skin);
    this.inner.add(this.handL, this.handR);

    this.footL = new THREE.Mesh(GEO.foot, MAT.hair);
    this.footR = new THREE.Mesh(GEO.foot, MAT.hair);
    this.footL.scale.set(1.25, .55, 1);
    this.footR.scale.set(1.25, .55, 1);
    this.inner.add(this.footL, this.footR);

    // ---- 腿：站立/走动时露在袍摆下面，走动交替摆动；坐下收起 ----
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.legL.position.set(-0.115, 0.31, 0);
    this.legR.position.set(0.115, 0.31, 0);
    for (const [leg, shoe] of [[this.legL, -1], [this.legR, 1]]) {
      const thigh = new THREE.Mesh(GEO.leg, MAT.leg);
      thigh.position.y = -0.14;
      leg.add(thigh);
      const s = new THREE.Mesh(GEO.foot, MAT.hair);
      s.scale.set(1.15, .5, 1.25);
      s.position.set(shoe * 0.005, -0.295, 0.03);
      leg.add(s);
    }
    this.inner.add(this.legL, this.legR);
    this.legL.visible = this.legR.visible = false;

    // ---- 木鱼 + 木槌：敲木鱼时才出现，摆在身前地上 ----
    this.muyuProp = new THREE.Group();
    this.muyuProp.position.set(0.02, 0.18, 0.30);
    const fish = new THREE.Mesh(GEO.muyu, MAT.woodFish);
    fish.scale.set(1.2, .85, 1.0);
    this.muyuProp.add(fish);
    // 开口朝上，看得出是木鱼而不是一块木头
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.05), MAT.hair);
    slit.position.set(0, 0.10, 0.04);
    this.muyuProp.add(slit);
    this.mallet = new THREE.Group();
    this.mallet.position.set(0.22, 0.16, 0.26);
    const stick = new THREE.Mesh(GEO.mallet, MAT.woodLight);
    stick.position.y = 0.02;
    stick.rotation.z = -0.5;
    this.mallet.add(stick);
    const head = new THREE.Mesh(GEO.malletHead, MAT.woodLight);
    head.position.set(-0.07, 0.13, 0);
    this.mallet.add(head);
    this.inner.add(this.muyuProp, this.mallet);
    this.muyuProp.visible = this.mallet.visible = false;
    this.muyuOn = false;
    this.muyuHit = -1;

    // ---- 头 ----
    this.head = new THREE.Group();
    this.head.position.y = 0.83;
    this.inner.add(this.head);
    this.face = new THREE.Mesh(GEO.head, MAT.skin);
    this.head.add(this.face);
    this.hairCap = new THREE.Mesh(GEO.hairCap, MAT.hair);
    this.hairCap.position.y = 0.005;
    this.head.add(this.hairCap);

    this.eyeL = new THREE.Mesh(GEO.eye, MAT.eye);
    this.eyeR = new THREE.Mesh(GEO.eye, MAT.eye);
    this.eyeL.position.set(-0.125, 0.005, 0.318);
    this.eyeR.position.set(0.125, 0.005, 0.318);
    this.head.add(this.eyeL, this.eyeR);

    this.blushL = new THREE.Mesh(GEO.blush, MAT.blush);
    this.blushR = new THREE.Mesh(GEO.blush, MAT.blush);
    this.blushL.position.set(-0.215, -0.085, 0.255);
    this.blushR.position.set(0.215, -0.085, 0.255);
    this.blushL.scale.set(1, .55, .25);
    this.blushR.scale.set(1, .55, .25);
    this.head.add(this.blushL, this.blushR);

    // 男：单发髻 + 木簪；女：双环髻 + 小莲花冠 + 圆润鬓发
    this.maleHair = new THREE.Group();
    const bun = new THREE.Mesh(GEO.bun, MAT.hair); bun.position.y = 0.345;
    const pin = new THREE.Mesh(GEO.pin, MAT.pin);
    pin.rotation.z = Math.PI / 2; pin.position.y = 0.345;
    this.maleHair.add(bun, pin);
    this.head.add(this.maleHair);

    this.femaleHair = new THREE.Group();
    for (const sx of [-1, 1]) {
      const loop = new THREE.Mesh(GEO.bun, MAT.hair);
      loop.scale.set(1.15, 1.15, 1.15);
      loop.position.set(sx * 0.215, 0.285, -0.02);
      this.femaleHair.add(loop);
      const side = new THREE.Mesh(GEO.hand, MAT.hair);
      side.scale.set(.62, 1.25, .6);
      side.position.set(sx * 0.295, -0.10, 0.10);
      this.femaleHair.add(side);
    }
    const crown = new THREE.Mesh(GEO.crown, MAT.crown);
    crown.position.set(0, 0.40, 0);
    this.femaleHair.add(crown);
    this.head.add(this.femaleHair);
    this.maleHair.visible = this.gender === 'm';
    this.femaleHair.visible = this.gender === 'f';

    // ---- 名牌 / 表情气泡 ----
    this.nameTex = makeNameTexture(this.name, this.gender);
    this.nameMat = new THREE.SpriteMaterial({ map: this.nameTex, transparent: true, depthTest: false, depthWrite: false });
    this.nameSprite = new THREE.Sprite(this.nameMat);
    this.nameSprite.scale.set(1.10, 0.275, 1);
    this.nameSprite.position.y = 1.48;
    this.nameSprite.renderOrder = 20;
    this.inner.add(this.nameSprite);

    this.bubbleMat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, opacity: 1 });
    this.bubbleSprite = new THREE.Sprite(this.bubbleMat);
    this.bubbleSprite.scale.set(1.62, 0.567, 1);
    this.bubbleSprite.position.y = 1.98;
    this.bubbleSprite.renderOrder = 21;
    this.bubbleSprite.visible = false;
    this.inner.add(this.bubbleSprite);

    // 略放大一点，在 108 个蒲团的尺度下人物才不会被场景吃掉；仍保持三头身幼态
    this.group.scale.setScalar(this.npc ? 1.30 : 1.62);
    this.target = { bend: 0, y: 0, sy: 1, hx: .26, hy: .40, headTilt: 0, bob: 0 };
    this.setPose(this.pose);
    this.applyLOD();
  }

  setCollarStyle() {
    if (this.gender === 'f') {
      this.collarA.rotation.z = 0; this.collarB.rotation.z = 0;
      this.collarA.position.set(-0.055, 0.48, 0.19);
      this.collarB.position.set(0.055, 0.48, 0.19);
    } else {
      this.collarA.rotation.z = 0.42; this.collarB.rotation.z = -0.42;
      this.collarA.position.set(-0.075, 0.50, 0.185);
      this.collarB.position.set(0.075, 0.50, 0.185);
    }
  }

  setAppearance({ gender, robe, name } = {}) {
    if (gender && (gender === 'm' || gender === 'f')) this.gender = gender;
    if (robe) this.robe = robe;
    if (name) this.name = name;
    const gm = g();
    this.robeMesh.geometry = this.gender === 'f' ? gm.robeF : gm.robeM;
    const rm = robeMaterial(this.robe);
    this.robeMesh.material = rm;
    this.sleeveL.material = rm; this.sleeveR.material = rm;
    this.maleHair.visible = this.gender === 'm';
    this.femaleHair.visible = this.gender === 'f';
    this.skirtEdge.visible = this.gender === 'f';
    this.setCollarStyle();
    this.setNameTexture();
  }

  setNameTexture() {
    if (this.nameTex) this.nameTex.dispose();
    this.nameTex = makeNameTexture(this.name, this.gender);
    this.nameMat.map = this.nameTex;
    this.nameMat.needsUpdate = true;
  }

  setPose(p) {
    const valid = ['stand', 'walk', 'sit', 'bow', 'bow3', 'palms', 'write', 'chant', 'muyu'];
    this.pose = valid.includes(p) ? p : 'stand';
    const T = this.target;
    T.bend = 0; T.y = 0; T.sy = 1; T.hx = .26; T.hy = .40; T.headTilt = 0; T.bob = 0;
    // 除站立/走动外，所有仪式姿态都必须面朝三清，不允许各个方向拜
    const ritual = this.pose !== 'walk';
    if (ritual) { this.faceLocked = true; this.faceTarget = Math.PI; }
    else this.faceLocked = false;
    switch (this.pose) {
      case 'sit':    T.y = 0; T.sy = .82; T.hy = .30; T.hx = .22; break;
      // 叩拜不再绕脚底大幅前倾（那会把身子转进地里），改成小幅躬身 + 明显低头
      case 'bow':    T.bend = .38; T.headTilt = .24; T.hx = .055; T.hy = .46; break;
      case 'bow3':   T.bend = .46; T.headTilt = .28; T.hx = .055; T.hy = .46; break;
      case 'palms':  T.hx = .055; T.hy = .47; break;
      case 'write':  T.hx = .20; T.hy = .55; T.headTilt = .10; break;
      case 'chant':  T.hx = .20; T.hy = .38; break;
      case 'muyu':   T.sy = .84; T.hx = .17; T.hy = .34; T.headTilt = .06; break;
      case 'walk':   T.bob = 1; break;
      default: break;
    }
    // 站立/走动露出两条腿；坐下时收腿、改露朝前的鞋
    const onFoot = this.pose === 'walk' || this.pose === 'stand';
    this.legL.visible = this.legR.visible = onFoot;
    this.footL.visible = this.footR.visible = (this.pose === 'sit');
    if (this.pose === 'sit') {
      this.footL.position.set(-.17, .06, .16);
      this.footR.position.set(.17, .06, .16);
    }
    this.setMuyu(this.pose === 'muyu');
  }

  setMuyu(v) {
    this.muyuOn = !!v;
    this.muyuProp.visible = this.mallet.visible = this.muyuOn;
  }

  strikeMuyu() {
    if (!this.muyuOn) this.setMuyu(true);
    this.muyuHit = 0;
  }

  jump() { this.jumpT = 0; }

  showBubble(glyph, label, geoText, seconds = 3.5) {
    if (this.bubbleMat.map) this.bubbleMat.map.dispose();
    this.bubbleMat.map = makeBubbleTexture(glyph, label, geoText);
    this.bubbleMat.needsUpdate = true;
    this.bubbleSprite.visible = true;
    this.bubbleT = seconds;
    this.bubbleSprite.scale.set(1.62, .567, 1);
  }

  applyLOD() {
    const detail = this.lod === 0;
    const medium = this.lod <= 1;
    this.eyeL.visible = this.eyeR.visible = detail;
    this.blushL.visible = this.blushR.visible = detail;
    this.collarA.visible = this.collarB.visible = detail;
    this.belt.visible = medium;
    this.sleeveL.visible = this.sleeveR.visible = medium;
    this.handL.visible = this.handR.visible = medium;
    this.maleHair.visible = medium && this.gender === 'm';
    this.femaleHair.visible = medium && this.gender === 'f';
    this.nameSprite.visible = this.lod <= 1;
  }
  setLOD(level) {
    const l = Math.max(0, Math.min(2, level | 0));
    if (l === this.lod) return;
    this.lod = l;
    this.applyLOD();
  }

  setSeated(v) { this.seated = !!v; }

  setGroundY(v) { this.groundTarget = v; }

  setRunning(v) { this.running = !!v; }

  /** 走动时可自由转身；一旦落座/叩拜就锁回面朝三清 */
  setFacing(r, lock) {
    this.faceTarget = typeof r === 'number' ? r : Math.PI;
    this.faceLocked = lock !== false;
  }

  setPosition(x, z, r) {
    this.group.position.x = x;
    this.group.position.z = z;
    if (typeof r === 'number') this.group.rotation.y = r;
  }

  update(dt, t) {
    const T = this.target;
    const k = 1 - Math.pow(0.0008, Math.min(dt, .1));
    let jumpY = 0, squash = 0;
    if (this.jumpT >= 0) {
      this.jumpT += dt;
      const d = .72;
      if (this.jumpT >= d) { this.jumpT = -1; squash = 0; }
      else jumpY = Math.sin((this.jumpT / d) * Math.PI) * .58;
    }
    const breathe = Math.sin(t * 1.8 + this.phase) * .012;
    const gait = this.running ? 11 : 6;
    const walkBob = T.bob ? Math.abs(Math.sin(t * gait + this.phase)) * (this.running ? .10 : .055) : 0;
    // 基准高度：坐姿抬到蒲团面上，站姿贴地；叩拜前倾额外抬 0.10 补偿旋转，
    // 保证任何姿态身体最低点都在地面之上，不再出现身子陷入地下。
    this.groundY = lerp(this.groundY, this.groundTarget, Math.min(1, k * 1.6));
    const baseY = this.groundY + (this.seated ? 0.21 : 0.02) + (T.bend > 0 ? 0.10 : 0);
    this.inner.position.y = lerp(this.inner.position.y, baseY + T.y + jumpY + walkBob + squash, k);
    if (this.faceLocked) {
      let d = this.faceTarget - this.group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.group.rotation.y += d * Math.min(1, k * 1.4);
    }
    this.inner.rotation.x = lerp(this.inner.rotation.x, T.bend, k);
    this.robeMesh.scale.y = lerp(this.robeMesh.scale.y, T.sy + breathe, k);

    // 走路：两条小腿交替前后摆；站着不动自然垂下（长按慢走时幅度小，疾行幅度大）
    const legSwing = T.bob ? Math.sin(t * gait + this.phase) * (this.running ? .48 : .30) : 0;
    const lk = Math.min(1, k * 2.4);
    this.legL.rotation.x = lerp(this.legL.rotation.x, legSwing, lk);
    this.legR.rotation.x = lerp(this.legR.rotation.x, -legSwing, lk);

    // 木鱼：落槌后回弹
    if (this.muyuHit >= 0) {
      this.muyuHit += dt;
      const p = Math.min(1, this.muyuHit / .16);
      this.mallet.rotation.x = -.95 + p * .95;
      if (this.muyuHit >= .16) { this.muyuHit = -1; this.mallet.rotation.x = 0; }
    }
    this.head.rotation.x = lerp(this.head.rotation.x, T.headTilt + (this.pose === 'chant' ? Math.sin(t * 2.2 + this.phase) * .06 : 0), k);

    const hx = T.hx, hy = T.hy;
    this.handL.position.x = lerp(this.handL.position.x, -hx + (T.bob ? Math.sin(t * gait + this.phase) * (this.running ? .13 : .07) : 0), k);
    this.handR.position.x = lerp(this.handR.position.x, hx + (T.bob ? -Math.sin(t * gait + this.phase) * (this.running ? .13 : .07) : 0), k);
    this.handL.position.y = lerp(this.handL.position.y, hy, k);
    this.handR.position.y = lerp(this.handR.position.y, this.pose === 'write' ? .62 : hy, k);
    this.handL.position.z = lerp(this.handL.position.z, .20, k);
    this.handR.position.z = lerp(this.handR.position.z, this.pose === 'write' ? .30 : .20, k);
    this.sleeveL.position.set(this.handL.position.x * .9, hy - .02, .02);
    this.sleeveR.position.set(this.handR.position.x * .9, hy - .02, .02);

    if (this.bubbleT > 0) {
      this.bubbleT -= dt;
      this.bubbleSprite.position.y = 1.98 + Math.sin(t * 2.4 + this.phase) * .04;
      this.bubbleMat.opacity = Math.min(1, this.bubbleT * 2);
      if (this.bubbleT <= 0) this.bubbleSprite.visible = false;
    }
  }

  dispose() {
    if (this.nameTex) this.nameTex.dispose();
    this.nameMat.dispose();
    if (this.bubbleMat.map) this.bubbleMat.map.dispose();
    this.bubbleMat.dispose();
    this.group.removeFromParent();
  }
}

/** 供单人静修模式使用的假道童数据 */
export function offlineNPCs() {
  const names = ['守静道童', '听松童子', '扫云道人', '添香道姑', '击磬童子', '抱朴散人'];
  const robes = ['玄青', '月白', '赭黄', '藕荷', '苍绿', '霜色'];
  const seats = [2, 16, 38, 52, 74, 95];
  return names.map((name, i) => ({
    id: `offline_npc_${i}`, name, robe: robes[i], gender: i === 3 ? 'f' : 'm',
    npc: true, seat: seats[i],
    x: ((seats[i] % 9) - 4) * 1.34, z: 2.0 + Math.floor(seats[i] / 9) * 1.28, r: 0,
    pose: i % 3 === 0 ? 'chant' : (i % 3 === 1 ? 'sit' : 'bow')
  }));
}
