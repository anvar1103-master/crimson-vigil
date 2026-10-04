// Опасности от врагов: кровавые сферы (снаряды) и ударные волны (от них спасает прыжок).
import * as THREE from 'three';
import { glowTex } from '../../core/textures.js';
import { randRange } from '../../core/util.js';

const V3 = THREE.Vector3;

export class Hazards {
  constructor(game) {
    this.game = game;
    this.orbs = [];
    this.waves = [];
    this.marks = [];
    this.orbGeo = new THREE.SphereGeometry(0.16, 12, 8);
    this.orbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.15, 0.2) });
    this.glowMat = new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(2.2, 0.1, 0.15), blending: THREE.AdditiveBlending, depthWrite: false });
  }

  // Кровавая сфера: летит к охотнику с лёгким самонаведением.
  orb(pos, dir, { speed = 9, damage = 12, homing = 1.2, size = 1 } = {}) {
    const m = new THREE.Mesh(this.orbGeo, this.orbMat);
    m.scale.setScalar(size);
    const g = new THREE.Sprite(this.glowMat);
    g.scale.setScalar(1.3);
    m.add(g);
    m.position.copy(pos);
    this.game.scene.add(m);
    this.orbs.push({ mesh: m, vel: dir.clone().normalize().multiplyScalar(speed), speed, damage, homing, life: 5, size });
  }

  // Ударная волна: расширяющееся кольцо по земле.
  shockwave(pos, { maxR = 7, speed = 9, damage = 18, color = 0xff5020, band = 0.7 } = {}) {
    const geo = new THREE.RingGeometry(0.9, 1, 64, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(pos.x, 0.08, pos.z);
    this.game.scene.add(m);
    this.waves.push({ mesh: m, pos: pos.clone(), r: 0.5, maxR, speed, damage, band, hit: false });
    this.game.fx.flash(new V3(pos.x, 0.5, pos.z), { color, intensity: 30, dur: 0.3, distance: 10 });
  }

  // Метка на земле: через delay секунд бьёт в этой точке (кровавый дождь Суверена).
  mark(pos, { delay = 1.2, radius = 2.2, damage = 22 } = {}) {
    const geo = new THREE.CircleGeometry(radius, 32).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.05, 0.08), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(pos.x, 0.06, pos.z);
    this.game.scene.add(m);
    this.marks.push({ mesh: m, pos: pos.clone(), t: 0, delay, radius, damage });
  }

  update(dt) {
    const game = this.game, p = game.player;
    const eye = new V3(p.pos.x, p.pos.y + 1.2, p.pos.z);
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.life -= dt;
      const to = eye.clone().sub(o.mesh.position);
      const d = to.length();
      if (p.alive && o.homing > 0) {
        o.vel.lerp(to.normalize().multiplyScalar(o.speed), Math.min(1, o.homing * dt));
      }
      o.mesh.position.addScaledVector(o.vel, dt);
      if (Math.random() < 0.6) {
        const q = o.mesh.position;
        game.fx.gore.spawn({ x: q.x, y: q.y, z: q.z, vx: randRange(-0.3, 0.3), vy: randRange(-0.5, 0.2), vz: randRange(-0.3, 0.3), life: 0.5, size: 0.08 * o.size, size1: 0.01, r: 0.6, g: 0.01, b: 0.04, a: 1, gravity: 3 });
      }
      let dead = o.life <= 0;
      if (p.alive && d < 0.7 * o.size + 0.3) {
        p.damage(o.damage * (game.run?.stats.enemyDamage ?? 1), o.mesh.position);
        game.fx.blood(o.mesh.position, o.vel.clone().normalize(), 0.8);
        dead = true;
      }
      const pos = o.mesh.position;
      if (pos.y < 0.1 || game.level.raycast(pos, o.vel.clone().normalize(), o.vel.length() * dt + 0.1)) {
        game.fx.blood(pos, new V3(0, 1, 0), 0.6);
        dead = true;
      }
      if (dead) { game.scene.remove(o.mesh); this.orbs.splice(i, 1); }
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.r += w.speed * dt;
      const k = w.r / w.maxR;
      w.mesh.scale.set(w.r, 1, w.r);
      w.mesh.material.opacity = Math.max(0, 1 - k) * 0.9;
      // Пыль по краю кольца.
      for (let j = 0; j < 4; j++) {
        const a = Math.random() * Math.PI * 2;
        game.fx.smoke.spawn({ x: w.pos.x + Math.cos(a) * w.r, y: 0.2, z: w.pos.z + Math.sin(a) * w.r, vy: 0.8, life: 0.7, size: 0.4, size1: 1.0, r: 0.3, g: 0.12, b: 0.08, a: 0.35, drag: 2 });
      }
      if (!w.hit && p.alive && p.pos.y < 0.35) {
        const d = Math.hypot(p.pos.x - w.pos.x, p.pos.z - w.pos.z);
        if (Math.abs(d - w.r) < w.band) {
          w.hit = true;
          if (p.damage(w.damage * (game.run?.stats.enemyDamage ?? 1), w.pos)) {
            const dir = new V3(p.pos.x - w.pos.x, 0, p.pos.z - w.pos.z).normalize();
            p.vel.addScaledVector(dir, 7);
            p.vel.y = 3;
            p.onGround = false;
          }
        }
      }
      if (w.r >= w.maxR) { game.scene.remove(w.mesh); w.mesh.geometry.dispose(); w.mesh.material.dispose(); this.waves.splice(i, 1); }
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      m.t += dt;
      const k = Math.min(1, m.t / m.delay);
      m.mesh.material.opacity = 0.15 + k * 0.5 * (0.7 + 0.3 * Math.sin(m.t * 30));
      m.mesh.scale.setScalar(0.4 + k * 0.6);
      if (m.t >= m.delay) {
        game.fx.blood(new V3(m.pos.x, 0.3, m.pos.z), new V3(0, 1, 0), 2);
        game.fx.flash(new V3(m.pos.x, 1, m.pos.z), { color: 0xff1020, intensity: 25, dur: 0.25, distance: 8 });
        const d = Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z);
        if (p.alive && d < m.radius) p.damage(m.damage * (game.run?.stats.enemyDamage ?? 1), m.pos);
        game.scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose();
        this.marks.splice(i, 1);
      }
    }
  }

  clear() {
    for (const o of this.orbs) this.game.scene.remove(o.mesh);
    for (const w of this.waves) this.game.scene.remove(w.mesh);
    for (const m of this.marks) this.game.scene.remove(m.mesh);
    this.orbs = []; this.waves = []; this.marks = [];
  }
}
