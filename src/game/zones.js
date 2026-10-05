// Зона ночи: волны → награда → врата с выбором пути. Плюс события (торговец, алтарь).
import * as THREE from 'three';
import { RewardAltar, HealingFont, Portal, Merchant, BloodAltar, Coffin } from '../world/interactables.js';
import { rollRelics, rollWeaponUpgrades, RELICS } from './relics.js';
import { REWARDS, MODIFIERS, BIOMES } from './run.js';
import { pick, randInt, rand } from '../core/util.js';
import { toRoman } from './enemies/director.js';

const V3 = THREE.Vector3;

const ZONE_NAMES = {
  village: ['Площадь висельников', 'Мельничный двор', 'Улица свечников', 'Чумной переулок', 'Рыночная площадь'],
  forest: ['Поляна шёпотов', 'Терновая лощина', 'Каменный круг', 'Гнилое болото', 'Старая просека'],
  cathedral: ['Двор собора', 'Разрушенный клуатр', 'Кладбище каноников', 'Колокольный двор'],
  castle: ['Внешний двор', 'Двор висельников', 'Галерея предков', 'Плац стражи'],
};
const BOSS_NAMES = {
  butcher: ['Мясник Холлоумира', 'Он ждал гостей к ужину'],
  broodmother: ['Матерь Стаи', 'Крылья заслоняют луну'],
  bellringer: ['Звонарь', 'Колокол звонит по тебе'],
  sovereign: ['Бледный Суверен', 'Сорок ночей он ждал тебя'],
};

export class ZoneController {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.portals = [];
    this.state = 'idle';
  }

  zoneTitle(z) {
    const b = BIOMES[z.biome];
    if (z.kind === 'boss') return { pre: b.name, title: BOSS_NAMES[b.boss][0], sub: BOSS_NAMES[b.boss][1] };
    if (!z.name) {
      const used = (this.game.run.usedNames ||= new Set());
      const free = ZONE_NAMES[b.id].filter((n) => !used.has(n));
      z.name = pick(free.length ? free : ZONE_NAMES[b.id]);
      used.add(z.name);
    }
    const name = z.name;
    const sub = z.modifier ? `${MODIFIERS[z.modifier].name} — ${MODIFIERS[z.modifier].desc.toLowerCase()}` : z.kind === 'elite' ? 'Испытание: элитные твари' : z.kind === 'event' ? REWARDS[z.reward].name : '';
    return { pre: `${b.name} · ${toRoman(z.index + 1)}`, title: name, sub };
  }

  clear() {
    for (const i of this.items) i.dispose();
    for (const p of this.portals) p.dispose();
    this.items = [];
    this.portals = [];
  }

  enter(zone) {
    const game = this.game, run = game.run;
    this.clear();
    this.zone = zone;
    run.zone = zone;
    this.state = 'fighting';
    game.flasks?.refill();
    const depth = run.depth;
    // Модификаторы зоны.
    run.zoneMods = { enemySpeed: 1, gold: 1, count: 1 };
    if (zone.modifier === 'bloodmoon') { run.zoneMods.enemySpeed = 1.2; run.zoneMods.gold = 2; }
    if (zone.modifier === 'frenzy') { run.zoneMods.count = 1.5; run.zoneMods.gold = 1.5; }
    if (zone.modifier === 'fog') game.scene.fog.density *= 1.6;
    game.weather.stormStrikes = zone.modifier === 'storm';
    if (zone.modifier === 'storm') game.weather.set({ rain: 1, lightning: true });

    const t = this.zoneTitle(zone);
    game.hud.setZone(t.title, `${BIOMES[zone.biome].short} · ${depth + 1}-я зона`, zone.modifier ? MODIFIERS[zone.modifier].name : '');

    if (zone.kind === 'event') {
      this.state = 'event';
      this.spawnEvent(zone);
      this.spawnExits();
      return;
    }
    const tier = depth + zone.biome * 0.5;
    if (zone.kind === 'boss') {
      game.enemies.startWaves({ boss: BIOMES[zone.biome].boss, bossName: BOSS_NAMES[BIOMES[zone.biome].boss][0], tier });
    } else {
      game.enemies.startWaves({
        waves: zone.kind === 'elite' ? 2 : 2 + (depth >= 4 ? 1 : 0),
        tier,
        elite: zone.kind === 'elite',
        countMul: run.zoneMods.count,
      });
      // Случайное событие: запечатанный гроб где-то на карте.
      if (rand() < (game.params?.has('coffin') ? 1 : 0.35)) this.spawnCoffin();
    }
  }

  spawnCoffin() {
    const game = this.game, L = game.level;
    const pts = L.spawnPoints.filter((p) => p.distanceTo(L.playerStart) > 8);
    const base = pick(pts.length ? pts : L.spawnPoints).clone();
    // Чуть внутрь арены от точки появления.
    const pos = base.multiplyScalar(0.78);
    L.resolveCircle(pos, 1.2, 0.5);
    const c = new Coffin(game, pos, (it) => {
      if (rand() < 0.6) {
        game.coins.burst(it.pos.clone().setY(0.8), 30, 2);
        game.coins.vial(it.pos.clone().add(new THREE.Vector3(0.8, 0, 0)), 30);
        game.audio.chestOpen();
        game.hud.banner('Сокровище усопшего', 'Мёртвым золото ни к чему');
      } else {
        const e = game.enemies.spawn('stalker', it.pos.clone().add(new THREE.Vector3(0, 0, 0.1)), { elite: true, hp: 300 });
        e.facing = Math.atan2(game.player.pos.x - e.pos.x, game.player.pos.z - e.pos.z);
        game.audio.screech(it.pos);
        game.hud.banner('Засада!', 'Гроб был не пуст');
        game.coins.burst(it.pos.clone().setY(0.8), 12, 2);
      }
    });
    this.items.push(c);
    game.hud.say(pick(['Свежая могила. И печать Ордена на крышке…', 'Запечатанный гроб. Кто-то очень не хотел, чтобы его открыли.', 'Гроб. Либо золото, либо неприятности.']));
  }

  // Вызывается директором, когда все волны зоны зачищены.
  onCleared() {
    const game = this.game, zone = this.zone;
    this.state = 'reward';
    const pos = game.level.rewardPoint.clone();
    if (zone.kind === 'boss') {
      game.run.bossesSlain++;
      if (zone.biome >= BIOMES.length - 1) { game.onVictory(); return; }
      this.spawnRelicAltar(pos, 'relic');
    } else if (zone.reward === 'relic' || zone.reward === 'elite') {
      this.spawnRelicAltar(pos, 'relic');
      if (zone.reward === 'elite') game.coins.burst(pos.clone().setY(1), 25, 2);
    } else if (zone.reward === 'weapon') {
      this.spawnRelicAltar(pos, 'weapon');
    } else if (zone.reward === 'gold') {
      game.coins.burst(pos.clone().setY(1.2), 40, 2);
      game.audio.chestOpen();
      this.spawnExits();
    } else if (zone.reward === 'heal') {
      const font = new HealingFont(game, pos, (it) => {
        game.player.maxHealth += 10;
        game.player.heal(game.player.maxHealth);
        game.audio.chestOpen();
        game.hud.banner('Исцеление', '+10 к макс. здоровью');
        it.consume();
        this.spawnExits();
      });
      this.items.push(font);
    } else this.spawnExits();
  }

  spawnRelicAltar(pos, type) {
    const game = this.game;
    const def = type === 'weapon' ? REWARDS.weapon : REWARDS.relic;
    const altar = new RewardAltar(game, pos, {
      glyph: def.glyph, color: def.color, prompt: type === 'weapon' ? 'E — к наковальне оружейника' : 'E — принять дар',
      onUse: async (it) => {
        const opts = type === 'weapon' ? rollWeaponUpgrades(game.run) : rollRelics(game.run);
        if (!opts.length) { it.consume(); this.spawnExits(); return; }
        const pickd = await game.choose({
          title: type === 'weapon' ? 'Оружейник' : 'Дар ночи',
          subtitle: type === 'weapon' ? 'Выберите одно улучшение' : 'Выберите одну реликвию',
          options: opts.map((o) => ({ ...o, rarity: type === 'weapon' ? 'upgrade' : o.rarity })),
        });
        if (pickd) {
          type === 'weapon' ? game.addUpgrade(pickd) : game.addRelic(pickd);
          it.consume();
          this.spawnExits();
        }
      },
    });
    this.items.push(altar);
  }

  spawnEvent(zone) {
    const game = this.game, pos = game.level.rewardPoint.clone();
    if (zone.reward === 'merchant') {
      const stock = rollRelics(game.run, 2).map((r) => ({ ...r, price: r.rarity === 'rare' ? 85 : r.rarity === 'cursed' ? 45 : 60, kind: 'relic' }));
      stock.push({ id: 'heal', name: 'Флакон крови', glyph: '⚗', desc: 'Восстанавливает 50 здоровья.', price: 25, rarity: 'item', kind: 'heal' });
      const up = rollWeaponUpgrades(game.run, 1)[0];
      if (up) stock.push({ ...up, price: 70, rarity: 'upgrade', kind: 'upgrade' });
      const m = new Merchant(game, pos, async () => {
        for (;;) {
          const opts = stock.map((s) => ({ ...s, disabled: s.sold || game.run.gold < s.price, rarityLabel: s.sold ? 'Продано' : undefined }));
          const p = await game.choose({ title: 'Гробовщик', subtitle: '«Мёртвым золото ни к чему. Вам — пригодится.»', options: opts, closable: true, footer: `У вас ◉ ${game.run.gold}` });
          if (!p) break;
          const s = stock.find((x) => x.id === p.id);
          game.run.gold -= s.price;
          s.sold = true;
          game.audio.coin();
          if (s.kind === 'relic') game.addRelic(RELICS.find((r) => r.id === s.id));
          else if (s.kind === 'upgrade') game.addUpgrade(s);
          else game.player.heal(50);
        }
      });
      this.items.push(m);
    } else if (zone.reward === 'altar') {
      const a = new BloodAltar(game, pos, async (it) => {
        const cursed = RELICS.filter((r) => r.rarity === 'cursed' && !game.run.relics.some((x) => x.id === r.id));
        const relic = cursed.length ? pick(cursed) : rollRelics(game.run, 1)[0];
        const p = await game.choose({
          title: 'Кровавый алтарь', subtitle: 'Чаша полна. Кровь просит крови.',
          options: [
            { id: 'drink', name: 'Испить', glyph: '☠', rarity: 'cursed', desc: `Потерять 25% макс. здоровья. Получить «${relic.name}» и 80 золота.` },
            { id: 'offer', name: 'Принести дар', glyph: '◉', rarity: 'common', desc: 'Отдать 50 золота — получить случайную реликвию.', disabled: game.run.gold < 50 },
            { id: 'leave', name: 'Уйти', glyph: '✝', rarity: 'choice', desc: 'Не всякая сила стоит души.' },
          ],
        });
        if (!p || p.id === 'leave') return;
        if (p.id === 'drink') {
          const loss = Math.round(game.player.maxHealth * 0.25);
          game.player.maxHealth -= loss;
          game.player.health = Math.min(game.player.health, game.player.maxHealth);
          game.addRelic(relic);
          game.coins.burst(it.pos.clone().setY(1.5), 40, 2);
          game.post.grade.uDamage.value = 1;
        } else {
          game.run.gold -= 50;
          game.addRelic(rollRelics(game.run, 1)[0]);
        }
        it.consume();
      });
      this.items.push(a);
    }
  }

  spawnExits() {
    if (this.portals.length) return;
    const game = this.game;
    const choices = game.run.nextChoices();
    const pts = game.level.exitPoints.slice();
    // Перемешиваем точки выхода, чтобы врата не стояли всегда на одних местах.
    for (let i = pts.length - 1; i > 0; i--) { const j = randInt(0, i); [pts[i], pts[j]] = [pts[j], pts[i]]; }
    choices.forEach((c, i) => {
      const pt = pts[i % pts.length];
      if (c.modifier) c.modifierName = MODIFIERS[c.modifier].name;
      const def = c.kind === 'boss' ? REWARDS.boss : c.kind === 'elite' ? REWARDS.elite : REWARDS[c.reward];
      const label = c.biome !== game.run.biome ? { ...def, name: BIOMES[c.biome].short } : def;
      this.portals.push(new Portal(game, pt.pos, pt.yaw, c, label, (ch) => game.transitionTo(ch)));
    });
    if (choices.length) {
      game.hud.banner('Путь открыт', choices.length > 1 ? 'Выберите врата' : 'Врата ждут');
      game.audio.bell();
    }
    this.state = 'exit';
  }

  update(dt) {
    const game = this.game;
    for (const i of this.items) i.update(dt);
    for (const p of this.portals) p.update(dt);
    // Подсказка и взаимодействие.
    let near = null;
    for (const i of this.items) if (i.near(game.player.pos)) { near = i; break; }
    game.hud.setPrompt(near && game.state === 'playing' ? near.prompt : '');
    if (near && game.input.lastInteract) near.interact();
  }
}

export { rand };
