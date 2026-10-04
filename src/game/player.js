// Охотник: движение от первого лица, камера (покачивание, тряска, отдача), здоровье, рывок.
import * as THREE from 'three';
import { clamp, damp, Spring } from '../core/util.js';

const V3 = THREE.Vector3;
const _fwd = new V3(), _right = new V3();

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new V3();
    this.vel = new V3();
    this.radius = 0.38;
    this.eye = 1.62;
    this.maxHealth = 100;
    this.walkSpeed = 4.4;
    this.sprintSpeed = 6.8;
    this.reset(new V3(), 0);
  }

  reset(pos, yaw) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0.06;
    this.health = this.maxHealth;
    this.alive = true;
    this.onGround = true;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.stepIndex = 0;
    this.landDip = new Spring(140, 14);
    this.kickPitch = new Spring(220, 22);
    this.kickYaw = new Spring(220, 22);
    this.fovKick = new Spring(120, 16);
    this.trauma = 0;
    this.roll = 0;
    this.dashCooldown = 0;
    this.dashTime = 0;
    this.dashDir = new V3();
    this.invuln = 0;
    this.deathTime = 0;
    this.sprinting = false;
    this.aiming = false;
    this.hurtTime = 0;
    this.speedMul = 1;
  }

  forward(out = new V3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  get eyePos() { return new V3(this.pos.x, this.pos.y + this.eye, this.pos.z); }

  update(dt, input) {
    const game = this.game;
    this.dashCooldown -= dt;
    this.invuln -= dt;
    this.hurtTime += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);

    if (!this.alive) {
      this.deathTime += dt;
      this.vel.set(0, 0, 0);
      return;
    }

    this.yaw -= input.lookX * (this.aiming ? 0.65 : 1);
    this.pitch = clamp(this.pitch - input.lookY * (this.aiming ? 0.65 : 1), -1.45, 1.45);

    const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * f + cy * s, wz = -cy * f - sy * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    this.sprinting = input.sprint && f > 0 && !this.aiming;
    const speed = (this.sprinting ? this.sprintSpeed : this.walkSpeed) * (this.aiming ? 0.62 : 1) * this.speedMul;
    const accel = this.onGround ? 13 : 2.5;
    this.vel.x = damp(this.vel.x, wx * speed, accel, dt);
    this.vel.z = damp(this.vel.z, wz * speed, accel, dt);

    // Рывок-уклонение.
    if (input.dash && this.dashCooldown <= 0) {
      if (wl > 0) this.dashDir.set(wx, 0, wz); else this.dashDir.set(-sy, 0, -cy);
      this.dashTime = 0.17;
      this.dashCooldown = 1.0;
      this.invuln = 0.3;
      this.fovKick.impulse(60);
      game.audio.dashWhoosh();
      game.hud?.dashUsed(1.0);
    }
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.vel.x = this.dashDir.x * 17;
      this.vel.z = this.dashDir.z * 17;
    }

    if (input.jump && this.onGround) {
      this.vel.y = 5.2;
      this.onGround = false;
    }
    this.vel.y -= 17 * dt;
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y <= 0) {
      if (!this.onGround && this.vel.y < -3) {
        this.landDip.impulse(this.vel.y * 0.35);
        game.audio.land();
      }
      this.pos.y = 0;
      this.vel.y = 0;
      this.onGround = true;
    }
    game.level.resolveCircle(this.pos, this.radius, this.pos.y);

    // Шаги и покачивание.
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const moving = this.onGround && hs > 0.6 && this.dashTime <= 0;
    this.bobAmount = damp(this.bobAmount, moving ? Math.min(hs / this.walkSpeed, 1.4) : 0, 9, dt);
    if (moving) {
      this.bobPhase += dt * hs * 1.38;
      const step = Math.floor(this.bobPhase / Math.PI);
      if (step !== this.stepIndex) {
        this.stepIndex = step;
        game.audio.footstep(game.level.atmosphere.rain, this.sprinting);
      }
    }
    this.roll = damp(this.roll, -s * 0.022 - (this.dashTime > 0 ? s * 0.05 : 0), 7, dt);
    this.landDip.update(dt);
    this.kickPitch.update(dt);
    this.kickYaw.update(dt);
    this.fovKick.update(dt);
  }

  // Отдача: мгновенный подброс камеры + пружина возврата.
  recoil(pitch, yaw) {
    this.kickPitch.impulse(pitch);
    this.kickYaw.impulse(yaw);
  }

  addTrauma(v) { this.trauma = Math.min(1, this.trauma + v); }

  damage(amount, from) {
    if (!this.alive || this.invuln > 0) return false;
    const game = this.game;
    amount *= game.run?.stats.damageTaken ?? 1;
    this.health -= amount;
    this.hurtTime = 0;
    this.addTrauma(0.45 + amount / 60);
    game.audio.hurt();
    game.hud?.damage(amount, from ? this.angleTo(from) : null);
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.deathTime = 0;
      game.onPlayerDeath();
    }
    return true;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.game.hud?.heal();
  }

  // Угол на источник относительно направления взгляда (для индикатора урона).
  angleTo(p) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const a = Math.atan2(-dx, -dz);
    return a - this.yaw;
  }

  applyCamera(camera, time) {
    const bob = this.bobAmount;
    const bobY = (Math.abs(Math.sin(this.bobPhase)) - 0.5) * 0.065 * bob;
    const bobX = Math.sin(this.bobPhase) * 0.035 * bob;
    const sh = this.trauma * this.trauma;
    const n = (k) => Math.sin(time * 37.1 * k) * 0.6 + Math.sin(time * 61.7 * k + 1.3) * 0.4;
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let eye = this.eye + this.landDip.x * 0.06 + bobY;
    let roll = this.roll + sh * 0.06 * n(1.3);
    if (!this.alive) {
      // Охотник падает на колени, потом на бок.
      const t = clamp(this.deathTime / 1.3, 0, 1);
      const e = 1 - (1 - t) ** 3;
      eye = this.eye * (1 - e * 0.82);
      roll += e * 0.9;
    }
    camera.position.set(this.pos.x, this.pos.y + eye, this.pos.z).addScaledVector(_right, bobX);
    camera.rotation.set(
      this.pitch + this.kickPitch.x * 0.01 + sh * 0.035 * n(1),
      this.yaw + this.kickYaw.x * 0.01 + sh * 0.035 * n(0.8),
      roll,
    );
    const base = this.game.settings.fov;
    const target = base + (this.sprinting ? 6 : 0) - (this.aiming ? 16 : 0) + this.fovKick.x * 0.1;
    camera.fov = damp(camera.fov, target, 10, 1 / 60);
    camera.updateProjectionMatrix();
  }
}

export { _fwd };
