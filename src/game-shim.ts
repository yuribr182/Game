/* Shim de migração (F1): monta o window.Game a partir do motor tipado
   (src/core/engine.ts), injetando a persistência via localStorage — que o
   core não pode tocar (fronteira do PRD §4.2).
   Desde a F2 do Modo Empresa Real, quem decide O QUE vai em window.Game é o
   src/real/boot.ts (jogo normal OU adaptador real) — este módulo só exporta a
   fábrica do jogo normal e o tipo global. Some na fase F5, quando ui/main
   deixarem de usar window.Game. */
import { createEngine } from './core/engine';
import type { Engine, Persistence } from './core/engine';
import { SAVE_KEY } from './core/state';

/** Cria o motor do jogo NORMAL (simulado), persistindo no localStorage. */
export function criarJogoNormal(): Engine {
  const persistence: Persistence = {
    read: () => localStorage.getItem(SAVE_KEY),
    write: (data) => localStorage.setItem(SAVE_KEY, data),
    clear: () => localStorage.removeItem(SAVE_KEY),
  };
  return createEngine(persistence);
}

import type { PonteRealApi } from './real/tipos';

declare global {
  interface Window {
    /** API do jogo (motor normal ou RealAdapter — mesma forma). */
    Game: Engine & {
      modoReal?: boolean;
      /** Só no modo real: snapshot da ponte + eventos p/ os painéis (ui-real). */
      real?: PonteRealApi;
      /** Só no modo real: resumo da etapa atual por projeto (balões do iso.js). */
      realResumo?: (projetoId: string) => string;
    };
  }
}
