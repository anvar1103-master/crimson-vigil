// Экран выбора: карточки реликвий/улучшений, лавка гробовщика, проклятый алтарь.
// Возвращает Promise с выбранным вариантом (или null, если закрыли).

const RARITY = { common: 'Обычная', rare: 'Редкая', cursed: 'Проклятая', upgrade: 'Оружие', item: 'Товар', choice: '' };

export class ChoiceUI {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'screen choice hidden';
    root.append(this.el);
    this.resolve = null;
    addEventListener('keydown', (e) => {
      if (!this.resolve) return;
      const n = Number(e.key);
      if (n >= 1 && n <= this.options.length) this.pick(n - 1);
      if (e.key === 'Escape' && this.closable) this.finish(null);
    });
  }

  get open() { return !!this.resolve; }

  // options: [{ name, desc, glyph, rarity, price?, disabled? }]
  show({ title, subtitle = '', options, closable = false, footer = '', wide = false, closeLabel = 'Уйти', paper = false }) {
    this.el.classList.toggle('compact', wide);
    this.el.classList.toggle('paper', paper);
    this.options = options;
    this.closable = closable;
    this.el.innerHTML = `
      <div class="ctitle">${title}</div>
      <div class="csub">${subtitle}</div>
      <div class="cards">${options.map((o, i) => `
        <div class="card ${o.rarity || ''} ${o.disabled ? 'disabled' : ''}" data-i="${i}" style="animation-delay:${i * 0.08}s">
          <div class="key">${i + 1}</div>
          <div class="glyph">${o.glyph || '✦'}</div>
          <div class="name">${o.name}</div>
          <div class="rar">${o.rarityLabel ?? RARITY[o.rarity] ?? ''}</div>
          <div class="desc">${o.desc}</div>
          ${o.price !== undefined ? `<div class="price">${o.price ? `◉ ${o.price}` : 'бесплатно'}</div>` : ''}
        </div>`).join('')}</div>
      ${closable ? `<button class="leave">${closeLabel}</button>` : ''}
      <div class="cfoot">${footer}</div>`;
    this.el.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => this.pick(Number(c.dataset.i))));
    this.el.querySelector('.leave')?.addEventListener('click', () => this.finish(null));
    this.el.classList.remove('hidden');
    return new Promise((res) => { this.resolve = res; });
  }

  pick(i) {
    const o = this.options[i];
    if (!o || o.disabled) return;
    this.finish(o);
  }

  finish(v) {
    this.el.classList.add('hidden');
    const r = this.resolve;
    this.resolve = null;
    r?.(v);
  }
}

// Затемнение и титульная карточка при переходе между зонами.
export class Transition {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'fade';
    this.el.innerHTML = '<div class="tc"><div class="tc-pre"></div><div class="tc-title"></div><div class="tc-sub"></div><div class="tc-lore"></div></div>';
    root.append(this.el);
  }
  async run(midway, { pre = '', title = '', sub = '', lore = '' } = {}) {
    this.el.querySelector('.tc-lore').innerHTML = lore;
    this.el.querySelector('.tc-pre').textContent = pre;
    this.el.querySelector('.tc-title').textContent = title;
    this.el.querySelector('.tc-sub').textContent = sub;
    this.el.classList.add('on');
    await wait(650);
    await midway();
    await wait(lore ? 9000 : title ? 1500 : 200);
    this.el.classList.remove('on');
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
