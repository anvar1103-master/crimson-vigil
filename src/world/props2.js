// Пропсы биомов: деревня, лес, склеп, замок.
import * as THREE from 'three';
import { boxGeo, cylGeo, extrudeGeo, archShape, archRingShape, mat4 } from './geo.js';
import * as TX from '../core/textures.js';
import { withFog } from '../core/fog.js';
import { glowTex } from '../core/textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3;
const M_ = (o) => withFog(new THREE.MeshStandardMaterial(o));

export function extraMaterials(M) {
  const tw = TX.setRepeat(TX.timberWall(13), 1 / 3);
  const sh = TX.shingles(17); sh.repeat.set(1 / 1.2, 1 / 1.2);
  const pl = TX.planks(21); pl.repeat.set(1 / 1.6, 1 / 1.6);
  const moss = TX.setRepeat(TX.stoneWall(37, [70, 84, 64]), 1 / 2);
  Object.assign(M, {
    timber: M_({ map: tw.map, bumpMap: tw.bump, bumpScale: 1.5, roughness: 0.92, color: 0xd0c4b8 }),
    roof: M_({ map: sh, roughness: 0.65, color: 0xa898a8 }),
    planks: M_({ map: pl, roughness: 0.85, color: 0xc0a898 }),
    hay: M_({ color: 0x8a7840, roughness: 1 }),
    cloth: M_({ color: 0x6a1018, roughness: 0.9, side: THREE.DoubleSide }),
    canvas: M_({ color: 0x6a6050, roughness: 1, side: THREE.DoubleSide }),
    rock: M_({ map: moss.map, bumpMap: moss.bump, bumpScale: 3, roughness: 0.95, color: 0x9aa094 }),
    water: M_({ color: 0x050708, roughness: 0.04, metalness: 0.6, envMapIntensity: 2 }),
    bloodWater: M_({ color: 0x3a0206, roughness: 0.05, metalness: 0.4, emissive: 0x200003, envMapIntensity: 2 }),
    litWindow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.2, 0.45) }),
    darkWindow: M_({ color: 0x050405, roughness: 0.3, metalness: 0.4 }),
    bone: M_({ color: 0xc8bca0, roughness: 0.7 }),
    gold: M_({ color: 0xb08a40, metalness: 1, roughness: 0.3 }),
    carpet: M_({ color: 0x4a0810, roughness: 0.95 }),
    shroom: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 1.3) }),
  });
  return M;
}

// Ограничивающий прямоугольник повёрнутого прямоугольника → коллайдер.
function rotBox(L, x, z, w, d, ry, h = 10) {
  const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
  const hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
  L.box(x - hw, z - hd, x + hw, z + hd, h);
}

// Локальная точка дома → мир.
function local(x, z, ry, lx, ly, lz) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [x + lx * c + lz * s, ly, z - lx * s + lz * c];
}

// Фахверковый дом: каменный цоколь, два этажа с выносом, крутая крыша, окна, дверь, труба.
export function house(L, M, x, z, ry, { w = 6, d = 5, burning = false, lit = 0.5 } = {}) {
  const rng = L.rng;
  const at = (lx, ly, lz, rx = 0, rry = 0, rz = 0, sx = 1) => {
    const [wx, wy, wz] = local(x, z, ry, lx, ly, lz);
    return mat4(wx, wy, wz, rx, ry + rry, rz, sx);
  };
  const h1 = 2.8, h2 = 2.6, base = 0.6;
  L.add(boxGeo(w + 0.3, base, d + 0.3, rng), M.stoneDark, at(0, base / 2, 0));
  L.add(boxGeo(w, h1, d, rng), M.timber, at(0, base + h1 / 2, 0));
  L.add(boxGeo(w + 0.6, 0.25, d + 0.6, rng), M.wood, at(0, base + h1 + 0.12, 0));
  L.add(boxGeo(w + 0.5, h2, d + 0.5, rng), M.timber, at(0, base + h1 + 0.25 + h2 / 2, 0));
  const top = base + h1 + 0.25 + h2;
  // Крыша — призма вдоль глубины, фронтоном на улицу.
  const rw = w + 1.4, rh = 3.4 + rng() * 1.2;
  const tri = new THREE.Shape();
  tri.moveTo(-rw / 2, 0); tri.lineTo(rw / 2, 0); tri.lineTo(0, rh); tri.closePath();
  L.add(extrudeGeo(tri, d + 1.2), M.roof, at(0, top, 0));
  const gable = new THREE.Shape();
  gable.moveTo(-(w + 0.5) / 2, 0); gable.lineTo((w + 0.5) / 2, 0); gable.lineTo(0, rh * ((w + 0.5) / rw)); gable.closePath();
  L.add(extrudeGeo(gable, 0.1), M.timber, at(0, top, (d + 0.5) / 2 + 0.03));
  L.add(boxGeo(0.7, 2.2, 0.7, rng), M.stoneDark, at(w * 0.25, top + rh * 0.55, -d * 0.2));
  if (!burning && rng() < 0.6) {
    const [cx, , cz] = local(x, z, ry, w * 0.25, 0, -d * 0.2);
    (L.chimneys ||= []).push(new V3(cx, top + rh * 0.55 + 1.2, cz));
  }
  // Окна и ставни.
  const winY = [base + 1.6, base + h1 + 0.25 + 1.3];
  for (let f = 0; f < 2; f++) for (const wx of [-w * 0.3, w * 0.3]) {
    if (f === 0 && Math.abs(wx) < 0.1) continue;
    const isLit = rng() < lit;
    const zf = (f === 0 ? d : d + 0.5) / 2 + 0.03;
    L.add(boxGeo(0.8, 1.0, 0.06, rng), isLit ? M.litWindow : M.darkWindow, at(wx, winY[f], zf), { cast: false });
    L.add(boxGeo(0.95, 0.12, 0.12, rng), M.wood, at(wx, winY[f] - 0.56, zf + 0.04));
    L.add(boxGeo(0.06, 1.0, 0.08, rng), M.wood, at(wx, winY[f], zf + 0.02));
    if (rng() < 0.6) L.add(boxGeo(0.45, 1.05, 0.05, rng), M.planks, at(wx + 0.66, winY[f], zf + 0.12, 0, 0.4));
  }
  // Дверь.
  L.add(boxGeo(1.1, 2.0, 0.1, rng), M.planks, at(0, base + 1.0, d / 2 + 0.04));
  L.add(boxGeo(1.4, 0.18, 0.2, rng), M.wood, at(0, base + 2.1, d / 2 + 0.06));
  rotBox(L, x, z, w + 0.4, d + 0.4, ry);
  if (burning) {
    const pts = [[-w * 0.2, top + 0.6, 0], [w * 0.15, top + rh * 0.5, d * 0.2], [0, top + 0.2, d * 0.45]];
    pts.forEach(([lx, ly, lz], i) => {
      const [wx, wy, wz] = local(x, z, ry, lx, ly, lz);
      L.addFire(wx, wy, wz, { scale: 2.6 - i * 0.4, light: i === 0, intensity: 70, distance: 26, glow: 2.5 });
      (L.embers ||= []).push(new V3(wx, wy + 1, wz));
      (L.smokers ||= []).push(new V3(wx, wy + 2, wz));
    });
  }
  return top + rh;
}

export function well(L, M, x, z) {
  const rng = L.rng;
  L.add(cylGeo(1.1, 1.15, 0.9, 16, rng, true), M.stone, mat4(x, 0.45, z));
  L.add(cylGeo(0.9, 0.9, 0.9, 16, rng, true), M.stone, mat4(x, 0.45, z));
  L.add(new THREE.RingGeometry(0.88, 1.12, 16).rotateX(-Math.PI / 2), M.trim, mat4(x, 0.91, z));
  L.add(new THREE.CircleGeometry(0.9, 16).rotateX(-Math.PI / 2), M.black, mat4(x, 0.5, z), { cast: false });
  for (const sx of [-1, 1]) L.add(boxGeo(0.14, 2.4, 0.14, rng), M.wood, mat4(x + sx * 0.95, 1.6, z));
  L.add(cylGeo(0.07, 0.07, 2.1, 8, rng), M.wood, mat4(x, 2.2, z, 0, 0, Math.PI / 2));
  const tri = new THREE.Shape();
  tri.moveTo(-1.3, 0); tri.lineTo(1.3, 0); tri.lineTo(0, 0.9); tri.closePath();
  L.add(extrudeGeo(tri, 1.6), M.roof, mat4(x, 2.75, z, 0, Math.PI / 2, 0));
  L.add(cylGeo(0.16, 0.13, 0.25, 10, rng, true), M.planks, mat4(x + 0.3, 1.5, z));
  L.circle(x, z, 1.25);
  (L.perchCandidates ||= []).push(new V3(x, 3.65, z + 0.3), new V3(x + 1.05, 0.95, z));
}

export function gallows(L, M, x, z, ry = 0) {
  const rng = L.rng;
  L.add(boxGeo(3.2, 1.2, 3.2, rng), M.planks, mat4(x, 0.6, z, 0, ry, 0));
  for (const [px, pz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
    const [wx, , wz] = local(x, z, ry, px, 0, pz);
    L.add(boxGeo(0.2, 1.2, 0.2, rng), M.wood, mat4(wx, 0.6, wz));
  }
  const [px, , pz] = local(x, z, ry, -1.2, 0, 0);
  L.add(boxGeo(0.25, 4.2, 0.25, rng), M.wood, mat4(px, 1.2 + 2.1, pz));
  const [bx, , bz] = local(x, z, ry, -0.2, 0, 0);
  L.add(boxGeo(2.4, 0.22, 0.22, rng), M.wood, mat4(bx, 5.2, bz, 0, ry, 0));
  const [sx, , sz] = local(x, z, ry, -0.85, 0, 0);
  L.add(boxGeo(0.12, 1.1, 0.12, rng), M.wood, mat4(sx, 4.75, sz, 0, ry, Math.PI / 4));
  const [nx, , nz] = local(x, z, ry, 0.6, 0, 0);
  L.add(cylGeo(0.012, 0.012, 1.4, 4, rng), M.wood, mat4(nx, 4.4, nz));
  L.add(new THREE.TorusGeometry(0.14, 0.02, 4, 12), M.wood, mat4(nx, 3.6, nz, 0, ry, 0));
  rotBox(L, x, z, 3.3, 3.3, ry);
}

export function cart(L, M, x, z, ry = 0, tilt = 0) {
  const rng = L.rng;
  const at = (lx, ly, lz, rx = 0, rz = 0) => { const [wx, wy, wz] = local(x, z, ry, lx, ly, lz); return mat4(wx, wy, wz, rx, ry, rz + tilt); };
  L.add(boxGeo(1.5, 0.12, 2.4, rng), M.planks, at(0, 0.75, 0));
  for (const sx of [-1, 1]) L.add(boxGeo(0.08, 0.5, 2.4, rng), M.planks, at(sx * 0.72, 1.0, 0));
  L.add(boxGeo(1.5, 0.5, 0.08, rng), M.planks, at(0, 1.0, -1.18));
  for (const sx of [-1, 1]) {
    const [wx, , wz] = local(x, z, ry, sx * 0.85, 0, 0.3);
    L.add(new THREE.TorusGeometry(0.5, 0.07, 6, 16), M.wood, mat4(wx, 0.5, wz, 0, ry + Math.PI / 2, 0));
    L.add(boxGeo(0.06, 0.06, 2.0, rng), M.wood, at(sx * 0.4, 0.55, 2.0, -0.25));
  }
  rotBox(L, x, z, 1.7, 2.6, ry, 1.6);
}

export function barrel(L, M, x, z, y = 0, onSide = false) {
  const rng = L.rng;
  const pts = [[0.3, 0], [0.36, 0.25], [0.38, 0.45], [0.36, 0.65], [0.3, 0.9]].map(([r, h]) => new THREE.Vector2(r, h));
  const g = new THREE.LatheGeometry(pts, 14);
  g.translate(0, -0.45, 0);
  const rx = onSide ? Math.PI / 2 : 0, ry = rng() * 6;
  L.add(g, M.planks, mat4(x, y + (onSide ? 0.36 : 0.45), z, rx, ry, 0));
  for (const hy of [-0.3, 0.3]) {
    const t = new THREE.TorusGeometry(0.365, 0.018, 4, 18).rotateX(Math.PI / 2);
    t.translate(0, hy, 0);
    L.add(t, M.iron, mat4(x, y + (onSide ? 0.36 : 0.45), z, rx, ry, 0));
  }
  L.circle(x, z, 0.4, 1);
}

export function crate(L, M, x, z, y = 0, s = 0.8) {
  L.add(boxGeo(s, s, s, L.rng), M.planks, mat4(x, y + s / 2, z, 0, L.rng() * 1.5, 0));
  if (y === 0) L.circle(x, z, s * 0.6, 1);
}

export function haybale(L, M, x, z) {
  const g = cylGeo(0.55, 0.55, 1.1, 12, L.rng);
  L.add(g, M.hay, mat4(x, 0.55, z, 0, L.rng() * 3, Math.PI / 2));
  L.circle(x, z, 0.65, 1.2);
}

export function woodFence(L, M, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ang = Math.atan2(dx, dz);
  const n = Math.max(1, Math.round(len / 2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    L.add(boxGeo(0.14, 1.3, 0.14, L.rng), M.wood, mat4(x0 + dx * t, 0.65, z0 + dz * t, 0, ang, (L.rng() - 0.5) * 0.1));
    (L.perchCandidates ||= []).push(new V3(x0 + dx * t, 1.3, z0 + dz * t));
  }
  for (const y of [0.45, 1.0]) L.add(boxGeo(0.06, 0.14, len, L.rng), M.planks, mat4((x0 + x1) / 2, y, (z0 + z1) / 2, 0, ang, (L.rng() - 0.5) * 0.05));
  const steps = Math.ceil(len / 1.5);
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    L.circle(x0 + dx * t, z0 + dz * t, 0.45, 1.3);
  }
}

export function stall(L, M, x, z, ry = 0) {
  const rng = L.rng;
  for (const [lx, lz] of [[-1.2, -0.8], [1.2, -0.8], [-1.2, 0.8], [1.2, 0.8]]) {
    const [wx, , wz] = local(x, z, ry, lx, 0, lz);
    L.add(boxGeo(0.1, 2.3, 0.1, rng), M.wood, mat4(wx, 1.15, wz));
  }
  const [cx, , cz] = local(x, z, ry, 0, 0, 0);
  L.add(boxGeo(2.6, 0.08, 1.8, rng), M.planks, mat4(cx, 0.9, cz, 0, ry, 0));
  L.add(new THREE.PlaneGeometry(2.8, 2.0).rotateX(-Math.PI / 2 + 0.25), M.cloth, mat4(cx, 2.35, cz, 0, ry, 0), { cast: true });
  for (let i = 0; i < 7; i++) {
    const [px, , pz] = local(x, z, ry, -1.0 + i * 0.33, 0, (rng() - 0.5) * 0.8);
    L.add(new THREE.SphereGeometry(0.08 + rng() * 0.04, 8, 6), i % 2 ? M.dirt : M.hay, mat4(px, 1.0, pz));
  }
  rotBox(L, x, z, 2.6, 1.8, ry, 1.2);
}

// Валун: икосаэдр с шумовыми вмятинами.
export function rock(L, M, x, z, r = 1, sink = 0.3) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position;
  const rng = L.rng;
  for (let i = 0; i < p.count; i++) {
    const k = 0.75 + rng() * 0.45;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r * 4, uv.getY(i) * r * 2);
  L.add(g, M.rock, mat4(x, r * (0.7 - sink), z, rng(), rng() * 6, rng() * 0.3));
  L.circle(x, z, r * 0.85, r * 1.2);
}

export function log(L, M, x, z, ry, len = 4, r = 0.35) {
  L.add(cylGeo(r * 0.9, r, len, 9, L.rng), M.bark, mat4(x, r * 0.85, z, 0, ry, Math.PI / 2));
  const s = Math.ceil(len / 1.2);
  for (let i = 0; i < s; i++) {
    const t = (i + 0.5) / s - 0.5;
    L.circle(x + Math.cos(ry) * len * t, z - Math.sin(ry) * len * t, r + 0.2, 0.9);
  }
}

// Светящиеся грибы.
export function mushrooms(L, M, x, z, n = 6) {
  const rng = L.rng;
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.28, r = rng() * 0.7;
    const h = 0.08 + rng() * 0.18, s = 0.05 + rng() * 0.08;
    const mx = x + Math.cos(a) * r, mz = z + Math.sin(a) * r;
    L.add(cylGeo(0.015, 0.02, h, 5, rng), M.bone, mat4(mx, h / 2, mz), { cast: false });
    L.add(new THREE.SphereGeometry(s, 8, 5, 0, 6.28, 0, Math.PI / 2), M.shroom, mat4(mx, h, mz), { cast: false });
  }
}

export function menhir(L, M, x, z, h = 3.5, lean = 0) {
  const g = boxGeo(0.9, h, 0.6, L.rng);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / h + 0.5;
    p.setX(i, p.getX(i) * (1.1 - y * 0.35));
    p.setZ(i, p.getZ(i) * (1.1 - y * 0.3));
  }
  g.computeVertexNormals();
  L.add(g, M.rock, mat4(x, h / 2 - 0.1, z, lean, L.rng() * 6, lean * 0.5));
  L.circle(x, z, 0.6, h);
}

export function thornBush(L, M, x, z, s = 1) {
  const rng = L.rng;
  for (let i = 0; i < 14; i++) {
    const g = new THREE.ConeGeometry(0.03 * s, (0.6 + rng() * 0.8) * s, 4);
    L.add(g, M.bark, mat4(x + (rng() - 0.5) * 0.8 * s, 0.35 * s, z + (rng() - 0.5) * 0.8 * s, (rng() - 0.5) * 1.6, rng() * 6, (rng() - 0.5) * 1.6), { cast: true });
  }
  L.circle(x, z, 0.6 * s, 1);
}

// Лагерь охотников: палатка и костёр.
export function camp(L, M, x, z) {
  const rng = L.rng;
  L.add(new THREE.ConeGeometry(1.6, 2.2, 4, 1, true), M.canvas, mat4(x - 2.2, 1.1, z, 0, Math.PI / 4, 0));
  L.circle(x - 2.2, z, 1.3, 2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 6.28;
    L.add(new THREE.DodecahedronGeometry(0.16), M.stone, mat4(x + Math.cos(a) * 0.55, 0.08, z + Math.sin(a) * 0.55, rng(), rng(), 0));
  }
  for (let i = 0; i < 3; i++) L.add(cylGeo(0.05, 0.06, 0.9, 5, rng), M.bark, mat4(x, 0.12, z, Math.PI / 2, i * 1.05, 0));
  L.addFire(x, 0.1, z, { scale: 1.1, intensity: 24, distance: 13 });
  (L.embers ||= []).push(new V3(x, 0.5, z));
  L.circle(x, z, 0.7, 0.6);
  log(L, M, x + 1.4, z + 0.6, 0.4, 2, 0.22);
}

// Блуждающий огонёк: летает по фигуре Лиссажу, светится бирюзой.
export function wisp(L, x, z, { light = true } = {}) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(0.6, 2.4, 2.0), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.setScalar(0.6);
  L.root.add(s);
  let pl = null;
  if (light) { pl = new THREE.PointLight(0x50ffd0, 4, 8, 2); L.root.add(pl); }
  const ph = L.rng() * 10;
  L.updaters.push((dt, t) => {
    const px = x + Math.sin(t * 0.37 + ph) * 3, pz = z + Math.sin(t * 0.29 + ph * 2) * 3, py = 1.3 + Math.sin(t * 1.3 + ph) * 0.4;
    s.position.set(px, py, pz);
    s.scale.setScalar(0.5 + Math.sin(t * 7 + ph) * 0.08);
    if (pl) { pl.position.set(px, py, pz); pl.intensity = 3.5 + Math.sin(t * 5 + ph) * 0.8; }
  });
}

export function pool(L, M, x, z, r = 2.5, blood = false) {
  const g = new THREE.CircleGeometry(r, 24).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 1; i < p.count; i++) {
    const k = 0.75 + L.rng() * 0.3;
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
  }
  L.add(g, blood ? M.bloodWater : M.water, mat4(x, 0.03, z), { cast: false });
}

// Знамя с гербом: полотнище колышется.
export function banner(L, x, y, z, ry, { w = 1.4, h = 4 } = {}) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 360;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5a0812'; ctx.fillRect(0, 0, 128, 360);
  ctx.fillStyle = '#7a1018'; ctx.fillRect(8, 0, 112, 330);
  ctx.strokeStyle = '#b08a40'; ctx.lineWidth = 4; ctx.strokeRect(12, 6, 104, 320);
  ctx.fillStyle = '#c8a050';
  ctx.font = 'bold 90px "Segoe UI Symbol", serif'; ctx.textAlign = 'center';
  ctx.fillText('☾', 64, 150);
  ctx.font = 'bold 60px "Segoe UI Symbol", serif';
  ctx.fillText('✠', 64, 250);
  ctx.beginPath(); ctx.moveTo(0, 330); ctx.lineTo(64, 360); ctx.lineTo(128, 330); ctx.lineTo(128, 300); ctx.lineTo(0, 300); ctx.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.PlaneGeometry(w, h, 6, 12);
  g.translate(0, -h / 2, 0);
  const m = new THREE.Mesh(g, withFog(new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 })));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  L.root.add(m);
  const base = g.attributes.position.array.slice();
  const ph = L.rng() * 10;
  L.updaters.push((dt, tt) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const yy = -base[i * 3 + 1] / h;
      p.setZ(i, Math.sin(tt * 1.6 + yy * 4 + base[i * 3] * 2 + ph) * 0.08 * yy);
    }
    p.needsUpdate = true;
  });
}

export function sarcophagus(L, M, x, z, ry = 0, open = false) {
  const rng = L.rng;
  L.add(boxGeo(1.0, 0.8, 2.2, rng), M.stone, mat4(x, 0.4, z, 0, ry, 0));
  L.add(boxGeo(1.12, 0.12, 2.3, rng), M.trim, mat4(x, 0.82, z, 0, ry, 0));
  if (open) {
    const [lx, , lz] = local(x, z, ry, 0.7, 0, 0.2);
    L.add(boxGeo(1.05, 0.2, 2.25, rng), M.trim, mat4(lx, 0.35, lz, 0, ry + 0.3, 0.35));
  } else {
    L.add(boxGeo(1.05, 0.2, 2.2, rng), M.trim, mat4(x, 0.98, z, 0, ry, 0));
    // Барельеф — фигура с крестом.
    L.add(boxGeo(0.35, 0.12, 1.5, rng), M.trim, mat4(x, 1.12, z, 0, ry, 0));
  }
  rotBox(L, x, z, 1.15, 2.35, ry, 1.1);
}

export function candelabra(L, M, x, z, h = 1.8) {
  const rng = L.rng;
  L.add(cylGeo(0.25, 0.3, 0.1, 8, rng), M.iron, mat4(x, 0.05, z));
  L.add(cylGeo(0.035, 0.035, h, 6, rng), M.iron, mat4(x, h / 2, z));
  L.add(boxGeo(0.9, 0.04, 0.04, rng), M.iron, mat4(x, h, z));
  for (const dx of [-0.42, 0, 0.42]) {
    L.add(cylGeo(0.035, 0.035, 0.22, 6, rng), M.wax, mat4(x + dx, h + 0.13, z), { cast: false });
    L.addFire(x + dx, h + 0.25, z, { scale: 0.14, light: false, glow: 0.6 });
  }
  const pl = new THREE.PointLight(0xffa050, 7, 9, 2);
  pl.position.set(x, h + 0.4, z);
  L.root.add(pl);
  L.fires.push({ light: pl, base: 7, seed: rng() * 100, sprites: [] });
  L.circle(x, z, 0.3, 2);
}

export function bones(L, M, x, z, n = 8) {
  const rng = L.rng;
  for (let i = 0; i < n; i++) {
    L.add(cylGeo(0.025, 0.03, 0.35 + rng() * 0.2, 5, rng), M.bone, mat4(x + (rng() - 0.5) * 1.2, 0.04, z + (rng() - 0.5) * 1.2, Math.PI / 2, rng() * 6, 0), { cast: false });
  }
  for (let i = 0; i < 2; i++) L.add(new THREE.SphereGeometry(0.1, 8, 6), M.bone, mat4(x + (rng() - 0.5), 0.09, z + (rng() - 0.5), 0, rng() * 6, 0));
}

// Стрельчатое окно с витражом, светящимся изнутри (для интерьеров и стен).
export function stainedWindow(L, x, y, z, ry, w = 1.6, spring = 3.2, color = [1.6, 1.2, 1.2]) {
  const tex = TX.lancetGlassTex();
  const g = new THREE.ShapeGeometry(archShape(w, spring, 0.85));
  const uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / (spring + w));
  const m = new THREE.Mesh(g, withFog(new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(...color), side: THREE.DoubleSide })));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  L.root.add(m);
  return m;
}

// Горгулья: присевшая тварь с рогами и сложенными крыльями — для карнизов и фронтонов.
export function gargoyle(L, M, x, y, z, ry = 0, s = 1) {
  const at = (lx, ly, lz, rx = 0, rry = 0, rz = 0) => {
    const [wx, , wz] = local(x, z, ry, lx * s, 0, lz * s);
    return mat4(wx, y + ly * s, wz, rx, ry + rry, rz);
  };
  const add = (geo, lx, ly, lz, rx, rry, rz) => L.add(geo, M.trim, at(lx, ly, lz, rx, rry, rz));
  add(boxGeo(0.7 * s, 0.25 * s, 0.7 * s, L.rng), 0, 0.12, 0);
  const body = new THREE.SphereGeometry(0.32 * s, 10, 8); body.scale(1, 1.1, 1.25);
  add(body, 0, 0.55, 0.05, 0.4);
  add(new THREE.SphereGeometry(0.17 * s, 10, 8), 0, 0.92, 0.32);
  for (const sx of [-1, 1]) {
    add(new THREE.ConeGeometry(0.04 * s, 0.22 * s, 5), sx * 0.09, 1.1, 0.26, -0.5, 0, sx * 0.5);
    const wing = new THREE.Shape();
    wing.moveTo(0, 0); wing.lineTo(0.55 * s, 0.6 * s); wing.lineTo(0.35 * s, 0.1 * s); wing.lineTo(0.5 * s, -0.15 * s); wing.closePath();
    const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.04 * s, bevelEnabled: false });
    if (sx < 0) wg.scale(-1, 1, 1);
    add(wg, sx * 0.15, 0.6, -0.15, 0, sx * 0.4, 0);
    add(new THREE.CylinderGeometry(0.06 * s, 0.05 * s, 0.35 * s, 6), sx * 0.18, 0.3, 0.3, 0.6);
  }
  add(new THREE.ConeGeometry(0.06 * s, 0.12 * s, 4), 0, 0.85, 0.5, Math.PI / 2);
}

// Каменный святой в нише: постамент, ниспадающая ряса, капюшон, молитвенно сложенные руки, нимб.
export function saint(L, M, x, y, z, ry = 0, s = 1) {
  const rng = L.rng;
  const at = (lx, ly, lz, rx = 0, rry = 0, rz = 0) => {
    const [wx, , wz] = local(x, z, ry, lx * s, 0, lz * s);
    return mat4(wx, y + ly * s, wz, rx, ry + rry, rz);
  };
  L.add(boxGeo(0.9 * s, 0.5 * s, 0.7 * s, rng), M.trim, at(0, 0.25, 0));
  const robe = new THREE.LatheGeometry([[0.36, 0], [0.33, 0.4], [0.26, 1.0], [0.2, 1.45], [0.14, 1.62], [0.02, 1.66]].map(([r, h]) => new THREE.Vector2(r * s, h * s)), 14);
  // Складки: лёгкая волна по окружности.
  const p = robe.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getX(i), p.getZ(i)), k = 1 + Math.sin(a * 7) * 0.05 * (1 - p.getY(i) / (1.7 * s));
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
  }
  robe.computeVertexNormals();
  L.add(robe, M.trim, at(0, 0.5, 0));
  L.add(new THREE.SphereGeometry(0.13 * s, 10, 8), M.trim, at(0, 2.27, 0.03));
  L.add(new THREE.ConeGeometry(0.19 * s, 0.38 * s, 10, 1, true), M.trim, at(0, 2.32, -0.02));
  L.add(boxGeo(0.12 * s, 0.22 * s, 0.1 * s, rng), M.trim, at(0, 1.75, 0.24, -0.4));
  L.add(new THREE.TorusGeometry(0.24 * s, 0.025 * s, 6, 20), M.trim, at(0, 2.35, -0.12));
}

// Подвесная клетка со скелетом; качается на цепи.
export function hangingCage(L, M, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const iron = M.iron, bone = M.bone;
  // Детали копятся по материалам и сливаются: клетка = 2 draw call-а вместо ~25.
  const parts = new Map([[iron, []], [bone, []]]);
  const add = (geo, mat, px, py, pz, rx = 0, ry = 0, rz = 0) => {
    const holder = { scale: { set: (a, b, c) => { holder.s = [a, b, c]; } } };
    parts.get(mat).push(() => {
      const gg = (geo.index ? geo.toNonIndexed() : geo.clone());
      for (const n of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(n)) gg.deleteAttribute(n);
      const s = holder.s || [1, 1, 1];
      gg.applyMatrix4(new THREE.Matrix4().compose(new V3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(...s)));
      return gg;
    });
    return holder;
  };
  add(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 4), iron, 0, -0.6, 0);
  add(new THREE.TorusGeometry(0.4, 0.02, 4, 16).rotateX(Math.PI / 2), iron, 0, -1.25, 0);
  add(new THREE.TorusGeometry(0.4, 0.02, 4, 16).rotateX(Math.PI / 2), iron, 0, -2.6, 0);
  add(new THREE.ConeGeometry(0.42, 0.3, 12, 1, true), iron, 0, -1.1, 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    add(new THREE.CylinderGeometry(0.012, 0.012, 1.35, 4), iron, Math.cos(a) * 0.4, -1.92, Math.sin(a) * 0.4);
  }
  // Скелет, сидящий в клетке.
  add(new THREE.SphereGeometry(0.1, 8, 6), bone, 0.05, -1.75, 0.08).scale.set(0.9, 1.1, 1);
  add(new THREE.CylinderGeometry(0.03, 0.04, 0.45, 5), bone, 0, -2.05, 0, 0.3);
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), bone, sx * 0.14, -2.1, 0.1, 0.6, 0, sx * 0.4);
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 4), bone, sx * 0.1, -2.45, 0.2, 1.3);
  }
  for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.1 - i * 0.008, 0.01, 4, 10, Math.PI), bone, 0, -1.92 - i * 0.06, 0.04, 0, 0, Math.PI);
  for (const [mat, list] of parts) {
    const merged = mergeGeometries(list.map((f) => f()), false);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    g.add(mesh);
  }
  L.root.add(g);
  const ph = L.rng() * 10;
  L.updaters.push((dt, t) => { g.rotation.z = Math.sin(t * 0.8 + ph) * 0.05; g.rotation.x = Math.sin(t * 0.6 + ph * 2) * 0.04; g.rotation.y = Math.sin(t * 0.2 + ph) * 0.3; });
}

let _web = null;
function webTex() {
  if (_web) return _web;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(230,225,215,0.7)';
  ctx.lineWidth = 1.2;
  const cx = 0, cy = 0, n = 9;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(Math.cos(a) * 256, Math.sin(a) * 256); ctx.stroke();
  }
  for (let r = 18; r < 256; r += 16 + r * 0.08) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI / 2, rr = r * (0.92 + Math.random() * 0.1);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.quadraticCurveTo(Math.cos(a - 0.08) * rr * 0.93, Math.sin(a - 0.08) * rr * 0.93, x, y);
    }
    ctx.stroke();
  }
  _web = new THREE.CanvasTexture(c);
  return _web;
}

// Паутина в углу: четверть-веер, повёрнутый в угол между стенами/колонной.
export function cobweb(L, x, y, z, ry, size = 1.6) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).translate(size / 2, -size / 2, 0), new THREE.MeshBasicMaterial({
    map: webTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(0.32, 0.29, 0.29), fog: true,
  }));
  m.position.set(x, y, z);
  m.rotation.set(0, ry, Math.PI);
  m.rotateX(0.5);
  L.root.add(m);
}

export { archRingShape, V3 };
