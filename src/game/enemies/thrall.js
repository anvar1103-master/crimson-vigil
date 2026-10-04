// Отродье: обращённый крестьянин. Сгорбленный, в лохмотьях, бежит рывками и кусает. Ходит стаями.
import * as THREE from 'three';
import { GroundEnemy } from './enemy.js';
import { randRange, rand, clamp } from '../../core/util.js';

const V3 = THREE.Vector3, V2 = THREE.Vector2;

let G = null;
function geos() {
  if (G) return G;
  const tunic = new THREE.LatheGeometry([[0.3, 0.55], [0.27, 0.75], [0.22, 1.05], [0.24, 1.25], [0.18, 1.38], [0.06, 1.42]].map(([r, y]) => new V2(r, y)), 14);
  // Рваный подол.
  const p = tunic.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.6) p.setY(i, p.getY(i) - Math.random() * 0.18);
  tunic.computeVertexNormals();
  G = {
    tunic,
    head: new THREE.SphereGeometry(0.12, 16, 12),
    jaw: new THREE.BoxGeometry(0.11, 0.04, 0.09),
    eye: new THREE.SphereGeometry(0.014, 6, 4),
    upper: new THREE.CylinderGeometry(0.045, 0.05, 0.32, 8).translate(0, -0.16, 0),
    fore: new THREE.CylinderGeometry(0.035, 0.045, 0.32, 8).translate(0, -0.16, 0),
    hand: new THREE.BoxGeometry(0.07, 0.1, 0.035).translate(0, -0.05, 0),
    thigh: new THREE.CylinderGeometry(0.06, 0.07, 0.42, 8).translate(0, -0.21, 0),
    shin: new THREE.CylinderGeometry(0.045, 0.055, 0.42, 8).translate(0, -0.21, 0),
    foot: new THREE.BoxGeometry(0.09, 0.05, 0.2).translate(0, -0.02, 0.05),
  };
  return G;
}

const BASE = {
  skin: new THREE.MeshStandardMaterial({ color: 0x9a9a8a, roughness: 0.7, emissive: 0x0a0c08 }),
  rags: new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 1, side: THREE.DoubleSide }),
  dark: new THREE.MeshStandardMaterial({ color: 0x0a0605, roughness: 1 }),
};

export class Thrall extends GroundEnemy {
  constructor(game, pos, opts = {}) {
    super(game);
    this.type = 'thrall';
    this.maxHp = this.hp = opts.hp ?? 55;
    this.speed = (opts.speed ?? 3.3) * randRange(0.9, 1.15);
    this.radius = 0.36;
    this.damage = 10;
    this.attackCd = 0;
    this.xp = 6;
    this.build();
    if (opts.elite) this.makeElite();
    this.pos.copy(pos);
    this.facing = this.toPlayer().yaw;
    this.root.rotation.y = this.facing;
    game.scene.add(this.root);
    this.state = 'rise';
    this.setDissolve(1, new V3(1.5, 2.5, 0.6));
    this.root.position.y = -1.6;
  }

  makeElite() {
    this.elite = true;
    this.sizeScale = 1.2;
    this.root.scale.setScalar(1.2);
    this.maxHp = this.hp = this.hp * 2.5;
    this.damage *= 1.5;
    this.setRim(0.5, 0.35, 0.05);
    this.title = 'Вожак';
  }

  build() {
    const g = geos();
    const skin = this.mat(BASE.skin), rags = this.mat(BASE.rags), dark = this.mat(BASE.dark);
    for (const m of this.materials) m.userData.rim.value.set(0.12, 0.16, 0.06);
    const body = (this.body = new THREE.Group());
    body.position.y = 0.9;
    this.root.add(body);
    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    // Торс наклонён вперёд — горб.
    const torso = (this.torso = new THREE.Group());
    torso.rotation.x = 0.5;
    body.add(torso);
    mesh(g.tunic, rags, torso, 0, -0.55, 0);
    const head = (this.head = new THREE.Group());
    head.position.set(0, 0.92, 0.08);
    torso.add(head);
    const skull = mesh(g.head, skin, head);
    skull.scale.set(0.9, 1.1, 1.05);
    this.jaw = mesh(g.jaw, dark, head, 0, -0.1, 0.06);
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 0.5) });
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(g.eye, eyeMat);
      e.position.set(sx * 0.04, 0.02, 0.1);
      head.add(e);
    }
    this.arms = [-1, 1].map((sx) => {
      const sh = new THREE.Group();
      sh.position.set(sx * 0.22, 0.75, 0.02);
      torso.add(sh);
      mesh(g.upper, skin, sh);
      const el = new THREE.Group();
      el.position.y = -0.31;
      sh.add(el);
      mesh(g.fore, skin, el);
      mesh(g.hand, skin, el, 0, -0.31, 0);
      return { sh, el, sx };
    });
    this.legs = [-1, 1].map((sx) => {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.12, 0, 0);
      body.add(hip);
      mesh(g.thigh, rags, hip);
      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);
      mesh(g.shin, skin, knee);
      mesh(g.foot, dark, knee, 0, -0.42, 0);
      return { hip, knee, sx };
    });
    this.hitSpheres = [
      { local: new V3(0, 0.8, 0.5), r: 0.16, part: 'head', node: this.body },
      { local: new V3(0, 0.45, 0.2), r: 0.28, part: 'body', node: this.body },
      { local: new V3(0, -0.1, 0), r: 0.28, part: 'body', node: this.body },
      { local: new V3(0, -0.6, 0), r: 0.25, part: 'body', node: this.body },
    ];
  }

  update(dt) {
    const game = this.game, player = game.player;
    this.stateT += dt;
    this.attackCd -= dt;
    this.updateFlash(dt);
    this.tickStatus(dt);
    if (!this.alive) { this.updateDying(dt); return; }
    const tp = this.toPlayer();
    let want = 0, dirX = tp.dx, dirZ = tp.dz, face = tp.yaw;
    let lunge = 0;
    switch (this.state) {
      case 'rise': {
        // Выкапывается из земли.
        const t = clamp(this.stateT / 1.1, 0, 1);
        this.root.position.y = -1.6 * (1 - t) * (1 - t);
        this.setDissolve(1 - t);
        if (rand() < 0.5) game.fx.smoke.spawn({ x: this.pos.x + randRange(-0.4, 0.4), y: 0.1, z: this.pos.z + randRange(-0.4, 0.4), vy: 0.6, life: 0.8, size: 0.3, size1: 0.8, r: 0.2, g: 0.15, b: 0.1, a: 0.5, drag: 2 });
        if (t >= 1) { this.root.position.y = 0; this.setDissolve(0); this.state = 'chase'; this.stateT = 0; }
        break;
      }
      case 'chase': {
        if (!player.alive) { want = -1.5; break; }
        // Небольшой зигзаг, чтобы стая не шла гуськом.
        const w = Math.sin(game.time * 2 + this.seed) * 0.35;
        const c = Math.cos(w), s = Math.sin(w);
        dirX = tp.dx * c - tp.dz * s; dirZ = tp.dx * s + tp.dz * c;
        want = this.speed * this.speedFactor * (game.run?.zoneMods?.enemySpeed ?? 1);
        if (tp.dist < 1.7 && this.attackCd <= 0) { this.state = 'bite'; this.stateT = 0; this.hit = false; }
        break;
      }
      case 'bite': {
        want = this.stateT < 0.3 ? -0.5 : 4;
        lunge = this.stateT < 0.3 ? -0.3 : 0.5;
        if (this.stateT > 0.35 && !this.hit) {
          this.hit = true;
          if (tp.dist < 1.9) {
            if (player.damage(this.damage * (game.run?.stats.enemyDamage ?? 1), this.pos)) game.audio.clawSwipe(this.pos);
          }
        }
        if (this.stateT > 0.65) { this.state = 'chase'; this.stateT = 0; this.attackCd = randRange(0.8, 1.4); }
        break;
      }
      case 'stagger': {
        want = 0;
        lunge = -0.4;
        if (this.stateT > 0.35) { this.state = 'chase'; this.stateT = 0; }
        break;
      }
    }
    this.locomote(dt, dirX, dirZ, want, 8);
    if (this.state !== 'rise') this.separate();
    this.turnTo(face, 9, dt);
    this.animate(dt, lunge);
  }

  animate(dt, lunge) {
    const ph = this.walkPhase, sp = Math.min(Math.abs(this.speedNow) / 3, 1.3);
    for (const l of this.legs) {
      const s = Math.sin(ph + (l.sx > 0 ? 0 : Math.PI));
      l.hip.rotation.x = s * 0.7 * sp;
      l.knee.rotation.x = Math.max(0, -Math.cos(ph + (l.sx > 0 ? 0 : Math.PI))) * 1.1 * sp;
    }
    for (const a of this.arms) {
      const s = Math.sin(ph + (a.sx > 0 ? Math.PI : 0));
      a.sh.rotation.x = -0.9 + s * 0.5 * sp + lunge * -1.5;
      a.sh.rotation.z = a.sx * (0.2 + Math.abs(lunge) * 0.4);
      a.el.rotation.x = -0.6 - Math.abs(lunge);
    }
    this.body.position.y = 0.9 - Math.abs(Math.sin(ph)) * 0.06 * sp;
    this.torso.rotation.x = 0.5 + lunge * 0.4 + Math.sin(ph * 2) * 0.04 * sp;
    this.head.rotation.x = -0.4 - lunge * 0.3;
    this.jaw.position.y = -0.1 - (this.state === 'bite' ? 0.04 : 0.01 + Math.sin(this.game.time * 9 + this.seed) * 0.01);
  }

  onHurt(amount, info) {
    if (this.state === 'rise') return;
    if (amount >= 15 || info.headshot) { this.state = 'stagger'; this.stateT = 0; }
  }

  onDeath() {
    this.game.audio.burst({ type: 'lowpass', freq: 800, freq1: 200, gain: 0.6, decay: 0.4, pos: this.pos, reverb: 0.4 });
  }
}
