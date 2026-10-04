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
  }

  // Пересечение луча со сферами попадания. Возвращает {t, part, point} или null.
  raycast(origin, dir, far) {
    let best = null;
    for (const s of this.hitSpheres) {
      _c.copy(s.local);
      s.node.localToWorld(_c);
      _oc.copy(origin).sub(_c);
      const b = _oc.dot(dir);
      const c = _oc.lengthSq() - s.r * s.r;
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

  center(out = new V3()) { return out.set(this.pos.x, this.pos.y + 1.1, this.pos.z); }

  dispose() {
    this.game.scene.remove(this.root);
    for (const m of this.materials) m.dispose();
  }
}
