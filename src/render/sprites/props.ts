/* ===========================================================
   App Agency Tycoon — bake de sprites (F2.1b do PRD)
   "Assa" cada móvel/objeto UMA vez num canvas offscreen (arte
   procedural atual) e cacheia como Texture WebGL, por assinatura
   (tipo+cor+dims). O frame vira só transformações de GPU (PRD §4.4).
   =========================================================== */
import { Texture } from 'pixi.js';
import { Painter } from '../draw2d';

// canvas de bake: mundo (0,0) do objeto -> (AX, AY) no canvas.
// Margens generosas cobrem a extensão de todos os props atuais.
const BW = 220;
const BH = 220;
const AX = 110;
const AY = 150;

export interface Baked {
  texture: Texture;
  anchorX: number;
  anchorY: number;
  w: number;
  h: number;
}

export class PropBaker {
  private readonly cache = new Map<string, Baked>();

  constructor(private readonly dpr: number) {}

  /** textura cacheada para `key`; desenha via `draw` no primeiro acesso */
  get(key: string, draw: (p: Painter) => void): Baked {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(BW * this.dpr);
    cv.height = Math.ceil(BH * this.dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('2D context indisponível para bake de sprite');
    ctx.scale(this.dpr, this.dpr);
    ctx.translate(AX, AY);
    draw(new Painter(ctx));
    const baked: Baked = { texture: Texture.from(cv), anchorX: AX / BW, anchorY: AY / BH, w: BW, h: BH };
    this.cache.set(key, baked);
    return baked;
  }

  destroy(): void {
    for (const b of this.cache.values()) b.texture.destroy(true);
    this.cache.clear();
  }
}
