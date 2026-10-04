// Биомы: атмосфера (небо, туман, свет, погода) и генератор уровня для каждого.
import * as THREE from 'three';
import { buildCathedralYard, yardAtmosphere } from './cathedralYard.js';

const V3 = THREE.Vector3;

export const ATMOS = {
  village: {
    ...yardAtmosphere,
    skyHorizon: 0x82301a, skyZenith: 0x0a0405, fogColor: 0x1e0d0a, fogDensity: 0.03,
    mistColor: [0.08, 0.045, 0.035], mistGround: 0.08,
    moonDir: new V3(-0.5, 0.45, -0.75).normalize(), moonLight: 0xe0c8c0, moonIntensity: 1.0,
    hemiSky: 0x6a3a30, hemiGround: 0x0c0605, rain: 0.85, lightning: true,
  },
  forest: {
    ...yardAtmosphere,
    skyHorizon: 0x5a1422, skyZenith: 0x050307, fogColor: 0x0d100e, fogDensity: 0.036,
    mistColor: [0.05, 0.07, 0.06], mistGround: 0.11,
    moonDir: new V3(0.3, 0.55, -0.8).normalize(), moonLight: 0xc8d8e0, moonIntensity: 1.1,
    hemiSky: 0x3a4a48, hemiGround: 0x060807, rain: 0, lightning: false,
  },
  cathedral: { ...yardAtmosphere },
  castle: {
    ...yardAtmosphere,
    skyHorizon: 0x6a1030, skyZenith: 0x07020b, fogColor: 0x150a16, fogDensity: 0.026,
    mistColor: [0.07, 0.04, 0.075], mistGround: 0.075,
    moonDir: new V3(0.1, 0.5, -1).normalize(), moonLight: 0xe0d0f0, moonIntensity: 1.35,
    hemiSky: 0x5a3060, hemiGround: 0x0a060c, rain: 0.35, lightning: true,
  },
};

const BUILDERS = {};
export function registerBiome(id, fn) { BUILDERS[id] = fn; }

// zone — описание зоны (для биомов с несколькими типами локаций).
export function buildBiomeLevel(scene, biomeId, seed, zone = null) {
  const builder = BUILDERS[biomeId];
  const level = builder ? builder(scene, seed, zone) : buildCathedralYard(scene, seed);
  level.atmosphere = { ...(ATMOS[biomeId] || yardAtmosphere), ...(level.atmosphereOverride || {}) };
  return level;
}
