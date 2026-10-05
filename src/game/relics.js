// Реликвии (пассивные бонусы забега) и улучшения оружия.
// apply(game) меняет характеристики забега или оружия; эффекты-реакции читаются из run.stats.
import { rand } from '../core/util.js';

export const RELICS = [
  { id: 'silver', name: 'Освящённое серебро', glyph: '✠', rarity: 'common', desc: '+20% урона всем оружием.', apply: (g) => { g.run.stats.damage += 0.2; } },
  { id: 'rosary', name: 'Чётки палача', glyph: '☩', rarity: 'common', desc: '+50% урона при попадании в голову.', apply: (g) => { g.run.stats.headMul += 0.5; } },
  { id: 'fingers', name: 'Ловкие пальцы', glyph: '☛', rarity: 'common', desc: 'Перезарядка на 35% быстрее.', apply: (g) => { g.run.stats.reloadSpeed += 0.35; } },
  { id: 'trigger', name: 'Курок-волосок', glyph: '⚙', rarity: 'common', desc: 'Скорострельность револьвера +25%.', apply: (g) => { g.run.stats.fireRate += 0.25; } },
  { id: 'holywater', name: 'Святая вода в гильзах', glyph: '✧', rarity: 'rare', desc: 'Пули и колья пробивают ещё одного врага.', apply: (g) => { g.run.stats.pierce += 1; } },
  { id: 'communion', name: 'Кровавое причастие', glyph: '♱', rarity: 'rare', desc: 'Вампиризм: 5% нанесённого урона лечит вас.', apply: (g) => { g.run.stats.lifesteal += 0.05; } },
  { id: 'cuirass', name: 'Кираса Ордена', glyph: '♜', rarity: 'common', desc: 'Получаемый урон −15%.', apply: (g) => { g.run.stats.damageTaken *= 0.85; } },
  { id: 'boots', name: 'Сапоги паломника', glyph: '⟿', rarity: 'common', desc: 'Скорость передвижения +12%.', apply: (g) => { g.run.stats.moveSpeed += 0.12; g.player.speedMul = g.run.stats.moveSpeed; } },
  { id: 'ashrose', name: 'Пепельная роза', glyph: '❦', rarity: 'common', desc: 'Каждое убийство восстанавливает 4 здоровья.', apply: (g) => { g.run.stats.healOnKill += 4; } },
  { id: 'deadbell', name: 'Колокольчик мертвеца', glyph: '♪', rarity: 'rare', desc: 'Убийство в голову мгновенно возвращает патрон и заряжает арбалет.', apply: (g) => { g.run.stats.headshotReload = true; } },
  { id: 'mirror', name: 'Зеркальце без отражения', glyph: '◈', rarity: 'common', desc: 'Шанс критического удара +12% (двойной урон).', apply: (g) => { g.run.stats.critChance += 0.12; } },
  { id: 'oakstake', name: 'Дубовая сердцевина', glyph: '⟊', rarity: 'common', desc: 'Арбалет: урон +40%.', apply: (g) => { g.weapons[1].damage *= 1.4; } },
  { id: 'garlic', name: 'Чесночная гирлянда', glyph: '❀', rarity: 'common', desc: 'Вампиры рядом с вами получают 14 урона в секунду.', apply: (g) => { g.run.stats.garlicDps += 14; } },
  { id: 'powder', name: 'Пороховой рог', glyph: '✹', rarity: 'rare', desc: 'Каждый шестой выстрел револьвера взрывается.', apply: (g) => { g.run.stats.explosiveEvery = 6; } },
  { id: 'prayer', name: 'Последняя молитва', glyph: '✝', rarity: 'rare', desc: 'Один раз за ночь смертельный удар оставляет вас с 1 здоровьем.', apply: (g) => { g.run.stats.lastPrayer += 1; } },
  { id: 'chrono', name: 'Сердце-хронометр', glyph: '⧗', rarity: 'common', desc: 'Рывок восстанавливается на 40% быстрее.', apply: (g) => { g.run.stats.dashCd *= 0.6; } },
  { id: 'locket', name: 'Ладанка матери', glyph: '♡', rarity: 'common', desc: '+25 к максимальному здоровью.', apply: (g) => { g.player.maxHealth += 25; g.player.heal(25); } },
  { id: 'ricochet', name: 'Крест-рикошет', glyph: '✣', rarity: 'rare', desc: 'Пуля после попадания рикошетит в ближайшего врага (60% урона).', apply: (g) => { g.run.stats.ricochet += 0.6; } },
  { id: 'embers', name: 'Угли горна', glyph: '♨', rarity: 'common', desc: 'Попадания поджигают: 24 урона за 3 секунды.', apply: (g) => { g.run.stats.burnDps += 8; } },
  { id: 'salt', name: 'Кладбищенская соль', glyph: '❄', rarity: 'common', desc: 'Попадания замедляют врагов на 35%.', apply: (g) => { g.run.stats.slowOnHit = 0.35; } },
  { id: 'purse', name: 'Кошелёк гробовщика', glyph: '⚱', rarity: 'common', desc: '+50% золота.', apply: (g) => { g.run.stats.goldMul += 0.5; } },
  { id: 'coin', name: 'Проклятая монета', glyph: '☠', rarity: 'cursed', desc: '+35% урона, но вы получаете на 25% больше урона.', apply: (g) => { g.run.stats.damage += 0.35; g.run.stats.damageTaken *= 1.25; } },
  { id: 'thorn', name: 'Шип Серебряного Терна', glyph: '✤', rarity: 'rare', desc: 'После рывка следующий выстрел наносит тройной урон.', apply: (g) => { g.run.stats.dashEmpower = 3; } },
  { id: 'flask', name: 'Освящённая фляга', glyph: '⚗', rarity: 'common', desc: '+1 фляга святой воды в каждой зоне.', apply: (g) => { g.run.stats.extraFlasks = (g.run.stats.extraFlasks || 0) + 1; g.flasks.charges++; } },
  { id: 'martyr', name: 'Мощи мученика', glyph: '♰', rarity: 'rare', desc: 'Святой огонь горит на 60% дольше и жжёт на 40% сильнее, лужа шире.', apply: (g) => { const s = g.run.stats; s.flaskDuration = (s.flaskDuration || 1) * 1.6; s.flaskPower = (s.flaskPower || 1) * 1.4; s.flaskRadius = (s.flaskRadius || 1) * 1.2; } },
  { id: 'wrath', name: 'Гнев небесный', glyph: '☄', rarity: 'rare', desc: 'Фляга взрывается при ударе: 60 урона по всем вокруг.', apply: (g) => { g.run.stats.flaskBurst = true; } },
  { id: 'scythe', name: 'Серп жнеца', glyph: '☽', rarity: 'common', desc: 'Окно серии убийств +2 с; каждая веха серии лечит 15.', apply: (g) => { g.run.stats.comboTime = (g.run.stats.comboTime || 0) + 2; g.run.stats.comboHeal = (g.run.stats.comboHeal || 0) + 15; } },
  { id: 'hunger', name: 'Голод охотника', glyph: '☾', rarity: 'cursed', desc: 'Скорость и скорострельность +20%, но убийства не лечат волной.', apply: (g) => { g.run.stats.moveSpeed += 0.2; g.player.speedMul = g.run.stats.moveSpeed; g.run.stats.fireRate += 0.2; g.run.stats.noWaveHeal = true; } },
];

export const WEAPON_UPGRADES = [
  { id: 'rev_barrel', weapon: 0, name: 'Удлинённый ствол', glyph: '▬', desc: 'Реквием: урон +25%.', apply: (g) => { g.weapons[0].damage *= 1.25; } },
  { id: 'rev_speed', weapon: 0, name: 'Быстрый барабан', glyph: '⟳', desc: 'Реквием: перезарядка вдвое быстрее.', apply: (g) => { g.weapons[0].reloadMul = (g.weapons[0].reloadMul || 1) * 2; } },
  { id: 'rev_fan', weapon: 0, name: 'Веерная стрельба', glyph: '⋙', desc: 'Реквием: скорострельность +35%.', apply: (g) => { g.weapons[0].fireDelay *= 0.74; } },
  { id: 'rev_silver', weapon: 0, name: 'Серебряная картечь', glyph: '⁂', desc: 'Реквием: пуля пробивает ещё одного врага, урон в голову +30%.', apply: (g) => { g.weapons[0].pierceBonus = (g.weapons[0].pierceBonus || 0) + 1; g.weapons[0].headMul += 0.75; } },
  { id: 'sg_pellets', weapon: 2, name: 'Серебряная дробь', glyph: '⁙', desc: 'Литания: +4 картечины в выстреле.', apply: (g) => { g.weapons[2].pellets += 4; } },
  { id: 'sg_choke', weapon: 2, name: 'Чок-сужение', glyph: '◎', desc: 'Литания: кучность выше, урон картечи +25%.', apply: (g) => { g.weapons[2].damage *= 1.25; g.weapons[2].choke = 0.6; } },
  { id: 'xb_heavy', weapon: 1, name: 'Тяжёлый натяжитель', glyph: '⚒', desc: 'Покаяние: урон +35%, отбрасывание сильнее.', apply: (g) => { g.weapons[1].damage *= 1.35; } },
  { id: 'xb_crank', weapon: 1, name: 'Механизм ворота', glyph: '⟲', desc: 'Покаяние: перезарядка на 40% быстрее.', apply: (g) => { g.weapons[1].reloadTime *= 0.6; } },
  { id: 'xb_holy', weapon: 1, name: 'Освящённый наконечник', glyph: '✺', desc: 'Покаяние: колья взрываются святым светом (радиус 3 м).', apply: (g) => { g.weapons[1].holy = true; } },
  { id: 'xb_triple', weapon: 1, name: 'Тройной ложемент', glyph: '⫶', desc: 'Покаяние: выпускает три кола веером.', apply: (g) => { g.weapons[1].multishot = 3; } },
];

export function rollRelics(run, n = 3) {
  const owned = new Set(run.relics.map((r) => r.id));
  const pool = RELICS.filter((r) => !owned.has(r.id));
  const out = [];
  while (out.length < n && pool.length) {
    // Редкие выпадают реже, проклятые — ещё реже.
    const weights = pool.map((r) => (r.rarity === 'rare' ? 0.5 : r.rarity === 'cursed' ? 0.35 : 1));
    let x = rand() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while (x > weights[i]) { x -= weights[i]; i++; }
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

export function rollWeaponUpgrades(run, n = 3) {
  const owned = new Set(run.upgrades.map((r) => r.id));
  const pool = WEAPON_UPGRADES.filter((r) => !owned.has(r.id));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}
