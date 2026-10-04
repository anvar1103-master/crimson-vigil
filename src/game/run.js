// Состояние забега: характеристики охотника, золото, реликвии, карта ночи (биомы и зоны).
import { rand, pick } from '../core/util.js';

export function defaultStats() {
  return {
    damage: 1,          // множитель урона
    headMul: 1,         // множитель урона в голову (поверх оружейного)
    fireRate: 1,
    reloadSpeed: 1,
    pierce: 0,          // доп. пробитие
    critChance: 0.05,
    lifesteal: 0,
    moveSpeed: 1,
    damageTaken: 1,
    enemySpeed: 1,
    enemyDamage: 1,
    healOnKill: 0,
    headshotReload: false,
    garlicDps: 0,
    explosiveEvery: 0,
    lastPrayer: 0,
    dashCd: 1,
    ricochet: 0,
    burnDps: 0,
    slowOnHit: 0,
    goldMul: 1,
    dashEmpower: 0,
    noWaveHeal: false,
  };
}

export const BIOMES = [
  { id: 'village', name: 'Деревня Холлоумир', short: 'Холлоумир', zones: 3, boss: 'butcher' },
  { id: 'forest', name: 'Терновый лес', short: 'Терновый лес', zones: 3, boss: 'broodmother' },
  { id: 'cathedral', name: 'Собор Святого Ашена', short: 'Собор', zones: 3, boss: 'bellringer' },
  { id: 'castle', name: 'Замок Морвейн', short: 'Замок', zones: 2, boss: 'sovereign' },
];

export const REWARDS = {
  relic: { name: 'Реликвия', glyph: '✠', color: '#e0303c' },
  weapon: { name: 'Оружейник', glyph: '⚒', color: '#9ab0d8' },
  gold: { name: 'Золото', glyph: '◉', color: '#e8b84a' },
  heal: { name: 'Святой источник', glyph: '♡', color: '#8ad0ff' },
  merchant: { name: 'Гробовщик', glyph: '⚱', color: '#c9a466' },
  altar: { name: 'Кровавый алтарь', glyph: '☠', color: '#ff3040' },
  elite: { name: 'Испытание', glyph: '♛', color: '#ff7a30' },
  boss: { name: 'Логово', glyph: '♆', color: '#ff2030' },
};

export const MODIFIERS = {
  bloodmoon: { name: 'Кровавая луна', desc: 'Вампиры быстрее, золота вдвое больше' },
  fog: { name: 'Саван тумана', desc: 'Туман густеет, враги видят хуже' },
  storm: { name: 'Гроза', desc: 'Молнии бьют в нечисть' },
  frenzy: { name: 'Голодная ночь', desc: 'Больше врагов, больше наград' },
};

export class Run {
  constructor(seed = Math.floor(Math.random() * 1e9)) {
    this.seed = seed;
    this.stats = defaultStats();
    this.gold = 0;
    this.kills = 0;
    this.headshots = 0;
    this.relics = [];
    this.upgrades = [];
    this.time = 0;
    this.wave = 0;
    this.depth = 0;         // сколько зон пройдено за ночь
    this.biome = 0;
    this.zoneInBiome = 0;
    this.bossesSlain = 0;
    this.zone = { kind: 'combat', reward: 'relic', modifier: null, biome: 0, index: 0 };
    this.shotCount = 0;
    this.empowered = false;
  }

  get biomeDef() { return BIOMES[this.biome]; }

  // Варианты следующей зоны (2–3 ворот на выходе).
  nextChoices() {
    const b = BIOMES[this.biome];
    const nextIndex = this.zoneInBiome + 1;
    if (this.zone.kind === 'boss') {
      if (this.biome + 1 >= BIOMES.length) return [];
      return [{ kind: 'combat', reward: 'relic', biome: this.biome + 1, index: 0 }];
    }
    if (nextIndex >= b.zones) return [{ kind: 'boss', reward: 'relic', biome: this.biome, index: nextIndex }];
    const pool = [
      { kind: 'combat', reward: 'relic', w: 3 },
      { kind: 'combat', reward: 'weapon', w: 2 },
      { kind: 'combat', reward: 'gold', w: 1.5 },
      { kind: 'combat', reward: 'heal', w: 1 },
      { kind: 'elite', reward: 'elite', w: 1.2 },
      { kind: 'event', reward: 'merchant', w: this.gold >= 40 ? 1.6 : 0.6 },
      { kind: 'event', reward: 'altar', w: 0.8 },
    ];
    const n = rand() < 0.3 ? 3 : 2;
    const out = [];
    while (out.length < n) {
      const avail = pool.filter((p) => !out.some((o) => o.reward === p.reward));
      let x = rand() * avail.reduce((a, p) => a + p.w, 0), i = 0;
      while (x > avail[i].w) { x -= avail[i].w; i++; }
      const c = avail[i];
      const mod = c.kind !== 'event' && this.depth > 0 && rand() < 0.3 ? pick(Object.keys(MODIFIERS)) : null;
      out.push({ kind: c.kind, reward: c.reward, modifier: mod, biome: this.biome, index: nextIndex });
    }
    return out;
  }
}
