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
    this.banks = [];
    this.crows = [];
    this.eyes = [];
    if (cfg.bats) this.makeBats(cfg.bats);
    if (cfg.eyes) this.makeEyes(cfg.eyes, cfg.eyesRadius || [22, 30]);
    if (game.level.perches?.length) this.makeCrows(game.level.perches);
    if (cfg.fogBanks) this.makeFogBanks(cfg.fogBanks, cfg.fogBankRadius || [12, 30]);
  }

  // Полосы тумана: мягкие «занавесы» с шумом, всегда повёрнуты к камере, тают вблизи.
  makeFogBanks(n, [r0, r1]) {
    const mist = this.game.level.atmosphere.mistColor;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(mist[0] * 2.4, mist[1] * 2.4, mist[2] * 2.4) }, uCam: { value: new THREE.Vector3() } },
      vertexShader: /* glsl */`
        varying vec2 vUv; varying vec3 vW;
        void main() { vUv = uv; vec4 w = modelMatrix * vec4( position, 1.0 ); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uColor; uniform vec3 uCam;
        varying vec2 vUv; varying vec3 vW;
        float h( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
        float n( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( h( i ), h( i + vec2( 1, 0 ) ), f.x ), mix( h( i + vec2( 0, 1 ) ), h( i + vec2( 1, 1 ) ), f.x ), f.y ); }
        void main() {
          vec2 p = vUv * vec2( 3.0, 1.2 ) + vec2( uTime * 0.03 + vW.x * 0.05, uTime * 0.01 );
          float d = n( p ) * 0.55 + n( p * 2.3 + 3.1 ) * 0.3 + n( p * 5.1 - uTime * 0.05 ) * 0.15;
          float edge = smoothstep( 0.0, 0.35, vUv.y ) * smoothstep( 1.0, 0.45, vUv.y ) * smoothstep( 0.0, 0.25, vUv.x ) * smoothstep( 1.0, 0.75, vUv.x );
          float near = smoothstep( 4.0, 11.0, distance( vW.xz, uCam.xz ) );
          float a = smoothstep( 0.35, 0.8, d ) * edge * near * 0.55;
          gl_FragColor = vec4( uColor, a );
        }`,
    });
    this.bankMat = mat;
    const geo = new THREE.PlaneGeometry(16, 5).translate(0, 2.2, 0);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      const a = (i / n) * Math.PI * 2 + rand() * 0.6, r = randRange(r0, r1);
      m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      m.scale.set(randRange(0.8, 1.4), randRange(0.7, 1.2), 1);
      m.renderOrder = 4;
      this.group.add(m);
      this.banks.push(m);
    }
  }

  // Глаза в темноте: пары светящихся точек за краем арены. Моргают и гаснут, если на них долго смотреть.
  makeEyes(n, [r0, r1]) {
    const geo = new THREE.SphereGeometry(0.035, 6, 4);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(rand() < 0.7 ? 0xff2010 : 0xffb020).multiplyScalar(4), fog: false, transparent: true });
      const g = new THREE.Group();
      const a = rand() * Math.PI * 2, r = randRange(r0, r1);
      g.position.set(Math.cos(a) * r, randRange(0.5, 1.6), Math.sin(a) * r);
      for (const sx of [-1, 1]) { const e = new THREE.Mesh(geo, mat); e.position.x = sx * 0.07; g.add(e); }
      this.group.add(g);
      this.eyes.push({ g, mat, a, r, next: randRange(1, 4), open: rand() < 0.6 ? 1 : 0, stare: 0 });
    }
  }

  updateEyes(dt) {
    const cam = this.game.camera, fwd = cam.getWorldDirection(this._v ||= new THREE.Vector3());
    for (const e of this.eyes) {
      e.g.lookAt(cam.position);
      const to = e.g.position.clone().sub(cam.position).normalize();
      // Если игрок смотрит прямо на глаза — они исчезают и появляются в другом месте.
      e.stare = fwd.dot(to) > 0.985 ? e.stare + dt : Math.max(0, e.stare - dt);
      e.next -= dt;
      if (e.stare > 0.8 && e.open > 0.5) { e.open = 0; e.next = randRange(3, 6); }
      if (e.next <= 0) {
        if (e.open < 0.5) {
          e.a = rand() * Math.PI * 2;
          e.g.position.set(Math.cos(e.a) * e.r, randRange(0.5, 1.6), Math.sin(e.a) * e.r);
          e.open = 1;
          e.next = randRange(4, 9);
        } else { e.blink = 0.15; e.next = randRange(2, 6); }
      }
      if (e.blink > 0) e.blink -= dt;
      const vis = e.open * (e.blink > 0 ? 0 : 1);
      e.mat.opacity += (vis - e.mat.opacity) * Math.min(1, dt * 6);
      e.g.visible = e.mat.opacity > 0.02;
    }
  }

  // Вороны сидят на оградах и надгробиях, вертят головой и взлетают, если подойти или выстрелить.
  makeCrows(perches) {
    const mat = withFog(new THREE.MeshStandardMaterial({ color: 0x0c0a0e, roughness: 0.4, metalness: 0.2 }));
    const beakMat = withFog(new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.6 }));
    const body = new THREE.SphereGeometry(0.11, 10, 8); body.scale(1, 0.85, 1.6);
    const head = new THREE.SphereGeometry(0.065, 8, 6);
    const beak = new THREE.ConeGeometry(0.022, 0.09, 5).rotateX(Math.PI / 2);
    const tail = new THREE.BoxGeometry(0.1, 0.015, 0.16);
    const wingG = new THREE.BoxGeometry(0.32, 0.012, 0.14).translate(0.16, 0, 0);
    for (const p of perches) {
      const g = new THREE.Group();
      g.position.copy(p);
      const b = new THREE.Mesh(body, mat); b.position.y = 0.1; g.add(b);
      const h = new THREE.Group(); h.position.set(0, 0.2, 0.12); g.add(h);
      h.add(new THREE.Mesh(head, mat));
      const bk = new THREE.Mesh(beak, beakMat); bk.position.z = 0.08; h.add(bk);
      const t = new THREE.Mesh(tail, mat); t.position.set(0, 0.08, -0.2); t.rotation.x = 0.3; g.add(t);
      const wl = new THREE.Mesh(wingG, mat), wr = new THREE.Mesh(wingG, mat);
      wl.position.set(0.05, 0.13, 0); wr.position.set(-0.05, 0.13, 0); wr.scale.x = -1;
      wl.visible = wr.visible = false;
      g.add(wl, wr);
      g.rotation.y = rand() * Math.PI * 2;
      this.group.add(g);
      this.crows.push({ g, h, wl, wr, state: 'perch', t: rand() * 5, vel: new THREE.Vector3(), ph: rand() * 10 });
    }
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
    if (this.banks.length) {
      this.bankMat.uniforms.uTime.value = t;
      this.bankMat.uniforms.uCam.value.copy(cam);
      for (const b of this.banks) b.rotation.y = Math.atan2(cam.x - b.position.x, cam.z - b.position.z);
    }
    if (this.eyes.length) this.updateEyes(dt);
    // Дым из труб.
    if (game.level.chimneys && rand() < 0.35) {
      const p = game.level.chimneys[Math.floor(rand() * game.level.chimneys.length)];
      fx.smoke.spawn({ x: p.x, y: p.y, z: p.z, vx: randRange(0.3, 0.7), vy: randRange(0.6, 1.0), vz: randRange(-0.1, 0.2), life: randRange(3, 5), size: 0.4, size1: 2.2, r: 0.12, g: 0.11, b: 0.11, a: 0.25, drag: 0.3, spin: randRange(-0.3, 0.3) });
    }
    // Вороны.
    const shotRecently = game.time - (game.lastShotTime ?? -99) < 0.2;
    for (const c2 of this.crows) {
      c2.t += dt;
      if (c2.state === 'perch') {
        // Резкие повороты головы, как у настоящей птицы.
        if (c2.t > 1.2 + (c2.ph % 1.5)) { c2.t = 0; c2.h.rotation.y = randRange(-1, 1); c2.h.rotation.x = randRange(-0.3, 0.4); }
        const d = c2.g.position.distanceTo(cam);
        if (d < 6 || (shotRecently && d < 25)) {
          c2.state = 'fly'; c2.t = 0;
          c2.vel.set(randRange(-2, 2), randRange(3, 4.5), randRange(-2, 2)).add(c2.g.position.clone().sub(cam).setY(0).normalize().multiplyScalar(3));
          c2.wl.visible = c2.wr.visible = true;
          game.audio.burst?.({ type: 'bandpass', freq: 1100, freq1: 700, q: 4, gain: 0.15, attack: 0.02, decay: 0.2, pos: c2.g.position, reverb: 0.5 });
          game.audio.burst?.({ type: 'lowpass', freq: 600, gain: 0.2, attack: 0.01, decay: 0.15, pos: c2.g.position });
        }
      } else if (c2.state === 'fly') {
        c2.vel.y += dt * 0.5;
        c2.g.position.addScaledVector(c2.vel, dt);
        c2.g.rotation.y = Math.atan2(c2.vel.x, c2.vel.z);
        const f = Math.sin(c2.t * 22) * 0.9;
        c2.wl.rotation.z = f; c2.wr.rotation.z = -f;
        if (c2.t > 8) { c2.state = 'gone'; c2.g.visible = false; }
      }
    }
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
