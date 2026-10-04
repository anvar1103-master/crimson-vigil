// Визуальные эффекты боя: частицы, декали, гильзы, вспышки света в мире.
import * as THREE from 'three';
import { ParticleSystem } from '../core/particles.js';
import { glowTex, smokeTex, holeTex, bloodTex } from '../core/textures.js';
import { withFog } from '../core/fog.js';
import { rand, randRange } from '../core/util.js';

const V3 = THREE.Vector3;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V3(), _p = new V3(), _e = new THREE.Euler();

export class FX {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.sparks = new ParticleSystem(scene, { max: 1500, additive: true, texture: glowTex(), renderOrder: 9 });
    this.smoke = new ParticleSystem(scene, { max: 900, additive: false, texture: smokeTex(), renderOrder: 6 });
    this.gore = new ParticleSystem(scene, { max: 900, additive: false, texture: glowTex(), renderOrder: 6 });
    this.systems = [this.sparks, this.smoke, this.gore];

    // Декали: пулевые отверстия и кровь (кольцевой буфер).
    this.decals = [];
    this.decalGeo = new THREE.PlaneGeometry(1, 1);
    this.holeMat = withFog(new THREE.MeshStandardMaterial({
      map: holeTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 1,
    }));
    this.bloodMat = withFog(new THREE.MeshStandardMaterial({
      map: bloodTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.25, color: 0xffffff,
    }));

    // Гильзы: физика на CPU, рисуются InstancedMesh.
    const casingGeo = new THREE.CylinderGeometry(0.0058, 0.0058, 0.03, 8);
    casingGeo.rotateX(Math.PI / 2);
    this.casingMesh = new THREE.InstancedMesh(casingGeo, withFog(new THREE.MeshStandardMaterial({ color: 0xc89a48, metalness: 1, roughness: 0.3 })), 80);
    this.casingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.casingMesh.count = 0;
    this.casingMesh.frustumCulled = false;
    this.casingMesh.castShadow = false;
    scene.add(this.casingMesh);
    this.casings = [];

    // Короткие вспышки света в мире (выстрел, взрыв): пул из двух ламп, без перекомпиляции шейдеров.
    this.flashLights = [0, 1].map(() => {
      const l = new THREE.PointLight(0xffb060, 0, 14, 2);
      scene.add(l);
      return { light: l, t: 0, dur: 0.06, peak: 0 };
    });
  }

  flash(pos, { color = 0xffb060, intensity = 30, dur = 0.06, distance = 14 } = {}) {
    const f = this.flashLights.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    f.light.position.copy(pos);
    f.light.color.set(color);
    f.light.distance = distance;
    f.t = 0; f.dur = dur; f.peak = intensity;
  }

  muzzleSmoke(pos, dir, amount = 1) {
    for (let i = 0; i < 5 * amount; i++) {
      const sp = randRange(0.4, 1.6);
      this.smoke.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + randRange(-0.2, 0.2), vy: dir.y * sp + randRange(0, 0.3), vz: dir.z * sp + randRange(-0.2, 0.2),
        life: randRange(0.8, 1.6), size: 0.05, size1: randRange(0.3, 0.55),
        r: 0.2, g: 0.19, b: 0.19, a: 0.18, drag: 2.4, gravity: -0.25, spin: randRange(-1, 1),
      });
    }
    for (let i = 0; i < 5; i++) {
      const sp = randRange(4, 10);
      this.sparks.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + randRange(-1, 1), vy: dir.y * sp + randRange(-1, 1), vz: dir.z * sp + randRange(-1, 1),
        life: randRange(0.08, 0.2), size: 0.03, size1: 0.01, r: 3, g: 1.6, b: 0.6, a: 1, drag: 3, gravity: 4,
      });
    }
  }

  // Попадание в камень/дерево: искры, пыль, обломки, отверстие.
  impact(point, normal, { color = [0.55, 0.5, 0.46], big = false } = {}) {
    const n = normal;
    for (let i = 0; i < (big ? 18 : 9); i++) {
      const sp = randRange(2, 7);
      this.sparks.spawn({
        x: point.x, y: point.y, z: point.z,
        vx: n.x * sp + randRange(-2.5, 2.5), vy: n.y * sp + randRange(-1, 3), vz: n.z * sp + randRange(-2.5, 2.5),
        life: randRange(0.15, 0.45), size: 0.035, size1: 0.005, r: 3.2, g: 1.7, b: 0.6, a: 1, drag: 1.5, gravity: 9,
      });
    }
    for (let i = 0; i < (big ? 10 : 5); i++) {
      const sp = randRange(0.4, 1.8);
      this.smoke.spawn({
        x: point.x + n.x * 0.05, y: point.y + n.y * 0.05, z: point.z + n.z * 0.05,
        vx: n.x * sp + randRange(-0.4, 0.4), vy: n.y * sp + randRange(0, 0.5), vz: n.z * sp + randRange(-0.4, 0.4),
        life: randRange(0.6, 1.4), size: 0.1, size1: randRange(0.4, 0.8),
        r: color[0], g: color[1], b: color[2], a: 0.45, drag: 3, gravity: 0.6, spin: randRange(-2, 2),
      });
    }
    for (let i = 0; i < 6; i++) {
      const sp = randRange(1.5, 4);
      this.gore.spawn({
        x: point.x, y: point.y, z: point.z,
        vx: n.x * sp + randRange(-1.5, 1.5), vy: n.y * sp + randRange(0.5, 3), vz: n.z * sp + randRange(-1.5, 1.5),
        life: randRange(0.4, 0.8), size: 0.03, size1: 0.025, r: color[0] * 0.6, g: color[1] * 0.6, b: color[2] * 0.6, a: 1, gravity: 12, drag: 0.5,
      });
    }
    this.decal(point, normal, this.holeMat, randRange(0.07, 0.11));
  }

  // Кровь вампира: тёмно-багровые брызги + капли + пятна на земле.
  blood(point, dir, amount = 1, { headshot = false } = {}) {
    const count = Math.round((headshot ? 40 : 22) * amount);
    for (let i = 0; i < count; i++) {
      const sp = randRange(1, headshot ? 7 : 4.5);
      const d = rand() < 0.65 ? 1 : -0.4;
      this.gore.spawn({
        x: point.x, y: point.y, z: point.z,
        vx: dir.x * sp * d + randRange(-1.5, 1.5), vy: randRange(-0.5, 3.2), vz: dir.z * sp * d + randRange(-1.5, 1.5),
        life: randRange(0.45, 1.1), size: randRange(0.05, 0.11), size1: 0.03,
        r: randRange(0.45, 0.7), g: 0.01, b: 0.03, a: 1, gravity: 11, drag: 0.8,
      });
    }
    // Багровая взвесь в месте попадания.
    for (let i = 0; i < 5 * amount; i++) {
      this.smoke.spawn({
        x: point.x, y: point.y, z: point.z,
        vx: dir.x * randRange(0.5, 2.2) + randRange(-0.5, 0.5), vy: randRange(-0.2, 0.6), vz: dir.z * randRange(0.5, 2.2) + randRange(-0.5, 0.5),
        life: randRange(0.35, 0.8), size: 0.15, size1: randRange(0.6, 0.9),
        r: 0.5, g: 0.02, b: 0.05, a: 0.55, drag: 4, gravity: 0.5,
      });
    }
    this.sparks.spawn({ x: point.x, y: point.y, z: point.z, life: 0.12, size: headshot ? 0.7 : 0.45, size1: 0.1, r: 2.5, g: 0.15, b: 0.12, a: 1 });
    // Пятно на земле под целью.
    if (rand() < 0.8) {
      _p.set(point.x + dir.x * randRange(0.5, 1.5), 0.02, point.z + dir.z * randRange(0.5, 1.5));
      this.decal(_p, new V3(0, 1, 0), this.bloodMat, randRange(0.6, 1.2) * amount);
    }
  }

  // Смерть вампира: пепел и тлеющие угли.
  ash(point, intensity = 1) {
    for (let i = 0; i < 10 * intensity; i++) {
      this.smoke.spawn({
        x: point.x + randRange(-0.3, 0.3), y: point.y + randRange(-0.6, 0.6), z: point.z + randRange(-0.3, 0.3),
        vx: randRange(-0.5, 0.5), vy: randRange(0.3, 1.5), vz: randRange(-0.5, 0.5),
        life: randRange(1.2, 2.5), size: 0.15, size1: randRange(0.6, 1.2),
        r: 0.12, g: 0.1, b: 0.1, a: 0.55, drag: 1.5, gravity: -0.3, spin: randRange(-1, 1),
      });
    }
    for (let i = 0; i < 14 * intensity; i++) {
      this.sparks.spawn({
        x: point.x + randRange(-0.35, 0.35), y: point.y + randRange(-0.8, 0.8), z: point.z + randRange(-0.35, 0.35),
        vx: randRange(-0.8, 0.8), vy: randRange(0.5, 2.5), vz: randRange(-0.8, 0.8),
        life: randRange(0.8, 2.0), size: randRange(0.02, 0.05), size1: 0.0,
        r: 3.5, g: randRange(0.6, 1.2), b: 0.2, a: 1, drag: 1.2, gravity: -0.6,
      });
    }
  }

  embers(pos, rate = 1) {
    if (rand() > rate * 0.25) return;
    this.sparks.spawn({
      x: pos.x + randRange(-0.2, 0.2), y: pos.y, z: pos.z + randRange(-0.2, 0.2),
      vx: randRange(-0.3, 0.3), vy: randRange(0.8, 2.2), vz: randRange(-0.3, 0.3),
      life: randRange(1, 2.2), size: randRange(0.02, 0.04), size1: 0, r: 3, g: 1.1, b: 0.3, a: 1, drag: 0.6, gravity: -0.2,
    });
  }

  decal(point, normal, material, size) {
    const m = new THREE.Mesh(this.decalGeo, material);
    m.position.copy(point).addScaledVector(normal, 0.01);
    m.lookAt(_p.copy(m.position).add(normal));
    m.rotateZ(rand() * Math.PI * 2);
    m.scale.setScalar(size);
    m.renderOrder = 2;
    this.game.scene.add(m);
    this.decals.push(m);
    if (this.decals.length > 60) this.game.scene.remove(this.decals.shift());
  }

  casing(pos, vel) {
    if (this.casings.length >= 80) this.casings.shift();
    this.casings.push({
      p: pos.clone(), v: vel.clone(),
      r: new V3(rand() * 6, rand() * 6, rand() * 6), w: new V3(randRange(-20, 20), randRange(-20, 20), randRange(-20, 20)),
      life: 10, bounces: 0,
    });
  }

  update(dt) {
    for (const s of this.systems) s.update(dt);
    for (const f of this.flashLights) {
      f.t += dt;
      const k = Math.max(0, 1 - f.t / f.dur);
      f.light.intensity = f.peak * k * k;
    }
    // Гильзы.
    const cs = this.casings;
    for (let i = cs.length - 1; i >= 0; i--) {
      const c = cs[i];
      c.life -= dt;
      if (c.life <= 0) { cs.splice(i, 1); continue; }
      c.v.y -= 14 * dt;
      c.p.addScaledVector(c.v, dt);
      c.r.addScaledVector(c.w, dt);
      if (c.p.y < 0.006) {
        c.p.y = 0.006;
        if (c.v.y < -0.8) {
          c.v.y *= -0.35; c.v.x *= 0.6; c.v.z *= 0.6; c.w.multiplyScalar(0.6);
          if (c.bounces++ < 3) this.game.audio.tone({ type: 'triangle', freq: 3400 + rand() * 1500, gain: 0.05, decay: 0.07, pos: c.p, reverb: 0.15 });
        } else { c.v.set(c.v.x * 0.9, 0, c.v.z * 0.9); c.w.multiplyScalar(0.9); c.r.x = Math.PI / 2; c.r.z = 0; }
      }
    }
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      _q.setFromEuler(_e.set(c.r.x, c.r.y, c.r.z));
      _m.compose(c.p, _q, _s.set(1, 1, 1));
      this.casingMesh.setMatrixAt(i, _m);
    }
    this.casingMesh.count = cs.length;
    this.casingMesh.instanceMatrix.needsUpdate = true;
  }

  setScale(h, fov) { for (const s of this.systems) s.setScale(h, fov); }

  clear() {
    for (const s of this.systems) s.clear();
    for (const d of this.decals) this.game.scene.remove(d);
    this.decals = [];
    this.casings = [];
  }
}
