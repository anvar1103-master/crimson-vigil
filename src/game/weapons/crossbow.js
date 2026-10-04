// Арбалет «Покаяние»: тяжёлый осиновый кол с серебряным наконечником.
// Медленный, но пробивает насквозь, отбрасывает и застревает в стенах.
import * as THREE from 'three';
import { extrudeGeo } from '../../world/geo.js';
import { woodTex } from '../../core/textures.js';
import { Spring, damp, randRange } from '../../core/util.js';

const V3 = THREE.Vector3;
function profile(geo) { geo.rotateY(Math.PI / 2); return geo; }

const MATS = {};
function mats() {
  if (MATS.wood) return MATS;
  MATS.wood = new THREE.MeshStandardMaterial({ map: woodTex(8, false), roughness: 0.45, color: 0xd8b8a8 });
  MATS.wood.map.repeat.set(6, 6);
  MATS.steel = new THREE.MeshStandardMaterial({ color: 0x4a4b52, metalness: 1, roughness: 0.36 });
  MATS.dark = new THREE.MeshStandardMaterial({ color: 0x1c1c22, metalness: 0.9, roughness: 0.45 });
  MATS.silver = new THREE.MeshStandardMaterial({ color: 0xd8dae0, metalness: 1, roughness: 0.18 });
  MATS.string = new THREE.MeshStandardMaterial({ color: 0x8a7a60, roughness: 0.9 });
  MATS.shaft = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.7 });
  MATS.fletch = new THREE.MeshStandardMaterial({ color: 0x6a0a14, roughness: 0.8, side: THREE.DoubleSide });
  MATS.gold = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.25 });
  return MATS;
}

// Болт-кол: используется и в руках, и как снаряд.
export function buildBolt() {
  const M = mats();
  const g = new THREE.Group();
  const shaft = new THREE.CylinderGeometry(0.0055, 0.0055, 0.3, 8).rotateX(Math.PI / 2);
  g.add(new THREE.Mesh(shaft, M.shaft));
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.05, 4).rotateX(-Math.PI / 2), M.silver);
  head.position.z = -0.17;
  g.add(head);
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.06), M.fletch);
    f.position.set(0, 0, 0.12);
    f.rotation.set(Math.PI / 2, 0, (i / 3) * Math.PI * 2);
    f.translateX(0.011);
    g.add(f);
  }
  return g;
}

export function buildCrossbowModel() {
  const M = mats();
  const root = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = root) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  // Ложа (тиллер) с прикладом.
  const st = new THREE.Shape();
  st.moveTo(-0.24, -0.02); st.lineTo(0.37, 0.012); st.lineTo(0.38, 0.04); st.lineTo(-0.1, 0.046);
  st.quadraticCurveTo(-0.17, 0.05, -0.25, 0.035); st.lineTo(-0.28, -0.06); st.quadraticCurveTo(-0.22, -0.07, -0.16, -0.03); st.closePath();
  add(profile(extrudeGeo(st, 0.036, 0.004)), M.wood);
  // Пистолетная рукоять.
  const gr = new THREE.Shape();
  gr.moveTo(-0.02, 0.0); gr.quadraticCurveTo(-0.01, -0.05, -0.03, -0.1); gr.lineTo(-0.07, -0.1); gr.quadraticCurveTo(-0.06, -0.04, -0.075, 0.0); gr.closePath();
  add(profile(extrudeGeo(gr, 0.03, 0.005)), M.wood);
  // Желоб под болт и металлическая накладка.
  add(new THREE.BoxGeometry(0.02, 0.006, 0.44), M.dark, 0, 0.049, -0.14);
  add(new THREE.BoxGeometry(0.042, 0.03, 0.08), M.steel, 0, 0.03, -0.06);
  for (const sx of [-1, 1]) {
    // Серебряные кресты на ложе.
    add(new THREE.BoxGeometry(0.002, 0.018, 0.005), M.silver, sx * 0.0215, 0.022, 0.08);
    add(new THREE.BoxGeometry(0.002, 0.005, 0.014), M.silver, sx * 0.0215, 0.026, 0.08);
    add(new THREE.BoxGeometry(0.002, 0.012, 0.3), M.dark, sx * 0.0205, 0.03, -0.2);
  }
  // Спусковой рычаг.
  const trig = add(new THREE.BoxGeometry(0.006, 0.06, 0.012), M.steel, 0, -0.01, -0.0);
  trig.rotation.x = 0.4;
  // Дуги (плечи лука).
  const prod = new THREE.Group();
  prod.position.set(0, 0.038, -0.35);
  root.add(prod);
  const arm = new THREE.CatmullRomCurve3([
    new V3(-0.29, 0, 0.07), new V3(-0.22, 0, 0.0), new V3(-0.1, 0, -0.03), new V3(0, 0, -0.035),
    new V3(0.1, 0, -0.03), new V3(0.22, 0, 0.0), new V3(0.29, 0, 0.07),
  ]);
  add(new THREE.TubeGeometry(arm, 40, 0.009, 8), M.dark, 0, 0, 0, prod).scale.set(1, 1.6, 1);
  for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.012, 10, 8), M.silver, sx * 0.29, 0, 0.07, prod);
  add(new THREE.BoxGeometry(0.06, 0.05, 0.05), M.steel, 0, 0, -0.01, prod);
  // Стремя спереди.
  const stir = add(new THREE.TorusGeometry(0.045, 0.006, 6, 18, Math.PI), M.steel, 0, 0.01, -0.4);
  stir.rotation.set(0, 0, Math.PI);
  // Тетива: две половинки от концов плеч к «ореху».
  const strings = [-1, 1].map(() => add(new THREE.CylinderGeometry(0.0022, 0.0022, 1, 5), M.string));
  const tips = [new V3(-0.29, 0.038, -0.28), new V3(0.29, 0.038, -0.28)];
  // Болт на ложе.
  const bolt = buildBolt();
  bolt.position.set(0, 0.058, -0.2);
  root.add(bolt);
  for (const m of root.children) m.castShadow = false;
  return { root, prod, strings, tips, bolt, muzzle: new V3(0, 0.058, -0.42) };
}

const _a = new V3(), _b = new V3(), _mid = new V3(), _up = new V3(0, 1, 0), _q = new THREE.Quaternion();

export class Crossbow {
  constructor(game) {
    this.game = game;
    this.name = 'Покаяние';
    this.kind = 'crossbow';
    const m = buildCrossbowModel();
    Object.assign(this, m);
    this.model = new THREE.Group();
    this.model.add(this.root);
    this.hip = new V3(0.1, -0.125, -0.47);
    this.ads = new V3(0, -0.058 - 0.022, -0.3);
    this.model.position.copy(this.hip);
    this.capacity = 1;
    this.ammo = 1;
    this.damage = 105;
    this.headMul = 2;
    this.reloadTime = 0.9;
    this.state = 'idle';
    this.stateT = 0;
    this.drawn = 1;        // натяжение тетивы 0..1
    this.kickZ = new Spring(160, 14);
    this.kickRot = new Spring(140, 12);
    this.reloadBlend = 0;
    this.drumAngle = 0;
    this.updateString();
  }

  get reloading() { return this.state === 'reloading'; }

  reset() {
    this.ammo = 1;
    this.state = 'idle';
    this.drawn = 1;
    this.bolt.visible = true;
    this.bolt.position.y = 0.058;
    this.updateString();
  }

  updateString() {
    // «Орех» (точка натяжения) скользит между взведённым и спущенным положением.
    const nutZ = THREE.MathUtils.lerp(-0.29, -0.05, this.drawn);
    _mid.set(0, 0.052, nutZ);
    this.strings.forEach((s, i) => {
      _a.copy(this.tips[i]);
      _b.subVectors(_mid, _a);
      const len = _b.length();
      s.position.copy(_a).addScaledVector(_b, 0.5);
      s.scale.set(1, len, 1);
      _q.setFromUnitVectors(_up, _b.normalize());
      s.quaternion.copy(_q);
    });
  }

  tryFire() {
    if (this.state !== 'idle' || this.ammo <= 0) return;
    this.fire();
  }

  fire() {
    const game = this.game, stats = game.run.stats;
    this.ammo = 0;
    this.drawn = 0;
    this.bolt.visible = false;
    this.kickZ.impulse(5);
    this.kickRot.impulse(10);
    game.player.recoil(game.player.aiming ? 3 : 4.5, randRange(-0.5, 0.5));
    game.player.addTrauma(0.2);
    game.audio.crossbowShot();
    game.hud.crosshairKick(1.2);
    const cam = game.camera;
    const dir = cam.getWorldDirection(new V3());
    if (!game.player.aiming) {
      const s = 0.006;
      dir.x += randRange(-s, s); dir.y += randRange(-s, s); dir.z += randRange(-s, s);
      dir.normalize();
    }
    game.projectiles.fireBolt(cam.position.clone().addScaledVector(dir, 0.3), dir, {
      speed: 62, damage: this.damage * stats.damage, headMul: this.headMul * stats.headMul,
      pierce: 2 + stats.pierce, knockback: 7, source: 'crossbow',
    });
    this.state = 'reloading';
    this.stateT = 0;
  }

  startReload() {}

  update(dt, input) {
    const game = this.game, stats = game.run.stats;
    this.stateT += dt;
    if (input.firePressed) this.tryFire();
    const rt = this.reloadTime / stats.reloadSpeed;
    if (this.state === 'reloading') {
      const t = this.stateT / rt;
      // Фаза 1 — рычаг натягивает тетиву, фаза 2 — новый кол ложится в желоб.
      this.drawn = THREE.MathUtils.smoothstep(t, 0.15, 0.6);
      if (t > 0.6 && !this.bolt.visible) {
        this.bolt.visible = true;
        game.audio.crossbowReload();
      }
      this.bolt.position.y = 0.058 + Math.max(0, 0.75 - t) * 0.3;
      if (t >= 1) { this.state = 'idle'; this.ammo = 1; this.bolt.position.y = 0.058; }
    }
    this.updateString();
    this.kickZ.update(dt); this.kickRot.update(dt);
    this.reloadBlend = damp(this.reloadBlend, this.state === 'reloading' && this.stateT < rt * 0.8 ? 1 : 0, 10, dt);
    const aim = game.vm.aimBlend ?? 0;
    const pos = this.model.position.copy(this.hip).lerp(this.ads, aim);
    const rb = this.reloadBlend;
    pos.z += this.kickZ.x * 0.014;
    pos.y += -rb * 0.05;
    pos.x += rb * 0.02;
    this.model.rotation.set(this.kickRot.x * 0.018 - rb * 0.35 + (1 - aim) * 0.03, (1 - aim) * 0.05 + rb * 0.2, -rb * 0.25 + (1 - aim) * 0.12);
  }
}

// Летящие колья: шаг симуляции разбит на отрезки, на каждом — луч по миру и по врагам.
export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.stuck = [];
  }

  fireBolt(origin, dir, opts) {
    const mesh = buildBolt();
    mesh.scale.setScalar(1.6);
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().sub(dir));
    this.game.scene.add(mesh);
    this.list.push({ mesh, pos: origin.clone(), vel: dir.clone().multiplyScalar(opts.speed), opts, hit: new Set(), pierce: opts.pierce, life: 3 });
  }

  update(dt) {
    const game = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.life -= dt;
      b.vel.y -= 2.5 * dt;
      const step = b.vel.clone().multiplyScalar(dt);
      const len = step.length();
      const dir = step.clone().divideScalar(len);
      const wh = game.level.raycast(b.pos, dir, len);
      const maxT = wh ? wh.distance : len;
      let done = false;
      for (const h of game.enemies.raycastAll(b.pos, dir, maxT)) {
        if (b.hit.has(h.enemy)) continue;
        b.hit.add(h.enemy);
        game.combat.applyHit(h.enemy, h, dir, b.opts);
        game.fx.flash(h.point, { color: 0xff3030, intensity: 6, dur: 0.15, distance: 5 });
        if (b.pierce-- <= 0) { done = true; break; }
      }
      // След.
      for (let k = 0; k < 2; k++) {
        const t = Math.random();
        game.fx.sparks.spawn({
          x: b.pos.x + step.x * t, y: b.pos.y + step.y * t, z: b.pos.z + step.z * t,
          life: 0.25, size: 0.025, size1: 0, r: 1.6, g: 1.4, b: 1.6, a: 0.7,
        });
      }
      if (done) { this.remove(i); continue; }
      if (wh) {
        // Кол застревает в стене.
        game.fx.impact(wh.point, wh.normal, { big: true });
        game.audio.hitStone(wh.point);
        game.audio.tone({ type: 'triangle', freq: 180, freq1: 120, gain: 0.3, decay: 0.15, pos: wh.point });
        b.mesh.position.copy(wh.point).addScaledVector(dir, 0.12);
        this.stuck.push({ mesh: b.mesh, life: 8 });
        this.list.splice(i, 1);
        continue;
      }
      b.pos.add(step);
      b.mesh.position.copy(b.pos);
      b.mesh.lookAt(b.pos.clone().sub(b.vel));
      if (b.life <= 0) this.remove(i);
    }
    for (let i = this.stuck.length - 1; i >= 0; i--) {
      const s = this.stuck[i];
      s.life -= dt;
      if (s.life <= 0) { game.scene.remove(s.mesh); this.stuck.splice(i, 1); }
    }
  }

  remove(i) {
    this.game.scene.remove(this.list[i].mesh);
    this.list.splice(i, 1);
  }

  clear() {
    for (const b of this.list) this.game.scene.remove(b.mesh);
    for (const s of this.stuck) this.game.scene.remove(s.mesh);
    this.list = []; this.stuck = [];
  }
}
