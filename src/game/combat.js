// Боевая логика: хитскан, взрывы, применение урона, эффекты реликвий и отклик (кровь, хитмаркер, слоу-мо).
import * as THREE from 'three';
import { randRange } from '../core/util.js';

const V3 = THREE.Vector3;

export class Combat {
  constructor(game) {
    this.game = game;
  }

  // Мгновенный выстрел. pierce — сколько врагов пробивает пуля дополнительно.
  hitscan(origin, dir, opts) {
    const game = this.game;
    const far = 140;
    const wh = game.level.raycast(origin, dir, far);
    const maxT = wh ? wh.distance : far;
    const hits = game.enemies.raycastAll(origin, dir, maxT);
    let pierce = opts.pierce || 0;
    let stopped = false, lastPoint = null;
    for (const h of hits) {
      this.applyHit(h.enemy, h, dir, opts);
      lastPoint = h.point;
      if (opts.ricochet && !opts.isRicochet) this.ricochet(h.enemy, h.point, opts);
      if (pierce-- <= 0) { stopped = true; break; }
    }
    if (!stopped && wh) {
      game.fx.impact(wh.point, wh.normal);
      if (!opts.quiet) game.audio.hitStone(wh.point);
      lastPoint = wh.point;
    }
    if (opts.explosive && lastPoint) this.explode(lastPoint, { radius: 3.2, damage: 45 * game.run.stats.damage });
    return { world: wh, enemies: hits };
  }

  // Рикошет: пуля отскакивает в ближайшего другого врага.
  ricochet(from, point, opts) {
    const game = this.game;
    const target = game.enemies.nearest(point, 10, from);
    if (!target) return;
    const to = target.center();
    const dir = to.clone().sub(point).normalize();
    // Видимый след рикошета.
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const p = point.clone().lerp(to, i / steps);
      game.fx.sparks.spawn({ x: p.x, y: p.y, z: p.z, life: 0.25, size: 0.05, size1: 0, r: 3, g: 2.6, b: 2, a: 1 });
    }
    const h = target.raycast(point, dir, 20);
    if (h) this.applyHit(target, h, dir, { ...opts, damage: opts.damage * opts.ricochet, isRicochet: true, ricochet: 0 });
  }

  explode(point, { radius = 3, damage = 40, color = 0xff7020 } = {}) {
    const game = this.game;
    game.fx.flash(point, { color, intensity: 50, dur: 0.25, distance: 12 });
    game.fx.ash(point, 1.5);
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, s = randRange(3, 9);
      game.fx.sparks.spawn({
        x: point.x, y: point.y, z: point.z, vx: Math.cos(a) * Math.cos(b) * s, vy: Math.sin(b) * s + 2, vz: Math.sin(a) * Math.cos(b) * s,
        life: randRange(0.3, 0.7), size: 0.08, size1: 0, r: 3.5, g: 1.4, b: 0.4, a: 1, drag: 2, gravity: 6,
      });
    }
    game.audio.burst({ type: 'lowpass', freq: 1200, freq1: 80, gain: 1.4, decay: 0.6, pos: point, reverb: 0.8 });
    game.audio.tone({ freq: 70, freq1: 30, gain: 1.0, decay: 0.4, pos: point });
    game.player.addTrauma(Math.max(0, 0.4 - point.distanceTo(game.player.pos) * 0.03));
    for (const e of game.enemies.list) {
      if (!e.alive) continue;
      const d = e.center().distanceTo(point);
      if (d > radius) continue;
      const dir = e.center().sub(point).normalize();
      const k = 1 - (d / radius) * 0.5;
      const killed = e.takeDamage(damage * k, { dir, knockback: 6 * k });
      game.hud.damageNumber(e.center(), damage * k, false);
      if (killed) game.onEnemyKilled(e, { headshot: false });
    }
  }

  applyHit(enemy, hit, dir, opts) {
    const game = this.game;
    const headshot = hit.part === 'head';
    const stats = game.run.stats;
    let dmg = opts.damage * (headshot ? opts.headMul ?? 2 : 1) * randRange(0.93, 1.07);
    const crit = Math.random() < stats.critChance;
    if (crit) dmg *= 2;
    if (game.run.empowered && !opts.isRicochet) {
      dmg *= stats.dashEmpower;
      game.run.empowered = false;
      game.fx.flash(hit.point, { color: 0xc0d0ff, intensity: 25, dur: 0.2, distance: 6 });
    }
    const killed = enemy.takeDamage(dmg, { dir, headshot, knockback: opts.knockback, source: opts.source });
    if (!killed) {
      if (stats.burnDps > 0) { enemy.burnT = 3; enemy.burnDps = stats.burnDps; }
      if (stats.slowOnHit > 0) { enemy.slowT = 1.5; enemy.slowAmt = stats.slowOnHit; }
    }
    game.fx.blood(hit.point, dir, killed ? 1.5 : 1, { headshot });
    if (!opts.quiet || killed) game.audio.hitFlesh(hit.point, headshot);
    game.audio.hitMarker(killed);
    game.hud.hitmarker(headshot, killed);
    game.hud.damageNumber(hit.point, dmg, headshot || crit);
    if (stats.lifesteal > 0) game.player.heal(dmg * stats.lifesteal);
    if (opts.holy) this.explode(hit.point, { radius: 3, damage: 40 * stats.damage, color: 0xd0e0ff });
    if (killed) game.onEnemyKilled(enemy, { headshot, source: opts.source });
    return killed;
  }
}
