// Нетопыри: стая кружит вокруг охотника и пикирует. Матерь Стаи — гигантская версия с поведением босса.
import * as THREE from 'three';
import { Enemy } from './enemy.js';
import { randRange, rand, clamp } from '../../core/util.js';

const V3 = THREE.Vector3;

let G = null;
function geos() {
  if (G) return G;
  // Крыло: зубчатый задний край, как у летучей мыши.
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.12, 0.05); s.lineTo(0.3, 0.09); s.lineTo(0.46, 0.04);
  s.quadraticCurveTo(0.4, -0.02, 0.36, -0.1);
  s.quadraticCurveTo(0.3, -0.04, 0.24, -0.11);
  s.quadraticCurveTo(0.18, -0.04, 0.12, -0.1);
  s.quadraticCurveTo(0.06, -0.03, 0, -0.06);
  s.closePath();
  const wing = new THREE.ShapeGeometry(s);
  wing.rotateX(Math.PI / 2);
  G = {
    wing,
    body: new THREE.SphereGeometry(0.07, 10, 8),
    head: new THREE.SphereGeometry(0.05, 10, 8),
    ear: new THREE.ConeGeometry(0.018, 0.06, 4),
    eye: new THREE.SphereGeometry(0.011, 6, 4),
  };
  return G;
}

const BASE = {
  fur: new THREE.MeshStandardMaterial({ color: 0x1a1214, roughness: 0.9 }),
  wing: new THREE.MeshStandardMaterial({ color: 0x2a1418, roughness: 0.7, side: THREE.DoubleSide, emissive: 0x100204 }),
};

export class Bat extends Enemy {
  constructor(game, pos, opts = {}) {
    super(game);
    this.type = 'bat';
    this.flying = true;
    this.maxHp = this.hp = opts.hp ?? 16;
    this.speed = opts.speed ?? 6;
    this.radius = 0.3;
    this.damage = 7;
    this.xp = 3;
    this.orbit = rand() * Math.PI * 2;
    this.orbitR = randRange(3.5, 6.5);
    this.orbitH = randRange(1.8, 3.4);
    this.diveCd = randRange(1.5, 4);
    this.vel = new V3();
    this.build();
    this.root.position.copy(pos).setY(randRange(2.5, 4));
    game.scene.add(this.root);
    this.state = 'fly';
    game.audio.burst({ type: 'bandpass', freq: 5000, q: 2, gain: 0.25, decay: 0.2, pos });
  }

  build() {
    const g = geos();
    const fur = this.mat(BASE.fur), wingM = this.mat(BASE.wing);
    for (const m of this.materials) m.userData.rim.value.set(0.4, 0.04, 0.06);
    const b = (this.body = new THREE.Group());
    this.root.add(b);
    const add = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
    add(g.body, fur, b, 0, 0, 0).scale.set(1, 0.9, 1.5);
    add(g.head, fur, b, 0, 0.02, 0.1);
    for (const sx of [-1, 1]) add(g.ear, fur, b, sx * 0.025, 0.07, 0.1).rotation.z = -sx * 0.3;
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 0.5, 0.3) });
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(g.eye, eyeMat); e.position.set(sx * 0.02, 0.03, 0.145); b.add(e); }
    this.wings = [-1, 1].map((sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.04, 0, 0);
      b.add(pivot);
      const w = add(g.wing, wingM, pivot, 0, 0, 0);
      w.scale.set(sx * 1.6, 1, 1.6);
      return pivot;
    });
    this.hitSpheres = [{ local: new V3(0, 0, 0), r: 0.38, part: 'body', node: this.body }];
  }

  center(out = new V3()) { return out.copy(this.root.position); }

  update(dt) {
    const game = this.game, p = game.player;
    this.stateT += dt;
    this.diveCd -= dt;
    this.updateFlash(dt);
    this.tickStatus(dt);
    const pos = this.root.position;
    if (!this.alive) {
      // Падает кувыркаясь, потом сгорает.
      this.vel.y -= 14 * dt;
      pos.addScaledVector(this.vel, dt);
      this.body.rotation.x += dt * 12;
      if (pos.y < 0.1) { pos.y = 0.1; this.vel.set(0, 0, 0); this.dissolve = Math.min(1, this.dissolve + dt * 2); this.setDissolve(this.dissolve); if (this.dissolve >= 1) this.dead = true; }
      return;
    }
    const eye = new V3(p.pos.x, p.pos.y + 1.5, p.pos.z);
    let target;
    if (this.state === 'fly') {
      this.orbit += dt * (0.9 + this.seed % 0.5);
      target = new V3(p.pos.x + Math.cos(this.orbit) * this.orbitR, this.orbitH + Math.sin(game.time * 2 + this.seed) * 0.4, p.pos.z + Math.sin(this.orbit) * this.orbitR);
      if (this.diveCd <= 0 && p.alive) { this.state = 'dive'; this.stateT = 0; game.audio.burst({ type: 'bandpass', freq: 3500, freq1: 6000, q: 3, gain: 0.3, decay: 0.25, pos }); }
    } else if (this.state === 'dive') {
      target = eye;
      if (pos.distanceTo(eye) < 0.7) {
        if (p.damage(this.damage * (game.run?.stats.enemyDamage ?? 1), pos)) game.audio.clawSwipe(pos);
        this.state = 'retreat'; this.stateT = 0;
      }
      if (this.stateT > 2.2) { this.state = 'retreat'; this.stateT = 0; }
    } else {
      target = new V3(pos.x - (eye.x - pos.x), 5, pos.z - (eye.z - pos.z));
      if (this.stateT > 0.9) { this.state = 'fly'; this.diveCd = randRange(2.5, 5); }
    }
    const sp = (this.state === 'dive' ? this.speed * 1.7 : this.speed) * this.speedFactor;
    const desired = target.sub(pos);
    const dl = desired.length();
    desired.multiplyScalar(dl > 0.01 ? sp / dl : 0);
    // Рывки «летучей мыши»: дрожание траектории.
    desired.x += Math.sin(game.time * 13 + this.seed) * 1.5;
    desired.y += Math.sin(game.time * 11 + this.seed * 2) * 1.2;
    this.vel.lerp(desired, 1 - Math.exp(-dt * (this.state === 'dive' ? 6 : 3)));
    pos.addScaledVector(this.vel, dt);
    pos.y = Math.max(0.5, pos.y);
    const lb = game.level.bounds;
    pos.x = clamp(pos.x, lb.minX, lb.maxX); pos.z = clamp(pos.z, lb.minZ, lb.maxZ);
    this.root.rotation.y = Math.atan2(this.vel.x, this.vel.z);
    this.body.rotation.x = clamp(-this.vel.y * 0.08, -0.8, 0.8);
    const flap = Math.sin(game.time * (this.state === 'dive' ? 10 : 26) + this.seed);
    this.wings[0].rotation.z = flap * 0.9;
    this.wings[1].rotation.z = -flap * 0.9;
  }

  takeDamage(amount, info = {}) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flash = 1;
    if (info.dir && !this.boss) this.vel.addScaledVector(info.dir, (info.knockback ?? 2) * 1.5);
    if (this.boss) {
      if (this.hp <= 0) { this.alive = false; this.vel.set(0, 2, 0); this.game.audio.vampireDeath(this.root.position); this.game.fx.ash(this.root.position, 4); return true; }
      return false;
    }
    if (this.hp <= 0) {
      this.alive = false;
      this.vel.y = 1;
      this.game.audio.burst({ type: 'bandpass', freq: 4500, freq1: 2000, q: 2, gain: 0.35, decay: 0.3, pos: this.root.position });
      return true;
    }
    if (this.state === 'dive') { this.state = 'retreat'; this.stateT = 0; }
    return false;
  }
}

// Матерь Стаи: огромная летучая тварь. Кружит над поляной, пикирует, призывает стаю, визжит.
export class Broodmother extends Bat {
  constructor(game, pos, opts = {}) {
    super(game, pos, { hp: opts.hp ?? 1300 });
    this.boss = opts.boss || 'broodmother';
    this.type = 'broodmother';
    this.sizeScale = 5;
    this.root.scale.setScalar(5);
    this.speed = 9;
    this.damage = 26;
    this.summonCd = 6;
    this.diveCd = 4;
    this.state = 'circle';
    this.center0 = new V3(0, 0, -2);
    this.setRim(0.7, 0.05, 0.08);
    this.hitSpheres = [
      { local: new V3(0, 0.02, 0.1), r: 0.07, part: 'head', node: this.body },
      { local: new V3(0, 0, 0), r: 0.11, part: 'body', node: this.body },
      { local: new V3(0.2, 0, 0), r: 0.08, part: 'body', node: this.body },
      { local: new V3(-0.2, 0, 0), r: 0.08, part: 'body', node: this.body },
    ];
    this.xp = 250;
  }

  update(dt) {
    const game = this.game, p = game.player;
    this.stateT += dt;
    this.diveCd -= dt;
    this.summonCd -= dt;
    this.updateFlash(dt);
    this.tickStatus(dt);
    const pos = this.root.position;
    if (!this.alive) {
      this.vel.y -= 9 * dt;
      pos.addScaledVector(this.vel, dt);
      this.body.rotation.z += dt * 3;
      if (pos.y < 0.8) { pos.y = 0.8; this.dissolve = Math.min(1, this.dissolve + dt * 0.7); this.setDissolve(this.dissolve); if (Math.random() < 0.8) game.fx.ash(pos.clone(), 1); if (this.dissolve >= 1) this.dead = true; }
      return;
    }
    const enraged = this.hp < this.maxHp * 0.4;
    let target, sp = this.speed, steer = 2;
    const eye = new V3(p.pos.x, p.pos.y + 1.2, p.pos.z);
    if (this.state === 'circle') {
      const a = game.time * (enraged ? 0.55 : 0.4);
      target = new V3(this.center0.x + Math.cos(a) * 11, 7 + Math.sin(game.time * 0.7) * 1.5, this.center0.z + Math.sin(a) * 11);
      if (this.summonCd <= 0) {
        this.summonCd = enraged ? 9 : 13;
        for (let i = 0; i < (enraged ? 6 : 4); i++) game.enemies.spawn('bat', pos.clone().add(new V3(randRange(-2, 2), 0, randRange(-2, 2))));
        game.audio.screech(pos);
        game.hud.say('Дети мои… ешьте!', this.bossName);
      } else if (this.diveCd <= 0 && p.alive) {
        this.state = 'telegraph'; this.stateT = 0;
        game.audio.screech(pos);
      }
    } else if (this.state === 'telegraph') {
      target = pos.clone().add(new V3(0, 0.5, 0));
      sp = 1;
      this.eyeFlare = 1;
      if (this.stateT > 0.8) { this.state = 'dive'; this.stateT = 0; this.diveTo = eye.clone(); }
    } else if (this.state === 'dive') {
      target = this.diveTo;
      sp = 22; steer = 6;
      if (Math.random() < 0.8) game.fx.smoke.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 0.8, size: 1, size1: 2.5, r: 0.15, g: 0.01, b: 0.03, a: 0.4, drag: 2 });
      if (pos.distanceTo(eye) < 2.0 && !this.hitThis) {
        this.hitThis = true;
        if (p.damage(this.damage * (game.run?.stats.enemyDamage ?? 1), pos)) { p.vel.addScaledVector(this.vel.clone().setY(0).normalize(), 10); game.audio.clawSwipe(pos); }
      }
      if (pos.distanceTo(this.diveTo) < 1.5 || this.stateT > 1.6) {
        this.state = 'perch'; this.stateT = 0; this.hitThis = false;
        game.hazards.shockwave(new V3(pos.x, 0, pos.z), { maxR: 6, damage: 14, speed: 8, color: 0xa01030 });
      }
    } else if (this.state === 'perch') {
      // Уязвима: сидит на земле, тяжело дышит.
      target = new V3(pos.x, 1.6, pos.z);
      sp = 3;
      if (this.stateT > (enraged ? 1.1 : 1.6)) { this.state = 'circle'; this.diveCd = enraged ? 3.5 : 5; }
    }
    const desired = target.clone().sub(pos);
    const dl = desired.length();
    desired.multiplyScalar(dl > 0.01 ? Math.min(sp, dl * 3) / dl : 0);
    this.vel.lerp(desired, 1 - Math.exp(-dt * steer));
    pos.addScaledVector(this.vel, dt);
    pos.y = Math.max(1.2, pos.y);
    if (this.state !== 'perch') this.root.rotation.y = Math.atan2(this.vel.x, this.vel.z);
    else this.root.rotation.y = Math.atan2(p.pos.x - pos.x, p.pos.z - pos.z);
    this.body.rotation.x = clamp(-this.vel.y * 0.04, -0.6, 0.6);
    const flapSpeed = this.state === 'dive' ? 3 : this.state === 'perch' ? 4 : 7;
    const flap = Math.sin(game.time * flapSpeed);
    const amp = this.state === 'dive' ? 0.25 : 0.8;
    this.wings[0].rotation.z = flap * amp;
    this.wings[1].rotation.z = -flap * amp;
    if (Math.random() < 0.15 && this.state === 'circle') game.audio.burst({ type: 'lowpass', freq: 300, gain: 0.25, decay: 0.15, pos, rate: 0.5 });
  }
}
