// Локация «Двор собора Святого Ашена»: фасад с розой-витражом, разрушенная аркада, кладбище, склеп.
import * as THREE from 'three';
import { Level } from './level.js';
import { boxGeo, cylGeo, extrudeGeo, archPoints, archRingShape, archShape, mat4 } from './geo.js';
import * as P from './props.js';
import * as Q from './props2.js';
import { roseWindowTex, lancetGlassTex } from '../core/textures.js';
import { withFog } from '../core/fog.js';
import { addGrass, groundMask } from './grass.js';
import { addPuddles } from './ambience.js';

const V3 = THREE.Vector3;

export const yardAtmosphere = {
  skyHorizon: 0x6a161c,
  skyZenith: 0x080306,
  fogColor: 0x1a0b0f,
  fogDensity: 0.028,
  mistColor: [0.075, 0.042, 0.048],
  mistGround: 0.085,
  moonDir: new V3(0.55, 0.62, -0.8).normalize(),
  moonLight: 0xd6cce6,
  moonIntensity: 1.25,
  hemiSky: 0x6a3040,
  hemiGround: 0x0c0607,
  hemiIntensity: 0.55,
  rain: 0.6,
  lightning: true,
};

export function buildCathedralYard(scene, seed = 2024) {
  const L = new Level(scene, seed);
  const M = Q.extraMaterials(P.createMaterials());
  L.mats = M;
  L.atmosphere = yardAtmosphere;
  L.bounds = { minX: -16.5, maxX: 19.4, minZ: -18.4, maxZ: 19.4 };
  L.playerStart.set(0, 0, 15);
  L.playerYaw = 0;
  const rng = L.rng;

  // ——— Земля и мощение ———
  const ground = new THREE.PlaneGeometry(300, 300, 1, 1);
  ground.rotateX(-Math.PI / 2);
  const guv = ground.attributes.uv;
  for (let i = 0; i < guv.count; i++) guv.setXY(i, guv.getX(i) * 300, guv.getY(i) * 300);
  L.add(ground, M.ground, null, { cast: false });

  const paving = (x0, z0, x1, z1, y = 0.012) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv, ox = rng() * 5;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0) + ox, uv.getY(i) * (z1 - z0));
    L.add(g, M.cobble, mat4((x0 + x1) / 2, y, (z0 + z1) / 2), { cast: false });
  };
  paving(-2.4, -6, 2.4, 19.5);
  paving(-8.5, -18.5, 8.5, -6, 0.014);
  paving(-16.5, -18.5, -11, 19.5, 0.013);
  // Бордюры дорожки.
  for (const sx of [-1, 1]) L.add(boxGeo(0.22, 0.12, 25.5, rng), M.trim, mat4(sx * 2.5, 0.06, 6.75), { cast: false });

  // ——— Собор ———
  buildFacade(L, M);

  // ——— Угловые стены ———
  L.add(boxGeo(3.6, 6, 1.2, rng), M.stone, mat4(-14.8, 3, -19));
  L.box(-16.6, -19.6, -13, -18.4);
  L.add(boxGeo(6.8, 3.2, 0.9, rng), M.stone, mat4(16.2, 1.6, -18.9));
  L.add(boxGeo(7.0, 0.25, 1.1, rng), M.trim, mat4(16.2, 3.3, -18.9));
  L.box(12.8, -19.4, 19.6, -18.4);

  // ——— Аркада клуатра (слева) ———
  L.add(boxGeo(1.1, 7.5, 39, rng), M.stone, mat4(-17.05, 3.75, 0.25));
  L.add(boxGeo(1.4, 0.35, 39, rng), M.trim, mat4(-17.05, 7.6, 0.25));
  // Зубцы.
  for (let z = -18.5; z < 19.5; z += 1.6) L.add(boxGeo(1.2, 0.6, 0.8, rng), M.stone, mat4(-17.05, 8.05, z));
  // Ниши-окна на внутренней стороне стены.
  const lancet = lancetGlassTex();
  for (const z of [-12, -4, 4, 12]) {
    const sh = archShape(1.3, 2.4, 0.85);
    L.add(extrudeGeo(sh, 0.06), M.black, mat4(-16.47, 2.2, z, 0, Math.PI / 2, 0), { cast: false });
    const ring = archRingShape(1.3, 0.18, 2.4, 0.85);
    L.add(extrudeGeo(ring, 0.18), M.trim, mat4(-16.42, 2.2, z, 0, Math.PI / 2, 0));
  }
  void lancet;
  const pillarZ = [-14, -10, -6, -2, 2, 6, 10, 14];
  let top = 0;
  for (const z of pillarZ) top = P.pillar(L, M, -12, z, 4.2, { broken: z === 6 });
  for (let i = 0; i < pillarZ.length - 1; i++) {
    const a = pillarZ[i], b = pillarZ[i + 1];
    if (a === 2 || a === 6) continue;
    P.archSpan(L, M, -12, a, -12, b, top, { depth: 0.6 });
  }
  for (const z of [-14, -6, -2, 14]) P.archSpan(L, M, -12, z, -16.5, z, top, { depth: 0.5, extra: 0.5 });
  P.rubble(L, M, -12.5, 4.5, 9, 1.8);
  P.rubble(L, M, -14.5, 7.5, 5, 1.2);
  P.wallTorch(L, M, -16.45, 3.0, -8, Math.PI / 2, { intensity: 16 });
  P.wallTorch(L, M, -16.45, 3.0, 8, Math.PI / 2, { intensity: 16 });

  // ——— Площадь ———
  P.stoneCross(L, M, 0, -10.5, 0.95);
  buildBrazier(L, M, -6.2, -8.5);
  P.candles(L, M, 1.0, 0.6, -9.3, 6, 0.3);
  P.candles(L, M, -0.8, 0.6, -9.5, 4, 0.25);

  // ——— Фонари вдоль дорожки ———
  P.lampPost(L, M, -3.4, 12, Math.PI / 2);
  P.lampPost(L, M, 3.4, 3.5, -Math.PI / 2);
  P.lampPost(L, M, -3.4, -4.5, Math.PI / 2);

  // ——— Кладбище (справа) ———
  buildMausoleum(L, M, 16, -12);
  const trees = [[9.2, 3.5, 1.15], [16.8, 12.5, 1.3], [-7.5, 13.5, 1.2], [-7.8, -2.5, 0.95]];
  for (const [x, z, s] of trees) P.deadTree(L, M, x, z, s);
  for (const x of [7.4, 10, 12.6, 15.2, 17.8]) {
    for (let z = -6; z < 18; z += 2.4 + rng() * 0.6) {
      const jx = x + (rng() - 0.5) * 0.7, jz = z + (rng() - 0.5) * 0.6;
      if (x > 12 && jz < -7.5) continue;
      if (trees.some(([tx, tz]) => Math.hypot(tx - jx, tz - jz) < 1.6)) continue;
      if (rng() < 0.12) continue;
      const r = rng();
      const kind = r < 0.45 ? 0 : r < 0.65 ? 1 : r < 0.88 ? 2 : 3;
      P.tombstone(L, M, jx, jz, kind, -Math.PI / 2 + (rng() - 0.5) * 0.3);
      if (kind < 3 && rng() < 0.6) {
        L.add(boxGeo(1.7, 0.14, 0.85, rng), M.dirt, mat4(jx - 1.1, 0.03, jz, 0.02, (rng() - 0.5) * 0.15, 0), { cast: false });
      }
      if (rng() < 0.14) P.candles(L, M, jx - 0.45, 0.0, jz + 0.2, 3, 0.15);
    }
  }
  P.candles(L, M, 10.4, 0.0, 9.0, 5, 0.25);

  // ——— Ограды ———
  P.ironFence(L, M, -16.5, 19.5, -1.9, 19.5);
  P.ironFence(L, M, 1.9, 19.5, 19.5, 19.5);
  P.ironFence(L, M, -1.5, 19.5, 1.5, 19.5, { h: 2.6, postEvery: 10 });
  for (const sx of [-1, 1]) {
    L.add(boxGeo(0.75, 3.2, 0.75, rng), M.trim, mat4(sx * 1.85, 1.6, 19.5));
    L.add(boxGeo(0.95, 0.2, 0.95, rng), M.trim, mat4(sx * 1.85, 3.3, 19.5));
    L.add(new THREE.SphereGeometry(0.3, 10, 8), M.trim, mat4(sx * 1.85, 3.65, 19.5));
  }
  P.ironFence(L, M, 19.5, -18.4, 19.5, 19.5);

  // ——— Горгульи, клетки, вороны ———
  for (const sx of [-1, 1]) {
    Q.gargoyle(L, M, sx * 7.6, 15.2, -18.7, 0, 1.1);
    Q.gargoyle(L, M, sx * 10.5 + sx * 2.2, 25.2, -18.2, sx * 0.4, 1.3);
    Q.gargoyle(L, M, sx * 10.5 - sx * 2.2, 25.2, -18.2, -sx * 0.2, 1.3);
  }
  Q.hangingCage(L, M, -13.2, 6.9, -10.5);
  Q.hangingCage(L, M, -13.4, 6.9, 12);
  (L.perchCandidates ||= []).push(new V3(0.85, 4.65, -10.5), new V3(-0.85, 4.65, -10.5), new V3(14.5, 6.0, -12), new V3(2.6, 0.15, -17.6));

  // ——— Лес за оградой и дальний план ———
  for (let i = 0; i < 34; i++) {
    let x, z;
    if (i < 18) { x = -24 + rng() * 64; z = 23 + rng() * 22; }
    else { x = 23 + rng() * 22; z = -24 + rng() * 48; }
    P.deadTree(L, M, x, z, 1.1 + rng() * 0.9, { depth: 3 });
  }
  // Левее и позади аркады — тоже деревья, чтобы над стеной были силуэты.
  for (let i = 0; i < 10; i++) P.deadTree(L, M, -22 - rng() * 18, -15 + rng() * 40, 1.4 + rng() * 0.8, { depth: 3 });
  buildDistant(L);

  L.flush();
  L.colliders = L.colliders.filter((c) => !(c.type === 'circle' && (Math.abs(c.x) > 21 || Math.abs(c.z) > 21)));
  // Лужи на дорожке и площади перед собором.
  const pavedOnly = (x, z) => ((Math.abs(x) < 2.3 && z > -6 && z < 18) || (Math.abs(x) < 8.3 && z > -18 && z < -6)) && groundMask(L)(x, z);
  addPuddles(L, { count: 16, area: 18, seed: seed + 4, mask: pavedOnly });
  L.ambient = { bats: 8, spores: 0.25, fogBanks: 10, fogBankRadius: [12, 30] };
  L.pickPerches(7);
  // Кладбищенская трава: всё, что не замощено.
  addGrass(L, {
    area: 36, count: 6000, seed: seed + 11, scale: [0.28, 0.75], tint: 0xc0b8a8,
    mask: groundMask(L, [{ x0: -2.7, z0: -6, x1: 2.7, z1: 19.5 }, { x0: -8.5, z0: -18.5, x1: 8.5, z1: -6 }, { x0: -16.5, z0: -18.5, x1: -11, z1: 19.5 }, { x0: -9, z0: -40, x1: 9, z1: -18 }]),
  });

  L.playerStart.set(0, 0, 10);
  L.rewardPoint = new V3(0, 0, -2.5);
  L.bossPoint = new V3(0, 0, -15.5);
  L.exitPoints = [
    { pos: new V3(0, 0, 18.3), yaw: 0 },
    { pos: new V3(-14, 0, -16.4), yaw: 0 },
    { pos: new V3(5.2, 0, -16.6), yaw: 0 },
  ];
  L.spawnPoints = [
    new V3(0, 0, -16.6), new V3(-14.2, 0, -9), new V3(-14.2, 0, 9), new V3(12.2, 0, -12),
    new V3(13.5, 0, 7), new V3(17.5, 0, -3), new V3(0, 0, 18.3), new V3(9.5, 0, 16),
    new V3(-9, 0, 17), new V3(-6, 0, -14.5), new V3(6, 0, -15),
  ];
  return L;
}

function buildFacade(L, M) {
  const rng = L.rng;
  const W = 16, H = 15, D = 1.6, zc = -19.3;
  const doorW = 3.6, doorSpring = 4.2, rf = 0.85;
  const rose = { y: 10.6, r: 2.4 };

  // Стена с порталом и круглым проёмом под розу.
  const door = archPoints(doorW, doorSpring, rf);
  const s = new THREE.Shape();
  s.moveTo(-W / 2, 0);
  for (const p of door) s.lineTo(p.x, p.y);
  s.lineTo(W / 2, 0); s.lineTo(W / 2, H); s.lineTo(-W / 2, H); s.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, rose.y, rose.r + 0.15, 0, Math.PI * 2, true);
  s.holes.push(hole);
  L.add(extrudeGeo(s, D), M.stone, mat4(0, 0, zc));
  L.box(-8, -21, 8, -18.5);

  // Фронтон.
  const g = new THREE.Shape();
  g.moveTo(-W / 2, 0); g.lineTo(W / 2, 0); g.lineTo(0, 6.5); g.closePath();
  L.add(extrudeGeo(g, 1.2), M.stone, mat4(0, H, zc));
  L.add(boxGeo(W + 0.6, 0.4, D + 0.3, rng), M.trim, mat4(0, H, zc));
  // Крест на вершине фронтона.
  L.add(boxGeo(0.25, 1.8, 0.25, rng), M.iron, mat4(0, H + 7.3, zc));
  L.add(boxGeo(1.0, 0.22, 0.22, rng), M.iron, mat4(0, H + 7.6, zc));
  // Аркатурный пояс над порталом.
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const sh = archShape(0.8, 1.6, 0.85);
    L.add(extrudeGeo(sh, 0.25), M.trim, mat4(i * 1.6, 6.3, -18.45));
    L.add(extrudeGeo(archShape(0.55, 1.45, 0.85), 0.05), M.black, mat4(i * 1.6, 6.35, -18.31), { cast: false });
  }

  // Архивольты портала.
  L.add(extrudeGeo(archRingShape(doorW, 0.35, doorSpring, rf), 0.35), M.trim, mat4(0, 0, -18.38));
  L.add(extrudeGeo(archRingShape(doorW + 0.7, 0.4, doorSpring, rf), 0.4), M.trim, mat4(0, 0, -18.15));
  L.add(boxGeo(7.5, 0.14, 1.4, rng), M.trim, mat4(0, 0.07, -17.8), { cast: false });

  // Святые в нишах по сторонам портала и высокие витражные окна над ними.
  for (const sx of [-1, 1]) {
    L.add(extrudeGeo(archShape(1.5, 2.4, 0.85), 0.05), M.black, mat4(sx * 4.7, 0.9, -18.47), { cast: false });
    L.add(extrudeGeo(archRingShape(1.5, 0.22, 2.4, 0.85), 0.3), M.trim, mat4(sx * 4.7, 0.9, -18.35));
    Q.saint(L, M, sx * 4.7, 0.9, -18.1, 0, 1.0);
    P.candles(L, M, sx * 4.7 + 0.5, 0, -17.6, 4, 0.2);
    Q.stainedWindow(L, sx * 5.4, 7.6, -18.48, 0, 1.3, 3.0, [1.7, 1.2, 1.2]);
    L.add(extrudeGeo(archRingShape(1.3, 0.2, 3.0, 0.85), 0.25), M.trim, mat4(sx * 5.4, 7.6, -18.4));
  }

  // Внутренность портала: тёплое свечение изнутри собора.
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(doorW, 7.2), withFog(new THREE.MeshBasicMaterial({
    color: 0xffffff, map: interiorGlowTex(), transparent: false,
  })));
  inner.position.set(0, 3.6, -20.05);
  L.addMesh(inner);
  // Приоткрытые створки.
  for (const sx of [-1, 1]) {
    const leaf = boxGeo(1.75, 4.6, 0.12, rng);
    leaf.translate(-sx * 0.875, 2.3, 0);
    L.add(leaf, M.wood, mat4(sx * 1.8, 0, -19.9, 0, sx * 1.1, 0));
  }
  const pl = new THREE.PointLight(0xff8a40, 22, 12, 2);
  pl.position.set(0, 2.2, -19.3);
  L.root.add(pl);
  L.fires.push({ light: pl, base: 22, seed: 3.3, sprites: [] });
  P.candles(L, M, -1.0, 0, -19.8, 7, 0.4);
  P.candles(L, M, 1.1, 0, -19.7, 6, 0.4);
  P.wallTorch(L, M, -2.95, 3.0, -18.0, 0, { intensity: 20 });
  P.wallTorch(L, M, 2.95, 3.0, -18.0, 0, { intensity: 20 });

  // Роза-витраж: стекло светится изнутри, поверх — каменная ажурная решётка.
  const glass = new THREE.Mesh(new THREE.CircleGeometry(rose.r + 0.15, 48), withFog(new THREE.MeshBasicMaterial({
    map: roseWindowTex(), color: new THREE.Color(1.8, 1.5, 1.5),
  })));
  glass.position.set(0, rose.y, zc - 0.1);
  L.addMesh(glass);
  L.add(new THREE.TorusGeometry(rose.r + 0.12, 0.22, 8, 48), M.trim, mat4(0, rose.y, -18.55));
  L.add(new THREE.TorusGeometry(rose.r * 0.4, 0.09, 6, 32), M.trim, mat4(0, rose.y, -18.6));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, len = rose.r * 0.6;
    const r0 = rose.r * 0.4 + len / 2;
    L.add(boxGeo(len, 0.09, 0.12, rng), M.trim, mat4(Math.cos(a) * r0, rose.y + Math.sin(a) * r0, -18.6, 0, 0, a));
  }

  // Башни.
  const lancet = lancetGlassTex();
  for (const sx of [-1, 1]) {
    const tx = sx * 10.5, tz = -20.5;
    L.add(boxGeo(5, 25, 5, rng), M.stone, mat4(tx, 12.5, tz));
    L.box(tx - 2.5, tz - 2.5, tx + 2.5, tz + 2.5);
    for (const y of [8, 16, 25]) L.add(boxGeo(5.5, 0.4, 5.5, rng), M.trim, mat4(tx, y, tz));
    // Контрфорсы.
    for (const bx of [-2.3, 2.3]) {
      L.add(boxGeo(0.9, 12, 1.6, rng), M.stone, mat4(tx + bx, 6, tz + 3.0));
      L.add(boxGeo(0.8, 6, 1.0, rng), M.stone, mat4(tx + bx, 15, tz + 2.75));
      L.add(new THREE.ConeGeometry(0.55, 1.6, 4), M.stone, mat4(tx + bx, 12.8, tz + 3.0, 0, Math.PI / 4, 0));
      L.box(tx + bx - 0.45, tz + 2.2, tx + bx + 0.45, tz + 3.8);
    }
    // Шатёр и пинакли.
    L.add(new THREE.ConeGeometry(3.6, 11, 4), M.slate, mat4(tx, 25.2 + 5.5, tz, 0, Math.PI / 4, 0));
    for (const [px, pz] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) {
      L.add(boxGeo(0.6, 1.2, 0.6, rng), M.stone, mat4(tx + px, 25.8, tz + pz));
      L.add(new THREE.ConeGeometry(0.42, 2.0, 4), M.stone, mat4(tx + px, 27.4, tz + pz, 0, Math.PI / 4, 0));
    }
    // Стрельчатые окна башни.
    for (const [y, lit] of [[10, false], [17.5, sx > 0], [21, sx < 0]]) {
      L.add(extrudeGeo(archRingShape(1.1, 0.2, 2.2, 0.85), 0.2), M.trim, mat4(tx, y, tz + 2.55));
      const win = new THREE.Mesh(extrudeGeo(archShape(1.1, 2.2, 0.85), 0.05), withFog(lit
        ? new THREE.MeshBasicMaterial({ map: lancet, color: new THREE.Color(2.2, 1.4, 1.0) })
        : new THREE.MeshStandardMaterial({ color: 0x040304, roughness: 0.3, metalness: 0.2 })));
      win.position.set(tx, y, tz + 2.5);
      if (lit) {
        const uv = win.geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.1 + 0.5, uv.getY(i) / 2.8);
      }
      L.addMesh(win);
    }
  }

  // Неф за фасадом (виден сбоку) и его крыша.
  L.add(boxGeo(16, 15, 22, rng), M.stone, mat4(0, 7.5, -31.1));
  const roof = new THREE.Shape();
  roof.moveTo(-8.6, 0); roof.lineTo(8.6, 0); roof.lineTo(0, 7); roof.closePath();
  L.add(extrudeGeo(roof, 22), M.slate, mat4(0, 15, -31.1));
  for (const sx of [-1, 1]) for (let z = -23; z > -42; z -= 4.5) {
    L.add(boxGeo(1, 12, 1.4, rng), M.stone, mat4(sx * 8.5, 6, z));
  }
}

function buildBrazier(L, M, x, z) {
  const rng = L.rng;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    L.add(cylGeo(0.03, 0.04, 1.1, 5, rng), M.iron, mat4(x + Math.cos(a) * 0.25, 0.5, z + Math.sin(a) * 0.25, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25));
  }
  const bowl = new THREE.CylinderGeometry(0.42, 0.25, 0.3, 12, 1, true);
  L.add(bowl, M.iron, mat4(x, 1.1, z));
  L.add(new THREE.CircleGeometry(0.4, 12).rotateX(-Math.PI / 2), M.black, mat4(x, 1.15, z), { cast: false });
  L.addFire(x, 1.15, z, { scale: 1.2, intensity: 26, distance: 15 });
  L.circle(x, z, 0.5);
  // Угли: искры летят вверх.
  L.embers = L.embers || [];
  L.embers.push(new V3(x, 1.3, z));
}

function buildMausoleum(L, M, cx, cz) {
  const rng = L.rng;
  const front = cx - 2.25;
  L.add(boxGeo(5.6, 0.45, 6.6, rng), M.trim, mat4(cx - 0.3, 0.22, cz));
  L.add(boxGeo(4.5, 3.6, 5.5, rng), M.stone, mat4(cx, 2.25, cz));
  // Портик.
  for (const dz of [-1.7, 1.7]) {
    L.add(cylGeo(0.2, 0.24, 3.3, 10, rng), M.trim, mat4(front - 0.85, 2.1, cz + dz));
    L.add(boxGeo(0.55, 0.25, 0.55, rng), M.trim, mat4(front - 0.85, 3.85, cz + dz));
  }
  L.add(boxGeo(1.3, 0.45, 4.4, rng), M.trim, mat4(front - 0.5, 4.2, cz));
  const tri = new THREE.Shape();
  tri.moveTo(-3.3, 0); tri.lineTo(3.3, 0); tri.lineTo(0, 1.7); tri.closePath();
  L.add(extrudeGeo(tri, 6.0), M.slate, mat4(cx - 0.55, 4.42, cz, 0, Math.PI / 2, 0));
  L.add(extrudeGeo(tri, 0.3), M.trim, mat4(front - 1.0, 4.42, cz, 0, Math.PI / 2, 0));
  // Железная дверь и красный отсвет из щели.
  L.add(boxGeo(0.12, 2.5, 1.5, rng), M.iron, mat4(front - 0.02, 1.7, cz));
  L.add(boxGeo(0.2, 0.2, 1.8, rng), M.trim, mat4(front - 0.05, 3.0, cz));
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 2.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.15) }));
  slit.position.set(front - 0.09, 1.7, cz);
  slit.rotation.y = -Math.PI / 2;
  L.addMesh(slit);
  const red = new THREE.PointLight(0xff2a1a, 5, 7, 2);
  red.position.set(front - 0.6, 1.2, cz);
  L.root.add(red);
  L.fires.push({ light: red, base: 5, seed: 9.1, sprites: [] });
  P.candles(L, M, front - 0.9, 0.45, cz - 1.1, 4, 0.2);
  P.candles(L, M, front - 0.9, 0.45, cz + 1.1, 3, 0.2);
  L.box(front - 1.2, cz - 3.3, cx + 2.6, cz + 3.3);
}

// Дальний план: холмы и замок на фоне луны. Без тумана, чтобы силуэт читался.
function buildDistant(L) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x14070a, fog: false });
  const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.4), fog: false });
  const group = new THREE.Group();
  const add = (geo, x, y, z, m = mat) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); group.add(o); return o; };
  const hill = add(new THREE.SphereGeometry(70, 24, 12), 120, -42, -200);
  hill.scale.set(1.4, 0.75, 1);
  add(new THREE.SphereGeometry(80, 24, 12), -60, -55, -220).scale.set(1.8, 0.7, 1);
  add(new THREE.SphereGeometry(90, 24, 12), 230, -60, -40).scale.set(1, 0.6, 1.8);
  // Замок.
  const cx = 118, cy = 8, cz = -196;
  add(new THREE.BoxGeometry(34, 14, 12), cx, cy + 7, cz);
  for (const [dx, h, r] of [[-17, 26, 3.2], [17, 22, 3], [-5, 36, 3.6], [8, 30, 2.6], [-26, 16, 2.4]]) {
    add(new THREE.CylinderGeometry(r, r * 1.1, h, 8), cx + dx, cy + h / 2, cz);
    add(new THREE.ConeGeometry(r * 1.35, h * 0.45, 8), cx + dx, cy + h + h * 0.22, cz);
  }
  for (const [dx, dy] of [[-5, 26], [8, 22], [-17, 18], [3, 9]]) add(new THREE.BoxGeometry(0.8, 1.6, 0.5), cx + dx, cy + dy, cz + 4, lit);
  L.root.add(group);
}

// Тёплый градиент «освещённого свечами интерьера».
function interiorGlowTex() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, '#ffb060');
  g.addColorStop(0.25, '#c05a20');
  g.addColorStop(0.6, '#3a1208');
  g.addColorStop(1, '#0a0303');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 128);
  // Силуэты колонн нефа.
  ctx.fillStyle = 'rgba(10,3,2,0.85)';
  ctx.fillRect(4, 10, 7, 118); ctx.fillRect(53, 10, 7, 118);
  ctx.fillRect(18, 40, 4, 88); ctx.fillRect(42, 40, 4, 88);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
