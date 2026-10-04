// Точка входа.
import { Game } from './game/game.js';

addEventListener('error', (e) => console.error('ERROR', e.message, e.filename?.split('/').pop(), e.lineno));
addEventListener('unhandledrejection', (e) => console.error('REJECTION', e.reason?.stack || e.reason));

// Даём браузеру нарисовать экран загрузки, прежде чем генерировать текстуры и уровень.
const loading = document.getElementById('loading');
const boot = () => {
  const game = new Game(document.getElementById('game'), document.getElementById('ui'));
  window.game = game;
  game.start();
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 900);
};
if (new URLSearchParams(location.search).has('scenario')) { loading.remove(); boot(); }
else requestAnimationFrame(() => setTimeout(boot, 30));
