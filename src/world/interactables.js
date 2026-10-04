// Интерактивные объекты зоны: алтарь наград, источник, сундук с золотом, торговец, проклятый алтарь, врата.
import * as THREE from 'three';
import { glowTex } from '../core/textures.js';
import { withFog, withFogTree } from '../core/fog.js';
import { archRingShape, archShape, extrudeGeo, boxGeo, cylGeo } from './geo.js';
import { rand, randRange } from '../core/util.js';

const V3 = THREE.Vector3;

// Текстура с глифом/надписью для парящих символов над объектами.
export function textSprite(text, { size = 128, font = 'Cormorant SC', color = '#fff', glow = '#f00', scale = 1, weight = 700 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${weight} ${size}px "${font}", "Segoe UI Symbol", serif`;
  const w = Math.ceil(ctx.measureText(text).width + size * 0.6);
  c.width = w; c.height = Math.ceil(size * 1.5);
  ctx.font = `${weight} ${size}px "${font}", "Segoe UI Symbol", serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = glow; ctx.shadowBlur = size * 0.25;
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, c.height / 2);
  ctx.fillText(text, w / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false });
  const s = new THREE.Sprite(m);
  s.scale.set((w / c.height) * scale, scale, 1);
  s.renderOrder = 9;
  return s;
}

const STONE = () => withFog(new THREE.MeshStandardMaterial({ color: 0x6a6268, roughness: 0.85 }));

class Interactable {
  constructor(game, pos, { radius = 2, prompt = 'E — взаимодействовать' } = {}) {
    this.game = game;
    this.pos = pos.clone();
    this.radius = radius;
    this.prompt = prompt;
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    this.active = true;
    this.t = rand() * 10;
    game.scene.add(this.group);
  }
  near(p) { return this.active && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < this.radius; }
  update(dt) { this.t += dt; }
  interact() {}
  dispose() { this.game.scene.remove(this.group); if (this.light) this.game.scene.remove(this.light); }
  addLight(color, intensity = 8, distance = 8, y = 1.6) {
    this.light = new THREE.PointLight(color, intensity, distance, 2);
    this.light.position.copy(this.pos).add(new V3(0, y, 0));
    this.game.scene.add(this.light);
    this.baseIntensity = intensity;
  }
}

// Алтарь с парящим символом: открывает выбор реликвии/улучшения.
export class RewardAltar extends Interactable {
  constructor(game, pos, { glyph = '✠', color = '#e0303c', prompt = 'E — принять дар', onUse }) {
    super(game, pos, { prompt });
    this.onUse = onUse;
    const stone = STONE();
    const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = m.receiveShadow = true; this.group.add(m); return m; };
    add(cylGeo(0.75, 0.85, 0.3, 8), stone, 0.15);
    add(cylGeo(0.4, 0.55, 0.8, 8), stone, 0.7);
    add(cylGeo(0.62, 0.45, 0.18, 8), stone, 1.18);
    const col = new THREE.Color(color);
    this.glyph = textSprite(glyph, { color: '#fff', glow: color, scale: 0.75, font: 'Segoe UI Symbol' });
    this.glyph.position.y = 2.0;
    this.group.add(this.glyph);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: col.clone().multiplyScalar(1.4), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.scale.setScalar(1.8);
    halo.position.y = 2.0;
    this.halo = halo;
    this.group.add(halo);
    this.addLight(col, 10, 9, 2);
    this.color = col;
    withFogTree(this.group);
  }
  update(dt) {
    super.update(dt);
    if (!this.active) return;
    this.glyph.position.y = 2.0 + Math.sin(this.t * 1.8) * 0.12;
    this.halo.position.y = this.glyph.position.y;
    this.halo.material.opacity = 0.7 + Math.sin(this.t * 3) * 0.2;
    if (rand() < 0.4) {
      this.game.fx.sparks.spawn({
        x: this.pos.x + randRange(-0.5, 0.5), y: 1.3, z: this.pos.z + randRange(-0.5, 0.5),
        vy: randRange(0.4, 1.2), life: 1.4, size: 0.04, size1: 0, r: this.color.r * 3, g: this.color.g * 3, b: this.color.b * 3, a: 1, gravity: -0.3,
      });
    }
  }
  interact() { this.onUse?.(this); }
  consume() {
    this.active = false;
    this.glyph.visible = this.halo.visible = false;
    if (this.light) this.light.intensity = 0;
    this.game.fx.ash(this.pos.clone().add(new V3(0, 2, 0)), 1);
  }
}

// Святой источник: лечит.
export class HealingFont extends RewardAltar {
  constructor(game, pos, onUse) {
    super(game, pos, { glyph: '♡', color: '#7ac8ff', prompt: 'E — испить из источника', onUse });
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.4, 2.2) }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 1.28;
    this.water = water;
    this.group.add(water);
  }
  consume() { super.consume(); this.water.material.color.setRGB(0.05, 0.08, 0.1); }
}

// Монеты: разлетаются и притягиваются к охотнику.
export class CoinShower {
  constructor(game) {
    this.game = game;
    const geo = new THREE.CylinderGeometry(0.06, 0.06, 0.012, 12);
    this.mesh = new THREE.InstancedMesh(geo, withFog(new THREE.MeshStandardMaterial({ color: 0xe0b040, metalness: 1, roughness: 0.25, emissive: 0x3a2000 })), 200);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    game.scene.add(this.mesh);
    this.coins = [];
    this.vials = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
  }
  burst(pos, n, value = 1) {
    for (let i = 0; i < n; i++) {
      if (this.coins.length >= 200) break;
      const a = rand() * Math.PI * 2, s = randRange(1.5, 4);
      this.coins.push({ p: pos.clone(), v: new V3(Math.cos(a) * s, randRange(3, 6), Math.sin(a) * s), r: rand() * 6, w: randRange(5, 15), t: 0, value });
    }
  }
  vial(pos, heal = 15) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.15, 0.2) }));
    m.position.copy(pos).setY(0.4);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(1.5, 0.1, 0.15), blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(0.8);
    m.add(glow);
    this.game.scene.add(m);
    this.vials.push({ mesh: m, heal, t: 0, base: pos.clone() });
  }
  update(dt) {
    const game = this.game, p = game.player.pos;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.t += dt;
      const dx = p.x - c.p.x, dz = p.z - c.p.z, d = Math.hypot(dx, dz);
      if (c.t > 0.6 && d < 3.5 && game.player.alive) {
        // Притяжение к охотнику.
        c.v.x += (dx / d) * 40 * dt; c.v.z += (dz / d) * 40 * dt; c.v.y += ((1.0 - c.p.y) * 20) * dt;
        c.v.multiplyScalar(Math.exp(-dt * 3));
        if (d < 0.6) {
          game.run.gold += Math.round(c.value * game.run.stats.goldMul);
          game.audio.coin();
          this.coins.splice(i, 1);
          continue;
        }
      } else {
        c.v.y -= 15 * dt;
      }
      c.p.addScaledVector(c.v, dt);
      if (c.p.y < 0.01) { c.p.y = 0.01; c.v.y *= -0.3; c.v.x *= 0.7; c.v.z *= 0.7; c.w *= 0.7; }
      c.r += c.w * dt;
      if (c.t > 25) this.coins.splice(i, 1);
    }
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      this._q.setFromEuler(this._e.set(c.r, c.r * 0.7, 0));
      this._m.compose(c.p, this._q, new V3(1, 1, 1));
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.count = this.coins.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    for (let i = this.vials.length - 1; i >= 0; i--) {
      const v = this.vials[i];
      v.t += dt;
      v.mesh.position.y = 0.4 + Math.sin(v.t * 3) * 0.08;
      const d = Math.hypot(p.x - v.base.x, p.z - v.base.z);
      if (d < 1.1 && game.player.alive && game.player.health < game.player.maxHealth) {
        game.player.heal(v.heal);
        game.audio.pickup();
        game.scene.remove(v.mesh);
        this.vials.splice(i, 1);
      } else if (v.t > 30) { game.scene.remove(v.mesh); this.vials.splice(i, 1); }
    }
  }
  clear() {
    this.coins = [];
    for (const v of this.vials) this.game.scene.remove(v.mesh);
    this.vials = [];
    this.mesh.count = 0;
  }
}

// Врата в следующую зону: каменная арка с багровым вихрем и знаком награды.
const PORTAL_FRAG = /* glsl */`
  uniform float uTime; uniform vec3 uColor; uniform float uOpen;
  varying vec2 vUv;
  float h( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
  float n( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( h( i ), h( i + vec2( 1, 0 ) ), f.x ), mix( h( i + vec2( 0, 1 ) ), h( i + vec2( 1, 1 ) ), f.x ), f.y ); }
  void main() {
    vec2 p = vUv - vec2( 0.5, 0.4 );
    float r = length( p * vec2( 1.0, 0.7 ) );
    float a = atan( p.y, p.x );
    float sw = n( vec2( a * 3.0 + uTime * 0.8 - r * 9.0, r * 6.0 - uTime * 1.5 ) );
    float sw2 = n( vec2( a * 5.0 - uTime * 1.2 + r * 5.0, r * 12.0 ) );
    float core = smoothstep( 0.65, 0.0, r );
    vec3 col = uColor * ( 0.4 + 1.6 * sw * sw2 ) * core + vec3( 1.0, 0.9, 0.8 ) * pow( core, 6.0 ) * 1.5;
    gl_FragColor = vec4( col * uOpen, core * uOpen );
  }`;

export class Portal extends Interactable {
  constructor(game, pos, yaw, choice, def, onEnter) {
    super(game, pos, { radius: 1.6, prompt: '' });
    this.choice = choice;
    this.onEnter = onEnter;
    this.group.rotation.y = yaw;
    const stone = STONE();
    const W = 2.6, S = 2.6;
    const ring = new THREE.Mesh(extrudeGeo(archRingShape(W, 0.45, S, 0.85), 0.6), stone);
    ring.castShadow = true;
    this.group.add(ring);
    for (const sx of [-1, 1]) {
      const base = new THREE.Mesh(boxGeo(0.9, 0.4, 0.9), stone);
      base.position.set(sx * (W / 2 + 0.22), 0.2, 0);
      this.group.add(base);
    }
    const col = new THREE.Color(def.color);
    this.uniforms = { uTime: { value: 0 }, uColor: { value: col.clone().multiplyScalar(2.2) }, uOpen: { value: 0 } };
    const vortex = new THREE.Mesh(new THREE.ShapeGeometry(archShape(W - 0.05, S, 0.85)), new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = vec2(position.x / 2.6 + 0.5, position.y / 4.4); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: PORTAL_FRAG,
    }));
    this.group.add(vortex);
    this.sign = textSprite(def.glyph, { color: '#fff', glow: def.color, scale: 0.9, font: 'Segoe UI Symbol' });
    this.sign.position.y = 5.0;
    this.group.add(this.sign);
    const label = textSprite(def.name + (choice.modifier ? ` · ${choice.modifierName}` : ''), { size: 64, color: '#f0e2cc', glow: '#000', scale: 0.42 });
    label.position.y = 4.25;
    this.group.add(label);
    this.addLight(col, 0, 10, 2);
    this.open = 0;
    withFogTree(ring);
  }
  update(dt) {
    super.update(dt);
    this.open = Math.min(1, this.open + dt * 0.8);
    this.uniforms.uTime.value = this.t;
    this.uniforms.uOpen.value = this.open;
    this.light.intensity = 12 * this.open * (0.85 + 0.15 * Math.sin(this.t * 5));
    this.sign.position.y = 5.0 + Math.sin(this.t * 1.5) * 0.1;
    if (this.open > 0.5 && this.near(this.game.player.pos) && this.active) {
      this.active = false;
      this.onEnter?.(this.choice);
    }
    if (rand() < 0.5 * this.open) {
      const a = rand() * Math.PI;
      const local = new V3(Math.cos(a) * 1.2, 0.3 + Math.sin(a) * 2.6, 0).applyAxisAngle(new V3(0, 1, 0), this.group.rotation.y);
      this.game.fx.sparks.spawn({
        x: this.pos.x + local.x, y: local.y, z: this.pos.z + local.z, vy: randRange(0.2, 0.8),
        life: 1.2, size: 0.05, size1: 0, r: this.uniforms.uColor.value.r * 1.5, g: this.uniforms.uColor.value.g * 1.5, b: this.uniforms.uColor.value.b * 1.5, a: 1,
      });
    }
  }
}

// Гробовщик-торговец: фигура в капюшоне с фонарём и телегой.
export class Merchant extends Interactable {
  constructor(game, pos, onUse) {
    super(game, pos, { radius: 2.4, prompt: 'E — торговать с гробовщиком' });
    this.onUse = onUse;
    const cloth = withFog(new THREE.MeshStandardMaterial({ color: 0x1a1418, roughness: 0.9 }));
    const wood = withFog(new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9 }));
    const skin = withFog(new THREE.MeshStandardMaterial({ color: 0x8a7a70, roughness: 0.7 }));
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 12), cloth);
    robe.position.y = 0.8;
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), cloth);
    hood.position.set(0, 1.62, 0.02);
    hood.scale.set(1, 1.15, 1.1);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skin);
    face.position.set(0, 1.58, 0.13);
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 1.8, 0.6) }));
    eyes.position.set(0, 1.6, 0.24);
    // Телега с гробами.
    const cart = new THREE.Mesh(boxGeo(1.4, 0.15, 2.2), wood);
    cart.position.set(-1.4, 0.7, 0);
    const coffin = new THREE.Mesh(boxGeo(0.6, 0.35, 1.8), wood);
    coffin.position.set(-1.4, 0.95, 0);
    coffin.rotation.y = 0.05;
    for (const z of [-0.8, 0.8]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 16), wood);
      wheel.position.set(-0.65, 0.42, z);
      wheel.rotation.y = Math.PI / 2;
      this.group.add(wheel);
    }
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.16), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.6) }));
    lantern.position.set(0.4, 1.15, 0.25);
    for (const m of [robe, hood, face, eyes, cart, coffin, lantern]) { m.castShadow = true; this.group.add(m); }
    this.addLight(0xffa050, 9, 9, 1.3);
    this.group.rotation.y = Math.atan2(game.level.playerStart.x - pos.x, game.level.playerStart.z - pos.z);
    withFogTree(this.group);
  }
  update(dt) {
    super.update(dt);
    this.light.intensity = this.baseIntensity * (0.85 + 0.15 * Math.sin(this.t * 9) * Math.sin(this.t * 3.1));
  }
  interact() { this.onUse?.(this); }
}

// Проклятый алтарь: чаша крови.
export class BloodAltar extends RewardAltar {
  constructor(game, pos, onUse) {
    super(game, pos, { glyph: '☠', color: '#ff2030', prompt: 'E — испить из чаши', onUse });
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.08, 0.3, 12, 1, true), withFog(new THREE.MeshStandardMaterial({ color: 0x8a7040, metalness: 1, roughness: 0.3, side: THREE.DoubleSide })));
    cup.position.y = 1.42;
    this.group.add(cup);
    const blood = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.02, 0.04) }));
    blood.rotation.x = -Math.PI / 2;
    blood.position.y = 1.55;
    this.group.add(blood);
  }
}
