// Мелкие математические помощники и сидируемый генератор случайных чисел.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Вся игровая случайность идёт через rand(), чтобы сценарии были воспроизводимыми.
let gameRng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
export function seedRandom(seed) { gameRng = mulberry32(seed); }
export const rand = () => gameRng();
export const randRange = (a, b) => a + (b - a) * gameRng();
export const randInt = (a, b) => Math.floor(a + (b - a + 1) * gameRng());
export const pick = (arr) => arr[Math.floor(gameRng() * arr.length)];

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
// Экспоненциальное сглаживание, не зависящее от частоты кадров.
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Пружина для отдачи и покачивания оружия.
export class Spring {
  constructor(stiffness = 180, damping = 18) {
    this.x = 0; this.v = 0; this.target = 0;
    this.k = stiffness; this.c = damping;
  }
  update(dt) {
    const a = -this.k * (this.x - this.target) - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
  impulse(v) { this.v += v; }
}

// Дешёвый 1D-шум для мерцания огня.
export function flicker(t, seed = 0) {
  return 0.5 * Math.sin(t * 7.3 + seed) + 0.3 * Math.sin(t * 13.1 + seed * 2.1) + 0.2 * Math.sin(t * 23.7 + seed * 3.7);
}
