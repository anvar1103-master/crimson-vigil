// Пул частиц на THREE.Points: искры, дым, пепел, кровь, угли.
// Каждая система — один draw call. Частицы симулируются на CPU.
import * as THREE from 'three';
import { fogUniforms } from './fog.js';

const VERT = /* glsl */`
  attribute vec4 aColor;
  attribute float aSize;
  attribute float aRot;
  uniform float uScale;
  varying vec4 vColor;
  varying float vRot;
  #include <fog_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    gl_PointSize = aSize * uScale / max( -mvPosition.z, 0.05 );
    gl_Position = projectionMatrix * mvPosition;
    vColor = aColor;
    vRot = aRot;
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */`
  uniform sampler2D map;
  varying vec4 vColor;
  varying float vRot;
  #include <fog_pars_fragment>
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float s = sin( vRot ), co = cos( vRot );
    vec2 uv = vec2( co * c.x - s * c.y, s * c.x + co * c.y ) + 0.5;
    vec4 t = texture2D( map, uv );
    gl_FragColor = vec4( vColor.rgb * t.rgb, vColor.a * t.a );
    if ( gl_FragColor.a < 0.003 ) discard;
    #ifdef ADDITIVE
      #if defined( USE_FOG ) && defined( FOG_EXP2 )
        gl_FragColor.a *= exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
      #endif
    #else
      #include <fog_fragment>
    #endif
  }`;

export class ParticleSystem {
  constructor(scene, { max = 2000, additive = false, texture, renderOrder = 5 }) {
    this.max = max;
    this.count = 0;
    this.additive = additive;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.rot = new Float32Array(max);
    // Параметры жизни: life, maxLife, size0, size1, alpha0, gravity, drag, spin
    this.p = new Float32Array(max * 8);

    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize);
    g.setAttribute('aRot', this.aRot);
    g.setDrawRange(0, 0);

    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: texture }, uScale: { value: 500 } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      defines: additive ? { ADDITIVE: '' } : {},
    });
    // Общие uniform-ы высотного тумана (объекты, а не копии).
    Object.assign(this.material.uniforms, fogUniforms);
    this.material.uniforms.map.value = texture;

    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    scene.add(this.points);
  }

  setScale(viewportHeight, fovDeg) {
    this.material.uniforms.uScale.value = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  // o: {x,y,z, vx,vy,vz, life, size, size1, r,g,b, a, gravity, drag, spin, rot}
  spawn(o) {
    if (this.count >= this.max) return;
    const i = this.count++;
    const i3 = i * 3, i4 = i * 4, i8 = i * 8;
    this.pos[i3] = o.x; this.pos[i3 + 1] = o.y; this.pos[i3 + 2] = o.z;
    this.vel[i3] = o.vx || 0; this.vel[i3 + 1] = o.vy || 0; this.vel[i3 + 2] = o.vz || 0;
    this.col[i4] = o.r ?? 1; this.col[i4 + 1] = o.g ?? 1; this.col[i4 + 2] = o.b ?? 1; this.col[i4 + 3] = o.a ?? 1;
    this.rot[i] = o.rot ?? Math.random() * 6.28;
    const p = this.p;
    p[i8] = 0; p[i8 + 1] = o.life || 1;
    p[i8 + 2] = o.size || 0.1; p[i8 + 3] = o.size1 ?? o.size ?? 0.1;
    p[i8 + 4] = o.a ?? 1; p[i8 + 5] = o.gravity || 0; p[i8 + 6] = o.drag || 0; p[i8 + 7] = o.spin || 0;
    this.size[i] = p[i8 + 2];
  }

  update(dt) {
    const p = this.p;
    let i = 0;
    while (i < this.count) {
      const i3 = i * 3, i4 = i * 4, i8 = i * 8;
      p[i8] += dt;
      const t = p[i8] / p[i8 + 1];
      if (t >= 1) { this.kill(i); continue; }
      const drag = Math.exp(-p[i8 + 6] * dt);
      this.vel[i3] *= drag; this.vel[i3 + 1] = this.vel[i3 + 1] * drag - p[i8 + 5] * dt; this.vel[i3 + 2] *= drag;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.size[i] = p[i8 + 2] + (p[i8 + 3] - p[i8 + 2]) * t;
      // Плавное появление и угасание.
      this.col[i4 + 3] = p[i8 + 4] * Math.min(1, t * 8) * (1 - t) * (1 - t * 0.3);
      this.rot[i] += p[i8 + 7] * dt;
      i++;
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aRot.needsUpdate = true;
    this.points.geometry.setDrawRange(0, this.count);
  }

  kill(i) {
    const last = --this.count;
    if (i === last) return;
    this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.col.copyWithin(i * 4, last * 4, last * 4 + 4);
    this.p.copyWithin(i * 8, last * 8, last * 8 + 8);
    this.size[i] = this.size[last];
    this.rot[i] = this.rot[last];
  }

  clear() { this.count = 0; this.points.geometry.setDrawRange(0, 0); }
}
