// Состояние забега: характеристики охотника, золото, реликвии, счёт.
export function defaultStats() {
  return {
    damage: 1,        // множитель урона
    headMul: 1,       // множитель урона в голову (поверх оружейного)
    fireRate: 1,
    reloadSpeed: 1,
    pierce: 0,        // доп. пробитие
    critChance: 0.05,
    lifesteal: 0,
    moveSpeed: 1,
    damageTaken: 1,
    enemySpeed: 1,
    enemyDamage: 1,
  };
}

export class Run {
  constructor() {
    this.stats = defaultStats();
    this.gold = 0;
    this.kills = 0;
    this.headshots = 0;
    this.relics = [];
    this.time = 0;
    this.wave = 0;
  }
}
