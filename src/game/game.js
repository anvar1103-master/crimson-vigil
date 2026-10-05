// Главный класс игры: рендерер, сцены, цикл, состояния (меню / игра / выбор / переход / пауза / смерть / победа).
import * as THREE from 'three';
import { createSky, createEnvironment } from '../core/sky.js';
import { createPost } from '../core/post.js';
import { fogUniforms } from '../core/fog.js';
import { seedRandom, damp, rand } from '../core/util.js';
import { Input, emptyInput } from '../core/input.js';
import { AudioEngine } from '../core/audio.js';
import { Weather } from '../core/weather.js';
import { buildBiomeLevel } from '../world/biomes.js';
import '../world/gen/village.js';
import '../world/gen/forest.js';
import '../world/gen/cathedral.js';
import '../world/gen/castle.js';
import { CoinShower } from '../world/interactables.js';
import { Ambience } from '../world/ambience.js';
import { Player } from './player.js';
import { ViewModel } from './viewmodel.js';
import { Revolver } from './weapons/revolver.js';
import { Crossbow, Projectiles } from './weapons/crossbow.js';
import { Flasks } from './weapons/flask.js';
import { FX } from './fx.js';
import { Combat } from './combat.js';
import { EnemyManager } from './enemies/director.js';
import { Hazards } from './enemies/hazards.js';
import { Run, BIOMES } from './run.js';
import { ZoneController } from './zones.js';
import { HUD } from '../ui/hud.js';
import { ChoiceUI, Transition } from '../ui/choice.js';
import { pickBark } from './barks.js';
import { SCENARIOS } from './scenarios.js';
import { loadMeta, saveMeta, META_UPGRADES } from './meta.js';
import { loadSettings, SettingsUI, QUALITY } from '../ui/settings.js';
import { rollRelics } from './relics.js';
import { CODEX, recordKill } from './codex.js';

function countLights(scene) {
  let n = 0;
  scene.traverse((o) => { if (o.isPointLight) n++; });
  return n;
}

export class Game {
  constructor(container, uiRoot) {
    this.container = container;
    this.params = new URLSearchParams(location.search);
    this.scenarioName = this.params.get('scenario');
    this.scenario = this.scenarioName ? SCENARIOS[this.scenarioName] || {} : null;
    if (this.scenario) seedRandom(Number(this.params.get('seed') || 1));
    this.settings = loadSettings();
    if (this.scenario) this.settings = { ...this.settings, fov: 68, quality: 'high', sensitivity: 1, showHands: this.params.has('hands') };
    this.quality = QUALITY[this.settings.quality] || QUALITY.high;
    this.pixelRatio = Math.min(devicePixelRatio, this.quality.maxPixelRatio);
    this.meta = loadMeta();

    const renderer = (this.renderer = new THREE.WebGLRenderer({
      antialias: false, powerPreference: 'high-performance',
      preserveDrawingBuffer: !!this.scenario,
    }));
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = this.quality.shadows > 0;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.05, 900);
    this.camera.rotation.order = 'YXZ';
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 20);

    this.time = 0;
    this.timeScale = 1;
    this.slowmo = 0;
    this.state = 'menu';
    this.lastBark = '';
    this.barkCooldown = 0;
    this.heartbeat = 0;

    this.audio = new AudioEngine();
    if (this.scenario && !this.params.has('audio')) this.audio.enabled = false;
    this.input = new Input(renderer.domElement);
    this.input.disabled = !!this.scenario;
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    // Звук разрешён только после действия пользователя: первый клик в меню запускает музыку.
    addEventListener('pointerdown', () => { this.audio.init(); this.audio.resume(); }, { once: true });
    // Если захват мыши сорвался (например, после экрана выбора), клик по экрану вернёт его.
    renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.lock();
    });

    this.post = createPost(renderer, this.scene, this.camera, this.vmScene, this.vmCamera, { samples: this.quality.samples, bloom: this.quality.bloom });
    this.run = new Run();
    this.loadLevel(this.params.get('biome') || 'cathedral', 7);
    this.weather = new Weather(this);
    this.weather.set(this.level.atmosphere);
    this.player = new Player(this);
    this.vm = new ViewModel(this);
    this.fx = new FX(this);
    this.combat = new Combat(this);
    this.enemies = new EnemyManager(this);
    this.hazards = new Hazards(this);
    this.coins = new CoinShower(this);
    this.zones = new ZoneController(this);
    this.hud = new HUD(this, uiRoot);
    this.choiceUI = new ChoiceUI(uiRoot);
    this.transitionUI = new Transition(uiRoot);
    this.projectiles = new Projectiles(this);
    this.flasks = new Flasks(this);
    this.weapons = [new Revolver(this), new Crossbow(this)];
    this.weaponIndex = 0;
    this.weapon = this.weapons[0];
    this.vm.root.add(this.weapon.model);
    this.switchTarget = -1;
    this.switchT = 0;
    this.player.reset(this.level.playerStart, this.level.playerYaw);
    this.hud.setMeta(this.meta);

    this.chooseCount = 0;
    this.settingsUI = new SettingsUI(uiRoot, this);
    this.hud.startBtn.addEventListener('click', () => this.startRun());
    this.hud.orderBtn.addEventListener('click', () => this.openOrder());
    this.hud.codexBtn?.addEventListener('click', () => this.openCodex());
    this.hud.settingsBtn.addEventListener('click', () => { this.hud.menu.classList.add('hidden'); this.settingsUI.open(() => this.hud.menu.classList.remove('hidden')); });
    this.hud.pause.querySelector('.resume').addEventListener('click', () => this.input.lock());
    this.hud.pause.querySelector('.opts').addEventListener('click', () => this.settingsUI.open());
    this.hud.pause.querySelector('.quit').addEventListener('click', () => this.quitToMenu());
    this.hud.death.querySelector('.again').addEventListener('click', () => this.startRun());
    this.hud.death.querySelector('.tomenu').addEventListener('click', () => this.quitToMenu(true));
    this.applySettings();

    this.onResize();
    addEventListener('resize', () => this.onResize());
  }

  loadLevel(biomeId, seed, zone = null) {
    if (this.level) this.level.dispose();
    this.level = buildBiomeLevel(this.scene, biomeId, seed, zone, this.settings.skyTheme || 'auto');
    this.applyAtmosphere(this.level.atmosphere);
    if (this.weather) this.weather.set(this.level.atmosphere);
    this.ambience?.dispose();
    this.ambience = new Ambience(this, this.level.ambient || {});
  }

  applyAtmosphere(a) {
    const scene = this.scene;
    this.renderer.toneMappingExposure = a.exposure ?? 1.15;
    scene.fog = new THREE.FogExp2(a.fogColor, a.fogDensity);
    scene.background = new THREE.Color(a.fogColor);
    fogUniforms.fogMistColor.value.setRGB(...a.mistColor);
    fogUniforms.fogGround.value = a.mistGround;

    if (this.sky) scene.remove(this.sky);
    this.sky = createSky({ horizon: a.skyHorizon, zenith: a.skyZenith, moonDir: a.moonDir, moonColor: a.moonColor, moonSize: a.moonSize, halo: a.halo, halo2: a.halo2, cloudLit: a.cloudLit });
    this.sky.visible = !a.indoor;
    scene.add(this.sky);

    if (this.lights) for (const l of this.lights) scene.remove(l);
    const moon = new THREE.DirectionalLight(a.moonLight, a.moonIntensity);
    moon.position.copy(a.moonDir).multiplyScalar(60);
    // В помещении «луна» — мягкий заполняющий свет без теней (иначе потолок гасит весь зал).
    moon.castShadow = !a.indoor && this.quality.shadows > 0;
    moon.shadow.mapSize.set(this.quality.shadows || 512, this.quality.shadows || 512);
    const sc = moon.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 160;
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.04;
    moon.shadow.radius = 3;
    moon.target.position.set(1.5, 0, 0);
    const hemi = new THREE.HemisphereLight(a.hemiSky, a.hemiGround, a.hemiIntensity);
    this.moonLight = moon;
    this.lights = [moon, moon.target, hemi];
    for (const l of this.lights) scene.add(l);

    if (!this.envCache) this.envCache = new Map();
    const key = `${a.skyHorizon}|${a.skyZenith}`;
    if (!this.envCache.has(key)) this.envCache.set(key, createEnvironment(this.renderer, { horizon: a.skyHorizon, zenith: a.skyZenith, moonDir: a.moonDir }));
    scene.environment = this.envCache.get(key);
    scene.environmentIntensity = 0.35;
    if (!this.vmScene.environment) {
      // Оружию — более нейтральное окружение, иначе металл отражает только багровое небо.
      this.vmScene.environment = createEnvironment(this.renderer, {
        horizon: 0x4a3a40, zenith: 0x1a1a24, moonDir: new THREE.Vector3(-0.4, 0.7, 0.5), warmDir: new THREE.Vector3(0.8, 0.1, -0.3),
      });
      this.vmScene.environmentIntensity = 0.9;
    }
  }

  // Применить настройки «на лету». Смена качества пересоздаёт страницу (буферы рендера).
  applySettings(qualityChanged = false) {
    const s = this.settings;
    this.input.sensitivity = 0.0022 * s.sensitivity;
    this.input.invertY = s.invertY;
    if (this.audio.master) this.audio.master.gain.value = s.volume;
    this.audio.volume = s.volume;
    this.hud?.setFps(s.showFps);
    if (qualityChanged) setTimeout(() => location.reload(), 200);
    // Новая тема неба сразу видна в меню; в забеге — со следующей зоны.
    if (this._theme && this._theme !== s.skyTheme && this.state === 'menu') this.loadLevel('cathedral', 7);
    this._theme = s.skyTheme;
  }

  // Динамическое разрешение: держим кадр около 60 FPS на неизвестном железе.
  adaptResolution(dt) {
    this.frameAvg = this.frameAvg ? this.frameAvg * 0.95 + dt * 0.05 : dt;
    this.resT = (this.resT || 0) + dt;
    if (this.resT < 2) return;
    const max = Math.min(devicePixelRatio, this.quality.maxPixelRatio);
    let pr = this.pixelRatio;
    if (this.frameAvg > 1 / 45 && pr > 0.6) pr = Math.max(0.6, pr - 0.1);
    else if (this.frameAvg < 1 / 70 && pr < max) pr = Math.min(max, pr + 0.05);
    if (pr !== this.pixelRatio) { this.pixelRatio = pr; this.onResize(); }
    this.resT = 0;
  }

  onResize() {
    const w = innerWidth, h = innerHeight;
    const pr = this.pixelRatio;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.camera.aspect = this.vmCamera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.updateProjectionMatrix();
    this.post.setSize(w, h, pr);
    this.fx?.setScale(h * pr, this.camera.fov);
  }

  // ——— Поток забега ———
  resetWorld() {
    this.flasks?.clear();
    this.enemies.clear();
    this.hazards.clear();
    this.fx.clear();
    this.projectiles.clear();
    this.coins.clear();
    this.zones.clear();
    this.hud.showBoss(null);
    this.hud.setPrompt('');
  }

  async startRun() {
    if (this.state === 'transition') return;
    this.audio.init();
    this.audio.resume();
    this.input.lock();
    const first = { kind: 'combat', reward: 'relic', modifier: null, biome: 0, index: 0 };
    if (!this.scenario) {
      // Титульная карточка ночи; мир собирается, пока экран тёмный.
      this.hud.menu.classList.add('hidden');
      this.hud.death.classList.add('hidden');
      this.state = 'transition';
      const run = new Run();
      await this.transitionUI.run(async () => { this.setupRun(run, first); }, { pre: 'Ночь первая', title: BIOMES[0].name, sub: 'Колокол бьёт полночь' });
      return;
    }
    this.setupRun(new Run(), first);
  }

  setupRun(run, first) {
    this.run = run;
    this.resetWorld();
    this.loadLevel(BIOMES[0].id, this.run.seed, first);
    this.player.reset(this.level.playerStart, this.level.playerYaw);
    this.player.maxHealth = 100 + (this.meta.upgrades.vitality || 0) * 10;
    this.player.health = this.player.maxHealth;
    this.player.speedMul = 1;
    this.weapons = [new Revolver(this), new Crossbow(this)];
    this.vm.root.clear();
    this.weaponIndex = 0;
    this.weapon = this.weapons[0];
    this.vm.root.add(this.weapon.model);
    this.hud.setRelics([]);
    this.state = 'playing';
    this.hud.show('hud');
    // Постоянные улучшения Ордена.
    const up = this.meta.upgrades;
    this.run.gold += (up.tithe || 0) * 25;
    this.run.stats.dashCd *= 1 - (up.reflex || 0) * 0.1;
    if (up.arsenal) this.addRelic(rollRelics(this.run, 1)[0]);
    this.flasks.reset();
    this.zones.enter(first);
    this.say('start', 0.6);
    if (this.meta.runs < 2) {
      setTimeout(() => this.hud.hints([
        '<b>ЛКМ</b> выстрел · <b>ПКМ</b> прицеливание · <b>R</b> перезарядка',
        '<b>1</b> / <b>2</b> или колесо — револьвер и арбалет',
        '<b>Q</b> рывок-уклонение · <b>Shift</b> бег · <b>Space</b> прыжок через ударные волны',
        '<b>G</b> или колёсико — фляга святой воды: лужа огня жжёт нечисть',
        '<b>E</b> — алтари, торговец и дары · выстрел в голову наносит больше урона',
      ]), 3500);
    }
    setTimeout(() => this.audio.bell(), 300);
  }

  async transitionTo(choice) {
    if (this.state === 'transition') return;
    this.state = 'transition';
    this.hud.setPrompt('');
    const title = this.zones.zoneTitle(choice);
    const midway = () => {
      const run = this.run;
      run.depth++;
      run.biome = choice.biome;
      run.zoneInBiome = choice.index;
      this.resetWorld();
      this.loadLevel(BIOMES[choice.biome].id, run.seed + run.depth * 7919, choice);
      this.player.teleport(this.level.playerStart, this.level.playerYaw);
      this.zones.enter(choice);
      if (!this.scenario) this.renderer.compile(this.scene, this.camera);
    };
    if (this.scenario) { midway(); this.state = 'playing'; console.log('ZONE', title.pre, '—', title.title, title.sub); return; }
    await this.transitionUI.run(async () => midway(), title);
    if (this.state === 'transition') this.state = 'playing';
  }

  async choose(opts) {
    if (this.scenario) {
      // В автотестах выбираем первый доступный вариант.
      const o = opts.options.find((x) => !x.disabled) || null;
      console.log('CHOICE', opts.title, '→', o?.name);
      return opts.closable && this.chooseCount++ > 0 ? null : o;
    }
    const prev = this.state;
    this.state = 'choice';
    this.input.unlock();
    this.hud.setPrompt('');
    if (this.params.has('autobot')) {
      setTimeout(() => {
        if (opts.closable && this.chooseCount++ > 0) this.choiceUI.finish(null);
        else this.choiceUI.pick(Math.max(0, opts.options.findIndex((o) => !o.disabled)));
        console.log('AUTOBOT choice', opts.title);
      }, 400);
    }
    const r = await this.choiceUI.show(opts);
    if (this.state === 'choice') this.state = prev === 'choice' ? 'playing' : prev;
    this.input.lock();
    return r;
  }

  addRelic(r) {
    if (!r) return;
    this.run.relics.push(r);
    r.apply(this);
    this.hud.setRelics(this.run.relics);
    this.hud.banner(r.name, r.desc);
    this.audio.chestOpen();
  }

  addUpgrade(u) {
    if (!u) return;
    this.run.upgrades.push(u);
    u.apply(this);
    this.hud.banner(u.name, u.desc);
    this.audio.chestOpen();
  }

  // Выход в главное меню (из паузы — с зачётом осколков за пройденное).
  quitToMenu(afterEnd = false) {
    if (!afterEnd && (this.state === 'paused' || this.state === 'playing')) this.endRun(false);
    this.resetWorld();
    this.state = 'menu';
    this.loadLevel('cathedral', 7);
    this.player.reset(this.level.playerStart, this.level.playerYaw);
    this.hud.show('menu');
    this.hud.setMeta(this.meta);
    this.input.unlock();
  }

  // Святилище Ордена: трата кровавых осколков на постоянные улучшения.
  // Бестиарий: карточки тварей, открытые после первого убийства.
  async openCodex() {
    this.hud.menu.classList.add('hidden');
    const seen = this.meta.codex || {};
    const opts = CODEX.map((e) => seen[e.id]
      ? { id: e.id, name: e.name, glyph: e.glyph, desc: e.text, rarity: e.boss ? 'cursed' : 'rare', rarityLabel: `Упокоено: ${seen[e.id]}` }
      : { id: e.id, name: '???', glyph: '?', desc: 'Запись откроется после первой встречи с этой тварью.', rarity: 'common', rarityLabel: e.boss ? 'Повелитель' : 'Неизвестно', disabled: true });
    await this.choiceUI.show({ title: 'Бестиарий Ордена', subtitle: `Изучено ${CODEX.filter((e) => seen[e.id]).length} из ${CODEX.length}`, options: opts, closable: true, wide: true, closeLabel: 'Закрыть' });
    this.hud.menu.classList.remove('hidden');
  }

  async openOrder() {
    this.hud.menu.classList.add('hidden');
    for (;;) {
      const opts = META_UPGRADES.map((u) => {
        const lvl = this.meta.upgrades[u.id] || 0;
        const maxed = lvl >= u.max;
        const cost = u.cost(lvl);
        return { id: u.id, name: u.name, glyph: u.glyph, desc: u.desc, rarity: 'rare', rarityLabel: `Уровень ${lvl}/${u.max}`, price: maxed ? undefined : cost, disabled: maxed || this.meta.shards < cost, cost };
      });
      const p = await this.choiceUI.show({ title: 'Святилище Ордена', subtitle: 'Кровь павших — цена силы живых', options: opts, closable: true, footer: `◆ ${this.meta.shards} кровавых осколков` });
      if (!p) break;
      this.meta.shards -= p.cost;
      this.meta.upgrades[p.id] = (this.meta.upgrades[p.id] || 0) + 1;
      saveMeta(this.meta);
      this.audio.init();
      this.audio.chestOpen();
    }
    this.hud.setMeta(this.meta);
    this.hud.menu.classList.remove('hidden');
  }

  onLockChange(locked) {
    if (this.scenario) return;
    if (!locked && this.state === 'playing') { this.state = 'paused'; this.hud.show('pause'); }
    else if (locked && this.state === 'paused') { this.state = 'playing'; this.hud.show('hud'); }
  }

  endRun(victory) {
    const run = this.run;
    const shards = Math.floor(run.kills / 4) + run.bossesSlain * 15 + (victory ? 50 : 0);
    this.meta.shards += shards;
    this.meta.runs++;
    if (victory) this.meta.wins++;
    this.meta.bestDepth = Math.max(this.meta.bestDepth, run.depth);
    saveMeta(this.meta);
    run.shardsEarned = shards;
    this.hud.setMeta(this.meta);
  }

  onPlayerDeath() {
    this.slowmo = 1.2;
    this.timeScale = 0.35;
    this.enemies.stop();
    setTimeout(() => {
      if (this.state !== 'playing' && this.state !== 'paused') return;
      this.state = 'dead';
      this.endRun(false);
      this.input.unlock();
      this.hud.showDeath(this.run);
    }, this.scenario ? 0 : 2200);
  }

  onVictory() {
    this.state = 'victory';
    this.endRun(true);
    setTimeout(() => { this.input.unlock(); this.hud.showVictory(this.run); }, 2500);
  }

  onEnemyKilled(enemy, { headshot }) {
    const run = this.run, stats = run.stats;
    run.kills++;
    if (recordKill(this.meta, enemy)) { this.hud.banner('Новая запись в бестиарии', CODEX.find((e) => e.id === (enemy.boss || enemy.type))?.name || ''); saveMeta(this.meta); }
    if (headshot) run.headshots++;
    const c = enemy.center();
    const coins = enemy.boss ? 30 : enemy.elite ? 8 : 2 + Math.floor(rand() * 3);
    // Серия убийств: каждые 5 — ещё +25% золота (до ×2.5).
    run.combo = (run.comboT > 0 ? run.combo : 0) + 1;
    run.comboT = 4 + (stats.comboTime || 0);
    run.bestCombo = Math.max(run.bestCombo || 0, run.combo);
    const comboMul = Math.min(2.5, 1 + Math.floor(run.combo / 5) * 0.25);
    this.hud.combo(run.combo, comboMul);
    if ([5, 10, 20, 35].includes(run.combo)) {
      this.hud.banner({ 5: 'Кровавая жатва', 10: 'Бойня', 20: 'Охотник ночи', 35: 'Бич Варна' }[run.combo], `Серия ×${run.combo} · золото ×${comboMul.toFixed(2)}`);
      this.audio.bell();
      if (stats.comboHeal) this.player.heal(stats.comboHeal);
    }
    this.coins.burst(c, Math.round(coins * comboMul * (run.zoneMods?.gold ?? 1)), 1);
    if (rand() < (enemy.elite ? 0.6 : 0.12)) this.coins.vial(c, 15);
    if (stats.healOnKill) this.player.heal(stats.healOnKill);
    if (headshot && stats.headshotReload) {
      const rev = this.weapons[0];
      rev.ammo = Math.min(rev.capacity, rev.ammo + 1);
      rev.updateChambers();
      const xb = this.weapons[1];
      if (xb.state === 'reloading') xb.stateT = 99;
    }
    this.slowmo = enemy.boss ? 1.5 : headshot ? 0.22 : 0.14;
    this.timeScale = enemy.boss ? 0.2 : headshot ? 0.25 : 0.4;
    this.player.addTrauma(enemy.boss ? 0.6 : 0.15);
    if (enemy.boss) this.hud.banner('Повержен', enemy.bossName || '');
    if (rand() < (headshot ? 0.45 : 0.2)) this.say(headshot ? 'headshot' : 'kill', 0.4);
  }

  onWaveCleared() {
    if (!this.run.stats.noWaveHeal) this.player.heal(15);
    if (rand() < 0.5) this.say('waveClear', 1.2);
  }

  say(key, delay = 0) {
    if (this.barkCooldown > 0) return;
    this.barkCooldown = 6;
    const text = pickBark(key, this.lastBark);
    this.lastBark = text;
    setTimeout(() => this.hud.say(text), delay * 1000);
  }

  // Смена оружия: опустить текущее, подменить модель, поднять новое.
  handleWeaponSwitch(dt, input) {
    let want = -1;
    if (input.weapon === 1 || input.weapon === 2) want = input.weapon - 1;
    else if (input.weapon === 10 || input.weapon === -10) want = (this.weaponIndex + 1) % this.weapons.length;
    if (want >= 0 && want !== this.weaponIndex && this.switchTarget < 0 && want < this.weapons.length) {
      this.switchTarget = want;
      this.switchT = 0;
      this.audio.weaponSwap();
    }
    if (this.switchTarget >= 0) {
      this.switchT += dt;
      if (this.switchT > 0.2) {
        this.vm.root.remove(this.weapon.model);
        this.weaponIndex = this.switchTarget;
        this.weapon = this.weapons[this.weaponIndex];
        this.vm.root.add(this.weapon.model);
        this.switchTarget = -1;
        this.hud.lastAmmo = -1;
      }
    }
  }

  // ——— Цикл ———
  start() {
    if (this.scenario) return this.runScenario();
    let last = performance.now();
    this.hud.show('menu');
    // Автобот: проверка настоящего игрового цикла (таймеры, переходы, экраны выбора).
    const autobot = this.params.has('autobot');
    let botFrame = 0;
    if (autobot) {
      this.input.disabled = true;
      this.audio.enabled = false;
      setTimeout(() => { this.startRun(); this.player.maxHealth = this.player.health = 400; }, 500);
    }
    this.renderer.setAnimationLoop(() => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      let inp = this.input.consume();
      if (autobot && this.state === 'playing') inp = Object.assign(emptyInput(), SCENARIOS.flow.input(this, botFrame++) || {});
      this.frame(dt, this.state === 'playing' ? inp : emptyInput());
      this.adaptResolution(dt);
      this.hud.tickFps(dt, this.pixelRatio);
    });
  }

  async runScenario() {
    const sc = this.scenario;
    if (sc.menu) this.hud.show('menu');
    else { this.state = 'playing'; this.hud.show('hud'); }
    sc.setup?.(this);
    const steps = Number(this.params.get('steps') || sc.steps || 30);
    for (let i = 0; i < steps; i++) {
      const inp = Object.assign(emptyInput(), sc.input?.(this, i) || {});
      this.frame(1 / 60, this.state === 'playing' ? inp : emptyInput(), i === steps - 1);
      await null; // даём отработать промисам (выбор наград, переходы)
    }
    const gl = this.renderer.getContext();
    // Отдельный замер: сколько draw call-ов стоит мир (без пост-обработки).
    this.renderer.info.reset();
    this.renderer.info.autoReset = false;
    this.renderer.render(this.scene, this.camera);
    const worldCalls = this.renderer.info.render.calls, tris = this.renderer.info.render.triangles;
    this.renderer.info.autoReset = true;
    this.post.render(1 / 60);
    console.log('SCENARIO DONE', this.scenarioName, 'world calls', worldCalls, 'tris', tris, 'lights', this.scene.children.length && countLights(this.scene), 'gl', gl.getError(), 'enemies', this.enemies.list.length, 'hp', Math.round(this.player.health));
    // Headless --screenshot не захватывает тяжёлый WebGL-холст — подменяем его картинкой.
    const img = new Image();
    img.src = this.renderer.domElement.toDataURL('image/png');
    img.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
    this.renderer.domElement.replaceWith(img);
  }

  frame(dt, input, render = true) {
    // Слоу-мо при убийстве и смерти.
    if (this.slowmo > 0) {
      this.slowmo -= dt;
      if (this.slowmo <= 0) this.timeScale = 1;
    } else this.timeScale = damp(this.timeScale, 1, 10, dt);
    const frozen = this.state === 'paused' || this.state === 'choice';
    const dtw = frozen ? 0 : dt * this.timeScale;
    this.time += dtw;
    this.barkCooldown -= dt;
    if (this.run.comboT > 0) { this.run.comboT -= dtw; if (this.run.comboT <= 0) { this.run.combo = 0; this.hud.combo(0, 1); } }
    this.input.lastInteract = input.interact;

    const playing = this.state === 'playing';
    const active = playing || this.state === 'transition' || this.state === 'victory';
    if (playing) {
      this.run.time += dtw;
      this.player.aiming = input.aim && this.player.alive && !this.weapon.reloading;
      this.player.update(dtw, input);
    } else if (this.state === 'menu') {
      // Заставка: медленный взгляд по двору.
      this.player.yaw = this.level.playerYaw + Math.sin(this.time * 0.12) * 0.25;
      this.player.pitch = 0.1 + Math.sin(this.time * 0.09) * 0.04;
    } else if (this.state === 'dead') this.player.update(dtw, emptyInput());
    this.player.applyCamera(this.camera, this.time);
    this.camera.updateMatrixWorld();
    if (!frozen) {
      if (playing && this.player.alive) this.handleWeaponSwitch(dtw, input);
      const down = !(active && this.player.alive) || this.switchTarget >= 0;
      this.vm.lowered = damp(this.vm.lowered, down ? 1 : 0, this.switchTarget >= 0 ? 18 : 9, dt);
      this.vm.update(dtw, this.camera, input);
      if (playing && this.player.alive && this.switchTarget < 0) this.weapon.update(dtw, input);
      else this.weapon.update(dtw, emptyInput());
      this.projectiles.update(dtw);
      this.flasks.update(dtw, playing && this.player.alive && this.switchTarget < 0 ? input : null);
      this.enemies.update(dtw);
      this.hazards.update(dtw);
      this.weather.update(dtw);
      if (this.fx) this.ambience.update(dtw);
      this.coins.update(dtw);
      this.zones.update(dtw);
      this.fx.update(dtw);
      this.level.update(dtw, this.time);
      for (const p of this.level.embers || []) this.fx.embers(p, 1);
      for (const p of this.level.smokers || []) {
        if (rand() < 0.3) this.fx.smoke.spawn({
          x: p.x + (rand() - 0.5), y: p.y, z: p.z + (rand() - 0.5), vx: 0.6, vy: 1.6 + rand(), vz: 0.3,
          life: 4 + rand() * 2, size: 1.2, size1: 5, r: 0.06, g: 0.05, b: 0.05, a: 0.35, drag: 0.3, spin: (rand() - 0.5) * 0.4,
        });
      }
      this.applyAuras(dtw);
    }
    this.vm.root.visible = this.state !== 'menu';
    if (this.gunlab && this.gunlab !== 'hip') {
      // Лаборатория оружия: модель в фиксированной позе для осмотра.
      const m = this.weapon.model;
      if (this.gunlab === 'side') { m.position.set(0, 0, -0.42); m.rotation.set(0, Math.PI / 2, 0); }
      else if (this.gunlab === 'right') { m.position.set(0, 0, -0.42); m.rotation.set(0, -Math.PI / 2, 0); }
      else if (this.gunlab === 'front') { m.position.set(0, -0.03, -0.35); m.rotation.set(0.2, 0.5, 0); }
      this.vm.root.position.set(0, 0, 0);
      this.vm.root.rotation.set(0, 0, 0);
    }

    // Сердцебиение и реплики на низком здоровье.
    if (playing && this.player.alive && this.player.health < 35) {
      this.heartbeat -= dt;
      if (this.heartbeat <= 0) { this.audio.heartbeat(); this.heartbeat = 0.85; }
      if (!this.saidLow) { this.saidLow = true; this.say('lowHealth'); }
    } else if (this.player.health > 50) this.saidLow = false;

    fogUniforms.fogTime.value = this.time;
    this.sky.position.copy(this.camera.position);
    this.sky.userData.uniforms.uTime.value = this.time;
    if (this.state !== 'menu') this.hud.update(dt);
    if (this.audio.ctx) {
      const f = this.camera.getWorldDirection(new THREE.Vector3());
      this.audio.updateListener(this.camera.position, f, this.camera.up);
      const lvlId = this.level.atmosphere.indoor ? 'crypt' : (this.run.biomeDef?.id || 'cathedral');
      this.audio.music?.update(dt, { combat: playing && this.enemies.alive > 0, boss: !!this.enemies.bossEnemy?.alive, biome: this.state === 'menu' ? 'cathedral' : lvlId });
    }
    if (render) {
      this.updateGodRays();
      this.fx.setScale(this.renderer.domElement.height, this.camera.fov);
      this.post.grade.uTime.value = this.time;
      this.post.render(dt);
    }
  }

  // Экранная позиция луны для лучей; сила зависит от того, насколько луна в кадре.
  updateGodRays() {
    const a = this.level.atmosphere, u = this.post.rays;
    if (a.indoor) { u.uIntensity.value = 0; return; }
    const cam = this.camera;
    const p = this._sunV ||= new THREE.Vector3();
    p.copy(a.moonDir).multiplyScalar(400).add(cam.position).project(cam);
    const facing = cam.getWorldDirection(this._dirV ||= new THREE.Vector3()).dot(a.moonDir);
    u.uSun.value.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    const edge = Math.max(Math.abs(p.x), Math.abs(p.y));
    const vis = facing > 0 ? (1 - THREE.MathUtils.smoothstep(edge, 1.0, 1.8)) * THREE.MathUtils.smoothstep(facing, 0.1, 0.6) : 0;
    u.uIntensity.value = vis * (a.godRays ?? 1) * (1 + this.weather.flashNow * 2);
  }

  // Ауры реликвий (чеснок) и удары молний в грозу.
  applyAuras(dt) {
    const s = this.run.stats;
    if (s.garlicDps > 0 && this.player.alive) {
      for (const e of this.enemies.list) {
        if (e.alive && e.pos.distanceTo(this.player.pos) < 2.4) e.dot(s.garlicDps * dt);
      }
    }
  }
}
