// Боевая логика: хитскан, снаряды, применение урона и отклик (кровь, хитмаркер, слоу-мо).
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
    let stopped = false;
    for (const h of hits) {
      this.applyHit(h.enemy, h, dir, opts);
      if (pierce-- <= 0) { stopped = true; break; }
    }
    if (!stopped && wh) {
      game.fx.impact(wh.point, wh.normal);
      game.audio.hitStone(wh.point);
    }
    return { world: wh, enemies: hits };
  }

  applyHit(enemy, hit, dir, opts) {
    const game = this.game;
    const headshot = hit.part === 'head';
    const stats = game.run.stats;
    let dmg = opts.damage * (headshot ? opts.headMul ?? 2 : 1) * randRange(0.93, 1.07);
    const crit = Math.random() < stats.critChance;
    if (crit) dmg *= 2;
    const killed = enemy.takeDamage(dmg, { dir, headshot, knockback: opts.knockback, source: opts.source });
    game.fx.blood(hit.point, dir, killed ? 1.5 : 1, { headshot });
    game.audio.hitFlesh(hit.point, headshot);
    game.audio.hitMarker(killed);
    game.hud.hitmarker(headshot, killed);
    game.hud.damageNumber(hit.point, dmg, headshot || crit);
    if (stats.lifesteal > 0) game.player.heal(dmg * stats.lifesteal);
    if (killed) game.onEnemyKilled(enemy, { headshot, source: opts.source });
    return killed;
  }
}

export { V3 };
