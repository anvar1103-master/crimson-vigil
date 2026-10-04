// Менеджер врагов и «режиссёр» волн: кого, где и когда выпускать.
import * as THREE from 'three';
import { Vampire, Sovereign } from './vampire.js';
import { Thrall } from './thrall.js';
import { Bat, Broodmother } from './bat.js';
import { Witch } from './witch.js';
import { Brute } from './brute.js';
import { rand } from '../../core/util.js';

const V3 = THREE.Vector3;

export const ENEMY_TYPES = {
  stalker: (game, pos, o) => new Vampire(game, pos, o),
  thrall: (game, pos, o) => new Thrall(game, pos, o),
  bat: (game, pos, o) => new Bat(game, pos, o),
  witch: (game, pos, o) => new Witch(game, pos, o),
  brute: (game, pos, o) => new Brute(game, pos, o),
};

// Боссы биомов.
const BOSSES = {
  butcher: (game, pos, hp) => new Brute(game, pos, { boss: 'butcher', hp: 1500 * hp, weapon: 'cleaver' }),
  broodmother: (game, pos, hp) => new Broodmother(game, pos, { boss: 'broodmother', hp: 1250 * hp }),
  bellringer: (game, pos, hp) => new Brute(game, pos, { boss: 'bellringer', hp: 1800 * hp, weapon: 'bell' }),
  sovereign: (game, pos, hp) => new Sovereign(game, pos, { hp: 2600 * hp, speed: 3.3 }),
};

// Состав тварей по биомам: [тип, стоимость, вес, минимальный уровень угрозы].
const ROSTER = {
  village: [['thrall', 1, 6, 0], ['stalker', 2.5, 2, 0], ['bat', 0.7, 0.8, 0.5], ['brute', 6, 1, 1.5]],
  forest: [['bat', 0.7, 2.5, 0], ['stalker', 2.5, 2, 0], ['witch', 3, 1.6, 0], ['thrall', 1, 1.5, 0], ['brute', 6, 0.5, 3]],
  cathedral: [['stalker', 2.5, 3, 0], ['witch', 3, 1.6, 0], ['thrall', 1, 2, 0], ['bat', 0.7, 1, 0], ['brute', 6, 0.7, 3]],
  castle: [['stalker', 2.5, 3, 0], ['witch', 3, 2, 0], ['brute', 6, 1.2, 0], ['bat', 0.7, 1, 0], ['thrall', 1, 1, 0]],
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

  // Состав волны: «бюджет угрозы» тратится на тварей из ростера биома.
  composeWave(d) {
    const biome = this.game.run.biomeDef?.id || 'cathedral';
    const roster = (ROSTER[biome] || ROSTER.cathedral).filter((r) => d.tier + d.wave * 0.5 >= r[3]);
    let budget = (3.5 + d.wave * 2.2 + d.tier * 1.7) * d.countMul;
    const out = [];
    let elites = d.elite ? 1 + Math.floor(d.wave / 2) : 0;
    let guard = 0;
    while (budget > 0.6 && guard++ < 60) {
      const total = roster.reduce((a, r) => a + r[2], 0);
      let x = rand() * total, i = 0;
      while (x > roster[i][2]) { x -= roster[i][2]; i++; }
      const [type, cost] = roster[i];
      if (cost > budget + 1) continue;
      const elite = type !== 'bat' && (elites-- > 0 || rand() < Math.min(0.03 + d.tier * 0.025, 0.2));
      if (type === 'bat') { for (let k = 0; k < 3; k++) out.push({ type, elite: false }); }
      else out.push({ type, elite });
      budget -= type === 'bat' ? cost * 3 : cost * (elite ? 2 : 1);
    }
    // Сначала мясо, потом сильные — волна нарастает.
    return out.sort((a, b) => (a.type === 'brute') - (b.type === 'brute'));
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
        const make = BOSSES[d.boss];
        this.bossEnemy = make ? make(game, pos, stats.hp) : new Vampire(game, pos, { boss: d.boss, hp: 1200 * stats.hp });
        this.list.push(this.bossEnemy);
        this.bossEnemy.bossName = d.bossName;
        game.hud.showBoss(this.bossEnemy);
        game.audio.bell();
        d.adds = 0;
        return;
      }
      // Свиту боссы призывают сами; здесь — только редкая подмога для Суверена.
      d.spawnTimer -= dt;
      if (d.boss === 'sovereign' && this.bossEnemy.alive && d.spawnTimer <= 0 && this.alive < 4) {
        d.spawnTimer = 14;
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
        d.maxAlive = Math.min(3 + Math.floor((d.wave + d.tier) / 1.5), 9);
        d.spawnTimer = 0.8;
        game.hud.banner(`Волна ${toRoman(d.wave)}${d.waves < 99 ? ` из ${toRoman(d.waves)}` : ''}`, d.wave === 1 ? pickOne(['Они вышли на охоту', 'Тени шевелятся', 'Слышишь шёпот?']) : 'Ночь сгущается');
      }
      return;
    }
    if (d.queue.length) {
      d.spawnTimer -= dt;
      if (d.spawnTimer <= 0 && this.alive < d.maxAlive) {
        const s = d.queue.shift();
        const base = { stalker: 110, thrall: 55, bat: 16, witch: 85, brute: 380 }[s.type] ?? 100;
        const at = this.pickSpawn();
        this.spawn(s.type, at, {
          hp: base * (s.elite && s.type === 'stalker' ? 2.5 : 1) * stats.hp,
          speed: s.type === 'stalker' ? 2.75 * stats.speed : undefined, elite: s.elite,
        });
        // Летучие мыши вылетают стаей из одной точки.
        while (s.type === 'bat' && d.queue[0]?.type === 'bat' && this.alive < d.maxAlive + 2) {
          d.queue.shift();
          this.spawn('bat', at.clone().add(new V3(rand() - 0.5, 0, rand() - 0.5)), { hp: base * stats.hp });
        }
        d.spawnTimer = Math.max(0.7, 2.4 - d.tier * 0.2);
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
