/* Ativa o renderer Pixi só quando a URL tem ?renderer=pixi (§4.3 do PRD:
   nasce em paralelo para comparação lado a lado). Registra-se como
   window.IsoOffice (mesma interface que js/iso.js) para que o js/main.js
   dirija a cena Pixi sem alterações. Sem a flag, este módulo é inerte e o
   renderer Canvas legado (js/iso.js) segue como padrão. */
import type { PixiRenderer } from './renderer';

declare global {
  interface Window {
    IsoOffice: {
      init(canvas: HTMLCanvasElement): void;
      resize(): void;
      popMoney(text: string): void;
      spawnClient(): void;
      npcInfo(i: number): { name: string; role: string | null } | null;
      workerScreenPos(i: number): { x: number; y: number } | null;
    };
  }
}

if (new URLSearchParams(location.search).get('renderer') === 'pixi') {
  let renderer: PixiRenderer | null = null;
  window.IsoOffice = {
    init(canvas: HTMLCanvasElement) {
      if (renderer) {
        renderer.resize();
        return;
      }
      // import dinâmico: o Pixi (pesado) só é baixado sob a flag, mantendo o
      // bundle inicial do renderer legado enxuto (code-splitting).
      void import('./renderer').then(({ PixiRenderer }) => {
        renderer = new PixiRenderer(canvas);
        void renderer.start();
      });
    },
    resize() {
      renderer?.resize();
    },
    // stubs até os marcos F2.1b/F2.2 (personagens, entregas, cliques):
    popMoney() {},
    spawnClient() {},
    npcInfo() {
      return null;
    },
    workerScreenPos() {
      return null;
    },
  };
}
