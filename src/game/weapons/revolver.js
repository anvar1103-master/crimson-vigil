// Револьвер «Реквием»: шесть серебряных пуль, отдача, взвод курка, вращение барабана,
// перезарядка по одному патрону с откидыванием барабана и выбросом гильз.
import * as THREE from 'three';
import { extrudeGeo } from '../../world/geo.js';
import { woodTex, muzzleTex, glowTex } from '../../core/textures.js';
import { Spring, damp, rand, randRange, clamp } from '../../core/util.js';

const V3 = THREE.Vector3;

// Профиль (X — вперёд, Y — вверх) → пространство оружия (−Z — вперёд).
function profile(geo) { geo.rotateY(Math.PI / 2); return geo; }

export function buildRevolverModel() {
  const steel = new THREE.MeshStandardMaterial({ color: 0x55565e, metalness: 1, roughness: 0.34 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24252c, metalness: 1, roughness: 0.4 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xd2d4da, metalness: 1, roughness: 0.17 });
  const wood = new THREE.MeshStandardMaterial({ map: woodTex(3), roughness: 0.42, color: 0xd8c8c0 });
  wood.map.repeat.set(12, 12);
  const brass = new THREE.MeshStandardMaterial({ color: 0xc09048, metalness: 1, roughness: 0.28 });
  const black = new THREE.MeshBasicMaterial({ color: 0x010101 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.25 });

  const gun = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = gun) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // Рама.
  const fr = new THREE.Shape();
  fr.moveTo(-0.036, 0.0); fr.lineTo(0.022, 0.0); fr.lineTo(0.03, 0.012); fr.lineTo(0.074, 0.016);
  fr.lineTo(0.08, 0.05); fr.lineTo(0.066, 0.062); fr.lineTo(0.0, 0.066); fr.lineTo(-0.034, 0.062);
  fr.quadraticCurveTo(-0.052, 0.056, -0.05, 0.036); fr.lineTo(-0.046, 0.012); fr.closePath();
  add(profile(extrudeGeo(fr, 0.019, 0.0018)), steel);
  // Окно под барабан (тёмная вставка по бокам рамы).
  // Ствол: восьмигранный, с верхней планкой и мушкой.
  const barrel = new THREE.CylinderGeometry(0.0098, 0.0098, 0.17, 8);
  barrel.rotateX(Math.PI / 2);
  add(barrel, steel, 0, 0.049, -0.16).rotation.z = Math.PI / 8;
  const rib = new THREE.BoxGeometry(0.007, 0.007, 0.17);
  add(rib, dark, 0, 0.059, -0.16);
  add(new THREE.BoxGeometry(0.0028, 0.011, 0.012), silver, 0, 0.066, -0.238);
  add(new THREE.BoxGeometry(0.008, 0.004, 0.006), dark, 0, 0.069, 0.03);
  // Дульный срез.
  const crown = new THREE.TorusGeometry(0.0085, 0.0018, 6, 16);
  add(crown, silver, 0, 0.049, -0.246);
  add(new THREE.CircleGeometry(0.0062, 12), black, 0, 0.049, -0.2462).rotation.y = Math.PI;
  // Кожух экстрактора под стволом.
  const ej = new THREE.CylinderGeometry(0.0055, 0.0055, 0.09, 10);
  ej.rotateX(Math.PI / 2);
  add(ej, steel, 0, 0.031, -0.12);
  add(new THREE.SphereGeometry(0.0062, 8, 6), silver, 0, 0.031, -0.166);
  // Серебряная инкрустация вдоль ствола — тонкие полосы.
  for (const sx of [-1, 1]) {
    const inlay = new THREE.BoxGeometry(0.0008, 0.0025, 0.13);
    add(inlay, silver, sx * 0.0092, 0.049, -0.165);
  }

  // Барабан на откидной рамке (crane).
  const crane = new THREE.Group();
  crane.position.set(-0.012, 0.018, -0.04);
  gun.add(crane);
  const drum = new THREE.Group();
  drum.position.set(0.012, 0.018, 0); // центр барабана: (0, 0.036, -0.04)
  crane.add(drum);
  const drumGeo = new THREE.CylinderGeometry(0.0225, 0.0225, 0.05, 30);
  drumGeo.rotateX(Math.PI / 2);
  add(drumGeo, silver, 0, 0, 0, drum);
  const chambers = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 2;
    const cx = Math.cos(a) * 0.0132, cy = Math.sin(a) * 0.0132;
    add(new THREE.CircleGeometry(0.0052, 12), black, cx, cy, -0.0252, drum).rotation.y = Math.PI;
    const tip = add(new THREE.SphereGeometry(0.0042, 10, 6), silver, cx, cy, -0.021, drum);
    const rim = new THREE.CylinderGeometry(0.0058, 0.0058, 0.002, 12);
    rim.rotateX(Math.PI / 2);
    const back = add(rim, brass, cx, cy, 0.026, drum);
    // Канавки-долы между каморами.
    const fa = a + Math.PI / 6;
    const flute = add(new THREE.BoxGeometry(0.004, 0.003, 0.032), dark, Math.cos(fa) * 0.022, Math.sin(fa) * 0.022, -0.003, drum);
    flute.rotation.z = fa + Math.PI / 2;
    chambers.push({ tip, back });
  }
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.056, 8).rotateX(Math.PI / 2), dark, 0, 0, 0, drum);

  // Курок.
  const hammer = new THREE.Group();
  hammer.position.set(0, 0.05, 0.042);
  gun.add(hammer);
  const hs = new THREE.Shape();
  hs.moveTo(-0.004, 0); hs.lineTo(0.006, 0); hs.lineTo(0.004, 0.018); hs.lineTo(-0.012, 0.026); hs.lineTo(-0.014, 0.021); hs.lineTo(-0.006, 0.014); hs.closePath();
  add(profile(extrudeGeo(hs, 0.007, 0.0008)), silver, 0, 0, 0, hammer);

  // Спуск и скоба.
  const trig = new THREE.Shape();
  trig.moveTo(0, 0); trig.quadraticCurveTo(0.008, -0.01, 0.002, -0.02); trig.lineTo(-0.002, -0.019); trig.quadraticCurveTo(0.003, -0.01, -0.004, 0); trig.closePath();
  const trigger = add(profile(extrudeGeo(trig, 0.004)), silver, 0, 0.004, -0.012);
  const guard = new THREE.TorusGeometry(0.017, 0.0024, 6, 18, Math.PI);
  guard.rotateZ(Math.PI);
  add(profile(guard), steel, 0, 0.0, -0.012);

  // Рукоять «плуг»: дерево, серебряная пятка и медальон с терновым крестом.
  const gr = new THREE.Shape();
  gr.moveTo(-0.034, 0.004);
  gr.quadraticCurveTo(-0.026, -0.04, -0.05, -0.078);
  gr.quadraticCurveTo(-0.066, -0.088, -0.082, -0.08);
  gr.quadraticCurveTo(-0.07, -0.03, -0.051, 0.024);
  gr.closePath();
  add(profile(extrudeGeo(gr, 0.026, 0.005, 16)), wood);
  const butt = new THREE.BoxGeometry(0.03, 0.006, 0.03);
  const bm = add(butt, silver, 0, -0.083, 0.066);
  bm.rotation.x = 0.35;
  for (const sx of [-1, 1]) {
    const med = new THREE.CylinderGeometry(0.0062, 0.0062, 0.002, 16);
    med.rotateZ(Math.PI / 2);
    add(med, gold, sx * 0.0182, -0.032, 0.054);
  }
  // Рамка-обвод рукояти.
  const strap = new THREE.Shape();
  strap.moveTo(-0.051, 0.024); strap.quadraticCurveTo(-0.07, -0.03, -0.082, -0.08); strap.lineTo(-0.086, -0.079);
  strap.quadraticCurveTo(-0.074, -0.03, -0.055, 0.026); strap.closePath();
  add(profile(extrudeGeo(strap, 0.02)), steel);

  for (const m of gun.children) m.castShadow = false;
  return { gun, drum, crane, hammer, trigger, chambers, muzzle: new V3(0, 0.049, -0.25) };
}

// Перчатка, держащая рукоять, и рукав плаща. Пространство оружия: −Z вперёд, рукоять около z≈0.05.
export function buildHand() {
  const leather = new THREE.MeshPhysicalMaterial({ color: 0x2a1c1a, roughness: 0.48, sheen: 0.6, sheenColor: new THREE.Color(0x6a4a40), sheenRoughness: 0.5 });
  const coat = new THREE.MeshStandardMaterial({ color: 0x1a1216, roughness: 0.85 });
  const cuff = new THREE.MeshStandardMaterial({ color: 0x6a0c18, roughness: 0.6 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xd2d4da, metalness: 1, roughness: 0.2 });
  const hand = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    hand.add(m);
    return m;
  };
  // Наклон рукояти «плуг»: пальцы идут вдоль неё.
  const gripTilt = 0.42;
  const gx = 0, gz = 0.058;
  // Тыльная сторона ладони — справа от рукояти.
  const back = add(new THREE.CapsuleGeometry(0.018, 0.04, 6, 12), leather, 0.02, -0.044, 0.064, gripTilt, 0, 0);
  back.scale.set(0.75, 1, 1.25);
  // Три пальца обхватывают рукоять спереди — дуги тора вокруг её оси.
  for (let i = 0; i < 3; i++) {
    const y = -0.026 - i * 0.02;
    const zOff = Math.sin(gripTilt) * (y + 0.02);
    const f = add(new THREE.TorusGeometry(0.02, 0.0098 - i * 0.0006, 8, 18, Math.PI * 1.25), leather, gx, y, gz + zOff - 0.004);
    f.rotation.set(Math.PI / 2 + gripTilt * 0.3, 0, Math.PI * 0.4);
  }
  // Указательный — на спусковом крючке.
  const idx = add(new THREE.CapsuleGeometry(0.0088, 0.032, 4, 8), leather, 0.006, -0.004, 0.012, Math.PI / 2 + 0.35, 0, -0.25);
  idx.scale.set(1, 1, 1);
  add(new THREE.SphereGeometry(0.0088, 8, 6), leather, -0.002, -0.012, -0.008);
  // Большой палец лежит вдоль левого бока рамы.
  add(new THREE.CapsuleGeometry(0.0092, 0.036, 4, 8), leather, -0.017, 0.022, 0.036, Math.PI / 2 - 0.12, 0, 0.1);
  // Серебряный перстень Ордена.
  add(new THREE.TorusGeometry(0.0108, 0.0024, 6, 16), silver, 0.004, -0.046, 0.04, Math.PI / 2, 0, 0.4);
  // Запястье, багровая манжета, рукав плаща — по одной линии от кисти назад-вниз.
  const base = new V3(0.022, -0.075, 0.09);
  const d = new V3(0.22, -0.62, 0.75).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, -1, 0), d);
  const seg = (geo, mat, from, len) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(base).addScaledVector(d, from + len / 2);
    m.quaternion.copy(q);
    hand.add(m);
  };
  seg(new THREE.CylinderGeometry(0.026, 0.023, 0.07, 12), leather, -0.01, 0.07);
  seg(new THREE.CylinderGeometry(0.036, 0.034, 0.04, 14), cuff, 0.055, 0.04);
  seg(new THREE.CylinderGeometry(0.05, 0.045, 0.34, 14), coat, 0.09, 0.34);
  for (const m of hand.children) m.castShadow = false;
  return hand;
}

export class Revolver {
  constructor(game) {
    this.game = game;
    this.name = 'Реквием';
    this.kind = 'revolver';
    const m = buildRevolverModel();
    Object.assign(this, m);
    this.model = new THREE.Group();
    this.model.add(this.gun);
    this.hand = buildHand();
    this.gun.add(this.hand);
    this.hip = new V3(0.15, -0.15, -0.4);
    // Поза перезарядки: ствол вверх-влево, левый бок с откинутым барабаном к игроку.
    this.reloadPose = { x: -0.07, y: 0.035, z: 0.06, rx: 0.45, ry: 0.55, rz: 0.25 };
    this.ads = new V3(0, -0.049 - 0.026, -0.36);
    this.model.position.copy(this.hip);

    // Вспышка.
    this.flash = new THREE.Group();
    this.flash.position.copy(this.muzzle);
    const fm = new THREE.SpriteMaterial({ map: muzzleTex(), color: new THREE.Color(4, 2.6, 1.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flashSprite = new THREE.Sprite(fm);
    this.flashSprite.scale.setScalar(0.16);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.07), new THREE.MeshBasicMaterial({
      map: glowTex(), color: new THREE.Color(4, 2.2, 0.9), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
    }));
    side.rotation.y = Math.PI / 2;
    side.position.z = -0.08;
    this.flashSide = side;
    this.flash.add(this.flashSprite, side);
    this.flash.visible = false;
    this.gun.add(this.flash);

    this.capacity = 6;
    this.ammo = 6;
    this.damage = 42;
    this.headMul = 2.5;
    this.fireDelay = 0.3;
    this.cooldown = 0;
    this.flashTime = 0;
    this.kickZ = new Spring(260, 20);
    this.kickRot = new Spring(200, 16);
    this.kickRoll = new Spring(160, 14);
    this.drumAngle = 0;
    this.drumTarget = 0;
    this.hammerCock = 1;
    this.triggerPull = 0;
    this.state = 'idle'; // idle | opening | inserting | closing
    this.stateT = 0;
    this.reloadBlend = 0;
    this.craneOpen = 0;
    this.queuedShot = 0;
    this.spent = 0;
    this.updateChambers();
  }

  get reloading() { return this.state !== 'idle'; }

  reset() {
    this.capacity = 6 + (this.game.run?.stats.extraRounds || 0);
    this.ammo = this.capacity;
    this.spent = 0;
    this.state = 'idle';
    this.cooldown = 0;
    this.updateChambers();
  }

  updateChambers() {
    // Каморы с патронами: ammo штук начиная с текущей позиции у ствола.
    const cur = Math.round(this.drumTarget / (Math.PI / 3));
    for (let i = 0; i < 6; i++) {
      const idx = (((i - cur) % 6) + 6) % 6;
      const loaded = idx < this.ammo;
      this.chambers[i].tip.visible = loaded;
      this.chambers[i].back.visible = loaded || idx < this.ammo + this.spent;
    }
  }

  tryFire(ctx) {
    if (this.state === 'opening' || this.state === 'inserting') {
      if (this.ammo > 0) { this.state = 'closing'; this.stateT = 0; this.queuedShot = 0.4; }
      return;
    }
    if (this.state === 'closing') { this.queuedShot = 0.4; return; }
    if (this.cooldown > 0) { this.queuedShot = 0.15; return; }
    if (this.ammo <= 0) {
      this.game.audio.dryFire();
      this.kickRot.impulse(-2);
      this.cooldown = 0.25;
      this.startReload();
      return;
    }
    this.fire(ctx);
  }

  fire() {
    const game = this.game, stats = game.run.stats;
    this.ammo--;
    this.spent++;
    this.cooldown = this.fireDelay / stats.fireRate;
    this.kickZ.impulse(3.2);
    this.kickRot.impulse(16);
    this.kickRoll.impulse(randRange(-3, 3));
    this.hammerCock = 0;
    this.triggerPull = 1;
    this.drumTarget += Math.PI / 3;
    this.flashTime = 0.055;
    this.flash.visible = true;
    this.flashSprite.material.rotation = rand() * Math.PI;
    this.flashSprite.scale.setScalar(randRange(0.13, 0.2));
    this.updateChambers();
    game.vm.muzzleLight.position.copy(this.muzzle).applyMatrix4(this.gun.matrixWorld);
    game.vm.muzzleLight.intensity = 6;

    const aim = game.player.aiming;
    game.player.recoil(aim ? 2.2 : 3.4, randRange(-0.8, 0.8));
    game.player.addTrauma(0.12);
    game.audio.revolverShot();
    game.hud.crosshairKick(1);

    const cam = game.camera;
    const origin = cam.position.clone();
    const dir = cam.getWorldDirection(new V3());
    const spread = this.spreadAngle();
    if (spread > 0) {
      dir.x += randRange(-spread, spread); dir.y += randRange(-spread, spread); dir.z += randRange(-spread, spread);
      dir.normalize();
    }
    const muzzleWorld = this.muzzleWorld();
    game.fx.flash(muzzleWorld, { intensity: 40, dur: 0.07, distance: 16 });
    game.fx.muzzleSmoke(muzzleWorld, dir, 1);
    game.run.shotCount++;
    const explosive = stats.explosiveEvery > 0 && game.run.shotCount % stats.explosiveEvery === 0;
    game.combat.hitscan(origin, dir, {
      damage: this.damage * stats.damage, headMul: this.headMul * stats.headMul, pierce: stats.pierce + (this.pierceBonus || 0),
      knockback: 2.2, source: 'revolver', muzzle: muzzleWorld, explosive, ricochet: stats.ricochet,
    });
  }

  spreadAngle() {
    const p = this.game.player;
    if (p.aiming) return 0.0008;
    const hs = Math.hypot(p.vel.x, p.vel.z);
    return 0.003 + Math.min(hs / 7, 1) * 0.022 + (p.onGround ? 0 : 0.03);
  }

  // Мировая позиция дульного среза (оружие живёт в отдельной сцене, переводим через камеру).
  muzzleWorld() {
    const game = this.game;
    this.gun.updateWorldMatrix(true, false);
    const p = this.muzzle.clone().applyMatrix4(this.gun.matrixWorld);
    // vm-камера стоит в начале координат и смотрит в −Z, как и игровая камера в её локальном пространстве.
    const s = Math.tan(THREE.MathUtils.degToRad(game.camera.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(game.vmCamera.fov / 2));
    p.x *= s; p.y *= s;
    return game.camera.localToWorld(p);
  }

  startReload() {
    if (this.state !== 'idle' || this.ammo >= this.capacity) return;
    this.state = 'opening';
    this.stateT = 0;
    this.game.audio.cylinderOpen();
  }

  update(dt, input) {
    const game = this.game, stats = game.run.stats;
    this.cooldown -= dt;
    this.queuedShot -= dt;
    this.stateT += dt;
    const reloadSpeed = stats.reloadSpeed * (this.reloadMul || 1);

    if (input.reload) this.startReload();
    if (input.firePressed) this.tryFire();
    else if (this.queuedShot > 0 && this.cooldown <= 0 && this.state === 'idle' && this.ammo > 0) { this.queuedShot = 0; this.fire(); }

    // Конечный автомат перезарядки.
    if (this.state === 'opening' && this.stateT > 0.32 / reloadSpeed) {
      // Экстрактор: гильзы летят из барабана.
      const n = this.spent;
      const base = this.muzzleWorld();
      const cam = game.camera;
      for (let i = 0; i < n; i++) {
        const v = new V3(randRange(-0.6, -0.1), randRange(-0.5, 0.6), randRange(0.6, 1.4)).applyQuaternion(cam.quaternion);
        game.fx.casing(base.clone().add(new V3(randRange(-0.03, 0.03), -0.05, 0.1).applyQuaternion(cam.quaternion)), v);
      }
      if (n) game.audio.shellsDrop();
      this.spent = 0;
      this.updateChambers();
      this.state = 'inserting';
      this.stateT = 0;
    } else if (this.state === 'inserting' && this.stateT > 0.27 / reloadSpeed) {
      this.ammo++;
      this.drumTarget -= Math.PI / 3;
      this.updateChambers();
      game.audio.roundInsert();
      this.stateT = 0;
      if (this.ammo >= this.capacity) { this.state = 'closing'; }
    } else if (this.state === 'closing' && this.stateT > 0.25 / reloadSpeed) {
      this.state = 'idle';
      this.stateT = 0;
      game.audio.cylinderClose();
      this.kickRot.impulse(-4);
      if (this.queuedShot > 0 && this.ammo > 0) { this.queuedShot = 0; this.cooldown = 0; this.fire(); }
    }

    // Анимация.
    const open = this.state === 'opening' || this.state === 'inserting';
    this.reloadBlend = damp(this.reloadBlend, this.state === 'idle' ? 0 : 1, 10, dt);
    this.craneOpen = damp(this.craneOpen, open && this.stateT > 0.08 || this.state === 'inserting' ? 1 : 0, 16, dt);
    this.kickZ.update(dt); this.kickRot.update(dt); this.kickRoll.update(dt);
    this.drumAngle = damp(this.drumAngle, this.drumTarget, 22, dt);
    this.hammerCock = damp(this.hammerCock, this.cooldown > 0.12 ? 0 : 1, 18, dt);
    this.triggerPull = damp(this.triggerPull, 0, 14, dt);

    const aim = game.vm.aimBlend ?? 0;
    const pos = this.model.position.copy(this.hip).lerp(this.ads, aim);
    pos.z += this.kickZ.x * 0.012;
    pos.y += this.kickRot.x * 0.0006;
    const rb = this.reloadBlend;
    const P = this.reloadPose;
    pos.x += rb * P.x; pos.y += rb * P.y; pos.z += rb * P.z;
    this.model.rotation.set(
      this.kickRot.x * 0.022 + rb * P.rx,
      (1 - aim) * 0.035 + rb * P.ry,
      this.kickRoll.x * 0.01 + rb * P.rz,
    );
    this.crane.rotation.z = this.craneOpen * 1.25;
    this.drum.rotation.z = -this.drumAngle;
    this.hammer.rotation.x = this.hammerCock * 0.5;
    this.trigger.position.z = -0.012 + this.triggerPull * 0.004;
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) this.flash.visible = false;
    }
    this.hand.visible = game.settings.showHands;
  }
}
