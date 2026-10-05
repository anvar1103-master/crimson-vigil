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
      <div class="hint">R — перезарядка</div>
      <div class="flasks"></div>`);
    this.hud.append(this.ammo);
    this.cyl = this.ammo.querySelector('.cyl');
    this.boltIco = this.ammo.querySelector('.boltico');
    this.flasksEl = this.ammo.querySelector('.flasks');
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
    this.hintEl = h('div', 'hint');
    this.hud.append(this.hintEl);
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
      <div class="menurow"><button class="order small">Святилище Ордена</button><button class="codexbtn small">Бестиарий</button><button class="opts small">Настройки</button></div>
      <button class="hardbtn small hidden">Кровавая ночь: выкл</button>
      <div class="controls">
        <span><b>WASD</b> движение</span><span><b>Мышь</b> прицел</span><span><b>ЛКМ</b> огонь</span><span><b>ПКМ</b> прицеливание</span>
        <span><b>R</b> перезарядка</span><span><b>Shift</b> бег</span><span><b>Q</b> рывок</span><span><b>Space</b> прыжок</span><span><b>1/2/3</b> оружие</span><span><b>G</b> святая вода</span><span><b>E</b> действие</span>
      </div>
      <div class="foot">Гидеон Вейл · охотник на вампиров</div>
      <svg class="hero" viewBox="0 0 300 600" aria-hidden="true">
        <defs>
          <radialGradient id="heroGlow" cx=".5" cy=".3" r=".65"><stop offset="0" stop-color="#9a0a14" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
          <linearGradient id="rim" x1="0" x2="1"><stop offset=".55" stop-color="#ff3038" stop-opacity="0"/><stop offset="1" stop-color="#ff3038" stop-opacity=".9"/></linearGradient>
        </defs>
        <ellipse cx="160" cy="200" rx="160" ry="250" fill="url(#heroGlow)"/>
        <g fill="#060204">
          <!-- плащ: широкие плечи, разрез, подол колышется на ветру -->
          <path d="M150 168 C120 168 96 176 84 188 C70 204 66 240 64 280 C60 360 50 440 30 520 C24 548 14 572 6 590 C40 584 70 596 96 588 C110 560 118 520 126 470 L140 470 L150 600 L196 596 C204 560 212 520 216 470 C226 520 240 556 262 584 C276 590 292 584 300 586 C282 540 262 480 248 400 C240 340 236 270 228 216 C224 196 214 182 196 174 C182 169 166 168 150 168 Z"/>
          <!-- поднятый воротник -->
          <path d="M112 182 C108 158 114 138 124 126 L136 150 L150 168 L164 150 L178 126 C190 140 194 160 188 184 Z"/>
          <!-- лицо в тени шляпы -->
          <path d="M134 120 C134 140 140 156 152 160 C164 156 170 140 170 120 Z"/>
          <!-- шляпа: широкие поля, вмятая тулья -->
          <path d="M62 122 C90 106 214 102 244 118 C250 124 240 130 226 128 C190 120 112 122 80 132 C66 134 56 128 62 122 Z"/>
          <path d="M112 118 C112 92 118 72 134 66 C142 72 152 72 160 66 C178 70 188 92 190 116 Z"/>
          <!-- правая рука вдоль тела, опущенный револьвер -->
          <path d="M222 214 C236 250 240 300 236 338 L222 340 C224 300 218 262 206 234 Z"/>
          <path d="M220 334 L240 332 L244 344 L240 352 L244 400 L236 402 L230 354 L222 352 Z"/>
          <!-- левая рука придерживает полу плаща -->
          <path d="M86 214 C72 250 70 300 80 336 L94 332 C88 296 92 256 104 230 Z"/>
          <!-- сапоги -->
          <path d="M130 560 L148 560 L150 600 L120 600 Z"/><path d="M172 560 L192 560 L200 598 L170 600 Z"/>
        </g>
        <!-- ремень с флягами святой воды -->
        <rect x="86" y="300" width="146" height="9" fill="#120808"/>
        <g fill="#9ad0ff" opacity=".9"><rect x="104" y="309" width="7" height="13" rx="3"/><rect x="116" y="309" width="7" height="13" rx="3"/><rect x="128" y="309" width="7" height="13" rx="3"/></g>
        <!-- серебряная пряжка и крест Ордена -->
        <rect x="153" y="299" width="12" height="11" fill="#c8ccd4"/>
        <path d="M160 200 L160 236 M150 212 L170 212" stroke="#c8ccd4" stroke-width="3"/>
        <!-- контровой багровый свет справа -->
        <g fill="none" stroke="url(#rim)" stroke-width="3" stroke-linecap="round">
          <path d="M62 122 C90 106 214 102 244 118"/>
          <path d="M196 174 C214 182 224 196 228 216 C236 270 240 340 248 400 C262 480 282 540 300 586"/>
          <path d="M178 126 C190 140 194 160 188 184"/>
        </g>
      </svg>`);
    root.append(this.menu);
    this.startBtn = this.menu.querySelector('.start');
    this.orderBtn = this.menu.querySelector('.order');
    this.settingsBtn = this.menu.querySelector('.opts');
    this.codexBtn = this.menu.querySelector('.codexbtn');
    this.hardBtn = this.menu.querySelector('.hardbtn');

    this.pause = h('div', 'screen pause hidden', `<h2>Пауза</h2><div class="hint">Ночь подождёт. Недолго.</div>
      <div class="btns"><button class="resume">Вернуться в ночь</button><button class="opts small">Настройки</button><button class="quit small">Покинуть забег</button></div>`);
    root.append(this.pause);

    this.death = h('div', 'screen death hidden', `
      <h2>Вы пали</h2>
      <div class="epitaph"></div>
      <div class="stats"></div>
      <button class="again">Восстать снова</button>
      <button class="tomenu small">В главное меню</button>`);
    root.append(this.death);
    this.fpsEl = h('div', 'fps hidden');
    root.append(this.fpsEl);

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

  // Обучающие подсказки по очереди.
  hints(list) {
    clearTimeout(this.hintTimer);
    let i = 0;
    const next = () => {
      if (i >= list.length) { this.hintEl.classList.remove('show'); return; }
      this.hintEl.innerHTML = list[i++];
      this.hintEl.classList.remove('show');
      void this.hintEl.offsetWidth;
      this.hintEl.classList.add('show');
      this.hintTimer = setTimeout(next, 5200);
    };
    next();
  }

  // Кинематографичное появление босса: полосы сверху и снизу, крупное имя.
  bossIntro(name, sub) {
    if (!this.introEl) {
      this.introEl = h('div', 'bossintro', '<div class="bar top"></div><div class="bar bot"></div><div class="bt"><div class="bn"></div><div class="bs"></div></div>');
      this.root.append(this.introEl);
    }
    this.introEl.querySelector('.bn').textContent = name;
    this.introEl.querySelector('.bs').textContent = sub || '';
    this.introEl.classList.remove('show');
    void this.introEl.offsetWidth;
    this.introEl.classList.add('show');
  }

  // Счётчик серии убийств справа от прицела; полоска показывает, сколько осталось до сброса.
  combo(n, mul) {
    if (!this.comboEl) {
      this.comboEl = h('div', 'combo', '<div class="cn"></div><div class="cm"></div><div class="cb"><i></i></div>');
      this.hud.append(this.comboEl);
    }
    this.comboEl.classList.toggle('show', n >= 2);
    if (n < 2) return;
    this.comboEl.querySelector('.cn').textContent = `×${n}`;
    this.comboEl.querySelector('.cm').textContent = mul > 1 ? `золото ×${mul.toFixed(2)}` : 'серия';
    const bar = this.comboEl.querySelector('.cb i');
    bar.style.transition = 'none'; bar.style.width = '100%';
    void bar.offsetWidth;
    bar.style.transition = `width ${this.game.run.comboT}s linear`; bar.style.width = '0%';
    this.comboEl.classList.remove('pop'); void this.comboEl.offsetWidth; this.comboEl.classList.add('pop');
  }

  setFps(on) { this.fpsEl.classList.toggle('hidden', !on); }

  tickFps(dt, pr) {
    this.fpsAcc = (this.fpsAcc || 0) + dt;
    this.fpsN = (this.fpsN || 0) + 1;
    if (this.fpsAcc > 0.5) {
      this.fpsEl.textContent = `${Math.round(this.fpsN / this.fpsAcc)} FPS · ×${pr.toFixed(2)}`;
      this.fpsAcc = 0; this.fpsN = 0;
    }
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

  setMeta(meta, hard = false) {
    if (this.hardBtn) {
      this.hardBtn.classList.toggle('hidden', !(meta.wins > 0));
      this.hardBtn.textContent = `Кровавая ночь: ${hard ? 'вкл · урон тварей ×1.35, осколки ×1.75' : 'выкл'}`;
      this.hardBtn.classList.toggle('on', hard);
    }
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
    let row = this.death.querySelector('.relicrow');
    if (!row) { row = h('div', 'relicrow'); this.death.querySelector('.stats').after(row); }
    row.innerHTML = run.relics.map((r) => `<span title="${r.name}">${r.glyph}</span>`).join('');
    const m = Math.floor(run.time / 60), s = Math.floor(run.time % 60).toString().padStart(2, '0');
    this.death.querySelector('.stats').innerHTML =
      `<div><b>${run.kills}</b>упокоено</div><div><b>${run.headshots}</b>в голову</div><div><b>${run.depth + 1}</b>зон</div>` +
      `<div><b>${run.relics.length}</b>реликвий</div><div><b>×${run.bestCombo || 0}</b>серия</div><div><b>${m}:${s}</b>в ночи</div><div><b>◆ ${run.shardsEarned ?? 0}</b>осколков</div>`;
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

    // Фляги святой воды.
    const fl = game.flasks;
    if (fl && (fl.charges !== this.lastFlasks || fl.max !== this.lastFlaskMax)) {
      this.lastFlasks = fl.charges; this.lastFlaskMax = fl.max;
      const total = Math.max(fl.max + (game.run?.stats.extraFlasks || 0), fl.charges);
      this.flasksEl.innerHTML = '<span class="fk">G</span>' + Array.from({ length: total }, (_, i) => `<i class="${i < fl.charges ? 'on' : ''}"></i>`).join('');
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
