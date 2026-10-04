// Главный класс игры: рендерер, сцены, цикл, состояние.
import * as THREE from 'three';
import { createSky, createEnvironment } from '../core/sky.js';
import { createPost } from '../core/post.js';
import { fogUniforms } from '../core/fog.js';
import { seedRandom } from '../core/util.js';
import { buildCathedralYard } from '../world/cathedralYard.js';

export class Game {
  constructor(container, uiRoot) {
    this.container = container;
    this.uiRoot = uiRoot;
    this.params = new URLSearchParams(location.search);
    this.scenarioName = this.params.get('scenario');
    if (this.scenarioName) seedRandom(Number(this.params.get('seed') || 1));

    const renderer = (this.renderer = new THREE.WebGLRenderer({
      antialias: false, powerPreference: 'high-performance',
      // Для headless-скриншотов кадр должен пережить композитинг.
      preserveDrawingBuffer: !!this.scenarioName,
    }));
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.05, 900);
    this.camera.rotation.order = 'YXZ';
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 20);

    this.time = 0;
    this.loadLevel();
    this.post = createPost(renderer, this.scene, this.camera, this.vmScene, this.vmCamera);
    this.onResize();
    addEventListener('resize', () => this.onResize());
  }

  loadLevel() {
    const level = (this.level = buildCathedralYard(this.scene));
    this.applyAtmosphere(level.atmosphere);
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
    this.vmScene.environment = env;
    this.vmScene.environmentIntensity = 0.6;
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
  }

  start() {
    const cam = this.params.get('cam');
    const s = this.level.playerStart;
    this.camera.position.set(s.x, 1.65, s.z);
    this.camera.rotation.set(0.12, this.level.playerYaw, 0);
    if (cam) {
      const [x, y, z, yaw, pitch] = cam.split(',').map(Number);
      this.camera.position.set(x, y, z);
      this.camera.rotation.set(pitch || 0, yaw || 0, 0);
    }
    if (this.scenarioName) {
      const steps = Number(this.params.get('steps') || 30);
      for (let i = 0; i < steps; i++) this.update(1 / 60);
      this.render(1 / 60);
      const gl = this.renderer.getContext();
      const px = new Uint8Array(4);
      gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      console.log('SCENARIO DONE', this.scenarioName, 'calls', this.renderer.info.render.calls, 'tris', this.renderer.info.render.triangles, 'center', [...px].join(','), 't', Math.round(performance.now()));
      // Headless --screenshot не захватывает тяжёлый WebGL-холст — подменяем его картинкой.
      const img = new Image();
      img.src = this.renderer.domElement.toDataURL('image/png');
      img.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:0';
      this.renderer.domElement.replaceWith(img);
      return;
    }
    let last = performance.now();
    this.renderer.setAnimationLoop(() => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      this.update(dt);
      this.render(dt);
    });
  }

  update(dt) {
    this.time += dt;
    fogUniforms.fogTime.value = this.time;
    this.sky.position.copy(this.camera.position);
    this.sky.userData.uniforms.uTime.value = this.time;
    this.level.update(dt, this.time);
  }

  render(dt) {
    if (this.params.has('nopost')) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.post.grade.uTime.value = this.time;
    this.post.render(dt);
  }
}
