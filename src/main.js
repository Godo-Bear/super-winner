import { Game } from './game.js';

const game = new Game(document.getElementById('game'));
// handy for debugging from the console / automated tests
window.__game = game;
