/* Boot da Agência Real — modo ÚNICO (o jogo simulado foi aposentado em
   2026-07-28, a pedido do dono). A cena isométrica continua como identidade
   visual, mas todo dado exibido vem da ponte local (informações reais).
   Importado por src/main.ts ANTES dos legados — eles capturam window.Game na carga. */

import type { Engine } from '../core/engine';
import { criarAdaptadorReal } from './adapter';
import type { PonteRealApi } from './tipos';

declare global {
  interface Window {
    /** API que a cena/HUD consomem (forma do antigo Engine, dados reais). */
    Game: Engine & {
      modoReal?: boolean;
      /** Snapshot da ponte + eventos p/ os painéis (ui-real). */
      real?: PonteRealApi;
      /** Resumo da etapa atual por projeto (balões do iso.js). */
      realResumo?: (projetoId: string) => string;
      /** Últimas linhas de atividade por projeto (monitor ao vivo do boneco). */
      realLinhas?: (projetoId: string) => string[];
      /** Salas por time na cena: faixas de mesas [inicio, fim) por time. */
      salasCena?: () => { nome: string; emoji: string; inicio: number; fim: number }[];
    };
  }
}

window.Game = criarAdaptadorReal();
document.body.classList.add('modo-real');

// overlay "ponte desligada": tentar de novo
document.getElementById('btnPonteRetry')?.addEventListener('click', () => location.reload());
