// HUD и экраны меню на HTML/CSS поверх WebGL.
import * as THREE from 'three';
import { clamp, damp } from '../core/util.js';

const h = (tag, cls, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const _v = new THREE.Vector3();

export class HUD {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    root.innerHTML = '';

    // ——— Игровой HUD ———
    this.hud = h('div', 'hud hidden');
    root.append(this.hud);

    this.cross = h('div', 'crosshair', '<i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><b></b>');
    this.hit = h('div', 'hitmarker', '<i></i><i></i><i></i><i></i>');
    this.hud.append(this.cross, this.hit);

    this.health = h('div', 'health', `
      <div class="vial"><svg viewBox="0 0 40 40"><path d="M20 4 C 26 14, 34 20, 34 27 A 14 14 0 0 1 6 27 C 6 20, 14 14, 20 4 Z"/></svg></div>
      <div class="bar"><div class="lag"></div><div class="fill"></div><div class="shine"></div></div>
      <div class="num">100</div>`);
    this.hud.append(this.health);
    this.hFill = this.health.querySelector('.fill');
    this.hLag = this.health.querySelector('.lag');
    this.hNum = this.health.querySelector('.num');
    this.dash = h('div', 'dash', '<div class="dfill"></div><span>РЫВОК</span>');
    this.health.append(this.dash);
    this.dashFill = this.dash.querySelector('.dfill');

    this.ammo = h('div', 'ammo', `
      <div class="wname">Реквием</div>
      <div class="row"><svg class="cyl" viewBox="-50 -50 100 100"></svg>
        <svg class="boltico hidden" viewBox="0 0 120 30"><path d="M4 15 L22 6 L22 12 L100 12 L100 18 L22 18 L22 24 Z" class="tip"/><path d="M96 9 L116 4 L110 15 L116 26 L96 21 Z" class="fl"/></svg>
        <div class="count"><b>6</b><span>/6</span></div></div>
      <div class="hint">R — перезарядка</div>`);
    this.hud.append(this.ammo);
    this.cyl = this.ammo.querySelector('.cyl');
    this.boltIco = this.ammo.querySelector('.boltico');
    this.ammoNum = this.ammo.querySelector('.count b');
    this.ammoCap = this.ammo.querySelector('.count span');
    this.ammoHint = this.ammo.querySelector('.hint');
    this.wname = this.ammo.querySelector('.wname');
    this.buildCylinder();

    this.score = h('div', 'score', '<div class="kills"><b>0</b><span>упокоено</span></div><div class="wave"></div><div class="gold"><b>0</b><span>золота</span></div>');
    this.hud.append(this.score);
    this.killsNum = this.score.querySelector('.kills b');
    this.waveText = this.score.querySelector('.wave');
    this.goldNum = this.score.querySelector('.gold b');

    this.dirs = h('div', 'dmgdirs');
    this.hud.append(this.dirs);
    this.claws = h('div', 'claws', '<i></i><i></i><i></i>');
    this.hud.append(this.claws);
    this.numbers = h('div', 'numbers');
    this.hud.append(this.numbers);
    this.bannerEl = h('div', 'banner', '<div class="t"></div><div class="s"></div>');
    this.hud.append(this.bannerEl);
    this.bark = h('div', 'bark');
    this.hud.append(this.bark);
    this.prompt = h('div', 'prompt');
    this.hud.append(this.prompt);
    this.relicsEl = h('div', 'relics');
    this.hud.append(this.relicsEl);
    this.zoneEl = h('div', 'zoneinfo', '<div class="zn"></div><div class="zo"></div><div class="zm"></div>');
    this.hud.append(this.zoneEl);
    this.bossEl = h('div', 'bossbar hidden', '<div class="bn"></div><div class="bb"><div class="bl"></div><div class="bf"></div></div>');
    this.hud.append(this.bossEl);

    // ——— Меню ———
    this.menu = h('div', 'screen menu', `
      <div class="title-wrap">
        <div class="pre">Орден Серебряного Терна представляет</div>
        <h1>Crimson Vigil</h1>
        <div class="sub">Багровое бдение</div>
      </div>
      <div class="lore">Сорок ночей Багровая Луна не заходит над провинцией Варн.<br>Последний охотник Ордена идёт туда, откуда не возвращаются.</div>
      <button class="start">Начать охоту</button>
      <button class="order small">Святилище Ордена</button>
      <div class="controls">
        <span><b>WASD</b> движение</span><span><b>Мышь</b> прицел</span><span><b>ЛКМ</b> огонь</span><span><b>ПКМ</b> прицеливание</span>
        <span><b>R</b> перезарядка</span><span><b>Shift</b> бег</span><span><b>Q</b> рывок</span><span><b>Space</b> прыжок</span>
      </div>
      <div class="foot">Гидеон Вейл · охотник на вампиров</div>`);
    root.append(this.menu);
    this.startBtn = this.menu.querySelector('.start');
    this.orderBtn = this.menu.querySelector('.order');

    this.pause = h('div', 'screen pause hidden', '<h2>Пауза</h2><div class="hint">Щёлкните, чтобы вернуться в ночь</div>');
    root.append(this.pause);

    this.death = h('div', 'screen death hidden', `
      <h2>Вы пали</h2>
      <div class="epitaph"></div>
      <div class="stats"></div>
      <button class="again">Восстать снова</button>`);
    root.append(this.death);

    this.hpShown = 100;
    this.hpLag = 100;
    this.spread = 0;
    this.hitT = 1;
    this.bannerT = 99;
    this.barkT = 99;
    this.nums = [];
  }

  buildCylinder() {
    const ns = 'http://www.w3.org/2000/svg';
    this.cyl.innerHTML = `<circle r="44" class="outer"/><circle r="9" class="axis"/>`;
    this.chambers = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', (Math.cos(a) * 27).toFixed(2));
      c.setAttribute('cy', (Math.sin(a) * 27).toFixed(2));
      c.setAttribute('r', '11');
      c.setAttribute('class', 'ch');
      this.cyl.append(c);
      this.chambers.push(c);
    }
  }

  show(which) {
    this.menu.classList.toggle('hidden', which !== 'menu');
    this.pause.classList.toggle('hidden', which !== 'pause');
    this.death.classList.toggle('hidden', which !== 'death');
    this.hud.classList.toggle('hidden', which !== 'hud' && which !== 'pause');
  }

  crosshairKick(v) { this.spread = Math.min(this.spread + v, 1.6); }

  hitmarker(head, kill) {
    this.hitT = 0;
    this.hit.className = 'hitmarker show' + (head ? ' head' : '') + (kill ? ' kill' : '');
    void this.hit.offsetWidth;
  }

  setZone(name, sub, mod) {
    this.zoneEl.querySelector('.zn').textContent = name;
    this.zoneEl.querySelector('.zo').textContent = sub;
    this.zoneEl.querySelector('.zm').textContent = mod || '';
  }

  setRelics(relics) {
    this.relicsEl.innerHTML = relics.map((r) => `<div class="r ${r.rarity || ''}" title="${r.name}: ${r.desc}">${r.glyph}</div>`).join('');
  }

  showBoss(enemy) {
    this.boss = enemy;
    this.bossEl.classList.toggle('hidden', !enemy);
    if (enemy) {
      this.bossEl.querySelector('.bn').textContent = enemy.bossName || 'Повелитель ночи';
      this.bossLag = 1;
    }
  }

  damageNumber(point, dmg, special, dot = false) {
    const e = h('div', 'dnum' + (special ? ' crit' : '') + (dot ? ' dot' : ''), Math.round(dmg).toString());
    this.numbers.append(e);
    this.nums.push({ e, p: point.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.2, 0)), t: 0 });
    if (this.nums.length > 24) this.nums.shift().e.remove();
  }

  damage(amount, angle) {
    if (angle !== null && angle !== undefined) {
      const d = h('div', 'dir');
      d.style.transform = `rotate(${-angle}rad)`;
      this.dirs.append(d);
      setTimeout(() => d.remove(), 1100);
    }
    this.game.post.grade.uDamage.value = Math.min(1, this.game.post.grade.uDamage.value + 0.35 + amount / 50);
  }

  heal() { this.game.post.grade.uHeal.value = 1; }

  clawMarks() {
    this.claws.classList.remove('show');
    void this.claws.offsetWidth;
    this.claws.classList.add('show');
  }

  dashUsed() { this.dashFill.style.transition = 'none'; this.dashFill.style.width = '0%'; }

  banner(title, sub = '') {
    this.bannerEl.querySelector('.t').textContent = title;
    this.bannerEl.querySelector('.s').textContent = sub;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
  }

  say(text, who = 'Вейл') {
    this.bark.innerHTML = `<span class="who ${who === 'Вейл' ? '' : 'foe'}">${who}:</span> ${text}`;
    this.bark.classList.remove('show');
    void this.bark.offsetWidth;
    this.bark.classList.add('show');
  }

  setPrompt(text) {
    this.prompt.textContent = text || '';
    this.prompt.classList.toggle('show', !!text);
  }

  setMeta(meta) {
    let el = this.menu.querySelector('.metainfo');
    if (!el) {
      el = h('div', 'metainfo');
      this.menu.append(el);
    }
    el.innerHTML = meta.runs ? `<span>◆ ${meta.shards} кровавых осколков</span><span>Ночей: ${meta.runs}</span><span>Побед: ${meta.wins}</span>` : '';
  }

  showVictory(run) {
    this.death.querySelector('h2').textContent = 'Рассвет';
    this.death.querySelector('.epitaph').textContent = 'Багровая Луна гаснет. Впервые за сорок ночей над Варном встаёт солнце.';
    this.fillStats(run);
    this.death.classList.add('victory');
    this.show('death');
  }

  fillStats(run) {
    const m = Math.floor(run.time / 60), s = Math.floor(run.time % 60).toString().padStart(2, '0');
    this.death.querySelector('.stats').innerHTML =
      `<div><b>${run.kills}</b>упокоено</div><div><b>${run.headshots}</b>в голову</div><div><b>${run.depth + 1}</b>зон</div>` +
      `<div><b>${run.relics.length}</b>реликвий</div><div><b>${m}:${s}</b>в ночи</div><div><b>◆ ${run.shardsEarned ?? 0}</b>осколков</div>`;
  }

  showDeath(run) {
    this.death.querySelector('h2').textContent = 'Вы пали';
    this.death.classList.remove('victory');
    const lines = [
      'Луна взошла и над его могилой.', 'Серебро кончилось раньше, чем ночь.', 'Орден запомнит имя. Варн — нет.',
      'Даже охотники становятся добычей.',
    ];
    this.death.querySelector('.epitaph').textContent = lines[Math.floor(Math.random() * lines.length)];
    this.fillStats(run);
    this.show('death');
  }

  update(dt) {
    const game = this.game, p = game.player, w = game.weapon;
    // Здоровье: быстрая заливка + отстающая «потерянная» полоса.
    this.hpShown = damp(this.hpShown, p.health, 18, dt);
    this.hpLag = this.hpLag > p.health ? Math.max(p.health, this.hpLag - dt * 40 * (this.hpLagDelay > 0.5 ? 1 : 0)) : p.health;
    this.hpLagDelay = this.hpLag > p.health + 0.5 ? (this.hpLagDelay || 0) + dt : 0;
    const pct = (this.hpShown / p.maxHealth) * 100;
    this.hFill.style.width = `${pct}%`;
    this.hLag.style.width = `${(this.hpLag / p.maxHealth) * 100}%`;
    this.hNum.textContent = Math.ceil(p.health);
    this.health.classList.toggle('low', p.health < 35);
    game.post.grade.uLowHealth.value = clamp((40 - p.health) / 40, 0, 1);
    game.post.grade.uDamage.value = Math.max(0, game.post.grade.uDamage.value - dt * 1.6);
    game.post.grade.uHeal.value = Math.max(0, game.post.grade.uHeal.value - dt * 1.5);
    this.dashFill.style.transition = '';
    this.dashFill.style.width = `${clamp(1 - p.dashCooldown / 1.0, 0, 1) * 100}%`;

    // Патроны.
    if (w) {
      const ammo = w.ammo, cap = w.capacity;
      if (ammo !== this.lastAmmo || cap !== this.lastCap) {
        this.lastAmmo = ammo; this.lastCap = cap;
        this.ammoNum.textContent = ammo;
        this.ammoCap.textContent = `/${cap}`;
        this.chambers.forEach((c, i) => {
          c.style.display = i < cap ? '' : 'none';
          c.classList.toggle('full', i < ammo);
        });
        this.ammo.classList.toggle('empty', ammo === 0);
        const xb = w.kind === 'crossbow';
        this.cyl.classList.toggle('hidden', xb);
        this.boltIco.classList.toggle('hidden', !xb);
        this.boltIco.classList.toggle('full', ammo > 0);
      }
      this.cyl.style.transform = `rotate(${(w.drumAngle ?? 0) * (180 / Math.PI)}deg)`;
      this.ammoHint.textContent = w.reloading ? 'перезарядка…' : ammo === 0 ? 'R — перезарядка' : '';
      this.wname.textContent = w.name;
    }

    // Прицел расходится от отдачи и движения.
    const move = Math.min(Math.hypot(p.vel.x, p.vel.z) / 7, 1);
    this.spread = damp(this.spread, 0, 7, dt);
    const gap = 6 + (this.spread * 14 + move * 8 + (p.onGround ? 0 : 10)) * (p.aiming ? 0.2 : 1);
    this.cross.style.setProperty('--gap', `${gap}px`);
    this.cross.classList.toggle('aim', p.aiming);

    // Плавающие числа урона.
    const cam = game.camera;
    const W = innerWidth, H = innerHeight;
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.t += dt;
      if (n.t > 0.9) { n.e.remove(); this.nums.splice(i, 1); continue; }
      n.p.y += dt * 0.8;
      _v.copy(n.p).project(cam);
      if (_v.z > 1) { n.e.style.opacity = 0; continue; }
      n.e.style.transform = `translate(${(_v.x * 0.5 + 0.5) * W}px, ${(-_v.y * 0.5 + 0.5) * H}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.15 - n.t) * 4})`;
      n.e.style.opacity = String(1 - Math.max(0, n.t - 0.5) / 0.4);
    }

    const run = game.run;
    this.killsNum.textContent = run.kills;
    this.goldNum.textContent = run.gold;
    if (this.boss) {
      const k = Math.max(0, this.boss.hp / this.boss.maxHp);
      this.bossLag = Math.max(k, (this.bossLag ?? 1) - dt * 0.25);
      this.bossEl.querySelector('.bf').style.width = `${k * 100}%`;
      this.bossEl.querySelector('.bl').style.width = `${this.bossLag * 100}%`;
    }
  }
}
