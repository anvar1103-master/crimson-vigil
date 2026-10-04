// Готические элементы окружения: колонны, арки, надгробия, кресты, склепы, деревья, ограды, фонари.
import * as THREE from 'three';
import { boxGeo, cylGeo, extrudeGeo, archShape, archSpanShape, archApex, mat4 } from './geo.js';
import * as TX from '../core/textures.js';
import { withFog } from '../core/fog.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

export function createMaterials() {
  const stone = TX.setRepeat(TX.stoneWall(11), 1 / 3);
  const stoneDark = TX.setRepeat(TX.stoneWall(23, [86, 80, 82]), 1 / 2.5);
  const cob = TX.setRepeat(TX.cobbles(5), 1 / 2.6);
  const ground = TX.setRepeat(TX.groundTex(9), 1 / 5);
  const wood = TX.woodTex(4, true); wood.repeat.set(1 / 1.5, 1 / 1.5);
  const M = (o) => withFog(new THREE.MeshStandardMaterial(o));
  return {
    stone: M({ map: stone.map, bumpMap: stone.bump, bumpScale: 3, roughnessMap: stone.bump, roughness: 1, color: 0xc8c2bc }),
    stoneDark: M({ map: stoneDark.map, bumpMap: stoneDark.bump, bumpScale: 3, roughness: 0.95, color: 0x9a9490 }),
    trim: M({ map: stoneDark.map, bumpMap: stoneDark.bump, bumpScale: 1.5, roughness: 0.85, color: 0xb0a8a2 }),
    cobble: M({ map: cob.map, bumpMap: cob.bump, bumpScale: 4, roughnessMap: cob.bump, roughness: 0.9, color: 0xb4aca8, envMapIntensity: 1.4 }),
    ground: M({ map: ground.map, bumpMap: ground.bump, bumpScale: 2, roughness: 0.95, color: 0xa8a0a0 }),
    tomb: M({ map: stoneDark.map, bumpMap: stoneDark.bump, bumpScale: 2.5, roughness: 0.9, color: 0x8c8a8a }),
    iron: M({ color: 0x141316, metalness: 0.85, roughness: 0.5 }),
    slate: M({ color: 0x1d1b22, roughness: 0.6, metalness: 0.1 }),
    wood: M({ map: wood, roughness: 0.85, color: 0x9a8a80 }),
    bark: M({ color: 0x1e1a18, roughness: 1 }),
    wax: M({ color: 0xd8ccb0, roughness: 0.6, emissive: 0x1a0c02 }),
    black: M({ color: 0x050405, roughness: 1 }),
    dirt: M({ color: 0x241c18, roughness: 1, map: ground.map }),
  };
}

// Колонна: база, ствол, капитель. broken — обломанный ствол.
export function pillar(L, M, x, z, h = 4.2, { r = 0.3, broken = false } = {}) {
  const rng = L.rng;
  L.add(boxGeo(0.95, 0.4, 0.95, rng), M.trim, mat4(x, 0.2, z));
  L.add(boxGeo(0.8, 0.2, 0.8, rng), M.trim, mat4(x, 0.5, z));
  const sh = broken ? h * (0.35 + rng() * 0.3) : h;
  L.add(cylGeo(r, r * 1.05, sh, 10, rng), M.stone, mat4(x, 0.6 + sh / 2, z));
  if (!broken) {
    L.add(boxGeo(0.85, 0.18, 0.85, rng), M.trim, mat4(x, 0.6 + h + 0.09, z));
    L.add(boxGeo(1.0, 0.22, 1.0, rng), M.trim, mat4(x, 0.6 + h + 0.29, z));
  } else {
    // Обломки у подножия.
    for (let i = 0; i < 4; i++) {
      const s = 0.25 + rng() * 0.35;
      L.add(boxGeo(s, s * 0.7, s * 0.9, rng), M.stone, mat4(x + (rng() - 0.5) * 2.4, s * 0.3, z + (rng() - 0.5) * 2.4, rng(), rng() * 3, rng()));
    }
  }
  L.circle(x, z, r + 0.15);
  return 0.6 + h + 0.4;
}

// Арочный пролёт между двумя точками на высоте y (плоскость арки вертикальная).
export function archSpan(L, M, x0, z0, x1, z1, y, { depth = 0.6, t = 0.45, extra = 0.7, rf = 0.85 } = {}) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  const w = len - 0.9;
  const top = archApex(w, 0, rf) + extra;
  const geo = extrudeGeo(archSpanShape(w, (len - w) / 2, top, rf), depth);
  const ang = Math.atan2(dx, dz);
  L.add(geo, M.stone, mat4((x0 + x1) / 2, y, (z0 + z1) / 2, 0, ang - Math.PI / 2, 0));
  // Карниз сверху.
  L.add(boxGeo(len, 0.25, depth + 0.2, L.rng), M.trim, mat4((x0 + x1) / 2, y + top + 0.12, (z0 + z1) / 2, 0, ang - Math.PI / 2, 0));
  return y + top + 0.25;
}

// Надгробие: скруглённое, стрельчатое, крест или обелиск.
export function tombstone(L, M, x, z, kind = 0, ry = 0) {
  const rng = L.rng;
  const tilt = (rng() - 0.5) * 0.22, roll = (rng() - 0.5) * 0.16;
  const sink = rng() * 0.12;
  if (kind === 0 || kind === 1) {
    const w = 0.55 + rng() * 0.25, h = 0.8 + rng() * 0.5;
    let s;
    if (kind === 0) {
      s = new THREE.Shape();
      s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - w / 2);
      s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
      s.lineTo(-w / 2, 0);
    } else s = archShape(w, h - w * 0.6, 0.8);
    L.add(extrudeGeo(s, 0.14 + rng() * 0.06, 0.02), M.tomb, mat4(x, -sink, z, tilt, ry, roll));
    L.add(boxGeo(w + 0.2, 0.15, 0.4, rng), M.tomb, mat4(x, 0.05, z, 0, ry, 0));
    L.circle(x, z, w * 0.45, h);
  } else if (kind === 2) {
    const h = 1.3 + rng() * 0.6;
    L.add(boxGeo(0.16, h, 0.16, rng), M.tomb, mat4(x, h / 2 - sink, z, tilt, ry, roll));
    L.add(boxGeo(0.7, 0.15, 0.16, rng), M.tomb, mat4(x, h * 0.72 - sink, z, tilt, ry, roll));
    L.add(boxGeo(0.5, 0.25, 0.4, rng), M.tomb, mat4(x, 0.1, z, 0, ry, 0));
    L.circle(x, z, 0.3, h);
  } else {
    const h = 1.6 + rng() * 0.8;
    L.add(boxGeo(0.7, 0.4, 0.7, rng), M.tomb, mat4(x, 0.2, z, 0, ry, 0));
    L.add(cylGeo(0.12, 0.25, h, 4, rng), M.tomb, mat4(x, 0.4 + h / 2, z, 0, ry + Math.PI / 4, 0));
    L.add(new THREE.ConeGeometry(0.17, 0.3, 4), M.tomb, mat4(x, 0.4 + h + 0.15, z, 0, ry + Math.PI / 4, 0));
    L.circle(x, z, 0.45, h);
  }
}

// Высокий каменный крест на ступенчатом постаменте.
export function stoneCross(L, M, x, z, scale = 1) {
  const s = scale, rng = L.rng;
  L.add(boxGeo(2.6 * s, 0.3 * s, 2.6 * s, rng), M.trim, mat4(x, 0.15 * s, z));
  L.add(boxGeo(1.9 * s, 0.3 * s, 1.9 * s, rng), M.trim, mat4(x, 0.45 * s, z));
  L.add(boxGeo(1.1 * s, 1.2 * s, 1.1 * s, rng), M.stone, mat4(x, 1.2 * s, z));
  L.add(boxGeo(0.45 * s, 3.6 * s, 0.45 * s, rng), M.stone, mat4(x, 3.6 * s, z));
  L.add(boxGeo(2.0 * s, 0.45 * s, 0.45 * s, rng), M.stone, mat4(x, 4.4 * s, z));
  const ring = new THREE.TorusGeometry(0.62 * s, 0.09 * s, 6, 24);
  L.add(ring, M.stone, mat4(x, 4.4 * s, z));
  L.circle(x, z, 1.3 * s);
}

// Сухое дерево: рекурсивные ветви, слитые в один меш.
export function deadTree(L, M, x, z, scale = 1, { depth = 4 } = {}) {
  const rng = L.rng;
  const branch = (start, dir, len, rad, d) => {
    const end = start.clone().addScaledVector(dir, len);
    const g = cylGeo(rad * 0.68, rad, len, d > 2 ? 7 : 5, rng);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
    g.applyMatrix4(new THREE.Matrix4().compose(start.clone().addScaledVector(dir, len / 2), q, new V3(1, 1, 1)));
    L.add(g, M.bark);
    if (d === 0 || rad < 0.018) return;
    const n = d >= 3 ? 2 + (rng() < 0.4 ? 1 : 0) : 2;
    for (let i = 0; i < n; i++) {
      const spread = d >= 3 ? 1.1 : 1.5;
      const nd = dir.clone().add(new V3((rng() - 0.5) * spread, (rng() - 0.15) * 0.9, (rng() - 0.5) * spread)).normalize();
      if (nd.y < -0.2) nd.y = -0.2;
      branch(end, nd.normalize(), len * (0.62 + rng() * 0.22), rad * 0.66, d - 1);
    }
  };
  const trunkDir = new V3((rng() - 0.5) * 0.25, 1, (rng() - 0.5) * 0.25).normalize();
  branch(new V3(x, -0.1, z), trunkDir, 2.4 * scale, 0.26 * scale, depth);
  // Корни.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng();
    const g = new THREE.ConeGeometry(0.12 * scale, 0.9 * scale, 5);
    L.add(g, M.bark, mat4(x + Math.cos(a) * 0.25 * scale, 0.05, z + Math.sin(a) * 0.25 * scale, Math.PI / 2 - 0.35, -a + Math.PI / 2, 0));
  }
  L.circle(x, z, 0.35 * scale);
}

// Кованая ограда с пиками (InstancedMesh) и каменными столбами.
export function ironFence(L, M, x0, z0, x1, z1, { h = 1.9, gap = 0.14, postEvery = 4 } = {}) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  const n = Math.floor(len / gap);
  const ang = Math.atan2(dx, dz);
  const bar = new THREE.CylinderGeometry(0.014, 0.014, h, 5);
  const tip = new THREE.ConeGeometry(0.03, 0.14, 4);
  const bars = new THREE.InstancedMesh(bar, M.iron, n);
  const tips = new THREE.InstancedMesh(tip, M.iron, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x0 + dx * t, z = z0 + dz * t;
    m.makeTranslation(x, h / 2, z); bars.setMatrixAt(i, m);
    m.makeTranslation(x, h + 0.06, z); tips.setMatrixAt(i, m);
  }
  bars.castShadow = tips.castShadow = true;
  L.addMesh(bars); L.addMesh(tips);
  for (const ry of [0.25, h - 0.3]) {
    L.add(boxGeo(0.03, 0.04, len, L.rng), M.iron, mat4((x0 + x1) / 2, ry, (z0 + z1) / 2, 0, ang, 0));
  }
  const posts = Math.max(1, Math.round(len / postEvery));
  for (let i = 0; i <= posts; i++) {
    const t = i / posts, x = x0 + dx * t, z = z0 + dz * t;
    L.add(boxGeo(0.45, h + 0.4, 0.45, L.rng), M.trim, mat4(x, (h + 0.4) / 2, z));
    L.add(boxGeo(0.6, 0.15, 0.6, L.rng), M.trim, mat4(x, h + 0.47, z));
    L.add(new THREE.SphereGeometry(0.17, 8, 6), M.trim, mat4(x, h + 0.68, z));
  }
}

// Фонарь на кованом столбе.
export function lampPost(L, M, x, z, facing = 0, { intensity = 14 } = {}) {
  const rng = L.rng;
  L.add(boxGeo(0.4, 0.3, 0.4, rng), M.iron, mat4(x, 0.15, z));
  L.add(cylGeo(0.05, 0.07, 3.1, 8, rng), M.iron, mat4(x, 1.85, z));
  const ax = Math.sin(facing) * 0.35, az = Math.cos(facing) * 0.35;
  L.add(boxGeo(0.05, 0.05, 0.75, rng), M.iron, mat4(x + ax, 3.3, z + az, 0, facing, 0));
  const lx = x + ax * 1.7, lz = z + az * 1.7;
  // Фонарь: рамка + стекло.
  L.add(boxGeo(0.32, 0.05, 0.32, rng), M.iron, mat4(lx, 3.12, lz));
  L.add(new THREE.ConeGeometry(0.26, 0.22, 4), M.iron, mat4(lx, 2.88, lz, 0, Math.PI / 4, 0));
  L.add(boxGeo(0.28, 0.04, 0.28, rng), M.iron, mat4(lx, 2.42, lz));
  const glass = new THREE.Mesh(boxGeo(0.22, 0.4, 0.22), withFog(new THREE.MeshStandardMaterial({
    color: 0x2a1a10, emissive: 0xff8a30, emissiveIntensity: 0.55, roughness: 0.15, transparent: true, opacity: 0.6, depthWrite: false,
  })));
  glass.position.set(lx, 2.64, lz);
  L.addMesh(glass);
  // Рёбра фонаря.
  for (const [ox, oz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) {
    L.add(boxGeo(0.025, 0.44, 0.025, rng), M.iron, mat4(lx + ox, 2.64, lz + oz));
  }
  L.addFire(lx, 2.48, lz, { scale: 0.35, intensity, distance: 16, glow: 1.4, color: 0xffa050 });
  L.circle(x, z, 0.22);
}

// Факел на стене: кронштейн + огонь.
export function wallTorch(L, M, x, y, z, ry = 0, opts = {}) {
  const rng = L.rng;
  const fx = x + Math.sin(ry) * 0.35, fz = z + Math.cos(ry) * 0.35;
  L.add(boxGeo(0.12, 0.3, 0.06, rng), M.iron, mat4(x, y, z, 0, ry, 0));
  L.add(boxGeo(0.04, 0.04, 0.4, rng), M.iron, mat4((x + fx) / 2, y - 0.05, (z + fz) / 2, -0.4, ry, 0));
  L.add(cylGeo(0.05, 0.035, 0.45, 6, rng), M.wood, mat4(fx, y + 0.05, fz, 0.25, ry, 0));
  L.add(cylGeo(0.075, 0.05, 0.12, 6, rng), M.iron, mat4(fx, y + 0.22, fz));
  return L.addFire(fx, y + 0.3, fz, { scale: 0.75, ...opts });
}

// Группа свечей (без собственного света, только огоньки).
export function candles(L, M, x, y, z, n = 5, spread = 0.35, withLight = false) {
  const rng = L.rng;
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, r = rng() * spread;
    const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
    const h = 0.12 + rng() * 0.3, rad = 0.03 + rng() * 0.025;
    L.add(cylGeo(rad, rad * 1.1, h, 8, rng), M.wax, mat4(cx, y + h / 2, cz), { cast: false });
    L.addFire(cx, y + h + 0.01, cz, { scale: 0.11, light: false, glow: 0.5 });
  }
  if (withLight) {
    const pl = new THREE.PointLight(0xff9a4a, 3.5, 6, 2);
    pl.position.set(x, y + 0.5, z);
    L.root.add(pl);
    L.fires.push({ light: pl, base: 3.5, seed: rng() * 100, sprites: [] });
  }
}

export function rubble(L, M, x, z, n = 6, spread = 1.5) {
  const rng = L.rng;
  for (let i = 0; i < n; i++) {
    const s = 0.2 + rng() * 0.5;
    L.add(boxGeo(s * (0.8 + rng()), s * 0.6, s, rng), M.stone, mat4(x + (rng() - 0.5) * spread * 2, s * 0.2, z + (rng() - 0.5) * spread * 2, rng() * 0.6, rng() * 3, rng() * 0.6));
  }
}
