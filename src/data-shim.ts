/* Shim de migração (F1): expõe o core tipado como window.DATA para os
   consumidores legados (js/game.js, js/iso.js, js/ui.js). Como imports são
   içados, esta atribuição precisa viver num módulo próprio importado ANTES
   de js/game.js em src/main.ts. Some na fase F5. */
import { DATA } from './core/data';

declare global {
  interface Window {
    DATA: typeof DATA;
  }
}

window.DATA = DATA;
