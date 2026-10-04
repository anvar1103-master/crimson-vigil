// Процедурные текстуры: рисуются на canvas при загрузке, внешних файлов нет.
import * as THREE from 'three';
import { mulberry32, smoothstep, clamp } from './util.js';

const cache = new Map();
function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// Бесшовный value-noise (fBm), значения 0..1.
export function tileNoise(size, { octaves = 5, freq = 4, seed = 1, persistence = 0.5 } = {}) {
  const rng = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const f = Math.min(freq << o, size);
    const lat = new Float32Array(f * f);
    for (let i = 0; i < lat.length; i++) lat[i] = rng();
    const cell = size / f;
    for (let y = 0; y < size; y++) {
      const gy = y / cell, y0 = Math.floor(gy), ty = gy - y0, sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % f) * f, r1 = ((y0 + 1) % f) * f;
      for (let x = 0; x < size; x++) {
        const gx = x / cell, x0 = Math.floor(gx), tx = gx - x0, sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % f, c1 = (x0 + 1) % f;
        const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx;
        const b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx;
        out[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
    total += amp;
    amp *= persistence;
  }
  // Растягиваем контраст: сумма октав сжимается к 0.5.
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < out.length; i++) { const v = out[i] / total; out[i] = v; if (v < mn) mn = v; if (v > mx) mx = v; }
  const k = 1 / (mx - mn);
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) * k;
  return out;
}

function canvasFromPixels(size, data) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  img.data.set(data);
  ctx.putImageData(img, 0, 0);
  return c;
}

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(canvas, { color = true, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

export function setRepeat(set, r) {
  for (const t of Object.values(set)) t.repeat.set(r, r);
  return set;
}

// Каменная кладка: ряды блоков разной ширины, раствор, мох и грязь.
export function stoneWall(seed = 11, base = [104, 98, 92]) {
  return cached(`stone${seed}${base}`, () => {
    const S = 512, rng = mulberry32(seed);
    const n1 = tileNoise(S, { octaves: 6, freq: 8, seed: seed + 1 });
    const n2 = tileNoise(S, { octaves: 3, freq: 2, seed: seed + 2 });
    const col = new Uint8ClampedArray(S * S * 4), hgt = new Uint8ClampedArray(S * S * 4);
    const rows = 8, rowH = S / rows;
    for (let r = 0; r < rows; r++) {
      const start = Math.floor(rng() * S);
      const bounds = [start];
      let x = start;
      for (;;) {
        const w = 70 + Math.floor(rng() * 110);
        if (x + w > start + S - 50) break;
        x += w; bounds.push(x);
      }
      bounds.push(start + S);
      const tone = bounds.map(() => 0.75 + rng() * 0.5);
      const warm = bounds.map(() => rng() - 0.5);
      for (let yy = 0; yy < rowH; yy++) {
        const y = r * rowH + yy;
        const dy = Math.min(yy, rowH - 1 - yy);
        let b = 0;
        for (let px = start; px < start + S; px++) {
          while (px >= bounds[b + 1]) b++;
          const dx = Math.min(px - bounds[b], bounds[b + 1] - 1 - px);
          const i = y * S + (px % S), o = i * 4;
          const n = n1[i], g = n2[i];
          const d = Math.min(dx, dy) + (n - 0.5) * 8;
          const edge = smoothstep(1.5, 11, d);
          let h, lum;
          if (d < 2.4) { h = 0.08 + n * 0.12; lum = 0.3 + n * 0.12; }
          else { h = 0.4 + 0.45 * edge + (n - 0.5) * 0.35; lum = tone[b] * (0.55 + 0.55 * n) * (0.7 + 0.3 * edge); }
          lum *= 0.62 + 0.55 * g;
          const moss = smoothstep(0.58, 0.78, g + (n - 0.5) * 0.5) * 0.65;
          let R = base[0] * lum + warm[b] * 12, G = base[1] * lum, B = base[2] * lum - warm[b] * 10;
          R = R * (1 - moss) + 44 * lum * 1.3 * moss;
          G = G * (1 - moss) + 56 * lum * 1.3 * moss;
          B = B * (1 - moss) + 34 * lum * 1.3 * moss;
          col[o] = R; col[o + 1] = G; col[o + 2] = B; col[o + 3] = 255;
          hgt[o] = hgt[o + 1] = hgt[o + 2] = clamp(h, 0, 1) * 255; hgt[o + 3] = 255;
        }
      }
    }
    return { map: tex(canvasFromPixels(S, col)), bump: tex(canvasFromPixels(S, hgt), { color: false }) };
  });
}

// Брусчатка: ячейки Вороного с выпуклыми камнями и тёмными щелями.
export function cobbles(seed = 5) {
  return cached(`cob${seed}`, () => {
    const S = 512, cells = 9, cell = S / cells, rng = mulberry32(seed);
    const n1 = tileNoise(S, { octaves: 5, freq: 8, seed: seed + 3 });
    const n2 = tileNoise(S, { octaves: 3, freq: 2, seed: seed + 4 });
    const pts = [];
    for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) {
      pts.push([(cx + 0.2 + 0.6 * rng()) * cell, (cy + 0.2 + 0.6 * rng()) * cell, 0.7 + rng() * 0.5]);
    }
    const col = new Uint8ClampedArray(S * S * 4), hgt = new Uint8ClampedArray(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      let d1 = 1e9, d2 = 1e9, id = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const gx = cx + i, gy = cy + j;
        const wx = (gx + cells) % cells, wy = (gy + cells) % cells;
        const p = pts[wy * cells + wx];
        const px = p[0] + (gx - wx) * cell, py = p[1] + (gy - wy) * cell;
        const d = (x - px) ** 2 + (y - py) ** 2;
        if (d < d1) { d2 = d1; d1 = d; id = wy * cells + wx; } else if (d < d2) d2 = d;
      }
      const i = y * S + x, o = i * 4, n = n1[i], g = n2[i];
      const e = (Math.sqrt(d2) - Math.sqrt(d1)) * 0.5 + (n - 0.5) * 5;
      const dome = smoothstep(1.5, 14, e);
      let lum, h, R, G, B;
      if (e < 2.2) {
        h = 0.05; lum = 0.25 + n * 0.15;
        R = 40 * lum * 2; G = 42 * lum * 2; B = 34 * lum * 2;
      } else {
        h = 0.3 + 0.7 * dome * (0.85 + 0.15 * n);
        lum = pts[id][2] * (0.5 + 0.6 * n) * (0.55 + 0.45 * dome) * (0.7 + 0.45 * g);
        R = 92 * lum; G = 88 * lum; B = 84 * lum;
      }
      col[o] = R; col[o + 1] = G; col[o + 2] = B; col[o + 3] = 255;
      hgt[o] = hgt[o + 1] = hgt[o + 2] = h * 255; hgt[o + 3] = 255;
    }
    return { map: tex(canvasFromPixels(S, col)), bump: tex(canvasFromPixels(S, hgt), { color: false }) };
  });
}

// Земля: глина, жухлая трава, мох и мелкие камешки.
export function groundTex(seed = 9) {
  return cached(`ground${seed}`, () => {
    const S = 512, rng = mulberry32(seed);
    const n1 = tileNoise(S, { octaves: 6, freq: 8, seed: seed + 1 });
    const n2 = tileNoise(S, { octaves: 4, freq: 2, seed: seed + 2 });
    const n3 = tileNoise(S, { octaves: 2, freq: 64, seed: seed + 3 });
    const col = new Uint8ClampedArray(S * S * 4), hgt = new Uint8ClampedArray(S * S * 4);
    for (let i = 0; i < S * S; i++) {
      const n = n1[i], g = n2[i], f = n3[i], o = i * 4;
      const grass = smoothstep(0.42, 0.62, g + (n - 0.5) * 0.45);
      const lum = 0.6 + 0.6 * n;
      let R = 52 * lum, G = 42 * lum, B = 34 * lum;
      const gr = [58 + f * 30, 56 + f * 22, 34 + f * 10];
      R = R * (1 - grass) + gr[0] * lum * grass;
      G = G * (1 - grass) + gr[1] * lum * grass;
      B = B * (1 - grass) + gr[2] * lum * grass;
      col[o] = R; col[o + 1] = G; col[o + 2] = B; col[o + 3] = 255;
      const h = n * 0.6 + f * 0.4 * grass;
      hgt[o] = hgt[o + 1] = hgt[o + 2] = h * 255; hgt[o + 3] = 255;
    }
    // Камешки.
    const c = canvasFromPixels(S, col), ctx = c.getContext('2d');
    const hc = canvasFromPixels(S, hgt), hctx = hc.getContext('2d');
    for (let k = 0; k < 260; k++) {
      const x = rng() * S, y = rng() * S, r = 1.5 + rng() * 4;
      const l = 60 + rng() * 50;
      ctx.fillStyle = `rgb(${l},${l * 0.96},${l * 0.9})`;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.6 + rng() * 0.4), rng() * 3, 0, 7); ctx.fill();
      hctx.fillStyle = '#ddd';
      hctx.beginPath(); hctx.ellipse(x, y, r, r * 0.8, 0, 0, 7); hctx.fill();
    }
    return { map: tex(c), bump: tex(hc, { color: false }) };
  });
}

// Дерево (рукоять револьвера, ложа арбалета, доски).
export function woodTex(seed = 3, dark = false) {
  return cached(`wood${seed}${dark}`, () => {
    const S = 256;
    const n = tileNoise(S, { octaves: 5, freq: 4, seed });
    const col = new Uint8ClampedArray(S * S * 4);
    const a = dark ? [30, 16, 10] : [58, 28, 15], b = dark ? [70, 40, 24] : [112, 60, 32];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x, o = i * 4;
      const g = Math.sin((x / S) * Math.PI * 2 * 7 + n[i] * 9 + Math.sin((y / S) * Math.PI * 2) * 1.5) * 0.5 + 0.5;
      const t = clamp(0.25 + 0.75 * n[i], 0, 1) * (0.72 + 0.28 * (1 - g ** 4));
      col[o] = a[0] + (b[0] - a[0]) * t; col[o + 1] = a[1] + (b[1] - a[1]) * t; col[o + 2] = a[2] + (b[2] - a[2]) * t; col[o + 3] = 255;
    }
    return tex(canvasFromPixels(S, col));
  });
}

// Мягкое круглое свечение для бликов, искр и ореолов.
export function glowTex() {
  return cached('glow', () => {
    const [c, ctx] = makeCanvas(128);
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    return tex(c, { wrap: false });
  });
}

// Язык пламени: горячее ядро, оранжевое тело, красные края.
export function flameTex() {
  return cached('flame', () => {
    const S = 128;
    const n = tileNoise(S, { octaves: 4, freq: 4, seed: 77 });
    const data = new Uint8ClampedArray(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = (x / S) * 2 - 1, v = 1 - y / S; // v: 0 низ, 1 верх
      const w = Math.sin(Math.PI * Math.pow(v, 0.55)) * 0.62 * Math.pow(1 - v, 0.25) + 0.001;
      const d = Math.abs(u + (n[y * S + x] - 0.5) * 0.35 * v) / w;
      let k = clamp(1 - d, 0, 1);
      k = k * k * smoothstep(0, 0.12, v);
      const core = smoothstep(0.55, 0.95, k) * (1 - v);
      const o = (y * S + x) * 4;
      data[o] = 255;
      data[o + 1] = clamp(90 + 165 * core + 60 * k, 0, 255);
      data[o + 2] = clamp(30 + 200 * core, 0, 255);
      data[o + 3] = clamp(k * 255 * 1.4, 0, 255);
    }
    return tex(canvasFromPixels(S, data), { wrap: false });
  });
}

// Клуб дыма или тумана: мягкий край с шумом внутри.
export function smokeTex() {
  return cached('smoke', () => {
    const S = 128;
    const n = tileNoise(S, { octaves: 5, freq: 4, seed: 41 });
    const data = new Uint8ClampedArray(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x / S - 0.5, dy = y / S - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const a = clamp(1 - r, 0, 1) ** 1.6 * (0.45 + 0.75 * n[y * S + x]);
      const o = (y * S + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = 255;
      data[o + 3] = clamp(a * 255, 0, 255);
    }
    return tex(canvasFromPixels(S, data), { wrap: false });
  });
}

// Вспышка выстрела: звезда с лучами.
export function muzzleTex() {
  return cached('muzzle', () => {
    const [c, ctx] = makeCanvas(256);
    ctx.translate(128, 128);
    ctx.globalCompositeOperation = 'lighter';
    const rng = mulberry32(19);
    for (let i = 0; i < 9; i++) {
      ctx.save();
      ctx.rotate((i / 9) * Math.PI * 2 + rng() * 0.4);
      const len = 70 + rng() * 55;
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, 'rgba(255,240,200,1)');
      g.addColorStop(0.4, 'rgba(255,170,60,0.7)');
      g.addColorStop(1, 'rgba(255,80,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(len, 0); ctx.lineTo(0, 9); ctx.fill();
      ctx.restore();
    }
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 60);
    g.addColorStop(0, 'rgba(255,255,240,1)');
    g.addColorStop(0.35, 'rgba(255,200,110,0.8)');
    g.addColorStop(1, 'rgba(255,100,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 60, 0, 7); ctx.fill();
    return tex(c, { wrap: false });
  });
}

// Роза-витраж: лепестки, кольца сегментов, свинцовые переплёты.
export function roseWindowTex() {
  return cached('rose', () => {
    const S = 512, h = S / 2;
    const [c, ctx] = makeCanvas(S);
    const rng = mulberry32(31);
    const palette = ['#7a0d18', '#9c1a22', '#1d2f7a', '#3a1660', '#b8741e', '#1e5a3a', '#5b0f2e'];
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
    ctx.translate(h, h);
    const ring = (r0, r1, n, off) => {
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2 + off, a1 = ((i + 1) / n) * Math.PI * 2 + off;
        ctx.fillStyle = palette[Math.floor(rng() * palette.length)];
        ctx.beginPath(); ctx.arc(0, 0, r1, a0, a1); ctx.arc(0, 0, r0, a1, a0, true); ctx.fill();
      }
    };
    ring(0.62 * h, 0.95 * h, 24, 0);
    ring(0.2 * h, 0.62 * h, 12, 0.13);
    // Лепестки поверх.
    for (let i = 0; i < 12; i++) {
      ctx.save(); ctx.rotate((i / 12) * Math.PI * 2);
      ctx.fillStyle = i % 2 ? '#a31c27' : '#22357f';
      ctx.beginPath(); ctx.ellipse(0.41 * h, 0, 0.2 * h, 0.075 * h, 0, 0, 7); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#c98a2a'; ctx.beginPath(); ctx.arc(0, 0, 0.2 * h, 0, 7); ctx.fill();
    // Шум стекла.
    const n = tileNoise(S, { octaves: 4, freq: 16, seed: 32 });
    const img = ctx.getImageData(0, 0, S, S);
    for (let i = 0; i < S * S; i++) {
      const k = 0.6 + 0.7 * n[i];
      img.data[i * 4] *= k; img.data[i * 4 + 1] *= k; img.data[i * 4 + 2] *= k;
    }
    ctx.putImageData(img, 0, 0);
    // Свинцовые переплёты.
    ctx.strokeStyle = '#050403'; ctx.lineWidth = 5;
    for (const r of [0.2, 0.62, 0.95]) { ctx.beginPath(); ctx.arc(0, 0, r * h, 0, 7); ctx.stroke(); }
    ctx.lineWidth = 3;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 0.62 * h, Math.sin(a) * 0.62 * h); ctx.lineTo(Math.cos(a) * 0.95 * h, Math.sin(a) * 0.95 * h); ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      ctx.save(); ctx.rotate((i / 12) * Math.PI * 2);
      ctx.beginPath(); ctx.ellipse(0.41 * h, 0, 0.2 * h, 0.075 * h, 0, 0, 7); ctx.stroke();
      ctx.restore();
    }
    return tex(c, { wrap: false });
  });
}

// Стрельчатое окно: ромбовидная расстекловка.
export function lancetGlassTex() {
  return cached('lancet', () => {
    const W = 128, H = 256;
    const [c, ctx] = makeCanvas(W, H);
    const rng = mulberry32(57);
    const palette = ['#8a1420', '#26357a', '#5a1a5c', '#b0782a', '#1f4f3c'];
    const s = 22;
    for (let y = -s; y < H + s; y += s / 2) for (let x = -s; x < W + s; x += s) {
      const ox = ((y / (s / 2)) & 1) ? s / 2 : 0;
      ctx.fillStyle = palette[Math.floor(rng() * palette.length)];
      ctx.beginPath();
      ctx.moveTo(x + ox, y - s / 2); ctx.lineTo(x + ox + s / 2, y); ctx.lineTo(x + ox, y + s / 2); ctx.lineTo(x + ox - s / 2, y);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#080605'; ctx.lineWidth = 2; ctx.stroke();
    }
    return tex(c, { wrap: false });
  });
}

// Пулевое отверстие / скол.
export function holeTex() {
  return cached('hole', () => {
    const [c, ctx] = makeCanvas(64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.22, 'rgba(10,8,6,0.95)');
    g.addColorStop(0.45, 'rgba(30,26,22,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    return tex(c, { wrap: false });
  });
}

// Брызги крови для декалей.
export function bloodTex() {
  return cached('blood', () => {
    const [c, ctx] = makeCanvas(128);
    const rng = mulberry32(73);
    ctx.fillStyle = 'rgba(70,0,6,0.95)';
    ctx.beginPath(); ctx.arc(64, 64, 22, 0, 7); ctx.fill();
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2, d = 18 + rng() * 40, r = 2 + rng() * 7;
      ctx.beginPath(); ctx.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r * (1 - d / 70), 0, 7); ctx.fill();
    }
    return tex(c, { wrap: false });
  });
}
