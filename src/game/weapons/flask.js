// Фляга святой воды: бросок по дуге (G или колёсико-клик), разбивается и оставляет лужу святого огня.
// Огонь жжёт нечисть и замедляет её. Три заряда, восполняются в каждой новой зоне.
import * as THREE from 'three';
import { glowTex } from '../../core/textures.js';
import { randRange, rand } from '../../core/util.js';

const V3 = THREE.Vector3;

export class Flasks {
  constructor(game) {
    this.game = game;
    this.max = 3;
    this.charges = 3;
    this.cooldown = 0;
    this.flying = [];
    this.pools = [];
    const glass = new THREE.MeshStandardMaterial({ color: 0x9ac8ff, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.75, emissive: 0x2050a0, emissiveIntensity: 0.6 });
    const cork = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
    this.makeFlask = () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), glass));
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.08, 8), glass);
      neck.position.y = 0.08; g.add(neck);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 8), cork);
      c.position.y = 0.13; g.add(c);
      return g;
    };
    this.poolGeo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
  }

  reset() {
    this.charges = this.max + (this.game.run?.stats.extraFlasks || 0);
    this.clear();
  }

  refill() { this.charges = this.max + (this.game.run?.stats.extraFlasks || 0); }

  throw() {
    const game = this.game;
    if (this.charges <= 0 || this.cooldown > 0) {
      if (this.charges <= 0) game.audio.dryFire();
      return;
    }
    this.charges--;
    this.cooldown = 0.6;
    const cam = game.camera;
    const dir = cam.getWorldDirection(new V3());
    const pos = cam.position.clone().addScaledVector(dir, 0.5).add(new V3(0, -0.15, 0));
    const vel = dir.clone().multiplyScalar(14).add(new V3(0, 3.2, 0)).add(game.player.vel.clone().multiplyScalar(0.5));
    const mesh = this.makeFlask();
    mesh.position.copy(pos);
    game.scene.add(mesh);
    this.flying.push({ mesh, vel, spin: new V3(randRange(-12, 12), randRange(-12, 12), randRange(-12, 12)), life: 4 });
    game.audio.weaponSwap();
    game.vm.flaskThrow = 1;
  }

  shatter(p) {
    const game = this.game, s = game.run?.stats || {};
    const radius = 3.2 * (s.flaskRadius || 1);
    game.audio.burst({ type: 'highpass', freq: 3000, gain: 0.7, decay: 0.15, pos: p, reverb: 0.4 });
    game.audio.tone({ type: 'triangle', freq: 2800, freq1: 1800, gain: 0.15, decay: 0.3, pos: p, reverb: 0.5 });
    game.audio.burst({ type: 'bandpass', freq: 600, freq1: 2000, q: 1, gain: 0.6, attack: 0.05, decay: 0.8, pos: p, reverb: 0.7 });
    game.fx.flash(new V3(p.x, 1, p.z), { color: 0x9ad0ff, intensity: 45, dur: 0.5, distance: 12 });
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2, sp = randRange(2, 7);
      game.fx.sparks.spawn({ x: p.x, y: 0.3, z: p.z, vx: Math.cos(a) * sp, vy: randRange(1, 5), vz: Math.sin(a) * sp, life: randRange(0.4, 0.9), size: 0.06, size1: 0, r: 1.4, g: 2.2, b: 3.5, a: 1, gravity: 8, drag: 1 });
    }
    // Лужа святого огня.
    // Мягкое голубое сияние с размытым краем, поверх — языки святого огня (частицы).
    const mat = new THREE.MeshBasicMaterial({ map: glowTex(), color: new THREE.Color(0.4, 0.9, 2.0), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const mesh = new THREE.Mesh(this.poolGeo, mat);
    mesh.position.set(p.x, 0.12, p.z);
    mesh.scale.setScalar(radius);
    game.scene.add(mesh);
    const light = game.fx.flashLights[0];
    this.pools.push({ mesh, pos: new V3(p.x, 0, p.z), radius, t: 0, dur: 4 * (s.flaskDuration || 1), dps: 34 * (s.damage || 1) * (s.flaskPower || 1), light });
    // Взрывная реликвия: мгновенный урон в радиусе.
    if (s.flaskBurst) game.combat.explode(new V3(p.x, 0.8, p.z), { radius, damage: 60 * (s.damage || 1), color: 0x9ad0ff });
  }

  update(dt, input) {
    const game = this.game;
    this.cooldown -= dt;
    if (input?.grenade && game.player.alive) this.throw();
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.life -= dt;
      f.vel.y -= 14 * dt;
      const step = f.vel.clone().multiplyScalar(dt);
      const hit = game.level.raycast(f.mesh.position, step.clone().normalize(), step.length() + 0.08);
      let enemyHit = null;
      for (const e of game.enemies.list) if (e.alive && e.center().distanceTo(f.mesh.position) < 0.9 * (e.sizeScale || 1)) { enemyHit = e; break; }
      f.mesh.position.add(step);
      f.mesh.rotation.x += f.spin.x * dt; f.mesh.rotation.z += f.spin.z * dt;
      if (hit || enemyHit || f.mesh.position.y < 0.08 || f.life <= 0) {
        const p = hit ? hit.point : f.mesh.position.clone();
        p.y = 0;
        game.scene.remove(f.mesh);
        this.flying.splice(i, 1);
        this.shatter(p);
      }
    }
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const pl = this.pools[i];
      pl.t += dt;
      const k = 1 - pl.t / pl.dur;
      pl.mesh.material.opacity = Math.max(0, k) * (0.65 + 0.2 * Math.sin(pl.t * 12));
      if (rand() < 0.9) {
        const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * pl.radius;
        game.fx.sparks.spawn({ x: pl.pos.x + Math.cos(a) * r, y: 0.1, z: pl.pos.z + Math.sin(a) * r, vy: randRange(1, 2.5), life: randRange(0.4, 0.9), size: randRange(0.08, 0.18), size1: 0, r: 0.8, g: 1.6, b: 3.2, a: 0.9, drag: 1 });
      }
      for (const e of game.enemies.list) {
        if (!e.alive) continue;
        const d = Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z);
        if (d < pl.radius && (e.pos.y ?? 0) < 2.5) {
          e.dot(pl.dps * dt);
          e.slowT = 0.3; e.slowAmt = Math.max(e.slowAmt || 0, 0.4);
        }
      }
      if (pl.t >= pl.dur) { game.scene.remove(pl.mesh); pl.mesh.material.dispose(); this.pools.splice(i, 1); }
    }
  }

  clear() {
    for (const f of this.flying) this.game.scene.remove(f.mesh);
    for (const p of this.pools) this.game.scene.remove(p.mesh);
    this.flying = []; this.pools = [];
  }
}
