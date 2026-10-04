// Сценарии для автоматических скриншотов: ?scenario=имя&steps=N.
// Игра делает N шагов по 1/60 с с заскриптованным вводом и рендерит один кадр.
import * as THREE from 'three';

const V3 = THREE.Vector3;

function ahead(g, dist, side = 0) {
  const p = g.player;
  return new V3(p.pos.x - Math.sin(p.yaw) * dist + Math.cos(p.yaw) * side, 0, p.pos.z - Math.cos(p.yaw) * dist - Math.sin(p.yaw) * side);
}

function tame(e) { e.speed = 0; e.lungeCd = 1e9; e.attackCd = 1e9; }

export const SCENARIOS = {
  // Общий вид локации со стартовой точки.
  overview: { steps: 20 },

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
    },
  },

  menu: { steps: 30, menu: true },
  death: { steps: 120, setup(g) { g.player.damage(500, ahead(g, 2)); } },
};
