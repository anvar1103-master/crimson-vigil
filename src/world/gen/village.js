// Деревня Холлоумир: площадь в кольце фахверковых домов, горящие крыши, ливень.
import * as THREE from 'three';
import { Level } from '../level.js';
import { boxGeo, mat4 } from '../geo.js';
import * as P from '../props.js';
import * as Q from '../props2.js';
import { registerBiome } from '../biomes.js';

const V3 = THREE.Vector3;

export function scatter(L, n, minD, R, avoid) {
  const out = [];
  let tries = 0;
  while (out.length < n && tries++ < n * 60) {
    const x = (L.rng() * 2 - 1) * R, z = (L.rng() * 2 - 1) * R;
    if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < a.r)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < minD)) continue;
    out.push({ x, z });
  }
  return out;
}

export function buildVillage(scene, seed = 1) {
  const L = new Level(scene, seed);
  const M = Q.extraMaterials(P.createMaterials());
  L.mats = M;
  const rng = L.rng;
  const B = 18.6;
  L.bounds = { minX: -B, maxX: B, minZ: -B, maxZ: B };
  L.playerStart.set(0, 0, 15);
  L.playerYaw = 0;

  // Земля: грязь + брусчатка площади и улиц.
  const ground = new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2);
  const guv = ground.attributes.uv;
  for (let i = 0; i < guv.count; i++) guv.setXY(i, guv.getX(i) * 300, guv.getY(i) * 300);
  L.add(ground, M.ground, null, { cast: false });
  const disk = new THREE.CircleGeometry(10, 40).rotateX(-Math.PI / 2);
  const duv = disk.attributes.uv, dpos = disk.attributes.position;
  for (let i = 0; i < duv.count; i++) duv.setXY(i, dpos.getX(i), dpos.getZ(i));
  L.add(disk, M.cobble, mat4(0, 0.012, -1), { cast: false });
  const street = (x0, z0, x1, z1) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0), uv.getY(i) * (z1 - z0));
    L.add(g, M.cobble, mat4((x0 + x1) / 2, 0.01, (z0 + z1) / 2), { cast: false });
  };
  street(-2.6, -40, 2.6, -10); street(-2.6, 8, 2.6, 40); street(8, -3.6, 40, 1.6); street(-40, -3.6, -8, 1.6);

  // Дома по периметру, на каждой стороне — проход-улица посередине.
  const slots = [-14, -6.5, 6.5, 14];
  const burning = new Set([Math.floor(rng() * 16), Math.floor(rng() * 16)]);
  let k = 0;
  const sides = [
    { ry: 0, at: (s) => [s, -21.5] },
    { ry: Math.PI, at: (s) => [s, 21.5] },
    { ry: -Math.PI / 2, at: (s) => [21.5, s] },
    { ry: Math.PI / 2, at: (s) => [-21.5, s] },
  ];
  for (const side of sides) {
    for (const s of slots) {
      const [x, z] = side.at(s + (rng() - 0.5) * 0.6);
      Q.house(L, M, x, z, side.ry + (rng() - 0.5) * 0.06, { w: 6 + rng() * 1.2, d: 5 + rng(), burning: burning.has(k), lit: 0.45 });
      k++;
    }
  }
  // Дальние дома за улицами — для глубины.
  for (const [x, z, ry] of [[-6, -34, 0], [7, -36, 0], [34, -8, -Math.PI / 2], [35, 7, -Math.PI / 2], [-34, 8, Math.PI / 2], [-35, -9, Math.PI / 2], [-6, 33, Math.PI], [6, 34, Math.PI]]) {
    Q.house(L, M, x, z, ry, { w: 6, d: 5, lit: 0.3 });
  }
  // Баррикада за спиной у входа.
  Q.cart(L, M, -1.2, 19.6, Math.PI / 2 + 0.3, 0.15);
  Q.crate(L, M, 1.6, 19.4); Q.crate(L, M, 1.7, 19.3, 0.8, 0.7);
  Q.barrel(L, M, 2.3, 18.6);

  // Центр: колодец, виселица или крест святого.
  const landmark = Math.floor(rng() * 3);
  if (landmark === 0) Q.well(L, M, 0, -1.5);
  else if (landmark === 1) Q.gallows(L, M, 0, -2.5, rng() * 0.5);
  else P.stoneCross(L, M, 0, -2, 0.85);
  P.candles(L, M, 1.6, 0, 0.2, 5, 0.3);

  // Фонари вокруг площади.
  for (const [x, z, f] of [[-7.5, -8.5, Math.PI / 4], [7.5, -8.5, -Math.PI / 4], [-7.5, 6.5, Math.PI * 0.75], [7.5, 6.5, -Math.PI * 0.75]]) {
    P.lampPost(L, M, x, z, f, { intensity: 16 });
  }

  // Разбросанные пропсы.
  const avoid = [
    { x: 0, z: -1.5, r: 3.5 }, { x: 0, z: 15, r: 4 }, { x: 0, z: 10, r: 3 }, { x: 0, z: 6, r: 2.5 }, { x: 0, z: -18, r: 3.5 }, { x: 18, z: -1, r: 3.5 },
    { x: -18, z: -1, r: 3.5 }, { x: -7.5, z: -8.5, r: 1 }, { x: 7.5, z: -8.5, r: 1 }, { x: -7.5, z: 6.5, r: 1 }, { x: 7.5, z: 6.5, r: 1 },
  ];
  const spots = scatter(L, 16, 3.2, 16.5, avoid);
  spots.forEach((s, i) => {
    const t = i % 8;
    if (t === 0) Q.cart(L, M, s.x, s.z, rng() * 6, rng() < 0.3 ? 0.25 : 0);
    else if (t === 1) Q.stall(L, M, s.x, s.z, Math.atan2(-s.x, -s.z));
    else if (t === 2) { Q.barrel(L, M, s.x, s.z); Q.barrel(L, M, s.x + 0.8, s.z + 0.3); Q.barrel(L, M, s.x + 0.3, s.z - 0.9, 0, true); }
    else if (t === 3) { Q.crate(L, M, s.x, s.z); Q.crate(L, M, s.x + 0.9, s.z + 0.2, 0, 0.7); Q.crate(L, M, s.x + 0.4, s.z, 0.8, 0.6); }
    else if (t === 4) { Q.haybale(L, M, s.x, s.z); Q.haybale(L, M, s.x + 1.2, s.z + 0.4); }
    else if (t === 5) Q.woodFence(L, M, s.x - 2, s.z, s.x + 2, s.z + (rng() - 0.5) * 2);
    else if (t === 6) P.deadTree(L, M, s.x, s.z, 1.0 + rng() * 0.3);
    else { P.tombstone(L, M, s.x, s.z, 2, rng() * 6); P.candles(L, M, s.x + 0.4, 0, s.z + 0.3, 3, 0.15); }
  });

  // Дальний план: холмы, мельница, шпиль церкви.
  const sil = new THREE.MeshBasicMaterial({ color: 0x150806, fog: false });
  const far = new THREE.Group();
  const add = (geo, x, y, z) => { const m = new THREE.Mesh(geo, sil); m.position.set(x, y, z); far.add(m); return m; };
  add(new THREE.SphereGeometry(90, 20, 10), 0, -70, -230).scale.set(2.2, 0.6, 1);
  add(new THREE.SphereGeometry(80, 20, 10), 200, -55, -60).scale.set(1, 0.6, 2);
  add(new THREE.CylinderGeometry(4, 6, 22, 8), -70, 11, -170);
  const blades = add(new THREE.BoxGeometry(1.2, 34, 0.5), -70, 22, -165);
  blades.rotation.z = 0.5;
  add(new THREE.BoxGeometry(1.2, 34, 0.5), -70, 22, -165).rotation.z = 0.5 + Math.PI / 2;
  add(new THREE.BoxGeometry(10, 18, 14), 60, 9, -180);
  add(new THREE.ConeGeometry(4.5, 26, 4), 60, 35, -183).rotation.y = Math.PI / 4;
  L.root.add(far);
  L.updaters.push((dt) => { blades.rotation.z += dt * 0.05; });

  L.flush();
  L.rewardPoint = new V3(0, 0, 4.5);
  L.bossPoint = new V3(0, 0, -12);
  L.exitPoints = [
    { pos: new V3(0, 0, -17.6), yaw: 0 },
    { pos: new V3(17.6, 0, -1), yaw: Math.PI / 2 },
    { pos: new V3(-17.6, 0, -1), yaw: Math.PI / 2 },
  ];
  L.spawnPoints = [
    new V3(0, 0, -17.5), new V3(17.5, 0, -1), new V3(-17.5, 0, -1), new V3(-10.5, 0, -17.8), new V3(10.5, 0, -17.8),
    new V3(17.8, 0, 10.2), new V3(-17.8, 0, 10.2), new V3(17.8, 0, -10.2), new V3(-17.8, 0, -10.2), new V3(10, 0, 17.6), new V3(-10, 0, 17.6),
  ];
  return L;
}

registerBiome('village', buildVillage);
void boxGeo;
