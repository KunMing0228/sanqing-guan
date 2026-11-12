import * as THREE from 'three';
import { textPlane } from './fx.js';

/**
 * 开放式三清大殿 —— 参照《山寺》「人物在佛堂内」的布局重做。
 * 殿内进深 44、宽 30，层高 13+（屋脊 20），108 个蒲团、三清像、供案全部在殿内；
 * 两侧做「下实墙 + 上格子窗」，透过窗能看到殿外山林、花木与「建造中」区域。
 * 同时导出碰撞体（墙 / 柱 / 供案 / 神像区），人物不能穿墙而过。
 */
const H = {
  colH: 13.4,      // 柱高
  beamY: 13.3,     // 额枋高度
  ceilY: 14.9,     // 藻井
  roofY: 17.2,     // 屋面中心（坡度 .34，檐口约 13.2、屋脊约 21.2）
  ridgeY: 21.3,    // 正脊
  roofPitch: .34
};
function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .82, metalness: .04, ...opts });
}
function box(w, h, d, material, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); parent.add(m); return m;
}
function cyl(rt, rb, h, material, x, y, z, parent, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z); parent.add(m); return m;
}

function makeDeity(parent, opts) {
  const {
    x = 0, z = -23.5, scale = 1.4, robe = 0xd7b873, trim = 0xf0dca8,
    haloColor = 0xffd28a, hold = 'pearl'
  } = opts;
  const G = new THREE.Group();
  G.position.set(x, .35, z);      // 站在须弥低台上
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
  body.position.y = .82; G.add(body);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.50, .055, 8, 24), light);
  collar.rotation.x = Math.PI / 2; collar.position.y = 3.16; G.add(collar);
  for (const s of [-1, 1]) {
    const sleeve = new THREE.Mesh(new THREE.SphereGeometry(.36, 12, 10), gold);
    sleeve.scale.set(1, .8, 1.2);
    sleeve.position.set(s * .62, 2.05, .22); G.add(sleeve);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(.43, 20, 16), faceMat);
  head.position.set(0, 3.55, .04); G.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.438, 20, 12, 0, Math.PI * 2, 0, .95), mat(0x22222a));
  hair.position.copy(head.position); G.add(hair);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(.30, .34, .34, 12), light);
  crown.position.set(0, 3.94, .04); G.add(crown);
  const crownTop = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 8), light);
  crownTop.position.set(0, 4.14, .04); G.add(crownTop);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x3a2c22 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.032, 8, 6), eyeMat);
    eye.position.set(s * .14, 3.53, .43); G.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(.16, .018, .02), eyeMat);
    brow.position.set(s * .14, 3.61, .43); G.add(brow);
  }
  if (hold === 'fan') {
    const beard = new THREE.Mesh(new THREE.ConeGeometry(.16, .55, 8), mat(0xe9e4d8));
    beard.position.set(0, 3.18, .40); beard.rotation.x = Math.PI; G.add(beard);
  }
  if (hold === 'pearl') {
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(.24, 16, 12),
      mat(0xf7f0d8, { roughness: .2, metalness: .1, emissive: 0x6b5a32, emissiveIntensity: .4 }));
    pearl.position.set(0, 2.20, .72); G.add(pearl);
  } else if (hold === 'gui') {
    const gui = box(.22, .95, .06, light, 0, 2.25, .72, G); gui.rotation.x = -.12;
  } else {
    const fan = new THREE.Mesh(new THREE.CircleGeometry(.36, 20), mat(0xe8dfc8, { side: THREE.DoubleSide }));
    fan.position.set(0, 2.25, .74); G.add(fan);
    const stick = cyl(.025, .025, .55, mat(0x6b4a2c), 0, 1.92, .74, G, 8);
    stick.rotation.x = .2;
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: opts.haloTexture, color: haloColor, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: .42
  }));
  halo.scale.set(5.2, 5.2, 1);
  halo.position.set(0, 2.8, -.75);
  G.add(halo);
  G.userData.halo = halo;
  const pl = new THREE.PointLight(haloColor, 1.2, 16, 2);
  pl.position.set(0, 3.0, 1.6); G.add(pl);
  G.userData.light = pl;
  return G;
}


/** 中式格子门窗：外框 + 纵横棂条 + 可选糊纸 */
function lattice(parent, o) {
  const {
    x, y, z, w, hgt, cols = 5, rows = 7, ry = 0,
    paper = false, frame = 0x8a3b28, bar = 0xc9a45c
  } = o;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);
  const fm = new THREE.MeshStandardMaterial({ color: frame, roughness: .82 });
  const bm = new THREE.MeshStandardMaterial({ color: bar, roughness: .6, metalness: .2 });
  const t = .14;
  box(w, t, t, fm, 0, hgt / 2, 0, g);
  box(w, t, t, fm, 0, -hgt / 2, 0, g);
  box(t, hgt, t, fm, -w / 2, 0, 0, g);
  box(t, hgt, t, fm, w / 2, 0, 0, g);
  for (let i = 1; i < cols; i++) {
    box(.055, hgt - .1, .055, bm, -w / 2 + (w / cols) * i, 0, 0, g);
  }
  for (let j = 1; j < rows; j++) {
    box(w - .1, .055, .055, bm, 0, -hgt / 2 + (hgt / rows) * j, 0, g);
  }
  if (paper) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w - .16, hgt - .16),
      new THREE.MeshBasicMaterial({
        color: 0xfff3d4, transparent: true, opacity: .34,
        side: THREE.DoubleSide, depthWrite: false
      }));
    p.position.z = -.02;
    g.add(p);
  }
  return g;
}

/** 悬挂宫灯 */
function lantern(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  const red = new THREE.MeshStandardMaterial({ color: 0xc24032, roughness: .72, emissive: 0x5a1a12, emissiveIntensity: .35 });
  const gold = mat(0xd9b46a, { roughness: .5, metalness: .4 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(.42, 14, 10), red);
  body.scale.set(1, .82, 1);
  g.add(body);
  const capA = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .09, 10), gold);
  capA.position.y = .36; g.add(capA);
  const capB = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .09, 10), gold);
  capB.position.y = -.36; g.add(capB);
  const tassel = new THREE.Mesh(new THREE.CylinderGeometry(.035, .01, .42, 6), red);
  tassel.position.y = -.60; g.add(tassel);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, 1.5, 6), gold);
  rope.position.y = 1.1; g.add(rope);
  const pl = new THREE.PointLight(0xffb26a, .55, 7, 2);
  pl.position.y = 0; g.add(pl);
  return g;
}

/** 殿内木构细节：门窗、墙、檐廊、灯笼、丹青 */
function addHallDetails(group, T) {
  const wallMat = mat(0xe9dcc0, { roughness: .96 });
  const timber = mat(0x7a3a28, { roughness: .85 });
  const teal = mat(0x3f7a78, { roughness: .8 });
  const ochre = mat(0xb98a3e, { roughness: .8 });
  const stone = mat(0xa3a79a, { roughness: .95 });

  // 殿内木地板：细木板缝（山寺是木地板，不是砖地）
  for (let i = -14; i <= 14; i++) {
    box(.035, .014, 44, timber, i, .02, -6, group);
  }
  for (let z = -26; z <= 14; z += 4) {
    box(30, .012, .028, timber, 0, .021, z, group);
  }

  // 背屏两侧：土墙 + 糊纸格子窗（随殿高抬到 11）
  for (const s of [-1, 1]) {
    box(6.6, 11.0, .35, wallMat, s * 11.8, 5.6, -27.5, group);
    box(6.8, .30, .5, timber, s * 11.8, 11.2, -27.3, group);
    lattice(group, { x: s * 11.8, y: 5.4, z: -27.24, w: 5.0, hgt: 8.6, cols: 5, rows: 10, paper: true });
  }

  // 两侧墙：下实墙（挡脚步）+ 上部格子窗（能看殿外，但不能穿窗而过）
  for (const s of [-1, 1]) {
    for (const z of [-21, -12, -3, 6, 13]) {
      box(.32, 1.35, 8.2, wallMat, s * 15.0, .68, z, group);
      box(.38, .18, 8.4, timber, s * 15.0, 1.42, z, group);
      lattice(group, {
        x: s * 15.0, y: 7.0, z, w: 8.0, hgt: 10.8,
        cols: 7, rows: 11, ry: Math.PI / 2, paper: false
      });
      box(.44, 12.4, .44, timber, s * 15.0, 6.2, z - 4.2, group);
    }
    box(.36, .52, 42, teal, s * 15.0, 12.7, -6, group);
    box(.36, .24, 42, ochre, s * 15.0, 12.35, -6, group);
  }

  // 殿口三开间门：中间敞开供出入，两侧格子门扇 + 两翼实墙
  for (const x of [-11, -4.6, 4.6, 11]) {
    box(.52, 12.4, .52, timber, x, 6.2, 15.5, group);
  }
  box(23, .64, .64, timber, 0, 12.7, 15.5, group);
  box(23, .22, .70, ochre, 0, 12.35, 15.5, group);
  for (const s of [-1, 1]) {
    lattice(group, { x: s * 7.8, y: 6.2, z: 15.5, w: 5.8, hgt: 11.2, cols: 5, rows: 13, paper: false });
    for (const dx of [-1.6, 0, 1.6]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(.11, 8, 6), ochre);
      knob.position.set(s * 7.8 + dx, 6.0, 15.85);
      group.add(knob);
    }
    // 门扇两侧到边墙之间补实墙，避免从侧面绕进殿里；白墙加木框与糊纸小窗，不做大白板
    box(4.0, 12.0, .34, wallMat, s * 13.2, 6.1, 15.5, group);
    box(4.2, .30, .5, timber, s * 13.2, 12.15, 15.45, group);
    box(.28, 12.0, .52, timber, s * 11.3, 6.1, 15.5, group);
    box(.28, 12.0, .52, timber, s * 15.1, 6.1, 15.5, group);
    box(4.2, .22, .5, timber, s * 13.2, 6.9, 15.5, group);
    lattice(group, { x: s * 13.2, y: 9.4, z: 15.32, w: 3.2, hgt: 3.2, cols: 4, rows: 5, paper: true });
  }
  // 殿口台阶 + 檐廊栏杆
  for (let i = 0; i < 3; i++) {
    box(13 - i * .8, .16, .62, stone, 0, .24 - i * .05, 16.3 + i * .62, group);
  }
  for (const s of [-1, 1]) {
    box(.16, .14, 12, timber, s * 13.4, .95, 21, group);
    for (let k = 0; k < 7; k++) {
      box(.18, 1.0, .18, timber, s * 13.4, .5, 15.5 + k * 1.8, group);
    }
  }

  // 檐下悬挂宫灯（跟着殿高抬到梁下）
  for (const z of [-18, -6, 6, 12]) {
    lantern(group, -8.6, 11.4, z);
    lantern(group, 8.6, 11.4, z);
  }

  // 梁枋丹青（青绿 / 朱 / 金三色带）
  for (const z of [-24, -15, -6, 3, 12]) {
    box(27, .18, .48, teal, 0, 13.1, z, group);
    box(27, .11, .50, ochre, 0, 12.94, z, group);
    for (let k = -5; k <= 5; k++) {
      box(.72, .13, .52, timber, k * 2.3, 13.25, z, group);
    }
  }

  // 上檐墙：从梁枋上沿封到檐口（12.45~13.95），
  // 否则殿外会看到「屋顶悬空、墙顶透光」的一道缝。
  const upY = 12.9, upH = 1.0;
  for (const s of [-1, 1]) {
    box(.34, upH, 42, wallMat, s * 15.0, upY, -6, group);
    box(.44, .18, 42, timber, s * 15.0, upY + upH / 2, -6, group);
    box(.44, .18, 42, timber, s * 15.0, upY - upH / 2, -6, group);
  }
  for (const s of [-1, 1]) {
    const wz = s > 0 ? 15.5 : -27.5;
    box(30.4, upH, .34, wallMat, 0, upY, wz, group);
    box(30.6, .18, .46, timber, 0, upY + upH / 2, wz, group);
  }
}

export function buildHall(T) {
  const group = new THREE.Group();
  const vermilion = new THREE.MeshStandardMaterial({ map: T.wood, roughness: .78, metalness: .04 });
  const darkWood = mat(0x5c4330, { roughness: .9 });
  const goldTrim = mat(0xc9a45c, { roughness: .45, metalness: .45 });
  const tileMat = new THREE.MeshStandardMaterial({ map: T.tile, roughness: .95 });
  const stoneMat = mat(0xa3a79a, { roughness: .95 });

  // 殿内地板：与室外齐平（薄板），不再有会吞人的高月台
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 44),
    new THREE.MeshStandardMaterial({ color: 0xcaa87a, roughness: .92 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, .012, -6);
  group.add(floor);
  box(30.4, .16, .32, goldTrim, 0, .09, 15.9, group);   // 殿口门槛

  // 柱网：只留左右两列檐柱（各 4 根，共 8 根），殿内不再立内柱——
  // 原来 4×5=20 根内柱会把望向三清的视线切得很碎，山寺的殿内也是通视的。
  const colX = [-12.6, 12.6];
  const colZ = [-24, -12, 0, 12];
  const occluders = [];   // 供相机避障：转到柱子背面时自动拉近，不贴脸穿模
  const colCY = H.colH / 2 + .3;
  for (const z of colZ) for (const x of colX) {
    occluders.push(cyl(.36, .42, H.colH, vermilion, x, colCY, z, group, 14));
    cyl(.48, .54, .26, darkWood, x, .13, z, group, 14);
    // 柱头斗拱：三层退台，撑住额枋
    box(1.1, .20, 1.1, darkWood, x, colCY + H.colH / 2 - .06, z, group);
    box(1.6, .18, .9, goldTrim, x, colCY + H.colH / 2 + .12, z, group);
    box(2.0, .16, .72, darkWood, x, colCY + H.colH / 2 + .28, z, group);
  }
  for (const x of colX) {
    box(.40, .52, 42, vermilion, x, H.beamY, -6, group);
    box(.22, .16, 42, goldTrim, x, H.beamY - .34, -6, group);
  }
  for (const z of colZ) box(28, .52, .44, vermilion, 0, H.beamY, z, group);

  // 背屏只在三清像后方，两侧通透
  occluders.push(box(17, 11.2, .4, mat(0x8d7358, { roughness: .95 }), 0, 5.7, -27.5, group));
  box(18, .34, .7, goldTrim, 0, 11.4, -27.4, group);

  // 藻井（抬到 14.9，殿内空间更挺）
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(30, 44),
    new THREE.MeshBasicMaterial({ map: T.taiji, side: THREE.DoubleSide, transparent: true, opacity: .72 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, H.ceilY, -6);
  group.add(ceiling);

  // 双坡屋顶（屋脊沿 X 轴，前后两坡）
  // 坡向要「檐低脊高」：前坡朝 +Z 下斜用 +.22，后坡朝 -Z 下斜用 -.22。
  // （原来两个符号是反的，脊线比檐口低，远看像一块悬空的板。）
  // 屋面做厚（1.0）：一是中式大殿屋顶本来就厚，二是屋面下沿能压住墙顶，
  // 否则从殿外会看到墙与檐之间一条透光的白缝。
  const roofFront = box(34, 1.0, 24, tileMat, 0, H.roofY, 4.5, group);
  const roofBack = box(34, 1.0, 24, tileMat, 0, H.roofY, -16.5, group);
  roofFront.rotation.x = H.roofPitch;
  roofBack.rotation.x = -H.roofPitch;
  box(35, .56, .9, darkWood, 0, H.ridgeY - .45, -6, group);
  box(35, .16, .24, goldTrim, 0, H.ridgeY - .12, -6, group);
  // 檐口压边 + 四角起翘，远看更有大殿轮廓
  const eaveY = H.roofY - Math.sin(H.roofPitch) * 12;
  for (const s of [-1, 1]) {
    box(35, .26, .6, darkWood, 0, eaveY + .1, s > 0 ? 16.4 : -28.4, group);
    const chi = new THREE.Mesh(new THREE.ConeGeometry(.46, 1.15, 8), goldTrim);
    chi.position.set(s * 17, H.ridgeY + .1, -6);
    chi.rotation.z = s * -.5;
    group.add(chi);
  }

  // 匾额：殿内正面
  const plaqueMain = textPlane(T.plaque, 6.4, 1.6);
  plaqueMain.position.set(0, 9.5, -26.9); group.add(plaqueMain);
  box(6.8, .14, .2, goldTrim, 0, 8.6, -26.9, group);

  const cl = textPlane(T.coupletL, .95, 5.4); cl.position.set(-9.6, 4.9, -26.8); group.add(cl);
  const cr = textPlane(T.coupletR, .95, 5.4); cr.position.set(9.6, 4.9, -26.8); group.add(cr);

  const banners = [];
  for (const [bx, bz, tx] of [
    [-10.4, -14, T.bannerA], [10.4, -14, T.bannerB],
    [-10.4, 5, T.bannerB], [10.4, 5, T.bannerA],
    [-10.4, 11, T.bannerA], [10.4, 11, T.bannerB]
  ]) {
    const b = textPlane(tx, .9, 4.6, { transparent: true, opacity: .92 });
    b.position.set(bx, 4.6, bz);
    group.add(b); banners.push(b);
  }

  // 须弥低台（可走上去，terrain.groundHeight 会跟随）
  box(16, .35, 9, stoneMat, 0, .175, -20.4, group);
  box(16.4, .10, .25, goldTrim, 0, .40, -15.9, group);
  // 台前三级台阶（视觉）
  for (let i = 0; i < 3; i++) {
    box(11 - i * .6, .12, .5, stoneMat, 0, .28 - i * .09, -15.4 + i * .5, group);
  }

  const deityOpts = { haloTexture: T.halo };
  const deities = [
    makeDeity(group, { ...deityOpts, x: -5.4, z: -23.5, scale: 1.62, robe: 0x86a9b8, trim: 0xd8e6e4, haloColor: 0xbfe4ff, hold: 'gui' }),
    makeDeity(group, { ...deityOpts, x: 0, z: -24.0, scale: 1.80, robe: 0xe3c484, trim: 0xf6e2b0, haloColor: 0xffd994, hold: 'pearl' }),
    makeDeity(group, { ...deityOpts, x: 5.4, z: -23.5, scale: 1.62, robe: 0x9b86b8, trim: 0xe0d2ee, haloColor: 0xd9bcff, hold: 'fan' })
  ];

  // 供案 / 香炉 / 烛台
  const TABLE_Z = -17.6;
  const tableMat = mat(0x5a3524, { roughness: .75 });
  const brass = mat(0xb08a4a, { roughness: .42, metalness: .68 });
  box(9.6, .82, 1.25, tableMat, 0, 1.36, TABLE_Z, group);
  box(9.8, .12, 1.40, goldTrim, 0, 1.80, TABLE_Z, group);
  box(9.6, .55, .05, mat(0x8e2f28, { roughness: .9 }), 0, 1.20, TABLE_Z + .64, group);
  const burnerPts = [[0, 0], [.42, 0], [.48, .10], [.40, .30], [.46, .40], [.0, .42]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const burner = new THREE.Mesh(new THREE.LatheGeometry(burnerPts, 18), brass);
  burner.position.set(0, 1.82, TABLE_Z); group.add(burner);
  for (let i = -1; i <= 1; i++) {
    const stick = cyl(.012, .012, .72, mat(0x7a4b2c), i * .13, 2.55, TABLE_Z, group, 6);
    stick.rotation.z = i * .06;
    const ember = new THREE.Mesh(new THREE.SphereGeometry(.026, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff9a4a }));
    ember.position.set(i * .13, 2.91, TABLE_Z); group.add(ember);
  }
  for (let i = -1; i <= 1; i++) {
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 10), mat(0xc98a3c));
    fruit.position.set(i * 2.4, 1.94, TABLE_Z + .15); group.add(fruit);
  }
  const flames = [];
  for (const s of [-1, 1]) {
    const cx = s * 3.35;
    cyl(.075, .12, .46, brass, cx, 2.02, TABLE_Z, group, 10);
    cyl(.20, .20, .05, brass, cx, 2.26, TABLE_Z, group, 12);
    cyl(.045, .045, .34, mat(0xd85b3a), cx, 2.44, TABLE_Z, group, 8);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.085, .30, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb257, transparent: true, opacity: .95 }));
    flame.position.set(cx, 2.76, TABLE_Z); group.add(flame); flames.push(flame);
    const pl = new THREE.PointLight(0xff9a4a, .9, 9, 2);
    pl.position.set(cx, 2.85, TABLE_Z + .4); group.add(pl);
  }

  addHallDetails(group, T);

  // ---------- 殿内「画墙」：右壁挂屏，道友张贴的画作就挂在这里 ----------
  const paintWall = new THREE.Group();
  paintWall.position.set(14.72, 0, 0);   // 贴着侧墙内侧挂，不悬空
  group.add(paintWall);
  const boardMat = mat(0xf1e2c2, { roughness: .95 });
  const frameMat = mat(0x7a3a28, { roughness: .8 });
  box(.10, 8.2, 9.6, boardMat, 0, 5.2, 6.0, paintWall);              // 背板
  box(.16, .26, 9.9, frameMat, 0, 9.2, 6.0, paintWall);
  box(.16, .26, 9.9, frameMat, 0, 1.2, 6.0, paintWall);
  box(.16, 8.2, .26, frameMat, 0, 5.2, 1.05, paintWall);
  box(.16, 8.2, .26, frameMat, 0, 5.2, 10.95, paintWall);
  const paintSlots = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const z = 2.6 + col * 3.4;
      const y = 3.5 + row * 3.3;
      box(.06, 2.5, 2.2, frameMat, -.04, y, z, paintWall);            // 画框
      const paper = new THREE.Mesh(
        new THREE.PlaneGeometry(1.92, 2.22),
        new THREE.MeshStandardMaterial({ color: 0xfaf3df, roughness: .95 })
      );
      paper.rotation.y = -Math.PI / 2;
      paper.position.set(-.09, y, z);
      paintWall.add(paper);
      paintSlots.push(paper);
    }
  }
  const paintLight = new THREE.PointLight(0xfff0cc, .9, 12, 2);
  paintLight.position.set(11.5, 6.4, 6);
  group.add(paintLight);

  // ---------- 碰撞体：墙、门、供案、神像区、柱子 ----------
  const colliders = { boxes: [], circles: [] };
  colliders.boxes.push({ x0: 14.6, x1: 15.6, z0: -27.9, z1: 15.9 });     // 右墙
  colliders.boxes.push({ x0: -15.6, x1: -14.6, z0: -27.9, z1: 15.9 });   // 左墙
  colliders.boxes.push({ x0: -15.6, x1: 15.6, z0: -27.9, z1: -27.0 });   // 背墙（含背屏）
  colliders.boxes.push({ x0: 4.3, x1: 15.6, z0: 15.2, z1: 16.0 });       // 殿口右门扇 + 翼墙
  colliders.boxes.push({ x0: -15.6, x1: -4.3, z0: 15.2, z1: 16.0 });     // 殿口左门扇 + 翼墙
  colliders.boxes.push({ x0: -4.9, x1: 4.9, z0: -18.3, z1: -16.9 });     // 供案
  colliders.boxes.push({ x0: -9.8, x1: 9.8, z0: -26.6, z1: -20.6 });     // 三清像与神龛
  for (const z of colZ) for (const x of colX) colliders.circles.push({ x, z, r: .64 });

  // 三清像 / 背屏区的遮挡代理：360° 转到殿后时镜头停在这里，不会钻进神像内部
  const deityGuard = new THREE.Mesh(
    new THREE.BoxGeometry(20, 13, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  deityGuard.position.set(0, 6.5, -23.5);
  group.add(deityGuard);
  occluders.push(deityGuard);

  return {
    group, deities, flames, banners, occluders, colliders, paintSlots,
    smokeOrigin: new THREE.Vector3(0, 2.9, TABLE_Z),
    platformY: .35
  };
}
