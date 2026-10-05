// Двустволка «Литания»: серебряная картечь в упор. Два выстрела, переломное заряжание,
// тяжёлая отдача и отбрасывание. Лучшее средство от толпы и громил.
import * as THREE from 'three';
import { extrudeGeo } from '../../world/geo.js';
import { woodTex, muzzleTex } from '../../core/textures.js';
import { Spring, damp, rand, randRange } from '../../core/util.js';
import { buildHand } from './revolver.js';

const V3 = THREE.Vector3;
function profile(geo) { geo.rotateY(Math.PI / 2); return geo; }

export function buildShotgunModel() {
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a4b52, metalness: 1, roughness: 0.32 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1d22, metalness: 1, roughness: 0.42 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xd2d4da, metalness: 1, roughness: 0.2 });
  const wood = new THREE.MeshStandardMaterial({ map: woodTex(5), roughness: 0.42, color: 0xa88878 });
  wood.map.repeat.set(8, 8);
  const black = new THREE.MeshBasicMaterial({ color: 0x010101 });
  const root = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = root) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  // Ложа с пистолетной шейкой.
  const st = new THREE.Shape();
  st.moveTo(-0.32, -0.02); st.lineTo(-0.08, 0.012); st.lineTo(0.0, 0.03); st.lineTo(0.0, 0.055); st.lineTo(-0.1, 0.05);
  st.quadraticCurveTo(-0.2, 0.045, -0.34, 0.06); st.lineTo(-0.36, -0.07); st.quadraticCurveTo(-0.24, -0.06, -0.14, -0.02); st.quadraticCurveTo(-0.08, -0.06, -0.06, -0.1); st.lineTo(-0.03, -0.1); st.quadraticCurveTo(-0.04, -0.03, -0.01, -0.0); st.closePath();
  add(profile(extrudeGeo(st, 0.036, 0.004)), wood);
  // Колодка с гравировкой и спуск.
  add(new THREE.BoxGeometry(0.042, 0.045, 0.09), steel, 0, 0.035, -0.04);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.002, 0.02, 0.05), silver, sx * 0.0215, 0.035, -0.04);
  add(new THREE.TorusGeometry(0.016, 0.0025, 6, 14, Math.PI).rotateZ(Math.PI).rotateY(Math.PI / 2), steel, 0, 0.012, -0.03);
  add(new THREE.BoxGeometry(0.004, 0.018, 0.005), silver, 0, 0.004, -0.028);
  // Стволы на шарнире — откидываются при заряжании.
  const barrels = new THREE.Group();
  barrels.position.set(0, 0.035, -0.085);
  root.add(barrels);
  for (const sx of [-1, 1]) {
    const b = new THREE.CylinderGeometry(0.0115, 0.0115, 0.42, 14).rotateX(Math.PI / 2);
    add(b, steel, sx * 0.0118, 0.012, -0.21, barrels);
    add(new THREE.CircleGeometry(0.0085, 12), black, sx * 0.0118, 0.012, -0.4205, barrels).rotation.y = Math.PI;
  }
  add(new THREE.BoxGeometry(0.008, 0.006, 0.42), dark, 0, 0.026, -0.21, barrels);
  add(new THREE.SphereGeometry(0.004, 6, 4), silver, 0, 0.031, -0.41, barrels);
  // Цевьё.
  add(new THREE.BoxGeometry(0.04, 0.022, 0.16), wood, 0, -0.002, -0.08, barrels);
  // Патроны в казённике (видны при переломе).
  const shells = [-1, 1].map((sx) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.0118, 0.012, 0.002);
    add(new THREE.CylinderGeometry(0.011, 0.011, 0.004, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc09048, metalness: 1, roughness: 0.3 }), 0, 0, 0, g);
    add(new THREE.CylinderGeometry(0.0105, 0.0105, 0.05, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7a1018, roughness: 0.6 }), 0, 0, -0.026, g);
    barrels.add(g);
    return g;
  });
  for (const m of root.children) m.castShadow = false;
  return { root, barrels, shells, muzzle: new V3(0, 0.047, -0.52) };
}

export class Shotgun {
  constructor(game) {
    this.game = game;
    this.name = 'Литания';
    this.kind = 'shotgun';
    Object.assign(this, buildShotgunModel());
    this.model = new THREE.Group();
    this.model.add(this.root);
    this.hand = buildHand();
    this.hand.position.set(-0.01, -0.012, 0.0);
    this.root.add(this.hand);
    this.root.scale.setScalar(0.85);
    this.hip = new V3(0.13, -0.155, -0.46);
    this.ads = new V3(0, -0.04 - 0.026, -0.34);
    this.model.position.copy(this.hip);
    this.capacity = 2;
    this.ammo = 2;
    this.pellets = 9;
    this.damage = 17;
    this.headMul = 1.6;
    this.fireDelay = 0.28;
    this.reloadTime = 1.15;
    this.cooldown = 0;
    this.state = 'idle';
    this.stateT = 0;
    this.kickZ = new Spring(150, 13);
    this.kickRot = new Spring(120, 11);
    this.breakOpen = 0;
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: muzzleTex(), color: new THREE.Color(4, 2.6, 1.4), blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash.scale.setScalar(0.3);
    this.flash.visible = false;
    this.root.add(this.flash);
    this.flashTime = 0;
  }

  get reloading() { return this.state === 'reloading'; }

  reset() { this.ammo = this.capacity; this.state = 'idle'; this.cooldown = 0; this.updateShells(); }

  updateShells() { this.shells.forEach((s, i) => { s.visible = i < this.ammo; }); }

  fire() {
    const game = this.game, stats = game.run.stats;
    const barrel = this.ammo === 2 ? -1 : 1;
    this.ammo--;
    this.cooldown = this.fireDelay / stats.fireRate;
    game.lastShotTime = game.time;
    this.kickZ.impulse(6); this.kickRot.impulse(24);
    game.player.recoil(game.player.aiming ? 5 : 7, randRange(-1, 1));
    game.player.addTrauma(0.32);
    // Выстрел картечью громче и ниже револьверного.
    game.audio.revolverShot();
    game.audio.tone({ freq: 70, freq1: 28, gain: 1.4, decay: 0.35, reverb: 0.7 });
    game.audio.burst({ type: 'lowpass', freq: 2500, freq1: 200, gain: 1.2, decay: 0.5, reverb: 1.0 });
    game.hud.crosshairKick(1.6);
    this.flash.position.set(barrel * 0.0118, 0.047, -0.53);
    this.flash.material.rotation = rand() * 6;
    this.flash.visible = true; this.flashTime = 0.06;
    this.updateShells();
    const cam = game.camera;
    const base = cam.getWorldDirection(new V3());
    const right = new V3().crossVectors(base, cam.up).normalize();
    const up = new V3().crossVectors(right, base).normalize();
    const spread = (game.player.aiming ? 0.045 : 0.075) * (this.choke || 1);
    const muzzle = cam.position.clone().addScaledVector(base, 0.6).addScaledVector(right, 0.12).addScaledVector(up, -0.1);
    game.fx.flash(muzzle, { intensity: 70, dur: 0.09, distance: 18 });
    game.fx.muzzleSmoke(muzzle, base, 2);
    for (let i = 0; i < this.pellets; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * spread;
      const d = base.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      game.combat.hitscan(cam.position.clone(), d, { damage: this.damage * stats.damage, headMul: this.headMul * stats.headMul, pierce: 0, knockback: 2.4, source: 'shotgun' });
    }
    if (this.ammo <= 0) this.startReload();
  }

  startReload() {
    if (this.state !== 'idle' || this.ammo >= this.capacity) return;
    this.state = 'reloading';
    this.stateT = 0;
    this.spentOut = false;
    this.game.audio.cylinderOpen();
  }

  update(dt, input) {
    const game = this.game, stats = game.run.stats;
    this.cooldown -= dt;
    this.stateT += dt;
    if (input.reload) this.startReload();
    if (input.firePressed) {
      if (this.state === 'idle' && this.cooldown <= 0 && this.ammo > 0) this.fire();
      else if (this.ammo <= 0 && this.state === 'idle') { game.audio.dryFire(); this.startReload(); }
    }
    const rt = this.reloadTime / stats.reloadSpeed;
    if (this.state === 'reloading') {
      const t = this.stateT / rt;
      // Перелом → гильзы вылетают → два патрона → щелчок.
      if (t > 0.25 && !this.spentOut) {
        this.spentOut = true;
        const spent = this.capacity - this.ammo;
        const cam = game.camera;
        for (let i = 0; i < spent; i++) {
          const p = cam.position.clone().addScaledVector(cam.getWorldDirection(new V3()), 0.3).add(new V3(0.1, -0.12, 0).applyQuaternion(cam.quaternion));
          game.fx.casing(p, new V3(randRange(0.5, 1.2), randRange(1.5, 2.5), randRange(0.3, 1)).applyQuaternion(cam.quaternion));
        }
        if (spent) game.audio.shellsDrop();
      }
      if (t > 0.55 && this.ammo < this.capacity && t < 0.8) { this.ammo = this.capacity; this.updateShells(); game.audio.roundInsert(); }
      if (t >= 1) { this.state = 'idle'; game.audio.cylinderClose(); this.kickRot.impulse(-6); }
    }
    const open = this.state === 'reloading' && this.stateT / rt < 0.85 ? 1 : 0;
    this.breakOpen = damp(this.breakOpen, open, 14, dt);
    this.barrels.rotation.x = -this.breakOpen * 0.55;
    this.kickZ.update(dt); this.kickRot.update(dt);
    const aim = game.vm.aimBlend ?? 0;
    const pos = this.model.position.copy(this.hip).lerp(this.ads, aim);
    pos.z += this.kickZ.x * 0.012;
    pos.y += this.breakOpen * -0.03;
    this.model.rotation.set(this.kickRot.x * 0.02 + this.breakOpen * 0.35, (1 - aim) * 0.04 + this.breakOpen * 0.25, this.breakOpen * 0.3);
    if (this.flashTime > 0) { this.flashTime -= dt; if (this.flashTime <= 0) this.flash.visible = false; }
    this.hand.visible = game.settings.showHands;
  }
}
