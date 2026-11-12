import * as THREE from 'three';

/**
 * 殿外园林 + 未开放的「建造中」区域。
 * 全部用 InstancedMesh 批量渲染：几百棵树/花/草加起来只有十几个 draw call，
 * 200 人同屏时不会把客户端显卡拖垮。
 */
const FONT = '"Microsoft YaHei","PingFang SC",sans-serif';
const KAITI = '"KaiTi","STKaiti","SimSun",serif';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function signTexture(title, subtitle) {
  const c = document.createElement('canvas');
  c.width = 768; c.height = 320;
  const x = c.getContext('2d');
  x.fillStyle = '#f8edd2'; x.fillRect(0, 0, 768, 320);
  x.strokeStyle = '#a3742a'; x.lineWidth = 14; x.strokeRect(12, 12, 744, 296);
  x.strokeStyle = 'rgba(163,116,42,.42)'; x.lineWidth = 3; x.strokeRect(30, 30, 708, 260);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#8a3b28'; x.font = `bold 82px ${KAITI}`;
  x.fillText(title, 384, 138);
  x.fillStyle = '#8a6a3a'; x.font = `30px ${FONT}`;
  x.fillText(subtitle, 384, 228);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function im(parent, geo, mat, count, place) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const d = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    d.position.set(0, 0, 0); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
    place(d, i);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);
  return mesh;
}

export const CONSTRUCTION_ZONES = [
  // 注意：建造区不能贴到大殿墙上（脚手架会伸进殿内，还会在殿里形成看不见的墙），
  // 所以殿左右两侧这两处要退到 x=±24（外沿 18.8，距殿墙 15 留出 3.8 步通道）。
  { x: -24, z: -3, name: '藏经阁', note: '典籍整理中 · 暂未开放' },
  { x: 24, z: -3, name: '丹房', note: '炉鼎未成 · 暂未开放' },
  { x: -24, z: 24, name: '云水寮', note: '寮房营建中 · 暂未开放' },
  { x: 26, z: 30, name: '钟楼', note: '铸钟未就 · 暂未开放' },
  { x: -30, z: 44, name: '后山静室', note: '山道整修中 · 暂未开放' },
  { x: 52, z: -26, name: '讲经台', note: '台基未平 · 暂未开放' },
  { x: -54, z: 60, name: '山门', note: '牌楼立柱中 · 暂未开放' },
  { x: 44, z: 74, name: '放生池', note: '池岸砌筑中 · 暂未开放' }
];

export function buildGarden(scene, quality = 'high') {
  const low = quality === 'low';
  const root = new THREE.Group();
  scene.add(root);
  const R = rng(20261112);

  // 殿内区域不种树；建造区周围留空
  const inHall = (x, z) => Math.abs(x) < 15 && z > -29 && z < 16;
  const nearZone = (x, z) => CONSTRUCTION_ZONES.some(s => Math.hypot(x - s.x, z - s.z) < 8);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: .95 });
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x43805f, roughness: .9, flatShading: true });
  const bambooMat = new THREE.MeshStandardMaterial({ color: 0x6f9c62, roughness: .9 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb9b3a2, roughness: .95 });
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xcdc6b0, roughness: .98 });

  // ---------- 松树 ----------
  const pines = [];
  let guard = 0;
  while (pines.length < (low ? 40 : 96) && guard++ < 2200) {
    const side = R() < .5 ? -1 : 1;
    const x = side * (16 + R() * 72);
    const z = -60 + R() * 176;
    if (inHall(x, z) || nearZone(x, z)) continue;
    pines.push({ x, z, s: .75 + R() * .9 });
  }
  im(root, new THREE.CylinderGeometry(.16, .24, 2.4, 7), trunkMat, pines.length,
    (d, i) => { const p = pines[i]; d.position.set(p.x, 1.2 * p.s, p.z); d.scale.setScalar(p.s); });
  const coneGeo = new THREE.ConeGeometry(1.5, 1.9, 8);
  for (let k = 0; k < 3; k++) {
    im(root, coneGeo, pineMat, pines.length, (d, i) => {
      const p = pines[i];
      d.position.set(p.x, (2.5 + k * .85) * p.s, p.z);
      d.scale.setScalar(p.s * (1 - k * .2));
    });
  }

  // ---------- 花树（桃 / 梅）----------
  const blossoms = [];
  guard = 0;
  while (blossoms.length < (low ? 14 : 30) && guard++ < 1200) {
    const side = R() < .5 ? -1 : 1;
    const x = side * (16 + R() * 60), z = -30 + R() * 130;
    if (inHall(x, z) || nearZone(x, z)) continue;
    blossoms.push({ x, z, s: .8 + R() * .55 });
  }
  im(root, new THREE.CylinderGeometry(.13, .19, 1.8, 7), trunkMat, blossoms.length,
    (d, i) => { const p = blossoms[i]; d.position.set(p.x, .9 * p.s, p.z); d.scale.setScalar(p.s); });
  const ballGeo = new THREE.SphereGeometry(.72, 10, 8);
  const pink = new THREE.MeshStandardMaterial({ color: 0xf3b9c8, roughness: .9, flatShading: true });
  const cream = new THREE.MeshStandardMaterial({ color: 0xfdf1e2, roughness: .9, flatShading: true });
  im(root, ballGeo, pink, blossoms.length, (d, i) => {
    const p = blossoms[i];
    d.position.set(p.x - .42 * p.s, (2.0 + (i % 3) * .22) * p.s, p.z);
    d.scale.setScalar(p.s);
  });
  im(root, ballGeo, cream, blossoms.length, (d, i) => {
    const p = blossoms[i];
    d.position.set(p.x + .46 * p.s, (2.2 + (i % 2) * .2) * p.s, p.z + .18);
    d.scale.setScalar(p.s * .9);
  });

  // ---------- 竹丛 ----------
  const stalks = [];
  for (let c = 0; c < (low ? 12 : 26); c++) {
    const side = R() < .5 ? -1 : 1;
    const bx = side * (17 + R() * 62), bz = -46 + R() * 150;
    if (inHall(bx, bz) || nearZone(bx, bz)) continue;
    for (let k = 0; k < 5; k++) {
      stalks.push({ x: bx + (R() - .5) * 1.8, z: bz + (R() - .5) * 1.8, h: .8 + R() * .55 });
    }
  }
  im(root, new THREE.CylinderGeometry(.055, .065, 3.6, 6), bambooMat, stalks.length,
    (d, i) => { const s = stalks[i]; d.position.set(s.x, 1.8 * s.h, s.z); d.scale.set(1, s.h, 1); });
  im(root, new THREE.ConeGeometry(.42, .95, 5), bambooMat, stalks.length,
    (d, i) => { const s = stalks[i]; d.position.set(s.x, 3.7 * s.h, s.z); d.scale.setScalar(s.h); });

  // ---------- 花圃 + 散花 ----------
  const FLOWER_COLORS = [0xf2b8c6, 0xffd76a, 0xf8f1de, 0xc7a6e0, 0xef8f7a, 0xa8c8e8];
  const flowers = [];
  for (const side of [-1, 1]) {
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 7; col++) {
        const x = side * (17 + col * .82), z = -6 + row * .9;
        if (nearZone(x, z)) continue;
        flowers.push({ x, z, c: FLOWER_COLORS[(row + col) % FLOWER_COLORS.length], s: .8 + R() * .5 });
      }
    }
  }
  for (let i = 0; i < (low ? 200 : 620); i++) {
    const x = (R() - .5) * 220, z = -58 + R() * 180;
    if (inHall(x, z) || nearZone(x, z)) continue;
    flowers.push({ x, z, c: FLOWER_COLORS[Math.floor(R() * FLOWER_COLORS.length)], s: .6 + R() * .5 });
  }
  const flowerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .9 });
  const fim = im(root, new THREE.SphereGeometry(.09, 6, 5), flowerMat, flowers.length,
    (d, i) => { const f = flowers[i]; d.position.set(f.x, .14 * f.s, f.z); d.scale.setScalar(f.s); });
  flowers.forEach((f, i) => fim.setColorAt(i, new THREE.Color(f.c)));
  if (fim.instanceColor) fim.instanceColor.needsUpdate = true;

  // ---------- 草丛 ----------
  const grasses = [];
  for (let i = 0; i < (low ? 340 : 980); i++) {
    const x = (R() - .5) * 250, z = -62 + R() * 196;
    if (inHall(x, z) || nearZone(x, z)) continue;
    grasses.push({ x, z, s: .6 + R() * .9 });
  }
  im(root, new THREE.ConeGeometry(.12, .42, 4),
    new THREE.MeshStandardMaterial({ color: 0x6fa05e, roughness: .95, flatShading: true }),
    grasses.length, (d, i) => { const g = grasses[i]; d.position.set(g.x, .2 * g.s, g.z); d.scale.setScalar(g.s); });

  // ---------- 石径 / 石灯笼（殿外两侧，随地图一起拉长）----------
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.8, .06, 96), pathMat);
    p.position.set(side * 14.4, .03, 26);
    root.add(p);
  }
  const link = new THREE.Mesh(new THREE.BoxGeometry(62, .06, 1.6), pathMat);
  link.position.set(0, .03, 18);
  root.add(link);

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffe6a8, emissive: 0x6b5428, emissiveIntensity: .3, roughness: .8
  });
  const lanternSpots = [
    [-13.2, -10], [13.2, -10], [-13.2, 2], [13.2, 2],
    [-13.2, 12], [13.2, 12], [-18, -18], [18, -18],
    [-26, 30], [26, 30], [-34, 48], [34, 48], [-44, 68], [44, 68]
  ];
  for (const [lx, lz] of lanternSpots) {
    const g = new THREE.Group(); g.position.set(lx, 0, lz); root.add(g);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.34, .42, .22, 8), stoneMat); base.position.y = .11; g.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.11, .14, 1.0, 8), stoneMat); pole.position.y = .72; g.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(.46, .42, .46), lampMat); lamp.position.y = 1.4; g.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(.44, .34, 4), stoneMat);
    cap.position.y = 1.78; cap.rotation.y = Math.PI / 4; g.add(cap);
  }

  // ---------- 殿内盆栽（柱边点缀）----------
  const potMat = new THREE.MeshStandardMaterial({ color: 0xa8593f, roughness: .9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f8a5c, roughness: .9, flatShading: true });
  for (const [px, pz] of [[-12, -18], [12, -18], [-12, 6], [12, 6]]) {
    const g = new THREE.Group(); g.position.set(px, 0, pz); root.add(g);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(.42, .32, .5, 10), potMat);
    pot.position.y = .25; g.add(pot);
    for (let k = 0; k < 5; k++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(.22, .9, 5), leafMat);
      const a = (k / 5) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * .2, .9, Math.sin(a) * .2);
      leaf.rotation.z = Math.cos(a) * .3; leaf.rotation.x = -Math.sin(a) * .3;
      g.add(leaf);
    }
  }

  // ---------- 未开放：建造中 ----------
  const flags = [];
  const wood = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: .9 });
  const plank = new THREE.MeshStandardMaterial({ color: 0x9c8258, roughness: .92 });
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0xd0bd93, roughness: .9 });
  for (const Z of CONSTRUCTION_ZONES) {
    const g = new THREE.Group(); g.position.set(Z.x, 0, Z.z); root.add(g);
    const base = new THREE.Mesh(new THREE.BoxGeometry(10, .3, 9), stoneMat); base.position.y = .15; g.add(base);

    const poleGeo = new THREE.CylinderGeometry(.085, .085, 5.2, 6);
    for (const px of [-4.2, 4.2]) for (const pz of [-3.4, 3.4]) {
      const m = new THREE.Mesh(poleGeo, wood); m.position.set(px, 2.6, pz); g.add(m);
    }
    for (const y of [1.6, 3.2, 4.8]) {
      for (const pz of [-3.4, 3.4]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(8.6, .1, .1), wood); m.position.set(0, y, pz); g.add(m);
      }
      for (const px of [-4.2, 4.2]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, 6.9), wood); m.position.set(px, y, 0); g.add(m);
      }
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(10, .22, 4.6), plank);
    roof.position.set(0, 5.4, -1.4); roof.rotation.x = -.2; g.add(roof);

    for (const [fx, fz, ry] of [[0, -4.4, 0], [-4.8, 0, Math.PI / 2], [4.8, 0, Math.PI / 2]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(9.6, 1.3, .14), fenceMat);
      m.position.set(fx, .75, fz); m.rotation.y = ry; g.add(m);
    }
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, .18, .28), wood);
      m.position.set(-2.4, .42 + i * .2, 2.6); g.add(m);
    }
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(.5, .28, .34), stoneMat);
      m.position.set(2.2 + (i % 3) * .56, .24 + Math.floor(i / 3) * .3, 2.8); g.add(m);
    }

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 2.2),
      new THREE.MeshBasicMaterial({ map: signTexture(Z.name + ' · 建造中', Z.note), side: THREE.DoubleSide })
    );
    sign.position.set(0, 3.4, 4.62);
    g.add(sign);

    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(
        new THREE.PlaneGeometry(.55, .4),
        new THREE.MeshBasicMaterial({ color: [0xd8543f, 0xe0b04a, 0x5a8fb0][i], side: THREE.DoubleSide })
      );
      f.position.set(-1.6 + i * 1.6, 5.9, 3.4);
      g.add(f); flags.push(f);
    }
  }

  // ---------- 更远的山，保证走到边界外仍有景可看 ----------
  const farMat = new THREE.MeshStandardMaterial({ color: 0xa3bdb0, roughness: 1, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(18 + R() * 16, 28 + R() * 22, 6), farMat);
    m.position.set(-220 + i * 18, 4, -140 - (i % 4) * 16);
    m.rotation.y = R() * 3;
    root.add(m);
  }

  // ---------- 飘落花瓣 ----------
  const PN = low ? 80 : 230;
  const pp = new Float32Array(PN * 3);
  const pv = [];
  for (let i = 0; i < PN; i++) {
    pp[i * 3] = (R() - .5) * 220;
    pp[i * 3 + 1] = 1 + R() * 16;
    pp[i * 3 + 2] = -60 + R() * 190;
    pv.push(.25 + R() * .45);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const petals = new THREE.Points(pg, new THREE.PointsMaterial({
    color: 0xffd0dc, size: .17, transparent: true, opacity: .82, depthWrite: false
  }));
  petals.frustumCulled = false;
  root.add(petals);

  function update(dt, t) {
    for (let i = 0; i < PN; i++) {
      pp[i * 3 + 1] -= pv[i] * dt;
      pp[i * 3] += Math.sin(t * .6 + i) * dt * .28;
      if (pp[i * 3 + 1] < .1) {
        pp[i * 3 + 1] = 12 + R() * 4;
        pp[i * 3] = (R() - .5) * 220;
      }
    }
    pg.attributes.position.needsUpdate = true;
    flags.forEach((f, i) => { f.rotation.y = Math.sin(t * 1.6 + i) * .5; });
  }

  return {
    constructionZones: CONSTRUCTION_ZONES.map(z => ({ ...z, r: 7 })),
    // 建造区围挡不可进入（对齐脚手架外沿）
    colliders: {
      boxes: CONSTRUCTION_ZONES.map(z => ({
        x0: z.x - 5.2, x1: z.x + 5.2, z0: z.z - 4.6, z1: z.z + 4.6
      })),
      circles: []
    },
    update,
    setVisible(v) { root.visible = v; }
  };
}
