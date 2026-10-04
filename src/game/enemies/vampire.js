// Вампир-охотник (Stalker): парит над землёй, кружит вокруг жертвы, бросается в рывок, рвёт когтями.
import * as THREE from 'three';
import { Enemy } from './enemy.js';
import { clamp, damp, angleDiff, rand, randRange } from '../../core/util.js';

const V3 = THREE.Vector3;
const V2 = THREE.Vector2;
const _v = new V3(), _w = new V3();

// Общие геометрии (кроме плаща — он деформируется у каждого свой).
let G = null;
function geos() {
  if (G) return G;
  const lathe = (pts, seg = 20, ps = 0, pl = Math.PI * 2) => new THREE.LatheGeometry(pts.map(([r, y]) => new V2(r, y)), seg, ps, pl);
  G = {
    coatPts: [[0.5, 0.0], [0.47, 0.08], [0.38, 0.32], [0.3, 0.58], [0.24, 0.82], [0.2, 0.98], [0.23, 1.16], [0.255, 1.36], [0.22, 1.45], [0.06, 1.48]],
    torso: lathe([[0.0, 0.82], [0.15, 0.85], [0.165, 1.05], [0.19, 1.3], [0.17, 1.44], [0.06, 1.5]], 16),
    collarOut: lathe([[0.12, 1.44], [0.15, 1.54], [0.2, 1.68], [0.27, 1.82]], 20, Math.PI * 0.42, Math.PI * 1.16),
    capelet: lathe([[0.48, 0.98], [0.45, 1.06], [0.38, 1.22], [0.3, 1.38], [0.2, 1.47], [0.08, 1.5]], 26, 0.55, Math.PI * 2 - 1.1),
    jabot: new THREE.ConeGeometry(0.055, 0.16, 8).rotateX(Math.PI),
    neck: new THREE.CylinderGeometry(0.045, 0.05, 0.14, 10),
    head: new THREE.SphereGeometry(0.1, 24, 18),
    hair: new THREE.SphereGeometry(0.106, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
    ear: new THREE.ConeGeometry(0.016, 0.07, 6),
    eye: new THREE.SphereGeometry(0.0115, 10, 8),
    brow: new THREE.BoxGeometry(0.04, 0.007, 0.012),
    fang: new THREE.ConeGeometry(0.0045, 0.022, 5).rotateX(Math.PI),
    mouth: new THREE.BoxGeometry(0.045, 0.004, 0.006),
    shoulder: new THREE.SphereGeometry(0.095, 12, 10),
    upper: new THREE.CylinderGeometry(0.05, 0.058, 0.32, 10).translate(0, -0.16, 0),
    fore: new THREE.CylinderGeometry(0.04, 0.05, 0.29, 10).translate(0, -0.145, 0),
    cuff: new THREE.CylinderGeometry(0.055, 0.045, 0.05, 10),
    hand: new THREE.BoxGeometry(0.065, 0.085, 0.03).translate(0, -0.04, 0),
    claw: new THREE.ConeGeometry(0.0065, 0.085, 5).rotateX(Math.PI).translate(0, -0.04, 0),
  };
  return G;
}

const BASE = {
  coat: new THREE.MeshPhysicalMaterial({ color: 0x0d0a10, roughness: 0.6, sheen: 1, sheenColor: new THREE.Color(0x6a1828), sheenRoughness: 0.45, side: THREE.FrontSide }),
  lining: new THREE.MeshStandardMaterial({ color: 0x8a0c1c, roughness: 0.4, side: THREE.BackSide, emissive: 0x3a0208 }),
  vest: new THREE.MeshStandardMaterial({ color: 0x3a0c14, roughness: 0.45, metalness: 0.1 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xe0d8e4, roughness: 0.42, emissive: 0x2a2232 }),
  hair: new THREE.MeshStandardMaterial({ color: 0x0a080b, roughness: 0.32 }),
  linen: new THREE.MeshStandardMaterial({ color: 0xd8d0c8, roughness: 0.7 }),
  claw: new THREE.MeshStandardMaterial({ color: 0x2a2224, roughness: 0.3, metalness: 0.2 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x050304, roughness: 1 }),
};

export class Vampire extends Enemy {
  constructor(game, pos, opts = {}) {
    super(game);
    this.type = 'stalker';
    this.maxHp = this.hp = opts.hp ?? 120;
    this.speed = opts.speed ?? 2.9;
    this.lungeSpeed = 13;
    this.clawDamage = 15;
    this.lungeDamage = 22;
    this.radius = 0.42;
    this.attackCd = 0;
    this.lungeCd = randRange(1.5, 3);
    this.lungeDir = new V3();
    this.knock = new V3();
    this.hover = 0.14;
    this.lean = 0;
    this.speedNow = 0;
    this.eyeGlow = 1;
    this.hitThisAttack = false;
    this.xp = 12;
    this.build();
    this.pos.copy(pos);
    this.facing = Math.atan2(game.player.pos.x - pos.x, game.player.pos.z - pos.z);
    this.root.rotation.y = this.facing;
    game.scene.add(this.root);
    this.setState('rise');
    this.setDissolve(1, new V3(2.5, 0.2, 1.2));
    game.audio.materialize(pos);
  }

  build() {
    const g = geos();
    const M = (k) => this.mat(BASE[k]);
    const coatM = M('coat'), liningM = M('lining'), vestM = M('vest'), skinM = M('skin'), hairM = M('hair'), linenM = M('linen'), clawM = M('claw'), darkM = M('dark');
    this.skinMat = skinM;
    const body = (this.body = new THREE.Group());
    this.root.add(body);
    const mesh = (geo, mat, parent = body, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    // Плащ с разрезом спереди и багровой подкладкой.
    const coatGeo = new THREE.LatheGeometry(g.coatPts.map(([r, y]) => new V2(r, y)), 30, 0.42, Math.PI * 2 - 0.84);
    this.coatGeo = coatGeo;
    this.coatBase = coatGeo.attributes.position.array.slice();
    mesh(coatGeo, coatM);
    const lining = mesh(coatGeo, liningM);
    lining.scale.setScalar(0.985);
    lining.castShadow = false;
    mesh(g.torso, vestM);
    mesh(g.jabot, linenM, body, 0, 1.36, 0.13);
    mesh(g.collarOut, coatM);
    const collarIn = mesh(g.collarOut, liningM);
    collarIn.scale.setScalar(0.97);
    // Пелерина на плечах — ломает «палочный» силуэт.
    mesh(g.capelet, coatM);
    const capIn = mesh(g.capelet, liningM);
    capIn.scale.setScalar(0.975);
    capIn.castShadow = false;
    mesh(g.neck, skinM, body, 0, 1.53, 0);
    for (const sx of [-1, 1]) mesh(g.shoulder, coatM, body, sx * 0.22, 1.4, 0).scale.set(1, 0.75, 1);

    // Голова.
    const head = (this.head = new THREE.Group());
    head.position.set(0, 1.66, 0.01);
    body.add(head);
    const skull = mesh(g.head, skinM, head);
    skull.scale.set(0.92, 1.2, 1.02);
    const hair = mesh(g.hair, hairM, head, 0, 0.012, -0.008);
    hair.scale.set(0.95, 1.18, 1.06);
    hair.rotation.x = -0.35;
    for (const sx of [-1, 1]) {
      const ear = mesh(g.ear, skinM, head, sx * 0.09, 0.02, -0.01);
      ear.rotation.set(-0.5, 0, -sx * 1.1);
      const brow = mesh(g.brow, hairM, head, sx * 0.034, 0.045, 0.092);
      brow.rotation.z = sx * 0.35;
      mesh(g.fang, linenM, head, sx * 0.013, -0.068, 0.088);
    }
    mesh(g.mouth, darkM, head, 0, -0.06, 0.094);
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 0.6, 0.35) });
    this.eyeMat = eyeMat;
    this.eyes = [-1, 1].map((sx) => {
      const e = new THREE.Mesh(g.eye, eyeMat);
      e.position.set(sx * 0.034, 0.022, 0.088);
      e.scale.set(1.2, 0.75, 0.6);
      head.add(e);
      return e;
    });

    // Руки: плечо → локоть → кисть с когтями.
    this.arms = [-1, 1].map((sx) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(sx * 0.25, 1.4, 0);
      body.add(shoulder);
      mesh(g.upper, coatM, shoulder);
      const elbow = new THREE.Group();
      elbow.position.y = -0.31;
      shoulder.add(elbow);
      mesh(g.fore, coatM, elbow);
      mesh(g.cuff, linenM, elbow, 0, -0.27, 0);
      const hand = mesh(g.hand, skinM, elbow, 0, -0.29, 0);
      for (let i = 0; i < 4; i++) {
        const c = mesh(g.claw, clawM, hand, (i - 1.5) * 0.017, -0.07, 0.005);
        c.rotation.x = 0.25;
        c.scale.y = i === 0 || i === 3 ? 0.8 : 1.1;
      }
      return { shoulder, elbow, hand, sx };
    });

    this.hitSpheres = [
      { local: new V3(0, 1.68, 0.02), r: 0.15, part: 'head', node: body },
      { local: new V3(0, 1.3, 0.0), r: 0.27, part: 'body', node: body },
      { local: new V3(0, 0.95, 0.0), r: 0.27, part: 'body', node: body },
      { local: new V3(0, 0.55, 0.0), r: 0.33, part: 'body', node: body },
    ];
  }

  update(dt) {
    const game = this.game, player = game.player;
    this.stateT += dt;
    this.attackCd -= dt;
    this.lungeCd -= dt;
    this.updateFlash(dt);

    const toP = _v.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const dist = toP.length();
    toP.divideScalar(dist || 1);
    let want = 0;            // желаемая скорость
    let dir = _w.copy(toP);  // желаемое направление
    let face = Math.atan2(toP.x, toP.z);
    let armPose = 'reach';
    let leanTarget = 0;
    const playerAlive = player.alive;

    switch (this.state) {
      case 'rise': {
        const t = clamp(this.stateT / 1.5, 0, 1);
        this.setDissolve(1 - t * t * (3 - 2 * t));
        this.hover = 0.14 - (1 - t) * 0.6;
        armPose = 'spread';
        if (this.stateT === dt) game.fx.ash(this.center(), 0.6);
        if (t >= 1) { this.setDissolve(0); this.setState('stalk'); game.audio.hiss(this.pos); }
        break;
      }
      case 'stalk': {
        // Плетёт зигзаг, чтобы в него было труднее попасть.
        const weave = Math.sin(game.time * 1.4 + this.seed) * (dist > 4 ? 0.75 : 0.3);
        dir.applyAxisAngle(UP, weave);
        want = playerAlive ? this.speed * (game.run?.stats.enemySpeed ?? 1) : -1;
        if (!playerAlive) { dir.negate(); want = 1.2; }
        const los = game.level.lineOfSight(this.pos, player.pos);
        if (playerAlive && dist < 2.1 && this.attackCd <= 0) this.setState('attack');
        else if (playerAlive && dist < 10 && dist > 3.2 && this.lungeCd <= 0 && los) {
          this.setState('windup');
          game.audio.screech(this.pos);
        }
        leanTarget = 0.12;
        break;
      }
      case 'windup': {
        armPose = 'spread';
        want = -0.6;
        leanTarget = -0.25;
        this.eyeGlow = 2.5;
        if (this.stateT > 0.55) {
          // Бросок с упреждением.
          const lead = 0.25;
          this.lungeDir.set(player.pos.x + player.vel.x * lead - this.pos.x, 0, player.pos.z + player.vel.z * lead - this.pos.z).normalize();
          this.setState('lunge');
          this.hitThisAttack = false;
        }
        break;
      }
      case 'lunge': {
        armPose = 'lunge';
        dir.copy(this.lungeDir);
        face = Math.atan2(dir.x, dir.z);
        want = this.lungeSpeed;
        leanTarget = 0.6;
        if (rand() < 0.7) game.fx.smoke.spawn({ x: this.pos.x, y: this.pos.y + 0.5 + rand(), z: this.pos.z, life: 0.6, size: 0.3, size1: 0.9, r: 0.08, g: 0.01, b: 0.03, a: 0.5, drag: 3 });
        if (!this.hitThisAttack && dist < 1.35 && playerAlive) {
          this.hitThisAttack = true;
          if (player.damage(this.lungeDamage * (game.run?.stats.enemyDamage ?? 1), this.pos)) {
            player.vel.addScaledVector(this.lungeDir, 9);
            game.audio.clawSwipe(this.pos);
          }
          this.setState('recover');
        } else if (this.stateT > 0.5) this.setState('recover');
        break;
      }
      case 'attack': {
        armPose = this.stateT < 0.32 ? 'raise' : 'swipe';
        want = 0.8;
        leanTarget = this.stateT < 0.32 ? -0.1 : 0.3;
        if (this.stateT > 0.32 && !this.hitThisAttack) {
          this.hitThisAttack = true;
          game.audio.clawSwipe(this.pos);
          const fwd = Math.atan2(toP.x, toP.z);
          if (dist < 2.4 && Math.abs(angleDiff(this.facing, fwd)) < 1.2 && playerAlive) {
            player.damage(this.clawDamage * (game.run?.stats.enemyDamage ?? 1), this.pos);
            game.hud.clawMarks();
          }
        }
        if (this.stateT > 0.6) this.setState('recover');
        break;
      }
      case 'recover': {
        want = -1.6;
        armPose = 'reach';
        if (this.stateT > 0.75) {
          this.attackCd = randRange(0.6, 1.2);
          this.lungeCd = randRange(2.5, 4.5);
          this.hitThisAttack = false;
          this.setState('stalk');
        }
        break;
      }
      case 'stagger': {
        want = 0;
        armPose = 'flail';
        leanTarget = -0.35;
        if (this.stateT > this.staggerTime) this.setState('stalk');
        break;
      }
      case 'dying': {
        const t = clamp(this.stateT / 1.4, 0, 1);
        this.setDissolve(0.02 + t * 1.0);
        this.hover += dt * 0.35;
        leanTarget = -0.5;
        armPose = 'spread';
        want = 0;
        if (rand() < 0.8) game.fx.ash(this.center(_w).add(new V3(0, (rand() - 0.5) * 1.2, 0)), 0.25);
        if (t >= 1) this.dead = true;
        break;
      }
    }
    if (this.state !== 'windup') this.eyeGlow = damp(this.eyeGlow, 1, 4, dt);

    // Движение.
    this.speedNow = damp(this.speedNow, want, this.state === 'lunge' ? 14 : 5, dt);
    if (this.state !== 'stalk' && this.state !== 'lunge') dir.copy(toP);
    this.vel.x = dir.x * this.speedNow + this.knock.x;
    this.vel.z = dir.z * this.speedNow + this.knock.z;
    this.knock.multiplyScalar(Math.exp(-dt * 6));
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    if (this.state !== 'dying' && this.state !== 'rise') {
      // Не налезать на игрока и друг на друга.
      for (const o of game.enemies.list) {
        if (o === this || !o.alive) continue;
        const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z, d = Math.hypot(dx, dz), m = this.radius + o.radius;
        if (d < m && d > 1e-4) { this.pos.x += (dx / d) * (m - d) * 0.5; this.pos.z += (dz / d) * (m - d) * 0.5; }
      }
      if (dist < 0.85) { this.pos.x -= toP.x * (0.85 - dist); this.pos.z -= toP.z * (0.85 - dist); }
      game.level.resolveCircle(this.pos, this.radius, 0.5);
    }

    if (this.state !== 'dying') this.facing += angleDiff(this.facing, face) * (1 - Math.exp(-dt * (this.state === 'lunge' ? 20 : 7)));
    this.root.rotation.y = this.facing;
    this.lean = damp(this.lean, leanTarget + clamp(this.speedNow / 25, -0.1, 0.4), 6, dt);
    const t = game.time + this.seed;
    this.body.position.y = this.hover + Math.sin(t * 2.1) * 0.05;
    this.body.rotation.x = this.lean;
    this.body.rotation.z = Math.sin(t * 1.3) * 0.03;

    // Голова следит за охотником.
    const headYaw = clamp(angleDiff(this.facing, Math.atan2(toP.x, toP.z)), -0.8, 0.8);
    this.head.rotation.y = damp(this.head.rotation.y, headYaw, 6, dt);
    this.head.rotation.x = damp(this.head.rotation.x, -this.lean * 0.6 + (this.state === 'windup' ? -0.3 : 0), 6, dt);
    const eg = this.eyeGlow * (this.dissolve > 0.5 ? 0 : 1);
    this.eyeMat.color.setRGB(9 * eg, 0.6 * eg, 0.35 * eg);
    for (const e of this.eyes) e.visible = this.dissolve < 0.55;

    this.animateArms(armPose, dt, t);
    this.animateCoat(t);

    // Шлейф тумана у подола.
    if (this.state !== 'dying' && rand() < 0.35) {
      game.fx.smoke.spawn({
        x: this.pos.x + randRange(-0.3, 0.3), y: this.pos.y + 0.1, z: this.pos.z + randRange(-0.3, 0.3),
        vx: -this.vel.x * 0.2, vy: 0.15, vz: -this.vel.z * 0.2,
        life: randRange(1.2, 2.2), size: 0.4, size1: 1.3, r: 0.12, g: 0.05, b: 0.07, a: 0.22, drag: 1.5, spin: randRange(-0.5, 0.5),
      });
    }
  }

  animateArms(pose, dt, t) {
    for (const a of this.arms) {
      const s = a.sx;
      let sx = -0.5, sz = s * 0.12, ex = -0.6;
      if (pose === 'reach') { sx = -0.9 + Math.sin(t * 2 + s) * 0.08; sz = s * 0.18; ex = -0.5; }
      else if (pose === 'spread') { sx = -1.3; sz = s * 1.05; ex = -0.3; }
      else if (pose === 'lunge') { sx = -1.55; sz = s * 0.35; ex = -0.15; }
      else if (pose === 'flail') { sx = -0.4 + Math.sin(t * 20 + s) * 0.4; sz = s * 0.6; ex = -1.0; }
      else if (pose === 'raise') {
        if (s > 0) { sx = -2.6; sz = 0.5; ex = -0.9; } else { sx = -0.6; sz = -0.2; ex = -0.6; }
      } else if (pose === 'swipe') {
        if (s > 0) { sx = -0.7; sz = -0.6; ex = -0.2; } else { sx = -0.6; sz = -0.2; ex = -0.6; }
      }
      const k = pose === 'swipe' ? 30 : pose === 'lunge' ? 14 : 8;
      a.shoulder.rotation.x = damp(a.shoulder.rotation.x, sx, k, dt);
      a.shoulder.rotation.z = damp(a.shoulder.rotation.z, sz, k, dt);
      a.elbow.rotation.x = damp(a.elbow.rotation.x, ex, k, dt);
    }
  }

  // Подол плаща колышется и отстаёт при движении.
  animateCoat(t) {
    const pos = this.coatGeo.attributes.position, base = this.coatBase, arr = pos.array;
    const sp = clamp(this.speedNow / 6, -0.5, 2);
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
      const low = Math.max(0, 1 - y / 1.3);
      const w = low * low;
      if (w <= 0) { arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z; continue; }
      const phi = Math.atan2(x, z);
      const ripple = Math.sin(phi * 3 + t * 4.2 + y * 3) * 0.5 + Math.sin(phi * 5 - t * 6.3) * 0.5;
      const r = 1 + ripple * 0.07 * w + sp * 0.15 * w;
      arr[i * 3] = x * r;
      arr[i * 3 + 1] = y + sp * 0.12 * w;
      arr[i * 3 + 2] = z * r - sp * 0.32 * w;
    }
    pos.needsUpdate = true;
  }

  // Урон: возвращает true, если враг убит.
  takeDamage(amount, info = {}) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flash = 1;
    if (info.dir) this.knock.addScaledVector(_v.set(info.dir.x, 0, info.dir.z).normalize(), info.knockback ?? 2);
    if (this.hp <= 0) { this.die(info); return true; }
    if (this.state !== 'rise' && (info.headshot || amount >= 30 || this.state === 'windup')) {
      this.staggerTime = info.headshot ? 0.45 : 0.25;
      this.setState('stagger');
      this.game.audio.hiss(this.pos);
    }
    return false;
  }

  die() {
    this.alive = false;
    this.setState('dying');
    this.setDissolve(0.02, new V3(7, 1.6, 0.35));
    this.game.audio.vampireDeath(this.pos);
    this.game.fx.ash(this.center(), 2);
    this.game.fx.flash(this.center(), { color: 0xff5020, intensity: 18, dur: 0.6, distance: 8 });
  }
}

const UP = new V3(0, 1, 0);
