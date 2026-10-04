// Синтезированный звук на WebAudio: выстрелы, шаги, вампиры, ветер, дождь, колокол, гром.
// Файлов нет, всё генерируется. Пространственный звук идёт через PannerNode (HRTF).
import { rand } from './util.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.listenerPos = { x: 0, y: 0, z: 0 };
  }

  init() {
    if (this.ctx || !this.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);

    this.sfx = ctx.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = 0.7; this.amb.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.4, 2.4);
    this.reverbIn = ctx.createGain(); this.reverbIn.gain.value = 0.55;
    this.reverbIn.connect(this.reverb).connect(this.master);

    this.noise = this.noiseBuffer(3);
    this.startAmbience();
  }

  resume() { this.ctx?.resume?.(); }
  get t() { return this.ctx.currentTime; }

  impulse(seconds, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Ранние отражения от каменных стен + хвост.
        const early = i < ctx.sampleRate * 0.08 && Math.random() < 0.004 ? 1.5 : 0;
        d[i] = ((Math.random() * 2 - 1) + early) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  noiseBuffer(seconds) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Узел вывода: панорамирование по позиции (если задана) + посыл в реверб.
  out({ pos = null, gain = 1, reverb = 0.3, bus = this.sfx } = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    let head = g;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 2.5; p.rolloffFactor = 1.1; p.maxDistance = 80;
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      g.connect(p);
      head = p;
    }
    head.connect(bus);
    if (reverb > 0) {
      const r = ctx.createGain();
      r.gain.value = reverb;
      head.connect(r).connect(this.reverbIn);
    }
    return g;
  }

  noiseSrc(rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(this.t, Math.random() * 2);
    return s;
  }

  env(param, t0, peak, attack, decay, floor = 0.0001) {
    param.cancelScheduledValues(t0);
    param.setValueAtTime(floor, t0);
    param.linearRampToValueAtTime(peak, t0 + attack);
    param.exponentialRampToValueAtTime(floor, t0 + attack + decay);
  }

  burst({ type = 'lowpass', freq = 1000, freq1 = null, q = 0.7, gain = 1, attack = 0.002, decay = 0.2, pos = null, reverb = 0.2, rate = 1, delay = 0 }) {
    if (!this.ctx) return;
    const t = this.t + delay;
    const src = this.noiseSrc(rate);
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freq1) f.frequency.exponentialRampToValueAtTime(freq1, t + attack + decay);
    const g = this.ctx.createGain();
    this.env(g.gain, t, gain, attack, decay);
    src.connect(f).connect(g).connect(this.out({ pos, reverb }));
    src.stop(t + attack + decay + 0.05);
  }

  tone({ type = 'sine', freq = 100, freq1 = null, gain = 0.5, attack = 0.002, decay = 0.2, pos = null, reverb = 0.1, delay = 0, detune = 0 }) {
    if (!this.ctx) return;
    const t = this.t + delay;
    const o = this.ctx.createOscillator();
    o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(freq, t);
    if (freq1) o.frequency.exponentialRampToValueAtTime(freq1, t + attack + decay);
    const g = this.ctx.createGain();
    this.env(g.gain, t, gain, attack, decay);
    o.connect(g).connect(this.out({ pos, reverb }));
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  updateListener(pos, forward, up) {
    if (!this.ctx) return;
    const l = this.ctx.listener, t = this.t;
    if (l.positionX) {
      l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(forward.x, t); l.forwardY.setValueAtTime(forward.y, t); l.forwardZ.setValueAtTime(forward.z, t);
      l.upX.setValueAtTime(up.x, t); l.upY.setValueAtTime(up.y, t); l.upZ.setValueAtTime(up.z, t);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  // ——— Оружие ———
  revolverShot() {
    if (!this.ctx) return;
    const v = 0.92 + rand() * 0.16;
    this.burst({ type: 'highpass', freq: 2500, gain: 0.9, decay: 0.05, reverb: 0.2, rate: v });
    this.burst({ type: 'lowpass', freq: 7000 * v, freq1: 500, gain: 1.6, decay: 0.32, reverb: 1.0, rate: v });
    this.tone({ freq: 150 * v, freq1: 38, gain: 1.4, decay: 0.2, reverb: 0.4 });
    this.tone({ type: 'triangle', freq: 80, freq1: 30, gain: 0.6, decay: 0.35, reverb: 0.6 });
    // Хвост эха от стен двора.
    this.burst({ type: 'bandpass', freq: 600, q: 0.8, gain: 0.25, attack: 0.03, decay: 0.9, reverb: 1.2, delay: 0.09 });
  }
  hammerClick() { this.burst({ type: 'bandpass', freq: 3800, q: 4, gain: 0.35, decay: 0.03, reverb: 0.05 }); }
  dryFire() {
    this.burst({ type: 'bandpass', freq: 2800, q: 6, gain: 0.5, decay: 0.04, reverb: 0.1 });
    this.burst({ type: 'bandpass', freq: 1400, q: 5, gain: 0.25, decay: 0.05, delay: 0.05, reverb: 0.1 });
  }
  cylinderOpen() {
    this.burst({ type: 'bandpass', freq: 2200, q: 3, gain: 0.4, decay: 0.06 });
    this.burst({ type: 'bandpass', freq: 5200, q: 8, gain: 0.25, decay: 0.12, delay: 0.04 });
  }
  shellsDrop() {
    for (let i = 0; i < 4; i++) {
      this.tone({ type: 'triangle', freq: 3200 + rand() * 1600, gain: 0.08, decay: 0.08 + rand() * 0.05, delay: 0.25 + i * 0.07 + rand() * 0.05, reverb: 0.2 });
    }
  }
  roundInsert() {
    this.burst({ type: 'bandpass', freq: 3200, q: 5, gain: 0.35, decay: 0.035 });
    this.tone({ type: 'triangle', freq: 1900, gain: 0.08, decay: 0.05, delay: 0.02 });
  }
  cylinderClose() {
    this.burst({ type: 'bandpass', freq: 1800, q: 2, gain: 0.6, decay: 0.07 });
    this.burst({ type: 'highpass', freq: 4000, gain: 0.3, decay: 0.04, delay: 0.02 });
  }
  crossbowShot() {
    this.tone({ type: 'sawtooth', freq: 220, freq1: 60, gain: 0.35, decay: 0.18, reverb: 0.3 });
    this.burst({ type: 'bandpass', freq: 900, freq1: 200, q: 1.2, gain: 1.0, decay: 0.22, reverb: 0.5 });
    this.tone({ freq: 90, freq1: 40, gain: 0.9, decay: 0.15 });
    this.burst({ type: 'highpass', freq: 3000, gain: 0.25, decay: 0.12, delay: 0.03 });
  }
  crossbowReload() {
    this.burst({ type: 'bandpass', freq: 600, freq1: 1400, q: 2, gain: 0.35, attack: 0.15, decay: 0.15 });
    this.burst({ type: 'bandpass', freq: 3000, q: 6, gain: 0.5, decay: 0.04, delay: 0.32 });
  }
  weaponSwap() { this.burst({ type: 'bandpass', freq: 1500, freq1: 900, q: 1.5, gain: 0.3, attack: 0.03, decay: 0.12 }); }

  // ——— Попадания ———
  hitFlesh(pos, head = false) {
    this.burst({ type: 'lowpass', freq: 1200, freq1: 300, gain: 0.8, decay: 0.12, pos, reverb: 0.1 });
    this.tone({ freq: 120, freq1: 60, gain: 0.5, decay: 0.1, pos });
    if (head) this.tone({ type: 'square', freq: 1800, gain: 0.12, decay: 0.06, reverb: 0 });
  }
  hitMarker(kill = false) {
    this.tone({ type: 'triangle', freq: kill ? 1300 : 2400, freq1: kill ? 700 : 2000, gain: kill ? 0.3 : 0.12, decay: kill ? 0.18 : 0.05, reverb: 0 });
  }
  hitStone(pos) {
    this.burst({ type: 'bandpass', freq: 2500 + rand() * 1500, q: 2, gain: 0.5, decay: 0.06, pos, reverb: 0.3 });
    if (rand() < 0.3) this.tone({ type: 'sine', freq: 2600 + rand() * 1200, freq1: 1200, gain: 0.08, decay: 0.35, pos, reverb: 0.4 });
  }

  // ——— Игрок ———
  footstep(wet = 0, run = false) {
    const r = 0.8 + rand() * 0.4;
    this.burst({ type: 'lowpass', freq: run ? 900 : 650, q: 1, gain: run ? 0.32 : 0.22, decay: 0.07, reverb: 0.15, rate: r });
    if (wet > 0) this.burst({ type: 'highpass', freq: 2500, gain: 0.08 * wet, decay: 0.09, rate: r });
  }
  land() { this.tone({ freq: 90, freq1: 45, gain: 0.5, decay: 0.12 }); this.burst({ type: 'lowpass', freq: 700, gain: 0.4, decay: 0.1 }); }
  hurt() {
    this.tone({ freq: 70, freq1: 40, gain: 1.0, decay: 0.3 });
    this.burst({ type: 'lowpass', freq: 900, gain: 0.7, decay: 0.2 });
    this.burst({ type: 'bandpass', freq: 4500, q: 3, gain: 0.25, decay: 0.15, delay: 0.02 });
  }
  heartbeat() {
    this.tone({ freq: 55, freq1: 40, gain: 0.7, decay: 0.12, reverb: 0 });
    this.tone({ freq: 50, freq1: 38, gain: 0.5, decay: 0.14, delay: 0.22, reverb: 0 });
  }
  dashWhoosh() { this.burst({ type: 'bandpass', freq: 500, freq1: 2400, q: 1, gain: 0.5, attack: 0.04, decay: 0.2 }); }

  // ——— Вампиры ———
  hiss(pos) {
    this.burst({ type: 'bandpass', freq: 4200, q: 1.5, gain: 0.5, attack: 0.08, decay: 0.6, pos, reverb: 0.4 });
    this.tone({ type: 'sawtooth', freq: 75, freq1: 60, gain: 0.25, attack: 0.05, decay: 0.6, pos, reverb: 0.3 });
  }
  screech(pos) {
    if (!this.ctx) return;
    const t = this.t;
    for (const [f, d] of [[880, 0], [1320, 7], [990, -12]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.7, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.25);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.7);
      o.detune.value = d;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 28;
      const lg = this.ctx.createGain(); lg.gain.value = 40;
      lfo.connect(lg).connect(o.frequency);
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 0.8;
      const g = this.ctx.createGain();
      this.env(g.gain, t, 0.12, 0.05, 0.7);
      o.connect(bp).connect(g).connect(this.out({ pos, reverb: 0.7 }));
      o.start(t); lfo.start(t); o.stop(t + 0.8); lfo.stop(t + 0.8);
    }
    this.burst({ type: 'highpass', freq: 3000, gain: 0.35, attack: 0.05, decay: 0.5, pos, reverb: 0.5 });
  }
  clawSwipe(pos) { this.burst({ type: 'bandpass', freq: 1200, freq1: 4000, q: 1.2, gain: 0.6, attack: 0.03, decay: 0.15, pos }); }
  vampireDeath(pos) {
    this.burst({ type: 'lowpass', freq: 400, freq1: 3000, gain: 0.8, attack: 0.1, decay: 1.2, pos, reverb: 0.7 });
    this.tone({ type: 'sawtooth', freq: 600, freq1: 120, gain: 0.18, attack: 0.02, decay: 1.0, pos, reverb: 0.8 });
    this.tone({ type: 'sawtooth', freq: 900, freq1: 200, gain: 0.1, attack: 0.02, decay: 0.9, pos, reverb: 0.8, detune: 15 });
  }
  materialize(pos) {
    this.burst({ type: 'bandpass', freq: 300, freq1: 1800, q: 1, gain: 0.6, attack: 0.6, decay: 0.6, pos, reverb: 0.8 });
    this.tone({ type: 'sine', freq: 110, freq1: 55, gain: 0.3, attack: 0.4, decay: 0.8, pos, reverb: 0.6 });
  }

  // ——— Мир ———
  bell() {
    const base = 146.8;
    for (const [r, g, d] of [[0.5, 0.25, 6], [1, 0.3, 5], [1.19, 0.18, 4], [1.5, 0.12, 3.5], [2, 0.1, 3], [2.74, 0.06, 2.2], [3.76, 0.04, 1.6]]) {
      this.tone({ type: 'sine', freq: base * r, gain: g * 0.4, attack: 0.005, decay: d, reverb: 1.2 });
    }
  }
  thunder(delay = 0) {
    this.burst({ type: 'lowpass', freq: 180, freq1: 60, gain: 1.4, attack: 0.15, decay: 3.5, reverb: 0.8, delay, rate: 0.5 });
    this.burst({ type: 'lowpass', freq: 1200, freq1: 200, gain: 0.6, attack: 0.01, decay: 0.6, reverb: 0.5, delay });
  }
  chestOpen() {
    this.burst({ type: 'bandpass', freq: 300, freq1: 800, q: 4, gain: 0.5, attack: 0.2, decay: 0.4 });
    this.tone({ type: 'triangle', freq: 1046, gain: 0.15, decay: 1.2, delay: 0.35, reverb: 0.8 });
    this.tone({ type: 'triangle', freq: 1568, gain: 0.12, decay: 1.4, delay: 0.45, reverb: 0.8 });
  }
  pickup() { this.tone({ type: 'triangle', freq: 1400, freq1: 2100, gain: 0.15, decay: 0.12, reverb: 0.3 }); }
  coin() { this.tone({ type: 'square', freq: 2400 + rand() * 300, gain: 0.05, decay: 0.08, reverb: 0.2 }); }

  startAmbience() {
    const ctx = this.ctx;
    // Ветер: шум через полосовой фильтр с медленными LFO.
    const wind = this.noiseSrc(0.5);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.12;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 0.08;
    lfo.connect(lg).connect(g.gain);
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.045;
    const lg2 = ctx.createGain(); lg2.gain.value = 220;
    lfo2.connect(lg2).connect(bp.frequency);
    wind.connect(bp).connect(g).connect(this.amb);
    lfo.start(); lfo2.start();

    // Дождь: высокочастотный шум, громкость задаёт setRain().
    const rain = this.noiseSrc(1);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    rain.connect(hp).connect(lp).connect(this.rainGain).connect(this.amb);

    // Низкий гул-дрон.
    for (const [f, d] of [[55, 0], [82.4, 6], [55.3, -8]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = d;
      const og = ctx.createGain(); og.gain.value = 0.035;
      o.connect(og).connect(this.amb); o.start();
    }
  }

  setRain(v) { if (this.rainGain) this.rainGain.gain.setTargetAtTime(v * 0.16, this.t, 0.5); }
}
