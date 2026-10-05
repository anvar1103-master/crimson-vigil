// Погода: дождь (струи считаются на GPU вокруг камеры), брызги, молнии с громом.
import * as THREE from 'three';
import { rand, randRange } from './util.js';

const RAIN_VERT = /* glsl */`
  attribute vec3 aOffset;
  attribute float aEnd;
  uniform float uTime;
  uniform vec3 uCam;
  uniform vec3 uWind;
  uniform float uBox;
  uniform float uLen;
  varying float vAlpha;
  void main() {
    float speed = 15.0 + aOffset.y * 0.12;
    vec3 fall = vec3( uWind.x, -speed, uWind.z ) * uTime;
    vec3 p = aOffset + fall;
    // Заворачиваем в куб вокруг камеры.
    p = mod( p - uCam + uBox * 0.5, uBox ) - uBox * 0.5 + uCam;
    vec3 dir = normalize( vec3( uWind.x, -speed, uWind.z ) );
    p -= dir * uLen * aEnd;
    vec4 mv = modelViewMatrix * vec4( p, 1.0 );
    gl_Position = projectionMatrix * mv;
    float d = length( p - uCam );
    vAlpha = ( 1.0 - aEnd * 0.85 ) * smoothstep( uBox * 0.5, uBox * 0.2, d ) * smoothstep( 0.3, 1.5, d );
  }`;

const RAIN_FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() { gl_FragColor = vec4( uColor, vAlpha * uOpacity ); }`;

export class Weather {
  constructor(game) {
    this.game = game;
    this.rain = 0;
    this.lightning = false;
    this.nextStrike = randRange(6, 12);
    this.strikeT = 99;
    this.flashSeq = [];

    const N = 5000;
    const box = 28;
    const pos = new Float32Array(N * 2 * 3);
    const off = new Float32Array(N * 2 * 3);
    const end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * box, y = (Math.random() - 0.5) * box, z = (Math.random() - 0.5) * box;
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k;
        off[j * 3] = x; off[j * 3 + 1] = y; off[j * 3 + 2] = z;
        end[j] = k;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aOffset', new THREE.BufferAttribute(off, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.uniforms = {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector3(1.6, 0, 0.8) },
      uBox: { value: box }, uLen: { value: 0.55 }, uColor: { value: new THREE.Color(0.75, 0.68, 0.72) }, uOpacity: { value: 0.35 },
    };
    this.lines = new THREE.LineSegments(g, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
    this.lines.visible = false;
    game.scene.add(this.lines);

    // Молния: отдельный направленный свет, обычно выключен (интенсивность 0 — без перекомпиляции).
    this.bolt = new THREE.DirectionalLight(0xc8c0ff, 0);
    this.bolt.position.set(-30, 60, -20);
    game.scene.add(this.bolt);
  }

  set({ rain = 0, lightning = false } = {}) {
    this.rain = rain;
    this.lightning = lightning;
    this.lines.visible = rain > 0;
    this.uniforms.uOpacity.value = 0.18 + rain * 0.25;
    this.game.audio.setRain(rain);
  }

  strike() {
    // Двойная-тройная вспышка, гром с задержкой «по расстоянию».
    const t = this.game.time;
    this.flashSeq = [[t, 1], [t + 0.08, 0.3], [t + 0.16, 0.9]];
    if (rand() < 0.5) this.flashSeq.push([t + 0.35, 0.6]);
    // Гроза-модификатор: молния бьёт в случайную тварь.
    const targets = this.stormStrikes ? this.game.enemies.list.filter((e) => e.alive && e.state !== 'rise') : [];
    if (targets.length) {
      const e = targets[Math.floor(rand() * targets.length)];
      this.boltTo(e.center());
      if (e.takeDamage(90, { dir: new THREE.Vector3(0, -1, 0), knockback: 0 })) this.game.onEnemyKilled(e, { headshot: false });
      this.game.audio.thunder(0.05);
    } else this.game.audio.thunder(randRange(0.4, 1.8));
  }

  // Видимый разряд с неба в точку.
  boltTo(p) {
    const fx = this.game.fx;
    let x = p.x + randRange(-3, 3), z = p.z + randRange(-3, 3);
    for (let y = 40; y > p.y; y -= 0.5) {
      const k = (y - p.y) / 40;
      x += (p.x - x) * 0.08 + randRange(-0.35, 0.35) * k;
      z += (p.z - z) * 0.08 + randRange(-0.35, 0.35) * k;
      fx.sparks.spawn({ x, y, z, life: 0.35, size: 0.35, size1: 0.1, r: 3, g: 3, b: 4, a: 1 });
    }
    fx.flash(p, { color: 0xc8c0ff, intensity: 80, dur: 0.4, distance: 25 });
    fx.ash(p, 2);
  }

  update(dt) {
    const game = this.game, cam = game.camera;
    // Время для струй держим в малом диапазоне: на больших значениях дождь пропадал (точность на GPU).
    this.uniforms.uTime.value = game.time % 3;
    this.uniforms.uCam.value.copy(cam.position);
    if (this.rain > 0) {
      // Брызги на земле вокруг охотника.
      const n = Math.floor(this.rain * 7 + rand());
      for (let i = 0; i < n; i++) {
        // Брызги не ближе 2 м, иначе у самой камеры они выглядят как светящиеся шары.
        const a = rand() * Math.PI * 2, r = 2 + rand() * 9;
        game.fx.sparks.spawn({
          x: cam.position.x + Math.cos(a) * r, y: 0.03, z: cam.position.z + Math.sin(a) * r,
          vx: randRange(-0.3, 0.3), vy: randRange(0.6, 1.4), vz: randRange(-0.3, 0.3),
          life: 0.15, size: 0.016, size1: 0.0, r: 0.28, g: 0.27, b: 0.32, a: 0.5, gravity: 9,
        });
      }
    }
    if (this.lightning) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) { this.strike(); this.nextStrike = this.stormStrikes ? randRange(4, 7) : randRange(9, 22); }
    }
    let flash = 0;
    for (const [t0, k] of this.flashSeq) {
      const d = game.time - t0;
      if (d >= 0 && d < 0.25) flash = Math.max(flash, k * (1 - d / 0.25));
    }
    if (this.flashSeq.length && game.time - this.flashSeq[this.flashSeq.length - 1][0] > 0.3) this.flashSeq = [];
    game.sky.userData.uniforms.uFlash.value = flash * 0.9;
    this.bolt.intensity = flash * 3.5;
    game.post.grade.uFlash.value = flash * 0.06;
  }
}
