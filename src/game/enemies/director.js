// Менеджер врагов и «режиссёр» волн: кого, где и когда выпускать.
import * as THREE from 'three';
import { Vampire } from './vampire.js';
import { rand } from '../../core/util.js';

const V3 = THREE.Vector3;

export const ENEMY_TYPES = {
  stalker: (game, pos, o) => new Vampire(game, pos, o),
};

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.director = { enabled: false };
  }

  spawn(type, pos, opts = {}) {
    const make = ENEMY_TYPES[type] || ENEMY_TYPES.stalker;
    const e = make(this.game, pos, opts);
    this.list.push(e);
    return e;
  }

  get alive() { let n = 0; for (const e of this.list) if (e.alive) n++; return n; }

  raycastAll(origin, dir, far) {
    const out = [];
    for (const e of this.list) {
      if (!e.alive) continue;
      const h = e.raycast(origin, dir, far);
      if (h) { h.enemy = e; out.push(h); }
    }
    return out.sort((a, b) => a.t - b.t);
  }

  nearest(pos, maxDist = Infinity, exclude = null) {
    let best = null, bd = maxDist;
    for (const e of this.list) {
      if (!e.alive || e === exclude) continue;
      const d = e.pos.distanceTo(pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
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
      const score = behind * 3 - Math.abs(d - 15) * 0.3 + rand() * 4;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return (best || game.level.spawnPoints[0]).clone();
  }

  // config: { waves, tier, elite, countMul, boss }
  startWaves(config = {}) {
    this.director = {
      enabled: true, wave: 0, toSpawn: 0, spawnTimer: 2.5, breakTimer: 1.5, queue: [],
      waves: config.waves ?? 99, tier: config.tier ?? 0, elite: !!config.elite, countMul: config.countMul ?? 1, boss: config.boss || null, bossName: config.bossName,
    };
  }

  stop() { this.director.enabled = false; }

  // Состав волны: кто именно выходит. Позже сюда добавятся новые виды тварей.
  composeWave(d) {
    const n = Math.round((2 + d.wave + Math.floor(d.tier * 0.7)) * d.countMul);
    const out = [];
    for (let i = 0; i < n; i++) {
      const elite = d.elite ? i < 1 + Math.floor(d.wave / 2) : rand() < Math.min(0.04 + d.tier * 0.03, 0.25);
      out.push({ type: 'stalker', elite });
    }
    return out;
  }

  update(dt) {
    const game = this.game;
    for (const e of this.list) e.update(dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].dead) { this.list[i].dispose(); this.list.splice(i, 1); }
    }
    const d = this.director;
    if (!d.enabled || !game.player.alive) return;
    const stats = { hp: 1 + d.tier * 0.12, speed: Math.min(1 + d.tier * 0.03, 1.35) * (game.run.zoneMods?.enemySpeed ?? 1) };

    if (d.boss) {
      if (!d.bossSpawned) {
        d.breakTimer -= dt;
        if (d.breakTimer > 0) return;
        d.bossSpawned = true;
        const pos = game.level.bossPoint?.clone() || this.pickSpawn();
        this.bossEnemy = this.spawn('stalker', pos, { boss: d.boss, hp: 900 * stats.hp, speed: 3.2 * stats.speed, tier: d.tier });
        this.bossEnemy.bossName = d.bossName;
        game.hud.showBoss(this.bossEnemy);
        game.audio.bell();
        d.adds = 0;
        return;
      }
      // Босс иногда призывает свиту.
      d.spawnTimer -= dt;
      if (this.bossEnemy.alive && d.spawnTimer <= 0 && this.alive < 4) {
        d.spawnTimer = 9;
        this.spawn('stalker', this.pickSpawn(), { hp: 110 * stats.hp, speed: 2.8 * stats.speed });
      }
      if (!this.bossEnemy.alive && this.alive === 0) {
        d.enabled = false;
        game.hud.showBoss(null);
        game.zones.onCleared();
      }
      return;
    }

    if (d.breakTimer > 0) {
      d.breakTimer -= dt;
      if (d.breakTimer <= 0) {
        if (d.wave >= d.waves) {
          d.enabled = false;
          game.zones.onCleared();
          return;
        }
        d.wave++;
        game.run.wave++;
        d.queue = this.composeWave(d);
        d.maxAlive = Math.min(2 + Math.floor((d.wave + d.tier) / 2), 6);
        d.spawnTimer = 0.8;
        game.hud.banner(`Волна ${toRoman(d.wave)}${d.waves < 99 ? ` из ${toRoman(d.waves)}` : ''}`, d.wave === 1 ? pickOne(['Они вышли на охоту', 'Тени шевелятся', 'Слышишь шёпот?']) : 'Ночь сгущается');
      }
      return;
    }
    if (d.queue.length) {
      d.spawnTimer -= dt;
      if (d.spawnTimer <= 0 && this.alive < d.maxAlive) {
        const s = d.queue.shift();
        this.spawn(s.type, this.pickSpawn(), {
          hp: (s.elite ? 280 : 110) * stats.hp, speed: 2.75 * stats.speed, elite: s.elite,
        });
        d.spawnTimer = Math.max(0.9, 2.8 - d.tier * 0.2);
      }
    } else if (this.alive === 0) {
      d.breakTimer = d.wave >= d.waves ? 1.2 : 4;
      if (d.wave < d.waves) game.hud.banner('Затишье', 'Ненадолго…');
      game.onWaveCleared(d.wave);
    }
  }

  clear() {
    for (const e of this.list) e.dispose();
    this.list = [];
    this.director = { enabled: false };
    this.bossEnemy = null;
  }
}

function pickOne(a) { return a[Math.floor(Math.random() * a.length)]; }

export function toRoman(n) {
  const map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of map) while (n >= v) { s += r; n -= v; }
  return s;
}

export { V3 };
