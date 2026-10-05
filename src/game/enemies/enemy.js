// Базовый класс врага: здоровье, сферы попадания, вспышка при попадании, растворение при смерти.
import * as THREE from 'three';
import { fogUniforms } from '../../core/fog.js';

const V3 = THREE.Vector3;
const _c = new V3(), _oc = new V3();

// Общий патч шейдера для материалов врагов: растворение с горящей кромкой + вспышка урона.
// Одна функция для всех материалов, поэтому программы шейдеров переиспользуются, а uniform-ы у каждого свои.
function enemyPatch(shader) {
  const u = this.userData;
  shader.uniforms.uDissolve = u.dissolve;
  shader.uniforms.uFlash = u.flash;
  shader.uniforms.uEdge = u.edge;
  shader.uniforms.uRim = u.rim;
  Object.assign(shader.uniforms, fogUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vDissolvePos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDissolvePos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec3 vDissolvePos;
      uniform float uDissolve;
      uniform float uFlash;
      uniform vec3 uEdge;
      uniform vec3 uRim;
      float dHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
      float dNoise( vec3 x ) {
        vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( mix( dHash( i ), dHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( dHash( i + vec3( 0, 1, 0 ) ), dHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
                    mix( mix( dHash( i + vec3( 0, 0, 1 ) ), dHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( dHash( i + vec3( 0, 1, 1 ) ), dHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
      }`)
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      float dN = dNoise( vDissolvePos * 8.0 ) * 0.6 + dNoise( vDissolvePos * 21.0 ) * 0.4;
      if ( uDissolve > 0.0 && dN < uDissolve ) discard;`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if ( uDissolve > 0.0 ) totalEmissiveRadiance += uEdge * ( 1.0 - smoothstep( uDissolve, uDissolve + 0.07, dN ) );
      totalEmissiveRadiance += vec3( 1.0, 0.3, 0.25 ) * uFlash;
      // Багровый контровой ореол: силуэт читается даже в темноте.
      float rimF = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
      totalEmissiveRadiance += uRim * pow( rimF, 4.0 );`);
}

export function enemyMaterial(base) {
  const m = base.clone();
  m.userData = {
    dissolve: { value: 0 },
    flash: { value: 0 },
    edge: { value: new THREE.Vector3(6, 1.4, 0.3) },
    rim: { value: new THREE.Vector3(0.32, 0.03, 0.05) },
  };
  m.onBeforeCompile = enemyPatch;
  return m;
}

export class Enemy {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group();
    this.pos = this.root.position;
    this.vel = new V3();
    this.facing = 0;
    this.radius = 0.4;
    this.maxHp = 100;
    this.hp = 100;
    this.alive = true;
    this.dead = false;   // окончательно удалён
    this.state = 'idle';
    this.stateT = 0;
    this.materials = [];
    this.hitSpheres = []; // { local: V3, r, part, node }
    this.flash = 0;
    this.dissolve = 0;
    this.seed = Math.random() * 100;
    this.elite = null;
    this.xp = 10;
    this.sizeScale = 1;
    this.burnT = 0; this.burnDps = 0;
    this.slowT = 0; this.slowAmt = 0;
    this.dotAcc = 0;
  }

  get speedFactor() { return this.slowT > 0 ? 1 - this.slowAmt : 1; }

  // Горение и замедление от реликвий.
  tickStatus(dt) {
    if (!this.alive) return;
    if (this.slowT > 0) this.slowT -= dt;
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.dot(this.burnDps * dt);
      if (Math.random() < 0.5) {
        const c = this.center();
        this.game.fx.sparks.spawn({ x: c.x + (Math.random() - 0.5) * 0.5, y: c.y + (Math.random() - 0.3) * 1.2, z: c.z + (Math.random() - 0.5) * 0.5, vy: 1.5, life: 0.5, size: 0.06, size1: 0, r: 3, g: 1.2, b: 0.2, a: 1 });
      }
    }
  }

  // Периодический урон без стаггера и вспышек; числа урона копятся и показываются пачкой.
  dot(amount) {
    if (!this.alive) return;
    this.dotAcc += amount;
    if (this.takeDamage(amount, { dot: true })) this.game.onEnemyKilled(this, { headshot: false });
    else if (this.dotAcc > 20) { this.game.hud.damageNumber(this.center(), this.dotAcc, false, true); this.dotAcc = 0; }
  }

  setState(s) { this.state = s; this.stateT = 0; }

  mat(base) {
    const m = enemyMaterial(base);
    this.materials.push(m);
    return m;
  }

  setDissolve(v, edge) {
    this.dissolve = v;
    for (const m of this.materials) {
      m.userData.dissolve.value = v;
      if (edge) m.userData.edge.value.copy(edge);
    }
  }

  updateFlash(dt) {
    this.flash = Math.max(0, this.flash - dt * 7);
    for (const m of this.materials) m.userData.flash.value = this.flash;
    // Аура элиты и боссов: искры цвета аффикса поднимаются от тела.
    if ((this.elite || this.boss) && this.alive && Math.random() < (this.boss ? 0.8 : 0.45)) {
      const rim = this.materials[0]?.userData.rim.value;
      const c = this.center();
      const s = this.sizeScale || 1;
      this.game.fx.sparks.spawn({
        x: c.x + (Math.random() - 0.5) * 0.7 * s, y: c.y + (Math.random() - 0.6) * 1.4 * s, z: c.z + (Math.random() - 0.5) * 0.7 * s,
        vy: 0.8 + Math.random(), life: 0.9, size: 0.05 * s, size1: 0,
        r: (rim?.x ?? 0.5) * 5, g: (rim?.y ?? 0.1) * 5, b: (rim?.z ?? 0.1) * 5, a: 1, drag: 0.5,
      });
    }
  }

  // Пересечение луча со сферами попадания. Возвращает {t, part, point} или null.
  raycast(origin, dir, far) {
    let best = null;
    for (const s of this.hitSpheres) {
      _c.copy(s.local);
      s.node.localToWorld(_c);
      _oc.copy(origin).sub(_c);
      const b = _oc.dot(dir);
      const r = s.r * this.sizeScale;
      const c = _oc.lengthSq() - r * r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      let t = -b - sq;
      if (t < 0) t = -b + sq;
      if (t < 0 || t > far) continue;
      if (!best || t < best.t) best = { t, part: s.part, center: _c.clone() };
    }
    if (best) best.point = origin.clone().addScaledVector(dir, best.t);
    return best;
  }

  center(out = new V3()) { return out.set(this.pos.x, this.pos.y + 1.1 * this.sizeScale, this.pos.z); }

  setRim(r, g, b) { for (const m of this.materials) m.userData.rim.value.set(r, g, b); }

  dispose() {
    this.game.scene.remove(this.root);
    for (const m of this.materials) m.dispose();
  }
}

// Наземный враг с общей логикой передвижения: разгон, отталкивание, коллизии, поворот.
export class GroundEnemy extends Enemy {
  constructor(game) {
    super(game);
    this.speedNow = 0;
    this.knock = new V3();
    this.walkPhase = Math.random() * 10;
    this.dying = 0;
  }

  toPlayer() {
    const p = this.game.player.pos;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1e-4;
    return { dx: dx / d, dz: dz / d, dist: d, yaw: Math.atan2(dx, dz) };
  }

  // Разгон к желаемой скорости вдоль dir (единичный вектор в XZ).
  locomote(dt, dirX, dirZ, want, accel = 6) {
    this.speedNow += (want - this.speedNow) * (1 - Math.exp(-accel * dt));
    this.vel.x = dirX * this.speedNow + this.knock.x;
    this.vel.z = dirZ * this.speedNow + this.knock.z;
    this.knock.multiplyScalar(Math.exp(-dt * 6));
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.walkPhase += dt * Math.abs(this.speedNow) * 2.4;
  }

  separate() {
    const game = this.game;
    for (const o of game.enemies.list) {
      if (o === this || !o.alive || o.flying) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, d = Math.hypot(dx, dz), m = this.radius + o.radius;
      if (d < m && d > 1e-4) { this.pos.x += (dx / d) * (m - d) * 0.5; this.pos.z += (dz / d) * (m - d) * 0.5; }
    }
    const p = game.player.pos, dx = this.pos.x - p.x, dz = this.pos.z - p.z, d = Math.hypot(dx, dz), m = this.radius + 0.4;
    if (d < m && d > 1e-4) { this.pos.x += (dx / d) * (m - d); this.pos.z += (dz / d) * (m - d); }
    return game.level.resolveCircle(this.pos, this.radius, 0.5);
  }

  turnTo(yaw, rate, dt) {
    let d = (yaw - this.facing) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * (1 - Math.exp(-rate * dt));
    this.root.rotation.y = this.facing;
  }

  // Общая смерть: заваливается и сгорает.
  updateDying(dt) {
    this.dying += dt;
    const t = Math.min(1, this.dying / 0.45);
    this.root.rotation.x = -t * t * 1.3;
    this.root.position.y = -t * 0.15;
    const d = Math.max(0, (this.dying - 0.35) / 1.0);
    this.setDissolve(0.02 + d);
    if (Math.random() < 0.6 && d > 0) this.game.fx.ash(this.center().setY(0.4), 0.2);
    if (d >= 1) this.dead = true;
  }

  takeDamage(amount, info = {}) {
    if (!this.alive) return false;
    if (this.armor) amount *= this.armor;
    this.hp -= amount;
    if (!info.dot) {
      this.flash = 1;
      if (info.dir) this.knock.addScaledVector(new V3(info.dir.x, 0, info.dir.z).normalize(), (info.knockback ?? 2) / (this.mass || 1));
    }
    if (this.hp <= 0) { this.die(info); return true; }
    if (!info.dot) this.onHurt?.(amount, info);
    return false;
  }

  die() {
    this.alive = false;
    this.dying = 0;
    this.setDissolve(0.02, new V3(6, 1.6, 0.3));
    this.game.fx.ash(this.center(), 1.2);
    this.onDeath?.();
  }
}
