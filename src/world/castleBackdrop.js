// Задник: огромный готический замок на скале, силуэтом на фоне луны.
// Донжон со шпилем, башни разной высоты, зубчатые стены, арочный мост с цепочкой фонарей, горящие окна.
// Всё сливается в несколько мешей: тёмный силуэт, окна, фонари.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glowTex } from '../core/textures.js';
import { mulberry32 } from '../core/util.js';

const V3 = THREE.Vector3;

function prep(g, m) {
  let gg = g.index ? g.toNonIndexed() : g;
  for (const n of Object.keys(gg.attributes)) if (n !== 'position') gg.deleteAttribute(n);
  gg.applyMatrix4(m);
  return gg;
}

export function addCastleBackdrop(L, { dir, dist = 175, scale = 1, seed = 13, tint = 0x0b0609 } = {}) {
  const rng = mulberry32(seed);
  const dark = [], lit = [];
  const M = (x, y, z, ry = 0, s = new V3(1, 1, 1)) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), s);
  const box = (w, h, d, x, y, z, ry = 0) => dark.push(prep(new THREE.BoxGeometry(w, h, d), M(x, y + h / 2, z, ry)));
  const cyl = (r, h, x, y, z, seg = 10) => dark.push(prep(new THREE.CylinderGeometry(r, r * 1.05, h, seg), M(x, y + h / 2, z)));
  const cone = (r, h, x, y, z, seg = 10) => dark.push(prep(new THREE.ConeGeometry(r, h, seg), M(x, y + h / 2, z)));
  const windows = (x, y0, y1, z, r, n) => {
    for (let i = 0; i < n; i++) {
      if (rng() < 0.45) continue;
      const a = rng() * Math.PI * 2, y = y0 + rng() * (y1 - y0);
      lit.push(prep(new THREE.BoxGeometry(0.9, 1.8, 0.4), M(x + Math.cos(a) * r, y, z + Math.sin(a) * r, -a + Math.PI / 2)));
    }
  };
  // Зубцы по кругу на вершине башни.
  const crown = (x, y, z, r) => {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      box(0.9, 1.2, 0.9, x + Math.cos(a) * r, y, z + Math.sin(a) * r, -a);
    }
  };
  const tower = (x, z, r, h, base = 0, spire = 1.6) => {
    cyl(r, h, x, base, z, 12);
    cyl(r + 0.6, 1, x, base + h, z, 12);
    crown(x, base + h + 1, z, r + 0.3);
    cone(r * 1.25, r * 3.2 * spire, x, base + h + 1, z, 12);
    cone(0.25, 4, x, base + h + 1 + r * 3.2 * spire - 0.5, z, 6);
    windows(x, base + 4, base + h - 2, z, r + 0.05, Math.floor(h / 3));
  };

  // Скала-утёс.
  const crag = new THREE.ConeGeometry(70, 46, 14, 4);
  const cp = crag.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const k = 0.75 + rng() * 0.5;
    cp.setX(i, cp.getX(i) * k); cp.setZ(i, cp.getZ(i) * (0.6 + rng() * 0.4));
  }
  dark.push(prep(crag, M(0, -2, 0)));
  const top = 21;
  // Куртины по периметру.
  const ring = [[-34, -10], [-20, 12], [10, 16], [34, 4], [30, -16], [0, -22], [-34, -10]];
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
    box(2.2, 12, len, (x0 + x1) / 2, top, (z0 + z1) / 2, ang);
    const n = Math.floor(len / 2.2);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      box(1.1, 1.4, 1.0, x0 + (x1 - x0) * t, top + 12, z0 + (z1 - z0) * t, ang);
    }
    tower(x0, z0, 3.2 + rng() * 1.2, 16 + rng() * 10, top, 1.2 + rng() * 0.6);
  }
  // Донжон с главным шпилем.
  box(22, 30, 16, 0, top, -2);
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k++) box(1.6, 22 - k * 3, 3, sx * 11.6, top, -8 + k * 4);
  }
  windows(0, top + 8, top + 26, -2, 11.3, 18);
  for (let i = 0; i < 4; i++) {
    const w = 3.2;
    lit.push(prep(new THREE.BoxGeometry(w * 0.5, 7, 0.4), M(-6 + i * 4, top + 18, 6.05)));
  }
  tower(0, -2, 6, 22, top + 30, 2.2);
  tower(-9, -9, 3.2, 20, top + 30, 1.4);
  tower(9, -9, 3.2, 26, top + 30, 1.5);
  tower(-14, 6, 2.8, 30, top, 1.8);
  tower(16, 8, 3.4, 36, top, 1.6);
  tower(22, -10, 2.6, 44, top, 2);
  tower(-24, -4, 3, 38, top, 1.7);
  // Арочный мост к воротам и цепочка фонарей.
  const lanterns = [];
  for (let i = 0; i < 9; i++) {
    const z = 22 + i * 7;
    box(6, 3, 7.2, 0, top - 1, z);
    box(1.6, top - 1 + 2, 1.6, -2.6, -2, z + 3.5);
    box(1.6, top - 1 + 2, 1.6, 2.6, -2, z + 3.5);
    if (i % 2 === 0) for (const sx of [-1, 1]) lanterns.push(new V3(sx * 2.9, top + 3.4, z));
  }
  tower(-4, 18, 2.6, 14, top, 1.3);
  tower(4, 18, 2.6, 14, top, 1.3);

  const group = new THREE.Group();
  const darkMat = new THREE.MeshBasicMaterial({ color: tint, fog: false });
  group.add(new THREE.Mesh(mergeGeometries(dark, false), darkMat));
  if (lit.length) group.add(new THREE.Mesh(mergeGeometries(lit, false), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.5, 0.5), fog: false })));
  // Фонари: тёплые ореолы-спрайты.
  const lm = new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(2.6, 1.2, 0.4), blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  for (const p of lanterns) {
    const s = new THREE.Sprite(lm);
    s.position.copy(p);
    s.scale.setScalar(3.2);
    group.add(s);
  }
  // Ставим по направлению к луне, мостом к игроку.
  const h = new V3(dir.x, 0, dir.z).normalize();
  group.position.copy(h).multiplyScalar(dist);
  group.position.y = -6;
  group.rotation.y = Math.atan2(-h.x, -h.z);
  group.scale.setScalar(scale);
  group.renderOrder = -5;
  L.root.add(group);
  return group;
}
