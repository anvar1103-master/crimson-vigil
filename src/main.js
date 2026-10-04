// Точка входа.
import { Game } from './game/game.js';

addEventListener('error', (e) => console.error('ERROR', e.message, e.filename?.split('/').pop(), e.lineno));
addEventListener('unhandledrejection', (e) => console.error('REJECTION', e.reason?.stack || e.reason));

const game = new Game(document.getElementById('game'), document.getElementById('ui'));
window.game = game;
game.start();
