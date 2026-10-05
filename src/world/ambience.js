// Живая атмосфера уровня: пепел, светлячки, споры, пылинки, стая летучих мышей у луны, лужи.
// Частицы рождаются вокруг камеры — эффект есть везде, а стоит копейки.
import * as THREE from 'three';
import { withFog } from '../core/fog.js';
import { rand, randRange, mulberry32 } from '../core/util.js';

// cfg: { ash, fireflies, spores, dust, bats, embersAir } — интенсивности 0..1 (и число мышей).
export class Ambience {
  constructor(game, cfg = {}) {
    this.game = game;
    this.cfg = cfg;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.bats = [];
    if (cfg.bats) this.makeBats(cfg.bats);
  }

  // Силуэты летучих мышей кружат вдали на фоне луны (не враги, просто декор).
  makeBats(n) {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0.15, -0.25, 0.75, 0, 0.35, 0, 0, 0, 0.75, 0, 0.35, 0.3, -0.05, 0.4], 3));
    const mat = new THREE.MeshBasicMaterial({ color: 0x060203, side: THREE.DoubleSide, fog: false });
    const body = new THREE.SphereGeometry(0.18, 6, 4);
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const l = new THREE.Mesh(wing, mat), r = new THREE.Mesh(wing, mat);
      r.scale.x = -1;
      g.add(l, r, new THREE.Mesh(body, mat));
      g.scale.setScalar(randRange(1.2, 2.2));
      this.group.add(g);
      this.bats.push({ g, l, r, ph: rand() * 10, rad: randRange(10, 26), h: randRange(-6, 8), sp: randRange(0.25, 0.5) * (rand() < 0.5 ? 1 : -1), flap: randRange(9, 14) });
    }
  }

  update(dt) {
    const game = this.game, c = this.cfg, cam = game.camera.position, t = game.time;
    const fx = game.fx;
    // Стая у луны.
    if (this.bats.length) {
      const md = game.level.atmosphere.moonDir;
      const cx = cam.x + md.x * 120, cy = 18 + md.y * 70, cz = cam.z + md.z * 120;
      for (const b of this.bats) {
        const a = t * b.sp + b.ph;
        b.g.position.set(cx + Math.cos(a) * b.rad, cy + b.h + Math.sin(t * 0.7 + b.ph) * 3, cz + Math.sin(a) * b.rad * 0.5);
        b.g.lookAt(cam);
        const f = Math.sin(t * b.flap + b.ph) * 0.9;
        b.l.rotation.z = f; b.r.rotation.z = -f;
      }
    }
    // Пепел медленно падает (горящая деревня).
    if (c.ash && rand() < c.ash * 0.9) {
      fx.smoke.spawn({
        x: cam.x + randRange(-12, 12), y: cam.y + randRange(2, 7), z: cam.z + randRange(-12, 12),
        vx: randRange(0.2, 0.8), vy: randRange(-0.6, -0.3), vz: randRange(-0.2, 0.3),
        life: randRange(5, 8), size: 0.05, size1: 0.04, r: 0.55, g: 0.52, b: 0.5, a: 0.8, drag: 0.1, spin: randRange(-3, 3),
      });
    }
    // Летящие искры от пожаров.
    if (c.embersAir && rand() < c.embersAir * 0.5) {
      fx.sparks.spawn({
        x: cam.x + randRange(-14, 14), y: randRange(0.5, 5), z: cam.z + randRange(-14, 14),
        vx: randRange(0.4, 1.2), vy: randRange(0.3, 1.1), vz: randRange(-0.4, 0.4),
        life: randRange(2, 4), size: randRange(0.02, 0.035), size1: 0, r: 3, g: 1.1, b: 0.25, a: 1, drag: 0.3, gravity: -0.1,
      });
    }
    // Светлячки: висят и медленно плывут, мерцание даёт смена жизни/угасания.
    if (c.fireflies && rand() < c.fireflies * 0.6) {
      fx.sparks.spawn({
        x: cam.x + randRange(-15, 15), y: randRange(0.3, 2.2), z: cam.z + randRange(-15, 15),
        vx: randRange(-0.3, 0.3), vy: randRange(-0.1, 0.15), vz: randRange(-0.3, 0.3),
        life: randRange(2.5, 5), size: 0.05, size1: 0.02, r: 1.6, g: 2.4, b: 0.6, a: 1, drag: 0.2,
      });
    }
    // Споры/пух в лунном свете.
    if (c.spores && rand() < c.spores * 0.7) {
      fx.smoke.spawn({
        x: cam.x + randRange(-10, 10), y: randRange(0.5, 4), z: cam.z + randRange(-10, 10),
        vx: randRange(-0.2, 0.2), vy: randRange(-0.05, 0.1), vz: randRange(-0.2, 0.2),
        life: randRange(5, 9), size: 0.03, size1: 0.03, r: 0.9, g: 0.85, b: 0.8, a: 0.7, drag: 0.1,
      });
    }
    // Пыль в помещениях: искорки в свете свечей и витражей.
    if (c.dust && rand() < c.dust * 0.8) {
      fx.sparks.spawn({
        x: cam.x + randRange(-8, 8), y: randRange(0.5, 5), z: cam.z + randRange(-8, 8),
        vx: randRange(-0.08, 0.08), vy: randRange(-0.05, 0.05), vz: randRange(-0.08, 0.08),
        life: randRange(4, 8), size: 0.018, size1: 0.018, r: 0.9, g: 0.75, b: 0.6, a: 0.6, drag: 0.05,
      });
    }
  }

  dispose() { this.game.scene.remove(this.group); }
}

// Лужи: глянцевые неровные пятна, отражают небо и огни. Рисуются одним мешем на уровень.
export function addPuddles(L, { count = 18, area = 16, mask = () => true, seed = 3 } = {}) {
  const rng = mulberry32(seed);
  const geos = [];
  let n = 0, tries = 0;
  while (n < count && tries++ < count * 30) {
    const x = (rng() * 2 - 1) * area, z = (rng() * 2 - 1) * area;
    if (!mask(x, z)) continue;
    const r = 0.5 + rng() * 1.3;
    const g = new THREE.CircleGeometry(r, 20).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 1; i < p.count; i++) {
      const k = 0.7 + rng() * 0.45;
      p.setX(i, p.getX(i) * k * 1.3); p.setZ(i, p.getZ(i) * k);
    }
    g.rotateY(rng() * Math.PI);
    g.translate(x, 0.028 + n * 0.0004, z);
    geos.push(g);
    n++;
  }
  if (!geos.length) return null;
  const merged = new THREE.BufferGeometry();
  // Простое слияние: позиции/нормали/uv + индексы.
  let vCount = 0;
  const pos = [], nor = [], uv = [], idx = [];
  for (const g of geos) {
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array);
    for (const i of g.index.array) idx.push(i + vCount);
    vCount += g.attributes.position.count;
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  merged.setIndex(idx);
  const mat = withFog(new THREE.MeshStandardMaterial({
    color: 0x060507, roughness: 0.07, metalness: 0.1, envMapIntensity: 1.0, polygonOffset: true, polygonOffsetFactor: -2,
  }));
  const mesh = new THREE.Mesh(merged, mat);
  mesh.receiveShadow = true;
  L.root.add(mesh);
  return mesh;
}
