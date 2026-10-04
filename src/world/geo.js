// Геометрические помощники: UV в метрах (текстуры не тянутся на больших объектах), стрельчатые арки.
import * as THREE from 'three';

const V2 = THREE.Vector2;

export function boxGeo(w, h, d, rng = Math.random) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const ou = rng() * 8, ov = rng() * 8;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0] + ou, uv.getY(i) * dims[f][1] + ov);
  }
  return g;
}

export function cylGeo(rTop, rBot, h, seg = 12, rng = Math.random, open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  const uv = g.attributes.uv;
  const circ = Math.PI * 2 * Math.max(rTop, rBot), ou = rng() * 8;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ + ou, uv.getY(i) * h);
  return g;
}

// Точки стрельчатой арки: от (-w/2, 0) вверх, через вершину, вниз до (w/2, 0).
// spring — высота прямых откосов до начала дуги, rf — радиус дуг в долях ширины (>0.5).
export function archPoints(w, spring, rf = 0.9, seg = 14) {
  const r = w * rf, half = w / 2, cxL = -half + r;
  // Левая дуга: центр справа, угол идёт от π (левый откос) до вершины на x = 0.
  const phiTop = Math.acos((half - r) / r);
  const pts = [];
  if (spring > 0) pts.push(new V2(-half, 0));
  const left = [];
  for (let k = 0; k <= seg; k++) {
    const a = Math.PI + (phiTop - Math.PI) * (k / seg);
    left.push(new V2(cxL + r * Math.cos(a), spring + r * Math.sin(a)));
  }
  pts.push(...left);
  for (let k = seg - 1; k >= 0; k--) pts.push(new V2(-left[k].x, left[k].y));
  if (spring > 0) pts.push(new V2(half, 0));
  return pts;
}

export function archApex(w, spring, rf = 0.9) {
  const r = w * rf, half = w / 2;
  return spring + Math.sqrt(r * r - (r - half) * (r - half));
}

export function extrudeGeo(shape, depth, bevel = 0, curveSegments = 12) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, curveSegments,
    bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

// Пролёт аркады: прямоугольник с вырезанной снизу стрельчатой аркой.
export function archSpanShape(w, t, top, rf = 0.9) {
  const arch = archPoints(w, 0, rf);
  const s = new THREE.Shape();
  s.moveTo(-w / 2 - t, 0);
  s.lineTo(-w / 2 - t, top);
  s.lineTo(w / 2 + t, top);
  s.lineTo(w / 2 + t, 0);
  for (let i = arch.length - 1; i >= 0; i--) s.lineTo(arch[i].x, arch[i].y);
  s.closePath();
  return s;
}

// Кольцо-архивольт вокруг проёма: внешняя арка минус внутренняя.
export function archRingShape(w, t, spring, rf = 0.9) {
  const outer = archPoints(w + 2 * t, spring, rf);
  const inner = archPoints(w, spring, rf);
  const s = new THREE.Shape();
  s.moveTo(outer[0].x, outer[0].y);
  for (let i = 1; i < outer.length; i++) s.lineTo(outer[i].x, outer[i].y);
  for (let i = inner.length - 1; i >= 0; i--) s.lineTo(inner[i].x, inner[i].y);
  s.closePath();
  return s;
}

// Глухая стрельчатая форма (окно, ниша, надгробие).
export function archShape(w, spring, rf = 0.9) {
  const pts = archPoints(w, spring, rf);
  const s = new THREE.Shape();
  s.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i].x, pts[i].y);
  s.closePath();
  return s;
}

export function mat4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(sx, sy, sz),
  );
}
