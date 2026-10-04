// Кровавая ведьма: держит дистанцию, швыряет сферы крови, ускользает туманом, если подойти близко.
import * as THREE from 'three';
import { GroundEnemy } from './enemy.js';
import { randRange, rand, clamp } from '../../core/util.js';
import { glowTex } from '../../core/textures.js';

const V3 = THREE.Vector3, V2 = THREE.Vector2;

let G = null;
function geos() {
  if (G) return G;
  const dress = new THREE.LatheGeometry([[0.55, 0.0], [0.45, 0.25], [0.32, 0.6], [0.2, 0.95], [0.16, 1.1], [0.19, 1.3], [0.15, 1.42], [0.05, 1.46]].map(([r, y]) => new V2(r, y)), 28);
  G = {
    dress,
    hair: new THREE.ConeGeometry(0.16, 0.9, 10, 1, true).translate(0, -0.35, 0),
    head: new THREE.SphereGeometry(0.095, 16, 12),
    arm: new THREE.CylinderGeometry(0.03, 0.04, 0.6, 8).translate(0, -0.3, 0),
    hand: new THREE.SphereGeometry(0.04, 8, 6),
    orb: new THREE.SphereGeometry(0.11, 12, 8),
    eye: new THREE.SphereGeometry(0.01, 6, 4),
  };
  return G;
}

const BASE = {
  dress: new THREE.MeshPhysicalMaterial({ color: 0x1a0408, roughness: 0.55, sheen: 1, sheenColor: new THREE.Color(0x8a1020), side: THREE.DoubleSide }),
  skin: new THREE.MeshStandardMaterial({ color: 0xd8d0e0, roughness: 0.45, emissive: 0x2a2030 }),
  hair: new THREE.MeshStandardMaterial({ color: 0x1a1012, roughness: 0.5, side: THREE.DoubleSide }),
};

export class Witch extends GroundEnemy {
  constructor(game, pos, opts = {}) {
    super(game);
    this.type = 'witch';
    this.maxHp = this.hp = opts.hp ?? 85;
    this.speed = 2.6;
    this.radius = 0.4;
    this.castCd = randRange(1.5, 2.5);
    this.blinkCd = 0;
    this.xp = 15;
    this.volley = opts.volley ?? 1;
    this.build();
    if (opts.elite) { this.elite = true; this.volley = 3; this.maxHp = this.hp = this.hp * 2.2; this.setRim(0.5, 0.05, 0.4); this.root.scale.setScalar(1.12); this.sizeScale = 1.12; }
    this.pos.copy(pos);
    this.facing = this.toPlayer().yaw;
    game.scene.add(this.root);
    this.state = 'rise';
    this.setDissolve(1, new V3(4, 0.3, 1.5));
    game.audio.materialize(pos);
  }

  build() {
    const g = geos();
    const dress = this.mat(BASE.dress), skin = this.mat(BASE.skin), hair = this.mat(BASE.hair);
    this.dressGeo = g.dress.clone();
    this.dressBase = this.dressGeo.attributes.position.array.slice();
    const body = (this.body = new THREE.Group());
    this.root.add(body);
    const add = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    add(this.dressGeo, dress, body);
    add(g.head, skin, body, 0, 1.58, 0.01).scale.set(0.9, 1.15, 1);
    add(g.hair, hair, body, 0, 1.66, -0.04).rotation.x = 0.12;
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.4, 1.2) });
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(g.eye, eyeMat); e.position.set(sx * 0.03, 1.6, 0.085); body.add(e); }
    this.arms = [-1, 1].map((sx) => {
      const sh = new THREE.Group();
      sh.position.set(sx * 0.17, 1.38, 0);
      body.add(sh);
      add(g.arm, skin, sh);
      add(g.hand, skin, sh, 0, -0.62, 0);
      return { sh, sx };
    });
    this.orb = new THREE.Mesh(g.orb, new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.2, 0.3) }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(2, 0.05, 0.1), blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(1.2);
    this.orb.add(glow);
    this.orb.position.set(0, 1.55, 0.45);
    this.orb.visible = false;
    body.add(this.orb);
    this.hitSpheres = [
      { local: new V3(0, 1.58, 0), r: 0.13, part: 'head', node: body },
      { local: new V3(0, 1.2, 0), r: 0.22, part: 'body', node: body },
      { local: new V3(0, 0.75, 0), r: 0.28, part: 'body', node: body },
      { local: new V3(0, 0.3, 0), r: 0.38, part: 'body', node: body },
    ];
  }

  update(dt) {
    const game = this.game, p = game.player;
    this.stateT += dt;
    this.castCd -= dt;
    this.blinkCd -= dt;
    this.updateFlash(dt);
    this.tickStatus(dt);
    if (!this.alive) { this.updateDying(dt); this.animateDress(game.time, 0); return; }
    const tp = this.toPlayer();
    let want = 0, dx = tp.dx, dz = tp.dz;
    let castPose = 0;
    switch (this.state) {
      case 'rise': {
        const t = clamp(this.stateT / 1.2, 0, 1);
        this.setDissolve(1 - t);
        if (t >= 1) { this.setDissolve(0); this.state = 'keep'; this.stateT = 0; }
        break;
      }
      case 'keep': {
        // Держит дистанцию 9–13 м, обходит по дуге.
        const side = Math.sin(game.time * 0.6 + this.seed) > 0 ? 1 : -1;
        if (tp.dist < 8) { dx = -tp.dx; dz = -tp.dz; want = this.speed; }
        else if (tp.dist > 14) want = this.speed;
        else { dx = -tp.dz * side; dz = tp.dx * side; want = this.speed * 0.7; }
        if (tp.dist < 4.5 && this.blinkCd <= 0) { this.blink(); break; }
        if (this.castCd <= 0 && p.alive && tp.dist < 26 && game.level.lineOfSight(this.pos, p.pos)) {
          this.state = 'cast'; this.stateT = 0;
          game.audio.tone({ type: 'sawtooth', freq: 180, freq1: 520, gain: 0.12, attack: 0.5, decay: 0.3, pos: this.pos, reverb: 0.6 });
        }
        break;
      }
      case 'cast': {
        castPose = Math.min(1, this.stateT / 0.5);
        this.orb.visible = true;
        this.orb.scale.setScalar(0.4 + castPose * 0.8);
        if (this.stateT > 0.75) {
          this.orb.visible = false;
          const from = this.body.localToWorld(new V3(0, 1.55, 0.45));
          const to = new V3(p.pos.x, p.pos.y + 1.3, p.pos.z);
          const base = to.sub(from).normalize();
          for (let i = 0; i < this.volley; i++) {
            const d = base.clone().applyAxisAngle(new V3(0, 1, 0), (i - (this.volley - 1) / 2) * 0.25);
            game.hazards.orb(from, d, { speed: 9.5, damage: 13, homing: this.volley > 1 ? 0.5 : 1.3 });
          }
          game.audio.burst({ type: 'lowpass', freq: 600, freq1: 2400, gain: 0.5, decay: 0.25, pos: this.pos });
          this.state = 'keep'; this.stateT = 0; this.castCd = randRange(2.2, 3.4);
        }
        break;
      }
      case 'stagger': {
        if (this.stateT > 0.3) { this.state = 'keep'; this.stateT = 0; this.orb.visible = false; }
        break;
      }
    }
    this.locomote(dt, dx, dz, want * this.speedFactor, 4);
    if (this.state !== 'rise') this.separate();
    this.turnTo(tp.yaw, 6, dt);
    this.body.position.y = 0.12 + Math.sin(game.time * 1.7 + this.seed) * 0.06;
    for (const a of this.arms) {
      a.sh.rotation.x = -0.3 - castPose * 1.1 + Math.sin(game.time * 2 + a.sx) * 0.05;
      a.sh.rotation.z = a.sx * (0.25 + castPose * 0.2);
    }
    this.animateDress(game.time, this.speedNow);
  }

  animateDress(t, speed) {
    const pos = this.dressGeo.attributes.position, b = this.dressBase, arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const x = b[i * 3], y = b[i * 3 + 1], z = b[i * 3 + 2];
      const w = Math.max(0, 1 - y / 1.0) ** 2;
      const phi = Math.atan2(x, z);
      const r = 1 + (Math.sin(phi * 4 + t * 3 + y * 4) * 0.08 + Math.sin(phi * 7 - t * 5) * 0.04) * w;
      arr[i * 3] = x * r; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z * r - speed * 0.06 * w;
    }
    pos.needsUpdate = true;
  }

  blink() {
    const game = this.game, p = game.player;
    this.blinkCd = 4;
    game.fx.ash(this.center(), 1.2);
    game.audio.materialize(this.pos);
    const a = Math.random() * Math.PI * 2;
    this.pos.set(p.pos.x + Math.cos(a) * 11, 0, p.pos.z + Math.sin(a) * 11);
    game.level.resolveCircle(this.pos, this.radius, 0.5);
    this.state = 'rise'; this.stateT = 0.6;
    this.setDissolve(0.5, new V3(4, 0.3, 1.5));
  }

  onHurt(amount, info) {
    if (this.state === 'rise') return;
    if (info.headshot || amount > 40) { this.state = 'stagger'; this.stateT = 0; this.orb.visible = false; }
  }

  onDeath() {
    this.orb.visible = false;
    this.game.audio.vampireDeath(this.pos);
  }

  updateDying(dt) {
    // Ведьма не падает — растворяется стоя.
    this.dying += dt;
    this.setDissolve(0.02 + this.dying / 1.2);
    if (Math.random() < 0.6) this.game.fx.ash(this.center(), 0.2);
    if (this.dying > 1.2) this.dead = true;
  }

  dispose() { super.dispose(); this.dressGeo.dispose(); }
}

export { rand };
