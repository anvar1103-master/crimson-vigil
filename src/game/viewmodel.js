// Риг оружия в руках: своя сцена и свет, покачивание при ходьбе, инерция при повороте, смена оружия.
import * as THREE from 'three';
import { Spring, damp, clamp } from '../core/util.js';

const V3 = THREE.Vector3;
const _q = new THREE.Quaternion(), _v = new V3();

export class ViewModel {
  constructor(game) {
    this.game = game;
    const scene = game.vmScene;
    this.root = new THREE.Group();
    scene.add(this.root);

    this.hemi = new THREE.HemisphereLight(0xb8aab8, 0x1a1012, 0.7);
    this.key = new THREE.DirectionalLight(0xf4ecf8, 2.6);
    this.key.target.position.set(0, 0, -0.3);
    this.fireLight = new THREE.PointLight(0xff8a40, 0, 3, 2);
    this.muzzleLight = new THREE.PointLight(0xffb060, 0, 2, 2);
    this.rim = new THREE.DirectionalLight(0xff4050, 0.25);
    this.rim.position.set(-1, 0.3, 0.5);
    scene.add(this.hemi, this.key, this.key.target, this.fireLight, this.muzzleLight, this.rim);

    this.swayX = new Spring(90, 11);
    this.swayY = new Spring(90, 11);
    this.lagX = 0; this.lagY = 0;
    this.switchT = 1;   // 0..1 подъём оружия
    this.lowered = 0;   // 0..1 опускание (смена/смерть)
  }

  update(dt, camera, input) {
    const game = this.game, player = game.player;
    // Лунный свет в пространстве камеры: оружие бликует при поворотах.
    _q.copy(camera.quaternion).invert();
    _v.copy(game.level.atmosphere.moonDir).applyQuaternion(_q);
    this.key.position.copy(_v).multiplyScalar(2);

    // Ближайший огонь подсвечивает оружие тёплым.
    let best = null, bd = 9;
    for (const f of game.level.fires) {
      if (!f.light) continue;
      const d = f.light.position.distanceTo(camera.position);
      if (d < bd) { bd = d; best = f; }
    }
    if (best) {
      _v.copy(best.light.position).sub(camera.position).applyQuaternion(_q).normalize().multiplyScalar(0.8);
      this.fireLight.position.copy(_v);
      const target = best.light.intensity * 0.12 * clamp(1 - bd / 9, 0, 1) ** 1.5;
      this.fireLight.intensity = damp(this.fireLight.intensity, target, 8, dt);
    } else this.fireLight.intensity = damp(this.fireLight.intensity, 0, 8, dt);

    // Инерция при повороте мыши.
    this.swayX.target = clamp(-input.lookX * 6, -0.12, 0.12);
    this.swayY.target = clamp(input.lookY * 6, -0.1, 0.1);
    this.swayX.update(dt); this.swayY.update(dt);

    const bob = player.bobAmount, ph = player.bobPhase;
    const aim = player.aiming ? 1 : 0;
    this.aimBlend = damp(this.aimBlend ?? 0, aim, 12, dt);
    const k = 1 - this.aimBlend * 0.85;
    const t = game.time;
    const breathe = Math.sin(t * 1.6) * 0.004;
    const sprint = player.sprinting ? 1 : 0;
    this.sprintBlend = damp(this.sprintBlend ?? 0, sprint, 8, dt);

    this.root.position.set(
      (Math.sin(ph) * 0.012 * bob + this.swayX.x * 0.12) * k,
      (-Math.abs(Math.cos(ph)) * 0.01 * bob + breathe + this.swayY.x * 0.1 + player.landDip.x * 0.012) * k - this.lowered * 0.35,
      0,
    );
    this.root.rotation.set(
      (this.swayY.x * 0.6 - this.sprintBlend * 0.35) * k - this.lowered * 0.6,
      (this.swayX.x * 0.8 + this.sprintBlend * 0.5) * k,
      (Math.sin(ph) * 0.02 * bob + this.swayX.x * 0.5) * k + this.sprintBlend * 0.25,
    );
    this.muzzleLight.intensity = damp(this.muzzleLight.intensity, 0, 30, dt);
  }
}
