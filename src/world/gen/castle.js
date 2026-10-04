// Замок Морвейн: внутренний двор с куртинами и башнями; тронный зал для финального босса.
import * as THREE from 'three';
import { Level } from '../level.js';
import { boxGeo, cylGeo, extrudeGeo, archPoints, archRingShape, mat4 } from '../geo.js';
import * as P from '../props.js';
import * as Q from '../props2.js';
import { registerBiome } from '../biomes.js';
import { withFog } from '../../core/fog.js';
import { scatter, corridors } from './village.js';

const V3 = THREE.Vector3;

function ground(L, M, mat = M.cobble) {
  const g = new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 300, uv.getY(i) * 300);
  L.add(g, mat, null, { cast: false });
}

// Стена с зубцами.
function curtain(L, M, x0, z0, x1, z1, h = 10, t = 2) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ang = Math.atan2(dx, dz);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  L.add(boxGeo(t, h, len, L.rng), M.stone, mat4(cx, h / 2, cz, 0, ang, 0));
  L.add(boxGeo(t + 0.4, 0.4, len, L.rng), M.trim, mat4(cx, h + 0.2, cz, 0, ang, 0));
  const n = Math.floor(len / 1.6);
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n - 0.5;
    L.add(boxGeo(t * 0.5, 1.0, 0.9, L.rng), M.stone, mat4(cx + dx * k, h + 0.9, cz + dz * k, 0, ang, 0));
  }
}

function tower(L, M, x, z, r = 3.4, h = 17) {
  L.add(cylGeo(r, r * 1.08, h, 16, L.rng), M.stone, mat4(x, h / 2, z));
  L.add(cylGeo(r + 0.4, r + 0.4, 0.5, 16, L.rng), M.trim, mat4(x, h + 0.25, z));
  L.add(new THREE.ConeGeometry(r + 0.6, r * 3, 16), M.slate, mat4(x, h + 0.5 + r * 1.5, z));
  for (let i = 0; i < 3; i++) {
    const a = L.rng() * 6.28, y = 5 + i * 4;
    const [wx, wz] = [x + Math.cos(a) * (r + 0.02), z + Math.sin(a) * (r + 0.02)];
    L.add(boxGeo(0.4, 1.4, 0.1, L.rng), L.rng() < 0.4 ? M.litWindow : M.darkWindow, mat4(wx, y, wz, 0, -a + Math.PI / 2, 0), { cast: false });
  }
  L.circle(x, z, r + 0.2);
}

// Статуя рыцаря на постаменте.
function statue(L, M, x, z, ry) {
  const rng = L.rng;
  L.add(boxGeo(1.4, 1.2, 1.4, rng), M.trim, mat4(x, 0.6, z, 0, ry, 0));
  L.add(boxGeo(1.6, 0.2, 1.6, rng), M.trim, mat4(x, 1.3, z, 0, ry, 0));
  L.add(cylGeo(0.35, 0.55, 1.6, 8, rng), M.stone, mat4(x, 2.2, z, 0, ry, 0));
  L.add(cylGeo(0.42, 0.36, 0.9, 8, rng), M.stone, mat4(x, 3.4, z, 0, ry, 0));
  for (const sx of [-1, 1]) L.add(new THREE.SphereGeometry(0.24, 8, 6), M.stone, mat4(x + Math.cos(ry) * sx * 0.45, 3.75, z - Math.sin(ry) * sx * 0.45));
  L.add(new THREE.SphereGeometry(0.22, 10, 8), M.stone, mat4(x, 4.1, z));
  L.add(new THREE.ConeGeometry(0.2, 0.3, 8), M.stone, mat4(x, 4.35, z));
  // Меч остриём вниз перед собой.
  const fx = x + Math.sin(ry) * 0.45, fz = z + Math.cos(ry) * 0.45;
  L.add(boxGeo(0.08, 2.2, 0.03, rng), M.stone, mat4(fx, 2.6, fz, 0, ry, 0));
  L.add(boxGeo(0.6, 0.08, 0.08, rng), M.stone, mat4(fx, 3.5, fz, 0, ry, 0));
  L.circle(x, z, 0.95);
}

function bloodFountain(L, M, x, z) {
  const rng = L.rng;
  L.add(cylGeo(3.2, 3.3, 0.7, 24, rng, true), M.trim, mat4(x, 0.35, z));
  L.add(cylGeo(2.9, 2.9, 0.7, 24, rng, true), M.trim, mat4(x, 0.35, z));
  L.add(new THREE.RingGeometry(2.9, 3.3, 24).rotateX(-Math.PI / 2), M.trim, mat4(x, 0.71, z));
  L.add(new THREE.CircleGeometry(2.9, 24).rotateX(-Math.PI / 2), M.bloodWater, mat4(x, 0.5, z), { cast: false });
  L.add(cylGeo(0.4, 0.55, 2.4, 10, rng), M.stone, mat4(x, 1.6, z));
  L.add(cylGeo(1.2, 0.3, 0.4, 16, rng), M.trim, mat4(x, 2.9, z));
  L.add(new THREE.CircleGeometry(1.1, 16).rotateX(-Math.PI / 2), M.bloodWater, mat4(x, 3.09, z), { cast: false });
  // Струйки «крови» — частицы через апдейтер уровня не нужны: красный свет снизу.
  const pl = new THREE.PointLight(0xff2030, 6, 9, 2);
  pl.position.set(x, 1.2, z);
  L.root.add(pl);
  L.fires.push({ light: pl, base: 6, seed: 4.2, sprites: [] });
  L.circle(x, z, 3.4, 0.8);
}

function brazierStand(L, M, x, z, scale = 1.2) {
  const rng = L.rng;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    L.add(cylGeo(0.03, 0.04, 1.1, 5, rng), M.iron, mat4(x + Math.cos(a) * 0.25, 0.5, z + Math.sin(a) * 0.25, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25));
  }
  L.add(new THREE.CylinderGeometry(0.42, 0.25, 0.3, 12, 1, true), M.iron, mat4(x, 1.1, z));
  L.addFire(x, 1.15, z, { scale, intensity: 26, distance: 15 });
  (L.embers ||= []).push(new V3(x, 1.3, z));
  L.circle(x, z, 0.5);
}

function chandelier(L, M, x, y, z) {
  const rng = L.rng;
  L.add(new THREE.TorusGeometry(1.2, 0.05, 6, 24).rotateX(Math.PI / 2), M.iron, mat4(x, y, z), { cast: false });
  L.add(cylGeo(0.02, 0.02, 12, 4, rng), M.iron, mat4(x, y + 6, z), { cast: false });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    L.addFire(x + Math.cos(a) * 1.2, y + 0.12, z + Math.sin(a) * 1.2, { scale: 0.16, light: false, glow: 0.7 });
  }
  const pl = new THREE.PointLight(0xffa050, 45, 22, 2);
  pl.position.set(x, y - 0.3, z);
  L.root.add(pl);
  L.fires.push({ light: pl, base: 45, seed: rng() * 100, sprites: [] });
}

export function buildCourtyard(scene, seed = 1) {
  const L = new Level(scene, seed);
  const M = Q.extraMaterials(P.createMaterials());
  L.mats = M;
  const rng = L.rng;
  const B = 18.5;
  L.bounds = { minX: -B, maxX: B, minZ: -B, maxZ: B };
  L.playerStart.set(0, 0, 15);
  L.playerYaw = 0;
  ground(L, M);

  // Куртины с проёмами для врат на востоке и западе.
  curtain(L, M, -21, 21, 21, 21);
  curtain(L, M, 21, -21, 21, -3.5); curtain(L, M, 21, 3.5, 21, 21);
  curtain(L, M, -21, -21, -21, -3.5); curtain(L, M, -21, 3.5, -21, 21);
  for (const sx of [-1, 1]) {
    // Арки боковых ворот.
    L.add(extrudeGeo(archRingShape(5.4, 1.2, 4.5, 0.85), 2.4), M.trim, mat4(sx * 21, 0, 0, 0, Math.PI / 2, 0));
    L.add(boxGeo(2.4, 3.6, 7.6, rng), M.stone, mat4(sx * 21, 10 - 1.8, 0));
  }
  for (const [x, z] of [[-21, -21], [21, -21], [-21, 21], [21, 21]]) tower(L, M, x, z);
  // Ворота за спиной — опущенная решётка.
  for (let i = -5; i <= 5; i++) L.add(boxGeo(0.08, 5, 0.08, rng), M.iron, mat4(i * 0.45, 2.5, 19.9));
  for (let j = 0; j < 6; j++) L.add(boxGeo(4.8, 0.08, 0.08, rng), M.iron, mat4(0, 0.4 + j * 0.85, 19.9));

  // Донжон на севере: фасад, большая дверь, лестница.
  const W = 26, H = 24;
  const door = archPoints(4.2, 4.5, 0.85);
  const s = new THREE.Shape();
  s.moveTo(-W / 2, 0);
  for (const p of door) s.lineTo(p.x, p.y);
  s.lineTo(W / 2, 0); s.lineTo(W / 2, H); s.lineTo(-W / 2, H); s.closePath();
  L.add(extrudeGeo(s, 3), M.stone, mat4(0, 0, -22.5));
  L.box(-13, -24, 13, -21);
  for (let i = 0; i < 4; i++) L.add(boxGeo(8 - i * 0.6, 0.22, 1.2, rng), M.trim, mat4(0, 0.11 + i * 0.22, -19.8 - i * 0.35), { cast: false });
  L.add(extrudeGeo(archRingShape(4.2, 0.45, 4.5, 0.85), 0.5), M.trim, mat4(0, 0, -20.8));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 7.5), withFog(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.18, 0.12) })));
  glow.position.set(0, 3.7, -23.5);
  L.addMesh(glow);
  for (const sx of [-1, 1]) {
    tower(L, M, sx * 14, -23, 4, 30);
    P.wallTorch(L, M, sx * 3.2, 3.2, -20.95, 0, { intensity: 22 });
    Q.stainedWindow(L, sx * 7, 11, -20.95, 0, 2.2, 4.5, [1.8, 0.8, 0.9]);
  }
  // Знамёна на стенах.
  for (const x of [-12, -6, 6, 12]) Q.banner(L, x, 9.6, 19.95, Math.PI);
  for (const z of [-12, 12]) { Q.banner(L, 19.95, 9.6, z, -Math.PI / 2); Q.banner(L, -19.95, 9.6, z, Math.PI / 2); }
  Q.banner(L, -4, 20, -20.95, 0, { w: 2.2, h: 8 });
  Q.banner(L, 4, 20, -20.95, 0, { w: 2.2, h: 8 });

  // Центр: кровавый фонтан или аллея статуй.
  if (rng() < 0.6) bloodFountain(L, M, 0, -3);
  else for (const [x, z, ry] of [[-4, -6, Math.PI / 2], [4, -6, -Math.PI / 2], [-4, 0, Math.PI / 2], [4, 0, -Math.PI / 2]]) statue(L, M, x, z, ry);
  for (const [x, z, ry] of [[-15, -14, Math.PI / 4], [15, -14, -Math.PI / 4]]) statue(L, M, x, z, ry);
  for (const [x, z] of [[-8, -12], [8, -12], [-8, 8], [8, 8]]) brazierStand(L, M, x, z);

  const avoid = [
    { x: 0, z: -3, r: 5 }, { x: 0, z: 15, r: 4 }, { x: 0, z: 9, r: 3 }, { x: 0, z: -17, r: 4 }, { x: 18, z: 0, r: 4 }, { x: -18, z: 0, r: 4 }, { x: 0, z: 5, r: 2.5 },
    ...corridors([{ x: 0, z: -17.8 }, { x: 18, z: 0 }, { x: -18, z: 0 }, { x: 0, z: 15 }], { x: 0, z: 5 }),
  ];
  for (const [i, sp] of scatter(L, 12, 3.5, 16, avoid).entries()) {
    const t = i % 4;
    if (t === 0) { Q.barrel(L, M, sp.x, sp.z); Q.barrel(L, M, sp.x + 0.8, sp.z + 0.3); }
    else if (t === 1) { Q.crate(L, M, sp.x, sp.z); Q.crate(L, M, sp.x + 0.6, sp.z + 0.7, 0, 0.7); }
    else if (t === 2) Q.cart(L, M, sp.x, sp.z, rng() * 6);
    else P.rubble(L, M, sp.x, sp.z, 5, 1.2);
  }

  L.flush();
  L.rewardPoint = new V3(0, 0, 5);
  L.bossPoint = new V3(0, 0, -14);
  L.exitPoints = [
    { pos: new V3(0, 0, -17.8), yaw: 0 },
    { pos: new V3(18, 0, 0), yaw: Math.PI / 2 },
    { pos: new V3(-18, 0, 0), yaw: Math.PI / 2 },
  ];
  L.spawnPoints = [
    new V3(0, 0, -17.5), new V3(17.5, 0, 0), new V3(-17.5, 0, 0), new V3(-16, 0, -16), new V3(16, 0, -16),
    new V3(-17, 0, 9), new V3(17, 0, 9), new V3(-10, 0, 17.5), new V3(10, 0, 17.5),
  ];
  return L;
}

export function buildThroneHall(scene, seed = 1) {
  const L = new Level(scene, seed);
  const M = Q.extraMaterials(P.createMaterials());
  L.mats = M;
  const rng = L.rng;
  const W = 15, D = 22, H = 16;
  L.bounds = { minX: -W + 0.6, maxX: W - 0.6, minZ: -D + 0.6, maxZ: D - 0.6 };
  L.playerStart.set(0, 0, 18);
  L.playerYaw = 0;
  ground(L, M);
  L.add(boxGeo(1, H, D * 2 + 2, rng), M.stone, mat4(-W - 0.5, H / 2, 0));
  L.add(boxGeo(1, H, D * 2 + 2, rng), M.stone, mat4(W + 0.5, H / 2, 0));
  L.add(boxGeo(W * 2 + 2, H, 1, rng), M.stone, mat4(0, H / 2, -D - 0.5));
  L.add(boxGeo(W * 2 + 2, H, 1, rng), M.stone, mat4(0, H / 2, D + 0.5));
  L.add(boxGeo(W * 2 + 2, 0.6, D * 2 + 2, rng), M.stoneDark, mat4(0, H + 0.3, 0), { cast: false });
  // Ковровая дорожка к трону.
  L.add(boxGeo(4, 0.03, D * 2 - 6, rng), M.carpet, mat4(0, 0.015, 2), { cast: false });
  // Колонны и арки.
  const zs = [-15, -8, -1, 6, 13];
  let top = 0;
  for (const sx of [-1, 1]) for (const z of zs) top = P.pillar(L, M, sx * 7.5, z, 8, { r: 0.6 });
  for (const sx of [-1, 1]) for (let i = 0; i < zs.length - 1; i++) P.archSpan(L, M, sx * 7.5, zs[i], sx * 7.5, zs[i + 1], top, { depth: 0.9, extra: 2 });
  // Высокие окна с лунным светом.
  for (const sx of [-1, 1]) for (const z of [-11.5, -4.5, 2.5, 9.5]) Q.stainedWindow(L, sx * (W - 0.02), 6, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 2.2, 5, [1.4, 1.1, 1.5]);
  // Трон на помосте.
  for (let i = 0; i < 4; i++) L.add(boxGeo(10 - i * 1.6, 0.4, 6 - i * 0.8, rng), M.trim, mat4(0, 0.2 + i * 0.4, -18.5 + i * 0.3));
  L.add(boxGeo(2.4, 1.0, 1.8, rng), M.carpet, mat4(0, 2.1, -19.5));
  L.add(boxGeo(2.6, 6, 0.6, rng), M.stoneDark, mat4(0, 4.6, -20.4));
  L.add(new THREE.ConeGeometry(0.4, 1.6, 4), M.gold, mat4(-1.1, 8.3, -20.4, 0, Math.PI / 4, 0));
  L.add(new THREE.ConeGeometry(0.4, 1.6, 4), M.gold, mat4(1.1, 8.3, -20.4, 0, Math.PI / 4, 0));
  L.add(new THREE.ConeGeometry(0.55, 2.4, 4), M.gold, mat4(0, 8.8, -20.4, 0, Math.PI / 4, 0));
  for (const sx of [-1, 1]) L.add(boxGeo(0.4, 2.2, 1.8, rng), M.stoneDark, mat4(sx * 1.4, 2.6, -19.6));
  L.box(-5, -22, 5, -15.5, 2);
  for (const sx of [-1, 1]) { Q.banner(L, sx * 4, 14, -21.95, 0, { w: 2.4, h: 9 }); Q.candelabra(L, M, sx * 4.5, -14); }
  for (const z of [-11.5, -1, 9.5]) chandelier(L, M, 0, 9, z);
  for (const sx of [-1, 1]) for (const z of [-4.5, 9.5]) brazierStand(L, M, sx * 11, z, 1.0);

  L.flush();
  L.rewardPoint = new V3(0, 0, 8);
  L.bossPoint = new V3(0, 2, -18);
  L.exitPoints = [{ pos: new V3(0, 0, -13), yaw: 0 }];
  L.spawnPoints = [new V3(-11, 0, -18), new V3(11, 0, -18), new V3(-12, 0, 0), new V3(12, 0, 0), new V3(-11, 0, 18), new V3(11, 0, 18)];
  L.atmosphereOverride = {
    indoor: true, exposure: 1.6, rain: 0, lightning: false, fogColor: 0x0c060c, fogDensity: 0.03, mistGround: 0.05, mistColor: [0.06, 0.03, 0.06],
    moonIntensity: 0.7, moonLight: 0xb8a8e0, moonDir: new V3(1, 0.7, 0.2).normalize(), hemiSky: 0x5a3858, hemiGround: 0x120810, hemiIntensity: 1.1,
  };
  return L;
}

registerBiome('castle', (scene, seed, zone) => (zone && zone.kind === 'boss' ? buildThroneHall(scene, seed) : buildCourtyard(scene, seed)));
registerBiome('throne', (scene, seed) => buildThroneHall(scene, seed));
