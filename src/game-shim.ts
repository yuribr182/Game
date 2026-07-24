/* Shim de migração (F1): monta window.Game a partir do motor tipado
   (src/core/engine.ts), injetando a persistência via localStorage — que o
   core não pode tocar (fronteira do PRD §4.2). Precisa viver num módulo
   próprio importado ANTES de js/iso.js/ui.js/main.js em src/main.ts (imports
   são içados). Some na fase F5, quando ui/main deixam de usar window.Game. */
import { createEngine } from './core/engine';
import type { Persistence } from './core/engine';
import { SAVE_KEY } from './core/state';

const persistence: Persistence = {
  read: () => localStorage.getItem(SAVE_KEY),
  write: (data) => localStorage.setItem(SAVE_KEY, data),
  clear: () => localStorage.removeItem(SAVE_KEY),
};

const Game = createEngine(persistence);

declare global {
  interface Window {
    Game: typeof Game;
  }
}

window.Game = Game;
