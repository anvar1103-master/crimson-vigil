// Главный класс игры: рендерер, сцены, цикл, состояния (меню / игра / пауза / смерть).
import * as THREE from 'three';
import { createSky, createEnvironment } from '../core/sky.js';
import { createPost } from '../core/post.js';
import { fogUniforms } from '../core/fog.js';
import { seedRandom, damp } from '../core/util.js';
import { Input, emptyInput } from '../core/input.js';
import { AudioEngine } from '../core/audio.js';
import { buildCathedralYard } from '../world/cathedralYard.js';
import { Player } from './player.js';
import { ViewModel } from './viewmodel.js';
import { Revolver } from './weapons/revolver.js';
import { Crossbow, Projectiles } from './weapons/crossbow.js';
import { FX } from './fx.js';
import { Combat } from './combat.js';
import { EnemyManager } from './enemies/director.js';
import { Run } from './run.js';
import { HUD } from '../ui/hud.js';
import { pickBark } from './barks.js';
import { SCENARIOS } from './scenarios.js';

export class Game {
  constructor(container, uiRoot) {
    this.container = container;
    this.params = new URLSearchParams(location.search);
    this.scenarioName = this.params.get('scenario');
    this.scenario = this.scenarioName ? SCENARIOS[this.scenarioName] || {} : null;
    if (this.scenario) seedRandom(Number(this.params.get('seed') || 1));
    this.settings = { fov: 68, showHands: false, sensitivity: 1 };

    const renderer = (this.renderer = new THREE.WebGLRenderer({
      antialias: false, powerPreference: 'high-performance',
      preserveDrawingBuffer: !!this.scenario,
    }));
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
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
    if (this.scenario) this.audio.enabled = false;
    this.input = new Input(renderer.domElement);
    this.input.onLockChange = (locked) => this.onLockChange(locked);

    this.post = createPost(renderer, this.scene, this.camera, this.vmScene, this.vmCamera);
    this.loadLevel();
    this.run = new Run();
    this.player = new Player(this);
    this.vm = new ViewModel(this);
    this.fx = new FX(this);
    this.combat = new Combat(this);
    this.enemies = new EnemyManager(this);
    this.hud = new HUD(this, uiRoot);
    this.projectiles = new Projectiles(this);
    this.weapons = [new Revolver(this), new Crossbow(this)];
    this.weaponIndex = 0;
    this.weapon = this.weapons[0];
    this.vm.root.add(this.weapon.model);
    this.switchTarget = -1;
    this.switchT = 0;
    this.player.reset(this.level.playerStart, this.level.playerYaw);

    this.hud.startBtn.addEventListener('click', () => this.startRun());
    this.hud.pause.addEventListener('click', () => this.input.lock());
    this.hud.death.querySelector('.again').addEventListener('click', () => this.startRun());

    this.onResize();
    addEventListener('resize', () => this.onResize());
  }

  loadLevel() {
    if (this.level) this.level.dispose();
    this.level = buildCathedralYard(this.scene);
    this.applyAtmosphere(this.level.atmosphere);
  }

  applyAtmosphere(a) {
    const scene = this.scene;
    scene.fog = new THREE.FogExp2(a.fogColor, a.fogDensity);
    scene.background = new THREE.Color(a.fogColor);
    fogUniforms.fogMistColor.value.setRGB(...a.mistColor);
    fogUniforms.fogGround.value = a.mistGround;

    if (this.sky) scene.remove(this.sky);
    this.sky = createSky({ horizon: a.skyHorizon, zenith: a.skyZenith, moonDir: a.moonDir });
    scene.add(this.sky);

    if (this.lights) for (const l of this.lights) scene.remove(l);
    const moon = new THREE.DirectionalLight(a.moonLight, a.moonIntensity);
    moon.position.copy(a.moonDir).multiplyScalar(60);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
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

    const env = createEnvironment(this.renderer, { horizon: a.skyHorizon, zenith: a.skyZenith, moonDir: a.moonDir });
    scene.environment = env;
    scene.environmentIntensity = 0.35;
    // Оружию — более нейтральное окружение, иначе металл отражает только багровое небо.
    this.vmScene.environment = createEnvironment(this.renderer, {
      horizon: 0x4a3a40, zenith: 0x1a1a24, moonDir: new THREE.Vector3(-0.4, 0.7, 0.5), warmDir: new THREE.Vector3(0.8, 0.1, -0.3),
    });
    this.vmScene.environmentIntensity = 0.9;
  }

  onResize() {
    const w = innerWidth, h = innerHeight;
    const pr = Math.min(devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.camera.aspect = this.vmCamera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.updateProjectionMatrix();
    this.post.setSize(w, h, pr);
    this.fx?.setScale(h * pr, this.camera.fov);
  }

  // ——— Поток игры ———
  startRun() {
    this.audio.init();
    this.audio.resume();
    this.enemies.clear();
    this.fx.clear();
    this.projectiles.clear();
    this.run = new Run();
    this.player.reset(this.level.playerStart, this.level.playerYaw);
    for (const w of this.weapons) w.reset();
    this.state = 'playing';
    this.hud.show('hud');
    this.input.lock();
    this.enemies.startWaves();
    this.say('start', 0.6);
    setTimeout(() => this.audio.bell(), 300);
  }

  onLockChange(locked) {
    if (this.scenario) return;
    if (!locked && this.state === 'playing') { this.state = 'paused'; this.hud.show('pause'); }
    else if (locked && this.state === 'paused') { this.state = 'playing'; this.hud.show('hud'); }
  }

  onPlayerDeath() {
    this.slowmo = 1.2;
    this.timeScale = 0.35;
    setTimeout(() => {
      if (this.state !== 'playing' && this.state !== 'paused') return;
      this.state = 'dead';
      this.input.unlock();
      this.hud.showDeath(this.run);
    }, this.scenario ? 0 : 2200);
  }

  onEnemyKilled(enemy, { headshot }) {
    const run = this.run;
    run.kills++;
    if (headshot) run.headshots++;
    run.gold += 3 + Math.floor(Math.random() * 4);
    this.slowmo = headshot ? 0.22 : 0.14;
    this.timeScale = headshot ? 0.25 : 0.4;
    this.player.addTrauma(0.15);
    if (Math.random() < (headshot ? 0.5 : 0.25)) this.say(headshot ? 'headshot' : 'kill', 0.4);
  }

  onWaveCleared() {
    this.player.heal(20);
    this.say('waveClear', 1.2);
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
    this.renderer.setAnimationLoop(() => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      this.frame(dt, this.state === 'playing' ? this.input.consume() : (this.input.consume(), emptyInput()));
    });
  }

  runScenario() {
    const sc = this.scenario;
    if (sc.menu) this.hud.show('menu');
    else { this.state = 'playing'; this.hud.show('hud'); }
    sc.setup?.(this);
    const steps = Number(this.params.get('steps') || sc.steps || 30);
    for (let i = 0; i < steps; i++) {
      const inp = Object.assign(emptyInput(), sc.input?.(this, i) || {});
      this.frame(1 / 60, inp, i === steps - 1);
    }
    const gl = this.renderer.getContext();
    console.log('SCENARIO DONE', this.scenarioName, 'calls', this.renderer.info.render.calls, 'gl', gl.getError(), 'enemies', this.enemies.list.length, 'hp', Math.round(this.player.health));
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
    const dtw = dt * this.timeScale;
    this.time += dtw;
    this.barkCooldown -= dt;

    const playing = this.state === 'playing';
    if (playing) {
      this.run.time += dtw;
      this.player.aiming = input.aim && this.player.alive && !this.weapon.reloading;
      this.player.update(dtw, input);
    } else if (this.state === 'menu') {
      // Заставка: медленный взгляд по двору.
      this.player.yaw = this.level.playerYaw + Math.sin(this.time * 0.12) * 0.25;
      this.player.pitch = 0.1 + Math.sin(this.time * 0.09) * 0.04;
    }
    this.player.applyCamera(this.camera, this.time);
    this.camera.updateMatrixWorld();
    if (this.state !== 'paused') {
      if (playing && this.player.alive) this.handleWeaponSwitch(dtw, input);
      const down = !(playing && this.player.alive) || this.switchTarget >= 0;
      this.vm.lowered = damp(this.vm.lowered, down ? 1 : 0, this.switchTarget >= 0 ? 18 : 9, dt);
      this.vm.update(dtw, this.camera, input);
      if (playing && this.player.alive && this.switchTarget < 0) this.weapon.update(dtw, input);
      else this.weapon.update(dtw, emptyInput());
      this.projectiles.update(dtw);
      this.enemies.update(dtw);
      this.fx.update(dtw);
      this.level.update(dtw, this.time);
      for (const p of this.level.embers || []) this.fx.embers(p, 1);
    }
    this.vm.root.visible = this.state !== 'menu';
    if (this.gunlab) {
      const m = this.weapon.model;
      if (this.gunlab === 'side') { m.position.set(0.0, -0.0, -0.42); m.rotation.set(0, Math.PI / 2, 0); }
      else if (this.gunlab === 'front') { m.position.set(0, -0.03, -0.35); m.rotation.set(0.2, 0.5, 0); }
      this.vm.root.position.set(0, 0, 0); this.vm.root.rotation.set(0, 0, 0);
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
    if (playing || this.state === 'dead') this.hud.update(dt);
    if (this.audio.ctx) {
      const f = this.camera.getWorldDirection(new THREE.Vector3());
      this.audio.updateListener(this.camera.position, f, this.camera.up);
    }
    if (render) {
      this.fx.setScale(this.renderer.domElement.height, this.camera.fov);
      this.post.grade.uTime.value = this.time;
      this.post.render(dt);
    }
  }
}
