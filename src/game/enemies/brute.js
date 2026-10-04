// Упырь-громила: таранит по прямой (и оглушает себя о стены), бьёт оземь ударной волной.
// На его основе — боссы Мясник Холлоумира и Звонарь.
import * as THREE from 'three';
import { GroundEnemy } from './enemy.js';
import { randRange, rand, clamp, pick } from '../../core/util.js';

const V3 = THREE.Vector3, V2 = THREE.Vector2;

let G = null;
function geos() {
  if (G) return G;
  G = {
    torso: new THREE.SphereGeometry(0.5, 18, 14),
    belly: new THREE.SphereGeometry(0.42, 16, 12),
    head: new THREE.SphereGeometry(0.17, 14, 10),
    jaw: new THREE.BoxGeometry(0.2, 0.07, 0.14),
    eye: new THREE.SphereGeometry(0.02, 6, 4),
    upper: new THREE.CylinderGeometry(0.13, 0.15, 0.55, 10).translate(0, -0.27, 0),
    fore: new THREE.CylinderGeometry(0.15, 0.12, 0.6, 10).translate(0, -0.3, 0),
    fist: new THREE.SphereGeometry(0.16, 10, 8),
    thigh: new THREE.CylinderGeometry(0.15, 0.17, 0.5, 10).translate(0, -0.25, 0),
    shin: new THREE.CylinderGeometry(0.12, 0.14, 0.5, 10).translate(0, -0.25, 0),
    foot: new THREE.BoxGeometry(0.2, 0.1, 0.34).translate(0, -0.04, 0.06),
    apron: new THREE.PlaneGeometry(0.75, 0.95, 4, 6).translate(0, -0.45, 0),
    blade: new THREE.BoxGeometry(0.04, 0.5, 0.75),
    handle: new THREE.CylinderGeometry(0.035, 0.035, 0.35, 8),
    link: new THREE.TorusGeometry(0.05, 0.015, 4, 8),
    bell: new THREE.LatheGeometry([[0.05, 1.3], [0.35, 1.25], [0.5, 1.0], [0.6, 0.45], [0.82, 0.08], [0.85, 0.0], [0.78, 0.0]].map(([r, y]) => new V2(r, y)), 24),
  };
  return G;
}

const BASE = {
  skin: new THREE.MeshStandardMaterial({ color: 0x5e5250, roughness: 0.72, emissive: 0x080404 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.8, side: THREE.DoubleSide }),
  iron: new THREE.MeshStandardMaterial({ color: 0x4a4a50, metalness: 0.9, roughness: 0.45 }),
  bronze: new THREE.MeshStandardMaterial({ color: 0x7a5a2a, metalness: 1, roughness: 0.35, side: THREE.DoubleSide }),
  dark: new THREE.MeshStandardMaterial({ color: 0x0a0605, roughness: 1 }),
};

export class Brute extends GroundEnemy {
  constructor(game, pos, opts = {}) {
    super(game);
    this.type = 'brute';
    this.maxHp = this.hp = opts.hp ?? 380;
    this.speed = opts.speed ?? 2.3;
    this.radius = 0.7;
    this.mass = 3;
    this.armor = 0.85;
    this.slamDamage = 25;
    this.chargeDamage = 28;
    this.waveR = 6.5;
    this.attackCd = 1;
    this.chargeCd = randRange(2, 4);
    this.summonCd = 10;
    this.xp = 40;
    this.weapon = opts.weapon || 'cleaver';
    this.build();
    if (opts.boss) this.makeBoss(opts);
    else if (opts.elite) { this.elite = true; this.maxHp = this.hp = this.hp * 2; this.setRim(0.55, 0.3, 0.05); this.root.scale.setScalar(1.12); this.sizeScale = 1.12; }
    this.pos.copy(pos);
    this.facing = this.toPlayer().yaw;
    game.scene.add(this.root);
    this.state = 'rise';
    this.setDissolve(1, new V3(4, 1.2, 0.3));
    game.audio.tone({ type: 'sawtooth', freq: 70, freq1: 45, gain: 0.5, attack: 0.2, decay: 1.2, pos, reverb: 0.6 });
  }

  makeBoss(opts) {
    this.boss = opts.boss;
    this.sizeScale = opts.boss === 'bellringer' ? 1.55 : 1.5;
    this.root.scale.setScalar(this.sizeScale);
    this.radius *= this.sizeScale;
    this.mass = 8;
    this.armor = 1;
    this.slamDamage = 30;
    this.chargeDamage = 34;
    this.waveR = 13;
    this.speed *= 1.15;
    this.chargeCd = 3;
    this.summonCd = 8;
    this.setRim(0.6, 0.08, 0.05);
    this.xp = 250;
  }

  build() {
    const g = geos();
    const skin = this.mat(BASE.skin), leather = this.mat(BASE.leather), iron = this.mat(BASE.iron), dark = this.mat(BASE.dark), bronze = this.mat(BASE.bronze);
    for (const m of this.materials) m.userData.rim.value.set(0.25, 0.05, 0.04);
    const body = (this.body = new THREE.Group());
    body.position.y = 1.0;
    this.root.add(body);
    const add = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    const torso = (this.torso = new THREE.Group());
    torso.rotation.x = 0.3;
    body.add(torso);
    add(g.torso, skin, torso, 0, 0.72, 0).scale.set(1.2, 1.1, 0.85);
    add(g.belly, skin, torso, 0, 0.3, 0.1).scale.set(1.0, 0.9, 0.95);
    // Горб и наплечник.
    add(g.belly, skin, torso, 0, 1.05, -0.22).scale.set(0.85, 0.7, 0.75);
    const pad = add(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), iron, torso, -0.62, 1.05, 0.02);
    pad.rotation.z = 0.5;
    const apron = add(g.apron, leather, torso, 0, 0.75, 0.43);
    apron.rotation.x = -0.12;
    for (let i = 0; i < 7; i++) { const l = add(g.link, iron, torso, -0.45 + i * 0.15, 0.12, 0.38 - Math.abs(i - 3) * 0.04); l.rotation.y = i % 2 ? Math.PI / 2 : 0; }
    const head = (this.head = new THREE.Group());
    head.position.set(0, 1.2, 0.38);
    torso.add(head);
    add(g.head, skin, head).scale.set(1, 0.85, 1.1);
    this.jaw = add(g.jaw, dark, head, 0, -0.12, 0.08);
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.9, 0.15) });
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(g.eye, eyeMat); e.position.set(sx * 0.055, 0.03, 0.16); e.scale.set(1, 0.6, 1); head.add(e); }
    // Нависшие надбровья.
    add(new THREE.BoxGeometry(0.22, 0.05, 0.08), skin, head, 0, 0.08, 0.13).rotation.x = 0.3;
    this.arms = [-1, 1].map((sx) => {
      const sh = new THREE.Group();
      sh.position.set(sx * 0.62, 0.95, 0.05);
      torso.add(sh);
      add(g.upper, skin, sh);
      const el = new THREE.Group();
      el.position.y = -0.53;
      sh.add(el);
      add(g.fore, skin, el);
      const hand = new THREE.Group();
      hand.position.y = -0.6;
      el.add(hand);
      add(g.fist, skin, hand);
      return { sh, el, hand, sx };
    });
    // Оружие в правой руке: тесак или колокол.
    const hand = this.arms[1].hand;
    if (this.weapon === 'bell') {
      const bell = add(g.bell, bronze, hand, 0, -1.1, 0.2);
      bell.scale.setScalar(1.0);
      this.bell = bell;
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), iron, hand, 0, -0.1, 0);
    } else {
      add(g.handle, leather, hand, 0, -0.1, 0.05).rotation.x = Math.PI / 2;
      const blade = add(g.blade, iron, hand, 0, -0.1, 0.55);
      blade.rotation.x = Math.PI / 2;
      this.blade = blade;
    }
    this.legs = [-1, 1].map((sx) => {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.28, 0.05, 0);
      body.add(hip);
      add(g.thigh, leather, hip);
      const knee = new THREE.Group();
      knee.position.y = -0.5;
      hip.add(knee);
      add(g.shin, skin, knee);
      add(g.foot, dark, knee, 0, -0.5, 0);
      return { hip, knee, sx };
    });
    this.hitSpheres = [
      { local: new V3(0, 1.5, 0.72), r: 0.2, part: 'head', node: body },
      { local: new V3(0, 0.9, 0.25), r: 0.55, part: 'body', node: body },
      { local: new V3(0, 0.35, 0.2), r: 0.5, part: 'body', node: body },
      { local: new V3(0, -0.4, 0), r: 0.4, part: 'body', node: body },
    ];
  }

  update(dt) {
    const game = this.game, p = game.player;
    this.stateT += dt;
    this.attackCd -= dt;
    this.chargeCd -= dt;
    this.summonCd -= dt;
    this.updateFlash(dt);
    this.tickStatus(dt);
    if (!this.alive) { this.updateDying(dt); return; }
    const tp = this.toPlayer();
    let want = 0, dx = tp.dx, dz = tp.dz, face = tp.yaw, turn = 5;
    let pose = 'walk';
    const enraged = this.boss && this.hp < this.maxHp * 0.35;
    const spd = this.speed * this.speedFactor * (enraged ? 1.3 : 1) * (game.run?.zoneMods?.enemySpeed ?? 1);
    switch (this.state) {
      case 'rise': {
        const t = clamp(this.stateT / 1.4, 0, 1);
        this.setDissolve(1 - t);
        if (t >= 1) { this.setDissolve(0); this.state = 'walk'; this.stateT = 0; if (this.boss) this.roar(); }
        break;
      }
      case 'walk': {
        want = p.alive ? spd : 0;
        if (!p.alive) break;
        if (this.boss && this.summonCd <= 0 && this.hp < this.maxHp * 0.8) { this.setState('summon'); break; }
        if (tp.dist < 3.2 * this.sizeScale && this.attackCd <= 0) { this.setState('slamUp'); break; }
        if (this.weapon === 'bell' && this.boss && tp.dist > 7 && this.chargeCd <= 0) { this.setState('leapUp'); this.leapFrom = this.pos.clone(); this.leapTo = p.pos.clone(); break; }
        if (tp.dist > 6 && tp.dist < 18 && this.chargeCd <= 0 && game.level.lineOfSight(this.pos, p.pos)) {
          this.setState('roar');
          this.chargeDir = new V3(tp.dx, 0, tp.dz);
          this.roar();
        }
        break;
      }
      case 'roar': {
        pose = 'roar';
        turn = 10;
        this.chargeDir.set(tp.dx, 0, tp.dz);
        if (this.stateT > 0.85) this.setState('charge');
        break;
      }
      case 'charge': {
        pose = 'charge';
        dx = this.chargeDir.x; dz = this.chargeDir.z; face = Math.atan2(dx, dz); turn = 3;
        want = 11 * (enraged ? 1.15 : 1);
        if (Math.random() < 0.6) game.fx.smoke.spawn({ x: this.pos.x, y: 0.2, z: this.pos.z, vy: 0.5, life: 0.8, size: 0.5, size1: 1.4, r: 0.25, g: 0.18, b: 0.14, a: 0.4, drag: 2 });
        if (tp.dist < 1.6 * this.sizeScale && !this.hitThis) {
          this.hitThis = true;
          if (p.damage(this.chargeDamage * (game.run?.stats.enemyDamage ?? 1), this.pos)) {
            p.vel.addScaledVector(this.chargeDir, 14); p.vel.y = 4; p.onGround = false;
            game.audio.hurt();
          }
        }
        if (this.stateT > 1.5) { this.setState('recover'); this.chargeCd = this.boss ? randRange(3, 5) : randRange(5, 8); }
        break;
      }
      case 'stunned': {
        pose = 'stunned';
        this.armor = 1.4;
        if (Math.random() < 0.3) {
          const c = this.center().add(new V3(0, 1.0 * this.sizeScale, 0));
          game.fx.sparks.spawn({ x: c.x + randRange(-0.3, 0.3), y: c.y, z: c.z + randRange(-0.3, 0.3), vy: 0.5, life: 0.5, size: 0.08, size1: 0, r: 3, g: 2.6, b: 1, a: 1 });
        }
        if (this.stateT > 1.8) { this.armor = this.boss ? 1 : 0.85; this.setState('walk'); }
        break;
      }
      case 'slamUp': {
        pose = 'raise';
        turn = 8;
        if (this.stateT > 0.65) {
          this.setState('slamDown');
          const hp = this.arms[1].hand.localToWorld(new V3(0, -0.5, 0.5));
          this.impact(new V3(hp.x, 0, hp.z));
        }
        break;
      }
      case 'slamDown': {
        pose = 'slam';
        if (this.stateT > 0.6) { this.setState('walk'); this.attackCd = this.boss ? 1.4 : 2.2; }
        break;
      }
      case 'leapUp': {
        // Звонарь прыгает к охотнику и бьёт колоколом при приземлении.
        pose = 'raise';
        const t = clamp(this.stateT / 1.0, 0, 1);
        this.pos.lerpVectors(this.leapFrom, this.leapTo, t);
        this.root.position.y = Math.sin(t * Math.PI) * 6;
        if (t >= 1) { this.root.position.y = 0; this.setState('slamDown'); this.impact(this.pos.clone()); this.chargeCd = 6; }
        break;
      }
      case 'summon': {
        pose = 'roar';
        if (this.stateT === dt) {
          this.roar();
          if (this.weapon === 'bell') this.toll();
        }
        if (this.stateT > 1.2) {
          const n = this.weapon === 'bell' ? 3 : 4;
          for (let i = 0; i < n; i++) game.enemies.spawn('thrall', game.enemies.pickSpawn(), { hp: 55 });
          game.hud.say(this.weapon === 'bell' ? 'Колокол зовёт паству!' : 'Ужин подан, гости дорогие!', this.bossName);
          this.summonCd = enraged ? 11 : 15;
          this.setState('walk');
        }
        break;
      }
      case 'recover': {
        want = 0;
        if (this.stateT > 0.6) this.setState('walk');
        break;
      }
    }
    this.locomote(dt, dx, dz, this.state === 'leapUp' ? 0 : want, this.state === 'charge' ? 10 : 4);
    if (this.state !== 'rise' && this.state !== 'leapUp') {
      const hitWall = this.separate();
      if (this.state === 'charge' && hitWall && this.stateT > 0.25) {
        // Врезался в стену — оглушён.
        this.setState('stunned');
        this.speedNow = 0;
        game.player.addTrauma(0.3);
        game.fx.impact(this.center(), new V3(-this.chargeDir.x, 0.3, -this.chargeDir.z), { big: true });
        game.audio.burst({ type: 'lowpass', freq: 600, freq1: 100, gain: 1.2, decay: 0.5, pos: this.pos, reverb: 0.6 });
        this.chargeCd = randRange(4, 6);
      }
    }
    if (this.state === 'charge' && this.stateT < dt * 1.5) this.hitThis = false;
    this.turnTo(face, turn, dt);
    this.animate(dt, pose);
  }

  impact(at) {
    const game = this.game;
    game.hazards.shockwave(at, { maxR: this.waveR, damage: this.slamDamage * 0.8, speed: this.boss ? 11 : 9 });
    if (this.weapon === 'bell') {
      setTimeout(() => this.alive && game.hazards.shockwave(at, { maxR: this.waveR, damage: this.slamDamage * 0.6, speed: 7, color: 0xffa040 }), 450);
      this.toll(0.6);
    }
    const p = game.player;
    if (p.alive && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < 2.6 * this.sizeScale) p.damage(this.slamDamage * (game.run?.stats.enemyDamage ?? 1), at);
    game.player.addTrauma(this.boss ? 0.55 : 0.35);
    game.audio.burst({ type: 'lowpass', freq: 400, freq1: 60, gain: 1.6, decay: 0.7, pos: at, reverb: 0.8 });
    game.audio.tone({ freq: 55, freq1: 30, gain: 1.2, decay: 0.5, pos: at });
    game.fx.impact(new V3(at.x, 0.1, at.z), new V3(0, 1, 0), { big: true, color: [0.35, 0.28, 0.22] });
  }

  toll(gain = 1) {
    const game = this.game;
    game.audio.bell();
    game.audio.tone({ type: 'sine', freq: 98, gain: 0.5 * gain, decay: 3, reverb: 1.2 });
    // Звон оглушает: охотник замедлен.
    game.player.speedMul = (game.run?.stats.moveSpeed ?? 1) * 0.6;
    game.post.grade.uDamage.value = Math.max(game.post.grade.uDamage.value, 0.4 * gain);
    clearTimeout(this._tollT);
    this._tollT = setTimeout(() => { game.player.speedMul = game.run?.stats.moveSpeed ?? 1; }, 2000);
  }

  roar() {
    this.game.audio.tone({ type: 'sawtooth', freq: 90, freq1: 55, gain: 0.45, attack: 0.1, decay: 1.0, pos: this.pos, reverb: 0.7 });
    this.game.audio.burst({ type: 'bandpass', freq: 300, freq1: 150, q: 1, gain: 0.8, attack: 0.1, decay: 0.9, pos: this.pos, reverb: 0.6 });
  }

  animate(dt, pose) {
    const ph = this.walkPhase, sp = Math.min(Math.abs(this.speedNow) / 2.3, 1.6);
    for (const l of this.legs) {
      const s = Math.sin(ph + (l.sx > 0 ? 0 : Math.PI));
      l.hip.rotation.x = s * 0.5 * sp;
      l.knee.rotation.x = Math.max(0, -Math.cos(ph + (l.sx > 0 ? 0 : Math.PI))) * 0.9 * sp;
    }
    const k = 1 - Math.exp(-dt * (pose === 'slam' ? 25 : 8));
    const set = (a, x, z, e) => { a.sh.rotation.x += (x - a.sh.rotation.x) * k; a.sh.rotation.z += (z - a.sh.rotation.z) * k; a.el.rotation.x += (e - a.el.rotation.x) * k; };
    for (const a of this.arms) {
      const s = Math.sin(ph + (a.sx > 0 ? Math.PI : 0)) * 0.4 * sp;
      if (pose === 'raise') set(a, a.sx > 0 ? -2.8 : -1.2, a.sx * 0.3, -0.6);
      else if (pose === 'slam') set(a, -0.5, a.sx * 0.15, -0.1);
      else if (pose === 'roar') set(a, -1.4, a.sx * 1.2, -1.2);
      else if (pose === 'charge') set(a, -1.6, a.sx * 0.3, -0.3);
      else if (pose === 'stunned') set(a, 0.2 + Math.sin(this.game.time * 6) * 0.2, a.sx * 0.5, -0.2);
      else set(a, -0.3 + s, a.sx * 0.2, -0.5);
    }
    const lean = pose === 'charge' ? 0.7 : pose === 'roar' ? -0.2 : pose === 'stunned' ? -0.3 : 0.3;
    this.torso.rotation.x += (lean - this.torso.rotation.x) * (1 - Math.exp(-dt * 6));
    this.body.position.y = 1.0 - Math.abs(Math.sin(ph)) * 0.05 * sp;
    this.jaw.position.y = pose === 'roar' ? -0.16 : -0.12;
  }

  onHurt(amount, info) {
    if (this.boss || this.state === 'rise' || this.state === 'charge') return;
    if (amount >= 90 || (info.headshot && amount > 60)) { this.setState('recover'); }
  }

  onDeath() {
    this.game.audio.tone({ type: 'sawtooth', freq: 80, freq1: 30, gain: 0.5, decay: 1.5, pos: this.pos, reverb: 0.8 });
    if (this._tollT) {
      clearTimeout(this._tollT);
      this.game.player.speedMul = this.game.run?.stats.moveSpeed ?? 1;
    }
  }
}

export { pick, rand };
