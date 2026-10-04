// Сценарии для автоматических скриншотов: ?scenario=имя&steps=N.
// Игра делает N шагов по 1/60 с с заскриптованным вводом и рендерит один кадр.
import * as THREE from 'three';
import { RELICS } from './relics.js';

const V3 = THREE.Vector3;

function ahead(g, dist, side = 0) {
  const p = g.player;
  return new V3(p.pos.x - Math.sin(p.yaw) * dist + Math.cos(p.yaw) * side, 0, p.pos.z - Math.cos(p.yaw) * dist - Math.sin(p.yaw) * side);
}

function tame(e) { e.speed = 0; e.lungeCd = 1e9; e.attackCd = 1e9; }

export const SCENARIOS = {
  // Общий вид локации со стартовой точки.
  overview: { steps: 20 },
  // Молния (кадр на пике вспышки).
  lightning: { steps: 14, setup(g) { g.weather.strike(); } },

  // Вампир крупным планом (модель, свет, глаза).
  vampire: {
    steps: 140,
    setup(g) {
      g.player.pitch = 0.08;
      const e = g.enemies.spawn('stalker', ahead(g, 3.2));
      tame(e);
    },
  },

  // Бой: вампир приближается, выстрел в последний кадр (видна вспышка).
  combat: {
    steps: 125,
    setup(g) {
      const e = g.enemies.spawn('stalker', ahead(g, 9, 1.5));
      e.lungeCd = 1e9;
    },
    input(g, i) { return i === 122 ? { firePressed: true } : {}; },
  },

  // Попадание: кровь, хитмаркер, число урона.
  hit: {
    steps: 112,
    setup(g) {
      const e = g.enemies.spawn('stalker', ahead(g, 5));
      tame(e);
    },
    input(g, i) {
      if (i === 100) { const e = g.enemies.list[0]; g.player.pitch = Math.atan2(1.3 - 1.62, 5); void e; }
      return i === 104 ? { firePressed: true } : {};
    },
  },

  // Смерть вампира: горящее растворение.
  kill: {
    steps: 150,
    setup(g) {
      const e = g.enemies.spawn('stalker', ahead(g, 4.5));
      tame(e);
    },
    input(g, i) {
      if (i === 100) g.player.pitch = Math.atan2(1.8 - 1.62, 4.5);
      return i === 102 || i === 122 ? { firePressed: true } : {};
    },
  },

  // Перезарядка: барабан откинут.
  reload: {
    steps: 70,
    input(g, i) {
      if (i === 5 || i === 30) return { firePressed: true };
      if (i === 50) return { reload: true };
      return {};
    },
  },

  // Арбалет: выстрел колом по вампиру, кадр — кол в полёте.
  crossbow: {
    steps: 66,
    setup(g) {
      const e = g.enemies.spawn('stalker', ahead(g, 10));
      tame(e);
    },
    input(g, i) {
      if (i === 1) return { weapon: 2 };
      if (i === 40) g.player.pitch = Math.atan2(1.3 - 1.62, 10);
      return i === 62 ? { firePressed: true } : {};
    },
  },
  crossbowhit: {
    steps: 80,
    setup(g) { const e = g.enemies.spawn('stalker', ahead(g, 10)); tame(e); },
    input(g, i) {
      if (i === 1) return { weapon: 2 };
      if (i === 40) g.player.pitch = Math.atan2(1.3 - 1.62, 10);
      return i === 62 ? { firePressed: true } : {};
    },
  },

  // Поза перезарядки крупно: ?pose=rx,ry,rz для подбора.
  reloadpose: {
    steps: 60,
    setup(g) {
      g.weapon.ammo = 2; g.weapon.spent = 4; g.weapon.updateChambers();
      const p = g.params.get('pose');
      if (p) { const [rx, ry, rz] = p.split(',').map(Number); Object.assign(g.weapon.reloadPose, { rx, ry, rz }); }
    },
    input(g, i) { return i === 2 ? { reload: true } : {}; },
  },

  // Прицеливание.
  aim: { steps: 40, input() { return { aim: true }; } },

  // Урон по игроку.
  hurt: {
    steps: 60,
    setup(g) { g.player.damage(35, ahead(g, 2, -1)); g.player.health = 30; },
  },

  // Волны с режиссёром.
  waves: {
    steps: 400,
    setup(g) { g.enemies.startWaves(); },
  },

  // Оружие на фоне неба (проверка модели).
  gun: { steps: 30, setup(g) { g.player.pitch = 0.75; g.player.yaw = 0.6; } },

  // Лаборатория оружия: нейтральный фон, вид сбоку (?view=side|front|hip).
  gunlab: {
    steps: 5,
    setup(g) {
      g.level.root.visible = false;
      g.sky.visible = false;
      g.scene.background = new THREE.Color(0x3a3a40);
      g.hud.hud.style.display = 'none';
      g.gunlab = g.params.get('view') || 'side';
      const wi = Number(g.params.get('weapon') || 0);
      if (wi) { g.vm.root.remove(g.weapon.model); g.weaponIndex = wi; g.weapon = g.weapons[wi]; g.vm.root.add(g.weapon.model); }
    },
  },

  // QA-бот: сам целится в ближайшего вампира, стреляет, перезаряжается и отступает.
  // Прогоняет полный цикл волн и печатает итоги — ловит ошибки и дисбаланс.
  bot: {
    steps: 6000,
    setup(g) { g.enemies.startWaves(); g.botLog = []; },
    input(g, i) {
      const p = g.player, inp = {};
      if (i % 600 === 0) console.log(`BOT t=${(i / 60).toFixed(0)}s hp=${Math.round(p.health)} kills=${g.run.kills} wave=${g.run.wave} alive=${g.enemies.alive} ammo=${g.weapon.ammo}`);
      if (!p.alive) return inp;
      let best = null, bd = 1e9;
      for (const e of g.enemies.list) {
        if (!e.alive || e.state === 'rise') continue;
        const d = e.pos.distanceTo(p.pos);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) return inp;
      if (i % 600 === 0) console.log('  targets:', g.enemies.list.filter((e) => e.alive).map((e) => `${e.type}@${e.pos.x.toFixed(1)},${e.pos.y.toFixed(1)},${e.pos.z.toFixed(1)}:${e.state}`).join(' '));
      const hs = best.hitSpheres[best.type === 'bat' ? 0 : 1] || best.hitSpheres[0];
      const head = hs.node.localToWorld(hs.local.clone());
      const eye = g.camera.position;
      const dx = head.x - eye.x, dy = head.y - eye.y, dz = head.z - eye.z;
      const wantYaw = Math.atan2(-dx, -dz), wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
      let dyaw = wantYaw - p.yaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      inp.lookX = -Math.max(-0.12, Math.min(0.12, dyaw * 0.35));
      inp.lookY = -Math.max(-0.08, Math.min(0.08, (wantPitch - p.pitch) * 0.35));
      if (Math.abs(dyaw) < 0.04 && i % 4 === 0) inp.firePressed = true;
      if (g.weapon.ammo === 0) inp.reload = true;
      inp.back = bd < 6;
      inp.left = Math.floor(i / 90) % 2 === 0;
      inp.right = !inp.left;
      if (best.state === 'windup' && i % 30 === 0) inp.dash = true;
      return inp;
    },
  },

  // Полный цикл забега ботом: бой → награда → врата → следующая зона.
  flow: {
    steps: 9000,
    setup(g) {
      g.audio.enabled = false;
      g.startRun();
      g.player.maxHealth = g.player.health = 400; // бот слабый — даём ему форы, проверяем логику, а не баланс
      if (g.params.has('god')) g.run.stats.damage = 4;
      const ev = g.params.get('event');
      if (ev) { g.run.gold = 200; g.transitionTo({ kind: 'event', reward: ev, biome: 0, index: 1 }); }
    },
    input(g, i) {
      const p = g.player, inp = {};
      if (g.params.has('god')) { p.invuln = 1; p.health = p.maxHealth; }
      if (i % 900 === 0) console.log(`FLOW t=${(i / 60).toFixed(0)}s depth=${g.run.depth} biome=${g.run.biome} zone=${g.zones.state} hp=${Math.round(p.health)} kills=${g.run.kills} gold=${g.run.gold} relics=${g.run.relics.map((r) => r.id).join(',')} state=${g.state}`);
      if (!p.alive) return inp;
      const steer = (target, stopDist = 0.5) => {
        const dx = target.x - p.pos.x, dz = target.z - p.pos.z;
        const want = Math.atan2(-dx, -dz);
        let dy = want - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        inp.lookX = -Math.max(-0.15, Math.min(0.15, dy * 0.4));
        inp.lookY = (p.pitch - 0.0) * 0.2;
        inp.forward = Math.hypot(dx, dz) > stopDist && Math.abs(dy) < 1.2;
        // Застрял об объект — шаг вбок.
        const sp = Math.hypot(p.vel.x, p.vel.z);
        g.botStuck = inp.forward && sp < 0.5 ? (g.botStuck || 0) + 1 : 0;
        if (g.botStuck > 40 || g.botSide > 0) {
          g.botSide = (g.botSide || 50) - 1;
          inp.right = Math.floor(i / 300) % 2 === 0; inp.left = !inp.right;
          if (g.botSide <= 0) { g.botSide = 0; g.botStuck = 0; }
        }
        return Math.hypot(dx, dz);
      };
      if (i % 900 === 0) console.log(`  pos ${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)} portals: ${g.zones.portals.map((pt) => `${pt.pos.x.toFixed(1)},${pt.pos.z.toFixed(1)}`).join(' ')}`);
      const alive = g.enemies.list.filter((e) => e.alive && e.state !== 'rise');
      if (alive.length) return SCENARIOS.bot.input(g, i);
      g.botUsed ||= new WeakSet();
      const item = g.zones.items.find((it) => it.active && !g.botUsed.has(it));
      if (item) {
        const d = steer(item.pos, 1.2);
        if (d < 1.8 && i % 20 === 0) { inp.interact = true; g.botUsed.add(item); }
        return inp;
      }
      const portal = g.zones.portals.find((pt) => pt.active && pt.open > 0.6);
      if (portal) steer(portal.pos, 0);
      // Собираем монеты по пути.
      return inp;
    },
  },

  // Алтарь награды после зачистки.
  reward: {
    steps: 90,
    setup(g) {
      g.zones.enter({ kind: 'combat', reward: 'relic', biome: 0, index: 0 });
      g.enemies.stop();
      g.zones.onCleared();
      g.player.teleport(new V3(0, 0, 3), 0);
      g.player.pitch = -0.05;
    },
  },
  // Врата выбора пути.
  portals: {
    steps: 150,
    setup(g) {
      g.run.depth = 1;
      g.zones.enter({ kind: 'combat', reward: 'gold', biome: 0, index: 0 });
      g.enemies.stop();
      g.zones.spawnExits();
      g.player.teleport(new V3(1, 0, -6), 0.12);
      g.player.pitch = 0.12;
    },
  },
  // Карточки реликвий.
  cards: {
    steps: 10,
    setup(g) {
      g.choiceUI.show({ title: 'Дар ночи', subtitle: 'Выберите одну реликвию', options: [RELICS[0], RELICS[5], RELICS[21]] });
    },
  },

  // Бестиарий: все виды тварей в ряд (?boss=butcher|broodmother|bellringer|sovereign — один босс).
  bestiary: {
    steps: 100,
    setup(g) {
      const boss = g.params.get('boss');
      g.player.pitch = 0.1;
      if (boss) {
        g.enemies.startWaves({ boss, bossName: boss, tier: 0 });
        g.enemies.director.breakTimer = 0;
        g.level.bossPoint = ahead(g, boss === 'broodmother' ? 9 : 7);
        if (boss === 'broodmother') g.player.pitch = 0.42;
        return;
      }
      const types = ['thrall', 'stalker', 'witch', 'brute', 'bat'];
      types.forEach((t, i) => g.enemies.spawn(t, ahead(g, 6 + (t === 'brute' ? 2 : 0), (i - 2) * 1.9)));
      for (const e of g.enemies.list) { e.speed = 0; e.lungeCd = 1e9; e.attackCd = 1e9; e.chargeCd = 1e9; e.castCd = 1e9; e.diveCd = 1e9; }
    },
  },

  menu: { steps: 30, menu: true },
  death: { steps: 120, setup(g) { g.player.damage(500, ahead(g, 2)); } },
};
