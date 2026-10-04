// Настройки: чувствительность, FOV, громкость, качество графики, счётчик кадров.
// Хранятся в localStorage; без хранилища просто действуют до перезагрузки.
const KEY = 'crimson-vigil-settings-v1';

export const DEFAULT_SETTINGS = { sensitivity: 1, fov: 68, volume: 0.8, quality: 'high', showFps: false, invertY: false, showHands: false };

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* хранилище недоступно */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* без сохранения */ }
}

export const QUALITY = {
  high: { label: 'Высокое', maxPixelRatio: 1.5, shadows: 2048, bloom: true, samples: 4 },
  medium: { label: 'Среднее', maxPixelRatio: 1.0, shadows: 1024, bloom: true, samples: 2 },
  low: { label: 'Низкое', maxPixelRatio: 0.75, shadows: 0, bloom: false, samples: 0 },
};

export class SettingsUI {
  constructor(root, game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.className = 'screen settings hidden';
    root.append(this.el);
  }

  open(onClose) {
    const s = this.game.settings;
    this.el.innerHTML = `
      <h2>Настройки</h2>
      <div class="rows">
        <label>Чувствительность мыши <span class="v" data-v="sensitivity"></span><input type="range" min="0.2" max="3" step="0.05" data-k="sensitivity"></label>
        <label>Поле зрения (FOV) <span class="v" data-v="fov"></span><input type="range" min="55" max="100" step="1" data-k="fov"></label>
        <label>Громкость <span class="v" data-v="volume"></span><input type="range" min="0" max="1" step="0.05" data-k="volume"></label>
        <label>Качество графики
          <select data-k="quality">${Object.entries(QUALITY).map(([k, q]) => `<option value="${k}">${q.label}</option>`).join('')}</select>
        </label>
        <label class="chk"><input type="checkbox" data-k="invertY"> Инвертировать ось Y</label>
        <label class="chk"><input type="checkbox" data-k="showFps"> Показывать FPS</label>
      </div>
      <div class="note">Разрешение подстраивается само, если кадров становится мало.</div>
      <button class="close">Готово</button>`;
    const sync = () => {
      for (const v of this.el.querySelectorAll('[data-v]')) {
        const k = v.dataset.v;
        v.textContent = k === 'volume' ? `${Math.round(s[k] * 100)}%` : k === 'fov' ? `${s[k]}°` : s[k].toFixed(2);
      }
    };
    for (const inp of this.el.querySelectorAll('[data-k]')) {
      const k = inp.dataset.k;
      if (inp.type === 'checkbox') inp.checked = !!s[k];
      else inp.value = s[k];
      inp.addEventListener('input', () => {
        const prevQ = s.quality;
        s[k] = inp.type === 'checkbox' ? inp.checked : inp.tagName === 'SELECT' ? inp.value : Number(inp.value);
        this.game.applySettings(prevQ !== s.quality);
        saveSettings(s);
        sync();
      });
    }
    sync();
    this.el.querySelector('.close').addEventListener('click', () => { this.el.classList.add('hidden'); onClose?.(); });
    this.el.classList.remove('hidden');
  }
}
