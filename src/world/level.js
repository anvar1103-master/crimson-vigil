// Уровень: статическая геометрия (сливается по материалам), коллайдеры, источники света, огни.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { withFog, withFogTree } from '../core/fog.js';
import { flameTex, glowTex } from '../core/textures.js';
import { clamp, flicker, mulberry32 } from '../core/util.js';

const _ray = new THREE.Raycaster();

export class Level {
  constructor(scene, seed = 1) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'level';
    scene.add(this.root);
    this.rng = mulberry32(seed);
    this.colliders = [];
    this.raycastTargets = [];
    this.batches = new Map();
    this.fires = [];       // { light, base, seed, sprites:[{sprite, sx, sy}] }
    this.updaters = [];    // (dt, t) => void
    this.spawnPoints = [];
    this.bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
    this.playerStart = new THREE.Vector3();
    this.playerYaw = 0;
  }

  // Статическая геометрия копится по материалам и в flush() сливается в один меш на материал.
  add(geo, mat, matrix = null, { cast = true, receive = true, raycast = true } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo && matrix) g = geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    const key = `${mat.uuid}|${cast}|${receive}|${raycast}`;
    if (!this.batches.has(key)) this.batches.set(key, { mat, cast, receive, raycast, geos: [] });
    this.batches.get(key).geos.push(g);
  }

  flush() {
    for (const b of this.batches.values()) {
      const merged = mergeGeometries(b.geos, false);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
      if (b.raycast) this.raycastTargets.push(mesh);
      for (const g of b.geos) g.dispose();
    }
    this.batches.clear();
    withFogTree(this.root);
  }

  addMesh(mesh, { raycast = false } = {}) {
    this.root.add(mesh);
    withFogTree(mesh);
    if (raycast) this.raycastTargets.push(mesh);
    return mesh;
  }

  box(minX, minZ, maxX, maxZ, h = 10) { this.colliders.push({ type: 'box', minX, minZ, maxX, maxZ, h }); }
  boxAt(x, z, w, d, h = 10) { this.box(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h); }
  circle(x, z, r, h = 10) { this.colliders.push({ type: 'circle', x, z, r, h }); }

  // Огонь: несколько аддитивных спрайтов пламени + ореол + мерцающий точечный свет.
  addFire(x, y, z, { scale = 1, light = true, intensity = 18, distance = 14, color = 0xff7a30, glow = 1 } = {}) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const sprites = [];
    const fm = new THREE.SpriteMaterial({
      map: flameTex(), color: new THREE.Color(3.2, 1.7, 0.9), blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false, transparent: true,
    });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(fm);
      const sx = (0.32 - i * 0.07) * scale, sy = (0.62 - i * 0.12) * scale;
      s.scale.set(sx, sy, 1);
      s.position.set((i - 1) * 0.04 * scale, sy * 0.4, 0);
      s.renderOrder = 8;
      group.add(s);
      sprites.push({ sprite: s, sx, sy });
    }
    if (glow > 0) {
      const gm = new THREE.SpriteMaterial({
        map: glowTex(), color: new THREE.Color(1.0, 0.42, 0.12).multiplyScalar(0.55 * glow), blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false, transparent: true,
      });
      const g = new THREE.Sprite(gm);
      g.scale.set(2.2 * scale, 2.2 * scale, 1);
      g.position.y = 0.2 * scale;
      g.renderOrder = 7;
      group.add(g);
      sprites.push({ sprite: g, sx: 2.2 * scale, sy: 2.2 * scale, glow: true });
    }
    this.root.add(group);
    let pl = null;
    if (light) {
      pl = new THREE.PointLight(color, intensity, distance, 2);
      pl.position.set(x, y + 0.35 * scale, z);
      this.root.add(pl);
    }
    const fire = { group, light: pl, base: intensity, seed: this.rng() * 100, sprites, pos: new THREE.Vector3(x, y, z) };
    this.fires.push(fire);
    return fire;
  }

  update(dt, t) {
    for (const f of this.fires) {
      const k = flicker(t * 1.3, f.seed);
      if (f.light) f.light.intensity = f.base * (0.82 + 0.18 * k);
      for (let i = 0; i < f.sprites.length; i++) {
        const s = f.sprites[i];
        if (s.glow) { const g = 0.9 + 0.1 * k; s.sprite.scale.set(s.sx * g, s.sy * g, 1); continue; }
        const j = flicker(t * 2.1 + i * 1.7, f.seed + i * 5);
        s.sprite.scale.set(s.sx * (0.9 + 0.12 * j), s.sy * (0.85 + 0.2 * j), 1);
        s.sprite.material.rotation = j * 0.06;
      }
    }
    for (const u of this.updaters) u(dt, t);
  }

  // Выталкивает круг (x,z) радиуса r из коллайдеров. Возвращает true при столкновении.
  resolveCircle(p, r, y = 0) {
    let hit = false;
    for (const c of this.colliders) {
      if (y > c.h) continue;
      if (c.type === 'box') {
        const cx = clamp(p.x, c.minX, c.maxX), cz = clamp(p.z, c.minZ, c.maxZ);
        const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r;
        } else {
          const pen = [p.x - c.minX, c.maxX - p.x, p.z - c.minZ, c.maxZ - p.z];
          const m = pen.indexOf(Math.min(...pen));
          if (m === 0) p.x = c.minX - r; else if (m === 1) p.x = c.maxX + r;
          else if (m === 2) p.z = c.minZ - r; else p.z = c.maxZ + r;
        }
      } else {
        const dx = p.x - c.x, dz = p.z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        hit = true;
        const d = Math.sqrt(d2) || 1e-4;
        p.x = c.x + (dx / d) * rr; p.z = c.z + (dz / d) * rr;
      }
    }
    const b = this.bounds;
    if (p.x < b.minX + r) { p.x = b.minX + r; hit = true; }
    if (p.x > b.maxX - r) { p.x = b.maxX - r; hit = true; }
    if (p.z < b.minZ + r) { p.z = b.minZ + r; hit = true; }
    if (p.z > b.maxZ - r) { p.z = b.maxZ - r; hit = true; }
    return hit;
  }

  // Проверка прямой видимости по коллайдерам (для ИИ), без учёта высоты.
  lineOfSight(a, b) {
    for (const c of this.colliders) {
      if (c.h < 1.2) continue;
      if (c.type === 'circle') {
        const abx = b.x - a.x, abz = b.z - a.z, len2 = abx * abx + abz * abz;
        const t = clamp(((c.x - a.x) * abx + (c.z - a.z) * abz) / (len2 || 1), 0, 1);
        const px = a.x + abx * t - c.x, pz = a.z + abz * t - c.z;
        if (px * px + pz * pz < c.r * c.r) return false;
      } else if (segBox(a.x, a.z, b.x, b.z, c)) return false;
    }
    return true;
  }

  raycast(origin, dir, far = 100) {
    _ray.set(origin, dir);
    _ray.far = far;
    const hits = _ray.intersectObjects(this.raycastTargets, false);
    if (!hits.length) return null;
    const h = hits[0];
    const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    return { point: h.point, normal: n, distance: h.distance, object: h.object };
  }

  dispose() {
    const mats = new Set();
    this.root.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) for (const m of [].concat(o.material)) mats.add(m);
    });
    for (const m of mats) m.dispose();
    this.scene.remove(this.root);
  }
}

function segBox(x0, z0, x1, z1, b) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dz = z1 - z0;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, x0 - b.minX) && clip(dx, b.maxX - x0) && clip(-dz, z0 - b.minZ) && clip(dz, b.maxZ - z0) && t0 <= t1;
}

export { withFog };
