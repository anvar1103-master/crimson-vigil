// Терновый лес: поляна в кольце мёртвых деревьев, каменный круг, болотца, грибы и блуждающие огни.
import * as THREE from 'three';
import { Level } from '../level.js';
import { mat4 } from '../geo.js';
import * as P from '../props.js';
import * as Q from '../props2.js';
import { registerBiome } from '../biomes.js';
import { scatter, corridors } from './village.js';
import { addGrass, groundMask } from '../grass.js';

const V3 = THREE.Vector3;

export function buildForest(scene, seed = 1) {
  const L = new Level(scene, seed);
  const M = Q.extraMaterials(P.createMaterials());
  // Лесная земля зеленее и темнее.
  M.ground.color.set(0x8a9a80);
  L.mats = M;
  const rng = L.rng;
  const R = 20;
  L.bounds = { minX: -R, maxX: R, minZ: -R, maxZ: R };
  L.playerStart.set(0, 0, 15);
  L.playerYaw = 0;

  const ground = new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2);
  const guv = ground.attributes.uv;
  for (let i = 0; i < guv.count; i++) guv.setXY(i, guv.getX(i) * 300, guv.getY(i) * 300);
  L.add(ground, M.ground, null, { cast: false });

  // Стена леса: плотное кольцо стволов и валунов. Коллайдеры круга не дают уйти с поляны.
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + rng() * 0.1;
    const r = R + 1.5 + rng() * 3;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    // Просеки-выходы оставляем свободными (север, восток, запад).
    if ([Math.PI * 1.5, 0, Math.PI].some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.13)) continue;
    P.deadTree(L, M, x, z, 1.5 + rng() * 0.9, { depth: 4 });
    if (rng() < 0.4) Q.rock(L, M, x + (rng() - 0.5) * 3, z + (rng() - 0.5) * 3, 0.8 + rng() * 1.2);
  }
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2, r = R + 7 + rng() * 22;
    P.deadTree(L, M, Math.cos(a) * r, Math.sin(a) * r, 1.6 + rng(), { depth: 3 });
  }

  // Центр: каменный круг, разрушенная часовня или полое древо.
  const landmark = Math.floor(rng() * 3);
  if (landmark === 0) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      if (rng() < 0.15) continue;
      Q.menhir(L, M, Math.cos(a) * 5.5, -2 + Math.sin(a) * 5.5, 2.6 + rng() * 1.6, (rng() - 0.5) * 0.25);
    }
    Q.rock(L, M, 0, -2, 1.0, 0.5);
    P.candles(L, M, 0, 0.55, -2, 6, 0.35, true);
  } else if (landmark === 1) {
    // Руины часовни: обломки стен и арка.
    P.pillar(L, M, -3, -4, 4.2, {});
    P.pillar(L, M, 3, -4, 4.2, {});
    P.archSpan(L, M, -3, -4, 3, -4, 5.2, { depth: 0.6 });
    P.pillar(L, M, -3, 1, 4.2, { broken: true });
    P.pillar(L, M, 3, 1.5, 4.2, { broken: true });
    P.rubble(L, M, 0, -1, 10, 2.5);
    P.candles(L, M, 0, 0, -4.5, 7, 0.4, true);
  } else {
    // Огромное полое древо.
    P.deadTree(L, M, 0, -3, 3.2, { depth: 5 });
    Q.mushrooms(L, M, 1.2, -2, 10);
    Q.mushrooms(L, M, -1.4, -3.6, 8);
  }

  // Болотца, грибы, коряги, терн, лагерь.
  const avoid = [
    { x: 0, z: -2, r: 7 }, { x: 0, z: 15, r: 4 }, { x: 0, z: 9, r: 3 }, { x: 0, z: -18, r: 3.5 }, { x: 18, z: 0, r: 3.5 }, { x: -18, z: 0, r: 3.5 }, { x: 0, z: 4, r: 2.5 },
    ...corridors([{ x: 0, z: -18.5 }, { x: 18.5, z: 0 }, { x: -18.5, z: 0 }, { x: 0, z: 15 }], { x: 0, z: 5 }),
  ];
  const spots = scatter(L, 18, 3.4, 16, avoid).filter((s) => Math.hypot(s.x, s.z) < 17.5);
  spots.forEach((s, i) => {
    const t = i % 7;
    if (t === 0) Q.pool(L, M, s.x, s.z, 1.8 + rng() * 1.5);
    else if (t === 1) Q.log(L, M, s.x, s.z, rng() * 6, 3 + rng() * 2);
    else if (t === 2) Q.rock(L, M, s.x, s.z, 0.6 + rng() * 0.8);
    else if (t === 3) Q.thornBush(L, M, s.x, s.z, 1 + rng() * 0.5);
    else if (t === 4) { Q.mushrooms(L, M, s.x, s.z, 7); P.deadTree(L, M, s.x + 1, s.z + 0.5, 0.9 + rng() * 0.3, { depth: 3 }); }
    else if (t === 5) P.tombstone(L, M, s.x, s.z, 2, rng() * 6);
    else P.deadTree(L, M, s.x, s.z, 1.1 + rng() * 0.5);
  });
  // Лагерь охотников — тёплый островок света.
  const campSpot = scatter(L, 1, 1, 12, avoid.concat(spots.map((s) => ({ x: s.x, z: s.z, r: 3.5 }))))[0];
  if (campSpot) Q.camp(L, M, campSpot.x, campSpot.z);
  for (let i = 0; i < 3; i++) {
    const s = scatter(L, 1, 1, 14, avoid)[0];
    if (s) Q.wisp(L, s.x, s.z, { light: i < 2 });
  }
  for (const s of scatter(L, 6, 4, 18, avoid)) Q.mushrooms(L, M, s.x, s.z, 5);

  L.flush();
  // Густой подлесок по всей поляне и за её краем.
  addGrass(L, { area: 30, count: 9000, mask: groundMask(L), scale: [0.3, 0.85], tint: 0xb8c0a0, seed: seed + 3 });
  // Деревья по кольцу ставят коллайдеры-круги; поляна остаётся круглой благодаря им.
  L.rewardPoint = new V3(0, 0, 5);
  L.bossPoint = new V3(0, 0, -12);
  L.exitPoints = [
    { pos: new V3(0, 0, -18.5), yaw: 0 },
    { pos: new V3(18.5, 0, 0), yaw: Math.PI / 2 },
    { pos: new V3(-18.5, 0, 0), yaw: Math.PI / 2 },
  ];
  L.spawnPoints = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    L.spawnPoints.push(new V3(Math.cos(a) * 17.5, 0, Math.sin(a) * 17.5));
  }
  return L;
}

registerBiome('forest', buildForest);
void mat4;
