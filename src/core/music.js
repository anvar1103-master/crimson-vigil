// Процедурная музыка и звуки окружения на WebAudio.
// Слои: органный гул (всегда), хоровые аккорды ре-минора (медленная смена), боевые барабаны (во время волн),
// плюс случайные звуки биома: совы и волки в лесу, капель в склепе, вороны и треск в деревне.
import { rand, randRange, pick } from './util.js';

const CHORDS = [
  [146.8, 174.6, 220.0, 293.7],  // Dm
  [116.5, 146.8, 174.6, 233.1],  // Bb
  [98.0, 146.8, 196.0, 233.1],   // Gm
  [110.0, 164.8, 220.0, 277.2],  // A
  [146.8, 174.6, 220.0, 293.7],  // Dm
  [130.8, 164.8, 196.0, 261.6],  // C
  [116.5, 146.8, 174.6, 233.1],  // Bb
  [110.0, 138.6, 164.8, 220.0],  // A
];

export class Music {
  constructor(audio) {
    this.audio = audio;
    const ctx = (this.ctx = audio.ctx);
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.32;
    this.bus.connect(audio.master);
    const rv = ctx.createGain(); rv.gain.value = 0.9;
    this.bus.connect(rv).connect(audio.reverbIn);

    // Хоровой фильтр: две форманты гласной «а» + срез верхов.
    this.padIn = ctx.createGain(); this.padIn.gain.value = 1;
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 760; f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    const g1 = ctx.createGain(); g1.gain.value = 1.6;
    const g2 = ctx.createGain(); g2.gain.value = 1.0;
    const dry = ctx.createGain(); dry.gain.value = 0.25;
    this.padIn.connect(f1).connect(g1).connect(lp);
    this.padIn.connect(f2).connect(g2).connect(lp);
    this.padIn.connect(dry).connect(lp);
    this.padLevel = ctx.createGain(); this.padLevel.gain.value = 0.5;
    lp.connect(this.padLevel).connect(this.bus);

    // Органный гул: педаль ре.
    this.drone = ctx.createGain(); this.drone.gain.value = 0;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 320;
    for (const [f, type, g] of [[73.4, 'sawtooth', 0.05], [36.7, 'sine', 0.22], [110.0, 'triangle', 0.04]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = g;
      o.connect(og).connect(dlp); o.start();
    }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lg = ctx.createGain(); lg.gain.value = 120;
    lfo.connect(lg).connect(dlp.frequency); lfo.start();
    dlp.connect(this.drone).connect(this.bus);
    this.drone.gain.setTargetAtTime(1, ctx.currentTime, 4);

    this.chordIndex = 0;
    this.nextChord = ctx.currentTime + 1;
    this.combat = 0;       // 0..1 сглаженная интенсивность боя
    this.beatTime = 0;
    this.beat = 0;
    this.nextAmbient = ctx.currentTime + 4;
    this.biome = 'cathedral';
  }

  playChord(freqs, dur) {
    const ctx = this.ctx, t = ctx.currentTime;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.12, t + dur * 0.35);
    env.gain.setValueAtTime(0.12, t + dur * 0.7);
    env.gain.linearRampToValueAtTime(0.0001, t + dur * 1.25);
    env.connect(this.padIn);
    for (const f of freqs) {
      for (const d of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = d + randRange(-2, 2);
        // Лёгкое вибрато «голосов».
        const v = ctx.createOscillator(); v.frequency.value = randRange(4.5, 5.5);
        const vg = ctx.createGain(); vg.gain.value = 3;
        v.connect(vg).connect(o.detune);
        o.connect(env);
        o.start(t); v.start(t);
        o.stop(t + dur * 1.3); v.stop(t + dur * 1.3);
      }
    }
  }

  drum(accent = false) {
    const a = this.audio, g = 0.35 + this.combat * 0.4;
    a.tone({ type: 'sine', freq: accent ? 95 : 75, freq1: 38, gain: (accent ? 1.0 : 0.6) * g, decay: 0.45, reverb: 0.5 });
    a.burst({ type: 'lowpass', freq: 500, freq1: 120, gain: (accent ? 0.5 : 0.3) * g, decay: 0.18, reverb: 0.4 });
  }

  // Звуки окружения по биому.
  ambient() {
    const a = this.audio, b = this.biome;
    const pan = { x: randRange(-40, 40), y: randRange(2, 12), z: randRange(-40, 40) };
    const lp = a.listenerPos;
    const pos = { x: lp.x + pan.x, y: pan.y, z: lp.z + pan.z };
    if (b === 'forest') {
      if (rand() < 0.5) {
        // Сова: «ху-хуу».
        a.tone({ type: 'sine', freq: 420, freq1: 390, gain: 0.08, attack: 0.05, decay: 0.35, pos, reverb: 0.9 });
        a.tone({ type: 'sine', freq: 400, freq1: 360, gain: 0.07, attack: 0.08, decay: 0.6, pos, reverb: 0.9, delay: 0.5 });
      } else this.howl(pos);
    } else if (b === 'crypt' || b === 'throne') {
      // Капель и далёкий стон камня.
      for (let i = 0; i < 1 + Math.floor(rand() * 3); i++) a.tone({ type: 'sine', freq: randRange(1300, 2200), freq1: randRange(500, 800), gain: 0.06, decay: 0.12, pos, reverb: 1.3, delay: i * randRange(0.3, 0.8) });
      if (rand() < 0.3) a.burst({ type: 'lowpass', freq: 120, freq1: 60, gain: 0.25, attack: 1, decay: 2, reverb: 1 });
    } else if (b === 'village') {
      if (rand() < 0.5) this.crow(pos);
      else for (let i = 0; i < 6; i++) a.burst({ type: 'bandpass', freq: randRange(1500, 3500), q: 3, gain: 0.05, decay: 0.03, delay: rand() * 0.8, pos, reverb: 0.2 });
    } else {
      if (rand() < 0.5) this.crow(pos);
      else if (rand() < 0.5) this.howl(pos);
      else a.tone({ type: 'triangle', freq: randRange(600, 900), freq1: randRange(300, 500), gain: 0.03, attack: 0.3, decay: 1.5, pos, reverb: 1.2 });
    }
  }

  howl(pos) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(560, t + 1.0);
    o.frequency.setValueAtTime(560, t + 1.8);
    o.frequency.exponentialRampToValueAtTime(380, t + 3.2);
    const vib = ctx.createOscillator(); vib.frequency.value = 5;
    const vg = ctx.createGain(); vg.gain.value = 8;
    vib.connect(vg).connect(o.frequency);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.6);
    g.gain.setValueAtTime(0.06, t + 2.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    o.connect(bp).connect(g).connect(this.audio.out({ pos, reverb: 1.2, bus: this.audio.amb }));
    o.start(t); vib.start(t); o.stop(t + 3.5); vib.stop(t + 3.5);
  }

  crow(pos) {
    const a = this.audio;
    const n = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      a.burst({ type: 'bandpass', freq: 1100, freq1: 700, q: 4, gain: 0.18, attack: 0.02, decay: 0.22, delay: i * 0.35, pos, reverb: 0.6 });
      a.tone({ type: 'sawtooth', freq: 520, freq1: 380, gain: 0.04, decay: 0.2, delay: i * 0.35, pos, reverb: 0.6 });
    }
  }

  update(dt, { combat = 0, boss = false, biome = 'cathedral' } = {}) {
    const ctx = this.ctx, now = ctx.currentTime;
    this.biome = biome;
    this.combat += ((combat ? 1 : 0) - this.combat) * Math.min(1, dt * (combat ? 0.8 : 0.25));
    // Хор: аккорды по 9 секунд с перекрытием.
    if (now >= this.nextChord) {
      const dur = 9;
      this.playChord(CHORDS[this.chordIndex % CHORDS.length], dur);
      this.chordIndex++;
      this.nextChord = now + dur;
    }
    this.padLevel.gain.setTargetAtTime(0.5 - this.combat * 0.15, now, 1);
    // Барабаны боя: 6/8, ускоряются на боссе.
    if (this.combat > 0.05) {
      const bpm = boss ? 132 : 104;
      const step = 60 / bpm / 2;
      this.beatTime -= dt;
      if (this.beatTime <= 0) {
        this.beatTime += step;
        const b = this.beat++ % 6;
        if (b === 0 || b === 3 || (boss && b === 5) || (this.combat > 0.6 && b === 2 && rand() < 0.5)) this.drum(b === 0);
      }
    } else this.beatTime = 0;
    if (now >= this.nextAmbient) {
      this.ambient();
      this.nextAmbient = now + randRange(6, 14);
    }
  }
}

export { pick };
