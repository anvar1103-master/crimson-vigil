// Менеджер врагов и «режиссёр» волн: кого, где и когда выпускать.
import * as THREE from 'three';
import { Vampire } from './vampire.js';
import { rand } from '../../core/util.js';

const V3 = THREE.Vector3;

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.director = { enabled: false, wave: 0, toSpawn: 0, spawnTimer: 0, maxAlive: 2, breakTimer: 0 };
  }

  spawn(type, pos, opts) {
    const e = new Vampire(this.game, pos, opts);
    this.list.push(e);
    return e;
  }

  get alive() { return this.list.filter((e) => e.alive).length; }

  raycastAll(origin, dir, far) {
    const out = [];
    for (const e of this.list) {
      if (!e.alive) continue;
      const h = e.raycast(origin, dir, far);
      if (h) { h.enemy = e; out.push(h); }
    }
    return out.sort((a, b) => a.t - b.t);
  }

  // Точка появления: подальше от охотника и желательно за его спиной.
  pickSpawn() {
    const game = this.game, p = game.player.pos;
    const fwd = game.player.forward();
    let best = null, bestScore = -Infinity;
    for (const s of game.level.spawnPoints) {
      const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz);
      if (d < 8) continue;
      const behind = -(dx * fwd.x + dz * fwd.z) / d;
      const score = behind * 4 - Math.abs(d - 15) * 0.3 + rand() * 3;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return (best || game.level.spawnPoints[0]).clone();
  }

  startWaves() {
    Object.assign(this.director, { enabled: true, wave: 0, toSpawn: 0, spawnTimer: 2.5, breakTimer: 0.01 });
  }

  update(dt) {
    for (const e of this.list) e.update(dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].dead) { this.list[i].dispose(); this.list.splice(i, 1); }
    }
    const d = this.director, game = this.game;
    if (!d.enabled || !game.player.alive) return;
    if (d.breakTimer > 0) {
      d.breakTimer -= dt;
      if (d.breakTimer <= 0) {
        d.wave++;
        game.run.wave = d.wave;
        d.toSpawn = 1 + d.wave * 2;
        d.maxAlive = Math.min(1 + Math.ceil(d.wave / 1.5), 5);
        d.spawnTimer = 1.0;
        game.hud.banner(`Волна ${toRoman(d.wave)}`, d.wave === 1 ? 'Они вышли на охоту' : 'Ночь сгущается');
      }
      return;
    }
    if (d.toSpawn > 0) {
      d.spawnTimer -= dt;
      if (d.spawnTimer <= 0 && this.alive < d.maxAlive) {
        this.spawn('stalker', this.pickSpawn(), { hp: 110 + d.wave * 10, speed: 2.7 + Math.min(d.wave * 0.12, 1) });
        d.toSpawn--;
        d.spawnTimer = Math.max(1.2, 3.5 - d.wave * 0.25);
      }
    } else if (this.alive === 0) {
      d.breakTimer = 5;
      game.hud.banner('Тишина', 'Ненадолго…');
      game.onWaveCleared(d.wave);
    }
  }

  clear() {
    for (const e of this.list) e.dispose();
    this.list = [];
  }
}

export function toRoman(n) {
  const map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of map) while (n >= v) { s += r; n -= v; }
  return s;
}

export { V3 };
