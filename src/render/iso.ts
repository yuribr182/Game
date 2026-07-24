/* ===========================================================
   App Agency Tycoon — projeção isométrica (F2 do PRD)
   Portado 1:1 de js/iso.js: mesma matemática de tile 2:1.
   Base compartilhada pelo renderer Pixi (render/).
   =========================================================== */

/** dimensões de tile isométrico (2:1) */
export const TW = 64;
export const TH = 32;
export const HW = TW / 2;
export const HH = TH / 2;

export interface Pt {
  x: number;
  y: number;
}

/** coordenadas "mundo" (gx, gy) -> tela crua (px, sem câmera) */
export function iso(gx: number, gy: number): Pt {
  return { x: (gx - gy) * HW, y: (gx + gy) * HH };
}

/** canto de um cuboide com altura h em pixels */
export function corner(gx: number, gy: number, h = 0): Pt {
  return { x: (gx - gy) * HW, y: (gx + gy) * HH - h };
}

/** profundidade para z-sort (mesma regra do CLAUDE.md: gx+gy) */
export function depth(gx: number, gy: number): number {
  return gx + gy;
}
