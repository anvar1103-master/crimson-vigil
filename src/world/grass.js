// Трава и подлесок: тысячи пучков одним InstancedMesh, качаются на ветру в вершинном шейдере.
import * as THREE from 'three';
import { fogUniforms } from '../core/fog.js';
import { mulberry32 } from '../core/util.js';

let _tex = null;
// Текстура пучка: изогнутые сужающиеся травинки на прозрачном фоне.
function grassTex() {
  if (_tex) return _tex;
  const W = 128, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const rng = mulberry32(55);
  for (let i = 0; i < 22; i++) {
    const x0 = 20 + rng() * 88, h = 60 + rng() * 64, bend = (rng() - 0.5) * 50, w = 2.5 + rng() * 3;
    const t = rng();
    const r = 70 + t * 70, g = 66 + t * 50, b = 34 + t * 18;
    ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    ctx.beginPath();
    ctx.moveTo(x0 - w, H);
    ctx.quadraticCurveTo(x0 + bend * 0.3, H - h * 0.6, x0 + bend, H - h);
    ctx.quadraticCurveTo(x0 + bend * 0.3 + w * 0.3, H - h * 0.6, x0 + w, H);
    ctx.closePath();
    ctx.fill();
  }
  _tex = new THREE.CanvasTexture(c);
  _tex.colorSpace = THREE.SRGBColorSpace;
  return _tex;
}

// Пучок — две перекрещенные плоскости. Нормали смотрят вверх: трава освещается ровно, без чёрных граней.
function tuftGeo() {
  const a = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  const g = new THREE.BufferGeometry();
  const merge = (name, size) => {
    const arr = new Float32Array(a.attributes[name].array.length * 2);
    arr.set(a.attributes[name].array, 0);
    arr.set(b.attributes[name].array, a.attributes[name].array.length);
    g.setAttribute(name, new THREE.BufferAttribute(arr, size));
  };
  merge('position', 3); merge('uv', 2);
  const n = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < n.length; i += 3) n[i + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  const ia = a.index.array, idx = [];
  for (const k of ia) idx.push(k);
  for (const k of ia) idx.push(k + 4);
  g.setIndex(idx);
  return g;
}

const windHook = function (shader) {
  Object.assign(shader.uniforms, fogUniforms);
  shader.uniforms.uWind = this.userData.wind;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uWind;\nuniform float fogTime;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[ 3 ].xyz;
      #else
        vec3 ip = vec3( 0.0 );
      #endif
      float sway = sin( fogTime * 1.7 + ip.x * 0.35 + ip.z * 0.27 ) * 0.6 + sin( fogTime * 3.1 + ip.x * 1.3 ) * 0.25;
      float k = uv.y * uv.y * uWind;
      transformed.x += sway * 0.12 * k;
      transformed.z += cos( fogTime * 1.3 + ip.z * 0.4 ) * 0.06 * k;`);
};

// mask(x, z) → можно ли здесь расти. density — пучков на м².
export function addGrass(L, { area = 20, count = 3000, mask = () => true, scale = [0.35, 0.8], tint = 0xffffff, wind = 1, seed = 7 } = {}) {
  const rng = mulberry32(seed);
  const mat = new THREE.MeshStandardMaterial({
    map: grassTex(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95, color: tint,
  });
  mat.userData.wind = { value: wind };
  mat.onBeforeCompile = windHook;
  const mesh = new THREE.InstancedMesh(tuftGeo(), mat, count);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  const col = new THREE.Color();
  let n = 0, tries = 0;
  while (n < count && tries++ < count * 6) {
    const x = (rng() * 2 - 1) * area, z = (rng() * 2 - 1) * area;
    if (!mask(x, z)) continue;
    const sc = scale[0] + rng() * (scale[1] - scale[0]);
    p.set(x, 0, z);
    q.setFromEuler(e.set((rng() - 0.5) * 0.25, rng() * Math.PI, (rng() - 0.5) * 0.25));
    s.set(sc * (0.8 + rng() * 0.5), sc, sc * (0.8 + rng() * 0.5));
    m.compose(p, q, s);
    mesh.setMatrixAt(n, m);
    const v = 0.7 + rng() * 0.5;
    mesh.setColorAt(n, col.setRGB(v, v * (0.9 + rng() * 0.15), v * 0.85));
    n++;
  }
  mesh.count = n;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  L.root.add(mesh);
  return mesh;
}

// Стандартная маска: не на коллайдерах и не на мощении.
export function groundMask(L, paved = []) {
  return (x, z) => {
    for (const r of paved) {
      if (r.r !== undefined) { if (Math.hypot(x - r.x, z - r.z) < r.r) return false; }
      else if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return false;
    }
    for (const c of L.colliders) {
      if (c.type === 'circle') { if (Math.hypot(x - c.x, z - c.z) < c.r + 0.15) return false; }
      else if (x > c.minX - 0.15 && x < c.maxX + 0.15 && z > c.minZ - 0.15 && z < c.maxZ + 0.15) return false;
    }
    return true;
  };
}
