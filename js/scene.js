import * as THREE from 'three';
import { TEX, Smoke, Fireflies, Sparks, makeSkyTexture } from './fx.js';
import { buildHall } from './hall.js';
import { buildGarden } from './garden.js';

/**
 * 三清殿 3D 场景（全部程序化几何 + Canvas 贴图，无外部模型、无外部图片）。
 * 运行时席位坐标以服务端 welcome.seats 为准；这里的常量用于先把蒲团画出来，
 * 必须与 server/config.js 的 SEAT_COLS / SEAT_GAP_X / SEAT_GAP_Z / SEAT_Z0 一致。
 */
export const SEAT_COLS = 9;
export const SEAT_ROWS = 12;
export const SEATS_COUNT = 108;
export const localSeats = Array.from({ length: SEATS_COUNT }, (_, i) => ({
  i,
  x: +(((i % SEAT_COLS) - (SEAT_COLS - 1) / 2) * 2.00).toFixed(3),
  z: +(-11.0 + Math.floor(i / SEAT_COLS) * 1.90).toFixed(3)
}));

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .82, metalness: .04, ...opts });
}
function box(w, h, d, material, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function cyl(rt, rb, h, material, x, y, z, parent, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** 单尊三清坐像：台座 + 道袍 + 头冠 + 面部 + 持物 + 背光 */
function makeDeity(parent, opts) {
  const {
    x = 0, z = -8.6, scale = 1, robe = 0xd7b873, trim = 0xf0dca8,
    haloColor = 0xffd28a, hold = 'pearl'
  } = opts;
  const G = new THREE.Group();
  G.position.set(x, .55, z);
  G.scale.setScalar(scale);
  parent.add(G);

  const stone = mat(0x4a5361, { roughness: .95 });
  const gold = mat(robe, { roughness: .42, metalness: .55 });
  const light = mat(trim, { roughness: .45, metalness: .35 });
  const faceMat = mat(0xe8cfa6, { roughness: .8, metalness: .05 });

  cyl(1.35, 1.48, .48, stone, 0, .24, 0, G, 20);
  cyl(1.12, 1.24, .22, light, 0, .58, 0, G, 20);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), light);
    petal.scale.set(1, .45, 1.5);
    petal.position.set(Math.cos(a) * 1.16, .72, Math.sin(a) * 1.16);
    petal.rotation.y = -a;
    G.add(petal);
  }

  const bodyPts = [
    [0, 0], [1.0, 0], [1.04, .18], [.88, .70], [.74, 1.35],
    [.62, 2.0], [.52, 2.45], [.0, 2.55]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(bodyPts, 22), gold);
  body.position.y = .82;
  G.add(body);
  // 领口与袖缘
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.50, .055, 8, 24), light);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 3.16;
  G.add(collar);
  for (const s of [-1, 1]) {
    const sleeve = new THREE.Mesh(new THREE.SphereGeometry(.36, 12, 10), gold);
    sleeve.scale.set(1, .8, 1.2);
    sleeve.position.set(s * .62, 2.05, .22);
    G.add(sleeve);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(.43, 20, 16), faceMat);
  head.position.set(0, 3.55, .04);
  G.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.438, 20, 12, 0, Math.PI * 2, 0, .95), mat(0x22222a));
  hair.position.copy(head.position);
  G.add(hair);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(.30, .34, .34, 12), light);
  crown.position.set(0, 3.94, .04);
  G.add(crown);
  const crownTop = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), light);
  crownTop.position.set(0, 4.14, .04);
  G.add(crownTop);
  // 垂目：两点即可，不做写实五官
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x3a2c22 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.032, 8, 6), eyeMat);
    eye.position.set(s * .14, 3.53, .43);
    G.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(.16, .018, .02), eyeMat);
    brow.position.set(s * .14, 3.61, .43);
    G.add(brow);
  }
  // 长须（太清）
  if (hold === 'fan') {
    const beard = new THREE.Mesh(new THREE.ConeGeometry(.16, .55, 8), mat(0xe9e4d8));
    beard.position.set(0, 3.18, .40);
    beard.rotation.x = Math.PI;
    G.add(beard);
  }

  // 持物
  if (hold === 'pearl') {
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(.24, 16, 12), mat(0xf7f0d8, { roughness: .2, metalness: .1, emissive: 0x6b5a32, emissiveIntensity: .4 }));
    pearl.position.set(0, 2.20, .72);
    G.add(pearl);
  } else if (hold === 'gui') {
    const gui = box(.22, .95, .06, light, 0, 2.25, .72, G);
    gui.rotation.x = -.12;
  } else {
    const fan = new THREE.Mesh(new THREE.CircleGeometry(.36, 20), mat(0xe8dfc8, { side: THREE.DoubleSide }));
    fan.position.set(0, 2.25, .74);
    G.add(fan);
    const stick = cyl(.025, .025, .55, mat(0x6b4a2c), 0, 1.92, .74, G, 8);
    stick.rotation.x = .2;
  }

  // 背光：径向渐变 sprite，Additive 混合，避免用后期 composer
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX().halo, color: haloColor, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: .42
  }));
  halo.scale.set(5.2, 5.2, 1);
  halo.position.set(0, 2.8, -.75);
  G.add(halo);
  G.userData.halo = halo;

  const pl = new THREE.PointLight(haloColor, 1.2, 16, 2);
  pl.position.set(0, 3.0, 1.6);
  G.add(pl);
  G.userData.light = pl;
  return G;
}

export function buildScene(renderer, quality = 'high') {
  const T = TEX();
  const scene = new THREE.Scene();
  scene.background = makeSkyTexture();
  scene.fog = new THREE.Fog(0xdce9e2, 150, 460);

  const camera = new THREE.PerspectiveCamera(56, 1, .1, 700);
  // 相机在殿口内侧偏后，俯看整个殿内：满地蒲团 + 纵深柱廊 + 三清像 + 藻井
  const focus = new THREE.Vector3(0, 2.6, -8);
  const focusTarget = focus.clone();
  const rig = { yaw: 0, pitch: .17, distance: 26, tYaw: 0, tPitch: .17, tDistance: 26 };
  // 360° 旋转时镜头会绕到柱子/背屏后面，做一次射线避障自动拉近，避免贴脸穿模
  let cameraOccluders = [];
  const camRay = new THREE.Raycaster();
  const camDir = new THREE.Vector3();
  function applyCamera() {
    let dist = rig.distance;
    if (cameraOccluders.length) {
      const h = Math.cos(rig.pitch) * dist;
      camDir.set(Math.sin(rig.yaw) * h, Math.sin(rig.pitch) * dist, Math.cos(rig.yaw) * h).normalize();
      camRay.set(focus, camDir);
      camRay.far = dist;
      const hits = camRay.intersectObjects(cameraOccluders, true);
      if (hits.length) dist = Math.max(4.5, hits[0].distance - 1.2);
    }
    const hh = Math.cos(rig.pitch) * dist;
    camera.position.set(
      focus.x + Math.sin(rig.yaw) * hh,
      focus.y + Math.sin(rig.pitch) * dist,
      focus.z + Math.cos(rig.yaw) * hh
    );
    camera.lookAt(focus);
  }
  applyCamera();

  // ---------- 光照 ----------
  // 晨光：天空亮、阳光暖、暗部不黑，刻意去掉夜观的阴森感
  scene.add(new THREE.AmbientLight(0xffffff, 1.75));
  scene.add(new THREE.HemisphereLight(0xdcefff, 0x9a8a68, 1.15));
  const sunLight = new THREE.DirectionalLight(0xfff0d0, 2.35);
  sunLight.position.set(16, 28, 14);
  scene.add(sunLight);
  const skyFill = new THREE.DirectionalLight(0xbcdcf5, .65);
  skyFill.position.set(-14, 12, -12);
  scene.add(skyFill);
  const frontFill = new THREE.PointLight(0xffe0ae, .8, 34, 2);
  frontFill.position.set(0, 6, 8);
  scene.add(frontFill);
  const innerGlow = new THREE.PointLight(0xffd9a0, 1.5, 24, 2);
  innerGlow.position.set(0, 4.4, -4.2);
  scene.add(innerGlow);

  // ---------- 大地面（460×460，走到边界外仍有景）----------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(460, 460),
    new THREE.MeshStandardMaterial({ map: T.brick, roughness: .97, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.02;
  scene.add(ground);
  const taijiDisc = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 48),
    new THREE.MeshBasicMaterial({ map: T.taiji, transparent: true, opacity: .40, depthWrite: false })
  );
  taijiDisc.rotation.x = -Math.PI / 2;
  taijiDisc.position.set(0, .04, 12.5);
  scene.add(taijiDisc);

  // ---------- 开放式三清大殿（蒲团与人物都在殿内）----------
  const hallData = buildHall(T);
  scene.add(hallData.group);
  cameraOccluders = hallData.occluders || [];
  const hc = hallData.colliders || { boxes: [], circles: [] };
  const colliders = { boxes: hc.boxes.slice(), circles: hc.circles.slice() };
  const paintSlots = hallData.paintSlots || [];
  const deities = hallData.deities;
  const flames = hallData.flames;
  const banners = hallData.banners;

  // ---------- 殿内画墙：把道友张贴的画作贴到挂屏上（最新 6 幅）----------
  const paintTex = new Map();
  const paintOrder = [];
  function applyPaintings() {
    paintSlots.forEach((slot, i) => {
      const id = paintOrder[i];
      const tex = id ? paintTex.get(id) : null;
      slot.material.map = tex || null;
      slot.material.color.set(tex ? 0xffffff : 0xfaf3df);
      slot.material.needsUpdate = true;
    });
  }
  function loadPaint(item, done) {
    const tex = new THREE.TextureLoader().load(item.src, () => { applyPaintings(); if (done) done(); });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    paintTex.set(item.id, tex);
  }
  function setPaintings(list) {
    paintOrder.length = 0;
    paintTex.clear();
    const keep = (list || []).filter(it => it && it.id && it.src).slice(-paintSlots.length).reverse();
    keep.forEach(it => { paintOrder.push(it.id); loadPaint(it); });
    applyPaintings();
  }
  function addPainting(item) {
    if (!item || !item.id || !item.src || paintTex.has(item.id)) return;
    loadPaint(item);
    paintOrder.unshift(item.id);
    while (paintOrder.length > paintSlots.length) {
      const dropped = paintOrder.pop();
      const t = paintTex.get(dropped);
      if (t) t.dispose();
      paintTex.delete(dropped);
    }
    applyPaintings();
  }

  // ---------- 108 蒲团：全部在殿内，间距加大、尺寸放大 ----------
  const cushionGeo = new THREE.CylinderGeometry(.62, .64, .20, 18);
  const cushionMat = mat(0xb04a34, { roughness: .96 });
  const cushions = new THREE.InstancedMesh(cushionGeo, cushionMat, SEATS_COUNT);
  const dummy = new THREE.Object3D();
  localSeats.forEach((s, i) => {
    dummy.position.set(s.x, .11, s.z);
    dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    dummy.updateMatrix(); cushions.setMatrixAt(i, dummy.matrix);
  });
  cushions.instanceMatrix.needsUpdate = true;
  scene.add(cushions);
  const ringGeo = new THREE.TorusGeometry(.61, .022, 6, 22);
  const ringMat = mat(0xd4ad63, { roughness: .6, metalness: .3 });
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, SEATS_COUNT);
  localSeats.forEach((s, i) => {
    dummy.position.set(s.x, .215, s.z);
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.updateMatrix(); rings.setMatrixAt(i, dummy.matrix);
  });
  rings.instanceMatrix.needsUpdate = true;
  scene.add(rings);

  // ---------- 远景：山 / 松 / 云 / 星 / 月 ----------
  const far = new THREE.Group();
  scene.add(far);
  const mountainMat = mat(0x6f9486, { roughness: 1, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(9 + i * 1.6, 12 + (i % 3) * 5, 6), mountainMat);
    mtn.position.set(-60 + i * 20, 3, -78 - (i % 3) * 10);
    mtn.rotation.y = i * .7;
    far.add(mtn);
  }
  const pineTrunk = mat(0x5d4a34);
  const pineLeaf = mat(0x43805f, { flatShading: true });
  for (const [px, pz, sc] of [[-24, -18, 1.3], [24, -19, 1.5], [-30, -9, 1.0], [30, -8, 1.1], [-36, -28, 1.8], [36, -27, 1.6]]) {
    const pg = new THREE.Group();
    pg.position.set(px, 0, pz);
    pg.scale.setScalar(sc);
    far.add(pg);
    cyl(.22, .30, 2.6, pineTrunk, 0, 1.3, 0, pg, 8);
    for (let k = 0; k < 3; k++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.7 - k * .38, 1.8, 8), pineLeaf);
      cone.position.set(0, 2.3 + k * .95, 0);
      pg.add(cone);
    }
  }
  // 星空
  const starPos = new Float32Array(320 * 3);
  for (let i = 0; i < 320; i++) {
    starPos[i * 3] = (Math.random() - .5) * 150;
    starPos[i * 3 + 1] = 14 + Math.random() * 45;
    starPos[i * 3 + 2] = -30 - Math.random() * 80;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    map: T.star, size: 1.05, transparent: true, opacity: .7,
    depthWrite: false, blending: THREE.AdditiveBlending, color: 0xcfe0ff
  }));
  far.add(stars);
  stars.visible = false;   // 白天不显示星星
  // 日轮（右上暖白）
  const moonBall = new THREE.Mesh(new THREE.SphereGeometry(1.8, 24, 18),
    new THREE.MeshBasicMaterial({ color: 0xfff4cf }));
  moonBall.position.set(28, 34, -88);
  far.add(moonBall);
  const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.halo, color: 0xffe2a0, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: .38
  }));
  moonHalo.scale.set(22, 22, 1);
  moonHalo.position.copy(moonBall.position);
  far.add(moonHalo);
  // 祥云
  const mists = [];
  for (let i = 0; i < 5; i++) {
    const mist = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.halo, color: 0xffffff, transparent: true,
      depthWrite: false, opacity: .22, blending: THREE.AdditiveBlending
    }));
    mist.scale.set(26 + i * 5, 8, 1);
    mist.position.set(-20 + i * 10, 3 + i * .8, -22 - i * 5);
    far.add(mist);
    mists.push(mist);
  }

  // ---------- 殿外园林 + 未开放的建造中区域 ----------
  const garden = buildGarden(scene, quality);
  if (garden.colliders) colliders.boxes.push(...garden.colliders.boxes);

  // ---------- 粒子 ----------
  const smoke = new Smoke(scene, hallData.smokeOrigin, quality);
  const fireflies = new Fireflies(scene, quality);
  const sparks = new Sparks(scene, 90);

  // ---------- 相机控制：初始构图不变，走远后平滑跟随 ----------
  function setFollow(x, z) {
    // 相机焦点就是角色本身，走到哪跟到哪；yaw 由用户拖拽决定看哪个方向
    focusTarget.set(x, 2.2, z);
  }
  function snapFollow(x, z) {
    focusTarget.set(x, 2.2, z);
    focus.copy(focusTarget);
    applyCamera();
  }
  /** 供移动逻辑把方向键换算成「镜头前方 / 镜头右方」 */
  function getYaw() { return rig.yaw; }
  function orbit(dx, dy) {
    // 水平方向不设限，可连续 360° 绕着角色转；俯仰仍限位，避免翻到地下
    rig.tYaw -= dx * .0042;
    rig.tPitch = Math.max(.05, Math.min(.62, rig.tPitch + dy * .0026));
  }
  function zoom(delta) {
    rig.tDistance = Math.max(12, Math.min(70, rig.tDistance + delta * .016));
  }
  function resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function setQuality(q) {
    const low = q === 'low';
    renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    smoke.setVisible(!low);
    fireflies.setVisible(!low);
    stars.visible = false;
    moonHalo.visible = !low;
    mists.forEach(m => { m.visible = !low; });
    garden.setVisible(true);
  }
  setQuality(quality);

  function update(dt, t) {
    focus.lerp(focusTarget, Math.min(1, dt * 2.2));
    rig.yaw += (rig.tYaw - rig.yaw) * Math.min(1, dt * 8);
    rig.pitch += (rig.tPitch - rig.pitch) * Math.min(1, dt * 8);
    rig.distance += (rig.tDistance - rig.distance) * Math.min(1, dt * 8);
    applyCamera();
    smoke.update(dt, t);
    fireflies.update(dt, t);
    sparks.update(dt);
    garden.update(dt, t);
    flames.forEach((f, i) => {
      f.scale.y = 1 + Math.sin(t * 11 + i * 2.3) * .16;
      f.scale.x = 1 + Math.cos(t * 9 + i) * .08;
    });
    banners.forEach((b, i) => { b.rotation.z = Math.sin(t * .55 + i * 1.4) * .035; });
    deities.forEach((d, i) => {
      d.userData.halo.material.opacity = .38 + Math.sin(t * .8 + i * 1.7) * .06;
      d.userData.light.intensity = 1.15 + Math.sin(t * .9 + i) * .15;
    });
    mists.forEach((m, i) => { m.position.x += Math.sin(t * .08 + i) * dt * .35; });
  }

  return {
    scene, camera, cushions, sparks, smoke, fireflies,
    seats: localSeats, orbit, zoom, resize, setQuality, setFollow, snapFollow, getYaw, update,
    constructionZones: garden.constructionZones,
    colliders, addPainting, setPaintings, paintSlots,
    deityPositions: deities.map(d => d.position.clone())
  };
}
