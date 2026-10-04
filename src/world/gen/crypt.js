// Склеп епископов: подземный зал с колоннами, сводами, саркофагами, свечами и лучами из витражей.
import * as THREE from 'three';
import { Level } from '../level.js';
import { boxGeo, mat4 } from '../geo.js';
import * as P from '../props.js';
import * as Q from '../props2.js';
import { glowTex } from '../../core/textures.js';

const V3 = THREE.Vector3;

export function buildCrypt(scene, seed = 1) {
  const L = new Level(scene, seed);
  const M = Q.extraMaterials(P.createMaterials());
  L.mats = M;
  const rng = L.rng;
  const W = 17, D = 19, H = 9;
  L.bounds = { minX: -W + 0.6, maxX: W - 0.6, minZ: -D + 0.6, maxZ: D - 0.6 };
  L.playerStart.set(0, 0, 15);
  L.playerYaw = 0;

  // Пол из плит и стены.
  const floor = new THREE.PlaneGeometry(W * 2, D * 2).rotateX(-Math.PI / 2);
  const fuv = floor.attributes.uv;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * W * 2, fuv.getY(i) * D * 2);
  L.add(floor, M.cobble, null, { cast: false });
  L.add(boxGeo(1, H, D * 2 + 2, rng), M.stone, mat4(-W - 0.5, H / 2, 0));
  L.add(boxGeo(1, H, D * 2 + 2, rng), M.stone, mat4(W + 0.5, H / 2, 0));
  L.add(boxGeo(W * 2 + 2, H, 1, rng), M.stone, mat4(0, H / 2, -D - 0.5));
  L.add(boxGeo(W * 2 + 2, H, 1, rng), M.stone, mat4(0, H / 2, D + 0.5));
  L.add(boxGeo(W * 2 + 2, 0.6, D * 2 + 2, rng), M.stoneDark, mat4(0, H + 0.3, 0), { cast: false });

  // Сетка колонн и своды между ними.
  const xs = [-11, -5.5, 5.5, 11], zs = [-13, -6.5, 0, 6.5, 13];
  let top = 0;
  for (const x of xs) for (const z of zs) top = P.pillar(L, M, x, z, 4.6, { r: 0.42 });
  for (const x of xs) for (let i = 0; i < zs.length - 1; i++) P.archSpan(L, M, x, zs[i], x, zs[i + 1], top, { depth: 0.7, extra: H - top - 2.6 });
  for (const z of zs) for (let i = 0; i < xs.length - 1; i++) {
    if (i === 1) continue; // центральный неф шире — без поперечных арок
    P.archSpan(L, M, xs[i], z, xs[i + 1], z, top, { depth: 0.6, extra: H - top - 2.8 });
  }
  // Пилястры у стен.
  for (const z of zs) for (const sx of [-1, 1]) L.add(boxGeo(0.8, H, 1.0, rng), M.trim, mat4(sx * (W - 0.4), H / 2, z));

  // Витражи на восточной стене и лучи света из них.
  for (const z of [-9.75, 3.25]) {
    Q.stainedWindow(L, W - 0.02, 4.0, z, -Math.PI / 2, 1.8, 2.6, [2.2, 1.6, 1.6]);
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 14), new THREE.MeshBasicMaterial({
      map: shaftTex(), color: new THREE.Color(0.9, 0.35, 0.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true,
    }));
    shaft.position.set(W - 5, 3.2, z);
    shaft.rotation.set(0, Math.PI / 2, 0.95);
    L.root.add(shaft);
  }
  // Центральный алтарь с черепами.
  L.add(boxGeo(3.2, 1.1, 1.6, rng), M.trim, mat4(0, 0.55, -15.5));
  L.add(boxGeo(3.6, 0.2, 2.0, rng), M.stone, mat4(0, 1.15, -15.5));
  L.box(-1.8, -16.5, 1.8, -14.5, 2);
  P.candles(L, M, -1.0, 1.25, -15.5, 6, 0.3);
  P.candles(L, M, 1.0, 1.25, -15.5, 6, 0.3);
  L.add(boxGeo(0.25, 3.2, 0.25, rng), M.iron, mat4(0, 2.8, -16.2));
  L.add(boxGeo(1.6, 0.25, 0.25, rng), M.iron, mat4(0, 3.6, -16.2));

  // Саркофаги вдоль боковых нефов, канделябры, кости.
  for (const sx of [-1, 1]) for (const z of [-9.75, -3.25, 3.25, 9.75]) {
    if (rng() < 0.2) continue;
    Q.sarcophagus(L, M, sx * 8.2, z, (rng() - 0.5) * 0.15, rng() < 0.3);
    if (rng() < 0.35) Q.bones(L, M, sx * 8.2 + 1.2, z + 0.5, 5);
  }
  for (const sx of [-1, 1]) for (const z of [-13, 0, 13]) {
    if (rng() < 0.25) continue;
    Q.sarcophagus(L, M, sx * 14.2, z, Math.PI / 2, rng() < 0.3);
  }
  for (const [x, z] of [[-3, -9], [3, -9], [-3, 4], [3, 4], [-14, -6.5], [14, 6.5]]) Q.candelabra(L, M, x, z);
  for (const [x, z] of [[-13.5, -16], [13.5, -16]]) {
    P.candles(L, M, x, 0, z, 8, 0.5);
  }
  // Жаровни в центральном нефе.
  for (const z of [8.5, -4]) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      L.add(boxGeo(0.05, 1.1, 0.05, rng), M.iron, mat4(Math.cos(a) * 0.25, 0.5, z + Math.sin(a) * 0.25, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25));
    }
    L.add(new THREE.CylinderGeometry(0.42, 0.25, 0.3, 12, 1, true), M.iron, mat4(0, 1.1, z));
    L.addFire(0, 1.15, z, { scale: 1.2, intensity: 30, distance: 16 });
    (L.embers ||= []).push(new V3(0, 1.3, z));
    L.circle(0, z, 0.5);
  }
  // Факелы на западной стене.
  for (const z of [-9.75, 3.25]) P.wallTorch(L, M, -W + 0.05, 3.2, z, Math.PI / 2, { intensity: 14 });
  Q.bones(L, M, -2, 8, 7);
  Q.bones(L, M, 12, -15, 6);

  L.flush();
  L.rewardPoint = new V3(0, 0, 4);
  L.bossPoint = new V3(0, 0, -11);
  L.exitPoints = [
    { pos: new V3(0, 0, -17.6), yaw: 0 },
    { pos: new V3(-15.8, 0, -16.3), yaw: 0 },
    { pos: new V3(15.8, 0, -16.3), yaw: 0 },
  ];
  L.spawnPoints = [
    new V3(0, 0, -12), new V3(-14.5, 0, -16), new V3(14.5, 0, -16), new V3(-14.5, 0, 16), new V3(14.5, 0, 16),
    new V3(-14.5, 0, 3), new V3(14.5, 0, -3), new V3(-8.2, 0, 16.5), new V3(8.2, 0, 16.5), new V3(0, 0, 17.5),
  ];
  L.atmosphereOverride = {
    indoor: true, exposure: 1.75, rain: 0, lightning: false, fogColor: 0x0d0709, fogDensity: 0.04, mistGround: 0.06, mistColor: [0.05, 0.03, 0.035],
    moonIntensity: 0.6, moonLight: 0xd07880, moonDir: new V3(1, 0.8, 0.15).normalize(), hemiSky: 0x7a4858, hemiGround: 0x1a0a0e, hemiIntensity: 1.3,
  };
  return L;
}

// Луч света: мягкий вертикальный градиент.
let _shaft = null;
function shaftTex() {
  if (_shaft) return _shaft;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
  const h = ctx.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.3, 'rgba(0,0,0,0)'); h.addColorStop(0.7, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = h; ctx.fillRect(0, 0, 64, 256);
  _shaft = new THREE.CanvasTexture(c);
  return _shaft;
}

export { glowTex };
