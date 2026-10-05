// Биомы: атмосфера (небо, туман, свет, погода) и генератор уровня для каждого.
import * as THREE from 'three';
import { buildCathedralYard, yardAtmosphere } from './cathedralYard.js';

const V3 = THREE.Vector3;

// Цветовые темы неба. crimson — багровое небо с кровавой луной, green — сумеречно-зелёное.
export const THEMES = {
  crimson: {
    moonColor: [1.25, 0.09, 0.05], moonSize: 0.9952,
    halo: [0.75, 0.05, 0.04], halo2: [1.0, 0.22, 0.14], cloudLit: [0.45, 0.1, 0.08],
    moonLight: 0xe0b0a8,
  },
  green: {
    skyHorizon: 0x2c4a36, skyZenith: 0x040a07, fogColor: 0x0b140f,
    mistColor: [0.05, 0.085, 0.065],
    moonColor: [0.85, 1.0, 0.75], moonSize: 0.9958,
    halo: [0.12, 0.32, 0.16], halo2: [0.55, 0.85, 0.5], cloudLit: [0.18, 0.32, 0.2],
    moonLight: 0xc8e0c0, hemiSky: 0x2e4a3a, hemiGround: 0x050806,
  },
};

export const ATMOS = {
  village: {
    ...yardAtmosphere,
    skyHorizon: 0x82301a, skyZenith: 0x0a0405, fogColor: 0x1e0d0a, fogDensity: 0.033,
    mistColor: [0.09, 0.05, 0.04], mistGround: 0.12,
    moonDir: new V3(-0.5, 0.45, -0.75).normalize(), moonIntensity: 1.0,
    hemiSky: 0x6a3a30, hemiGround: 0x0c0605, godRays: 0.6,
  },
  forest: {
    ...yardAtmosphere,
    skyHorizon: 0x5a1422, skyZenith: 0x050307, fogColor: 0x0d100e, fogDensity: 0.038,
    mistColor: [0.05, 0.07, 0.06], mistGround: 0.14,
    moonDir: new V3(0.3, 0.55, -0.8).normalize(), moonIntensity: 1.1,
    hemiSky: 0x3a4a48, hemiGround: 0x060807,
  },
  cathedral: { ...yardAtmosphere, mistGround: 0.12, godRays: 0.75 },
  castle: {
    ...yardAtmosphere,
    skyHorizon: 0x6a1030, skyZenith: 0x07020b, fogColor: 0x150a16, fogDensity: 0.028,
    mistColor: [0.07, 0.04, 0.075], mistGround: 0.11,
    moonDir: new V3(0.1, 0.5, -1).normalize(), moonIntensity: 1.35,
    hemiSky: 0x5a3060, hemiGround: 0x0a060c, lightning: true,
  },
};

// Тема по умолчанию: лес — зелёные сумерки, остальное — кровавая луна.
const AUTO_THEME = { village: 'crimson', forest: 'green', cathedral: 'crimson', crypt: 'crimson', castle: 'crimson', throne: 'crimson' };

const BUILDERS = {};
export function registerBiome(id, fn) { BUILDERS[id] = fn; }

// zone — описание зоны (для биомов с несколькими типами локаций). theme: 'auto' | 'crimson' | 'green'.
export function buildBiomeLevel(scene, biomeId, seed, zone = null, theme = 'auto') {
  const builder = BUILDERS[biomeId];
  const level = builder ? builder(scene, seed, zone) : buildCathedralYard(scene, seed);
  const t = THEMES[theme === 'auto' ? AUTO_THEME[biomeId] || 'crimson' : theme] || THEMES.crimson;
  level.atmosphere = {
    ...(ATMOS[biomeId] || yardAtmosphere), ...t, ...(level.atmosphereOverride || {}),
    // Дождь убран: вместо него — густой туман.
    rain: 0,
  };
  return level;
}
