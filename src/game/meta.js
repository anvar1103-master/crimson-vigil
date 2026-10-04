// Мета-прогрессия между забегами: кровавые осколки и постоянные улучшения Ордена.
// Хранится в localStorage; если хранилище недоступно, игра просто работает без сохранения.
const KEY = 'crimson-vigil-meta-v1';

export const META_UPGRADES = [
  { id: 'vitality', name: 'Закалка', glyph: '♡', desc: '+10 к максимальному здоровью за уровень.', max: 5, cost: (lvl) => 20 + lvl * 15 },
  { id: 'arsenal', name: 'Арсенал Ордена', glyph: '✠', desc: 'Начинать ночь с одной случайной реликвией.', max: 1, cost: () => 60 },
  { id: 'tithe', name: 'Десятина', glyph: '◉', desc: '+25 золота в начале ночи за уровень.', max: 4, cost: (lvl) => 15 + lvl * 10 },
  { id: 'reflex', name: 'Рефлексы', glyph: '⟿', desc: 'Рывок восстанавливается на 10% быстрее за уровень.', max: 3, cost: (lvl) => 25 + lvl * 20 },
];

export function loadMeta() {
  const base = { shards: 0, runs: 0, wins: 0, bestDepth: 0, upgrades: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...base, ...JSON.parse(raw) };
  } catch { /* хранилище недоступно */ }
  return base;
}

export function saveMeta(meta) {
  try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch { /* без сохранения */ }
}
