// Вурдалачий волк: быстрый, охотится стаей. Кружит вокруг охотника и бросается в прыжке.
import * as THREE from 'three';
import { GroundEnemy } from './enemy.js';
import { randRange, rand, clamp } from '../../core/util.js';

const V3 = THREE.Vector3;

let G = null;
function geos() {
  if (G) return G;
  const body = new THREE.CapsuleGeometry(0.2, 0.6, 6, 12).rotateX(Math.PI / 2);
  G = {
    body,
    chest: new THREE.SphereGeometry(0.26, 12, 10),
    head: new THREE.SphereGeometry(0.15, 12, 10),
    snout: new THREE.ConeGeometry(0.08, 0.26, 8).rotateX(Math.PI / 2),
    ear: new THREE.ConeGeometry(0.045, 0.13, 5),
    eye: new THREE.SphereGeometry(0.02, 6, 4),
    upper: new THREE.CylinderGeometry(0.05, 0.065, 0.3, 7).translate(0, -0.15, 0),
    lower: new THREE.CylinderGeometry(0.03, 0.04, 0.3, 6).translate(0, -0.15, 0),
    tail: new THREE.ConeGeometry(0.07, 0.5, 6).rotateX(-Math.PI / 2 - 0.5).translate(0, 0, -0.2),
    mane: new THREE.ConeGeometry(0.05, 0.18, 4),
  };
  return G;
}

const BASE = {
  fur: new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.95 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x0c0a0a, roughness: 1 }),
};

export class Wolf extends GroundEnemy {
  constructor(game, pos, opts = {}) {
    super(game);
    this.type = 'wolf';
    this.maxHp = this.hp = opts.hp ?? 45;
    this.speed = (opts.speed ?? 6.2) * randRange(0.9, 1.1);
    this.radius = 0.45;
    this.damage = 11;
    this.xp = 8;
    this.orbit = rand() < 0.5 ? 1 : -1;
    this.pounceCd = randRange(1.5, 3.5);
    this.build();
    if (opts.elite) { this.elite = true; this.maxHp = this.hp = this.hp * 2.5; this.damage *= 1.5; this.root.scale.setScalar(1.25); this.sizeScale = 1.25; this.setRim(0.5, 0.3, 0.05); }
    this.pos.copy(pos);
    this.facing = this.toPlayer().yaw;
    game.scene.add(this.root);
    this.state = 'rise';
    this.setDissolve(1, new V3(2, 1.4, 0.3));
    this.howl();
  }

  howl() {
    const a = this.game.audio;
    a.tone({ type: 'sawtooth', freq: 340, freq1: 520, gain: 0.08, attack: 0.3, decay: 1.2, pos: this.pos, reverb: 0.9 });
  }

  build() {
    const g = geos();
    const fur = this.mat(BASE.fur), dark = this.mat(BASE.dark);
    for (const m of this.materials) m.userData.rim.value.set(0.25, 0.06, 0.05);
    const body = (this.body = new THREE.Group());
    body.position.y = 0.68;
    this.root.add(body);
    const add = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    add(g.body, fur, body);
    add(g.chest, fur, body, 0, 0.04, 0.32).scale.set(1, 1.1, 1);
    for (let i = 0; i < 5; i++) { const m = add(g.mane, dark, body, 0, 0.25, 0.3 - i * 0.12); m.rotation.x = -0.6; }
    const head = (this.head = new THREE.Group());
    head.position.set(0, 0.2, 0.55);
    body.add(head);
    add(g.head, fur, head);
    add(g.snout, dark, head, 0, -0.04, 0.17);
    for (const sx of [-1, 1]) {
      const e = add(g.ear, fur, head, sx * 0.08, 0.13, -0.03); e.rotation.z = -sx * 0.25;
      const eye = new THREE.Mesh(g.eye, new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.2, 0.4) }));
      eye.position.set(sx * 0.06, 0.04, 0.12); head.add(eye);
    }
    this.tail = add(g.tail, fur, body, 0, 0.08, -0.42);
    this.legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.14, -0.05, sz * 0.32);
      body.add(hip);
      add(g.upper, fur, hip);
      const knee = new THREE.Group(); knee.position.y = -0.3; hip.add(knee);
      add(g.lower, dark, knee);
      return { hip, knee, sx, sz };
    });
    this.hitSpheres = [
      { local: new V3(0, 0.2, 0.6), r: 0.17, part: 'head', node: body },
      { local: new V3(0, 0, 0.25), r: 0.3, part: 'body', node: body },
      { local: new V3(0, 0, -0.25), r: 0.28, part: 'body', node: body },
    ];
  }

  center(out = new V3()) { return out.set(this.pos.x, this.pos.y + 0.7 * this.sizeScale, this.pos.z); }

  update(dt) {
    const game = this.game, p = game.player;
    this.stateT += dt;
    this.pounceCd -= dt;
    this.updateFlash(dt);
    this.tickStatus(dt);
    if (!this.alive) { this.updateDying(dt); return; }
    const tp = this.toPlayer();
    let want = 0, dx = tp.dx, dz = tp.dz, face = tp.yaw;
    switch (this.state) {
      case 'rise': {
        const t = clamp(this.stateT / 0.8, 0, 1);
        this.setDissolve(1 - t);
        if (t >= 1) { this.setDissolve(0); this.state = 'circle'; this.stateT = 0; }
        break;
      }
      case 'circle': {
        if (!p.alive) { want = 0; break; }
        // Кружит на дистанции 5–7 м, потом бросается.
        const tangent = new V3(-tp.dz * this.orbit, 0, tp.dx * this.orbit);
        const radial = tp.dist > 7 ? 1 : tp.dist < 5 ? -0.8 : 0;
        dx = tangent.x + tp.dx * radial; dz = tangent.z + tp.dz * radial;
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        face = Math.atan2(dx, dz);
        want = this.speed * this.speedFactor;
        if (this.pounceCd <= 0 && tp.dist < 9) { this.state = 'crouch'; this.stateT = 0; game.audio.burst({ type: 'lowpass', freq: 300, gain: 0.4, attack: 0.2, decay: 0.3, pos: this.pos }); }
        break;
      }
      case 'crouch': {
        want = 0;
        if (this.stateT > 0.35) {
          this.state = 'leap'; this.stateT = 0; this.hit = false;
          this.leapDir = new V3(tp.dx, 0, tp.dz);
          this.leapFrom = this.pos.clone();
          this.leapDist = Math.min(tp.dist + 1, 9);
          game.audio.burst({ type: 'bandpass', freq: 700, freq1: 300, q: 2, gain: 0.5, decay: 0.25, pos: this.pos });
        }
        break;
      }
      case 'leap': {
        // Дуга прыжка.
        const t = clamp(this.stateT / 0.55, 0, 1);
        this.pos.copy(this.leapFrom).addScaledVector(this.leapDir, this.leapDist * t);
        this.root.position.y = Math.sin(t * Math.PI) * 1.2;
        face = Math.atan2(this.leapDir.x, this.leapDir.z);
        if (!this.hit && tp.dist < 1.4) {
          this.hit = true;
          if (p.damage(this.damage * (game.run?.stats.enemyDamage ?? 1), this.pos)) game.audio.clawSwipe(this.pos);
        }
        if (t >= 1) { this.root.position.y = 0; this.state = 'circle'; this.stateT = 0; this.pounceCd = randRange(2, 4); this.orbit *= rand() < 0.4 ? -1 : 1; }
        break;
      }
      case 'stagger': {
        if (this.stateT > 0.3) { this.state = 'circle'; this.stateT = 0; }
        break;
      }
    }
    if (this.state !== 'leap') {
      this.locomote(dt, dx, dz, want, 6);
      if (this.state !== 'rise') this.separate();
    } else {
      game.level.resolveCircle(this.pos, this.radius, 0.5);
    }
    this.turnTo(face, 10, dt);
    this.animate(dt);
  }

  animate(dt) {
    const ph = this.walkPhase * 1.4, sp = Math.min(Math.abs(this.speedNow) / 5, 1.2);
    const leap = this.state === 'leap', crouch = this.state === 'crouch';
    for (const l of this.legs) {
      const off = (l.sx > 0 ? 0 : Math.PI) + (l.sz > 0 ? 0 : Math.PI / 2);
      const target = leap ? l.sz * -0.9 : Math.sin(ph + off) * 0.7 * sp;
      l.hip.rotation.x += (target - l.hip.rotation.x) * Math.min(1, dt * 20);
      l.knee.rotation.x = leap ? l.sz * 0.6 : Math.max(0, Math.cos(ph + off)) * 0.8 * sp * (l.sz > 0 ? -1 : 1);
    }
    this.body.position.y = (crouch ? 0.5 : 0.68) + Math.abs(Math.sin(ph)) * 0.04 * sp;
    this.body.rotation.x = crouch ? 0.15 : leap ? -0.2 : 0;
    this.tail.rotation.y = Math.sin(this.game.time * 8 + this.seed) * 0.3;
    this.head.rotation.x = crouch ? 0.25 : 0;
  }

  onHurt(amount, info) {
    if (this.state === 'rise' || this.state === 'leap') return;
    this.state = 'stagger'; this.stateT = 0;
    this.game.audio.tone({ type: 'sawtooth', freq: 900, freq1: 500, gain: 0.1, decay: 0.2, pos: this.pos });
  }
}
