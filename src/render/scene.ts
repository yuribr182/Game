/* ===========================================================
   App Agency Tycoon — composição da cena (F2.1b do PRD)
   Compõe os sprites assados (móveis, mesas, cadeiras, paredes da
   cozinha, café, árvores da frente) sob a câmera, com z-sort por
   gx+gy (regra do CLAUDE.md). Reusa o toolkit do Painter para o
   pacote de arte legado (window.Props).
   =========================================================== */
import { Container, Sprite } from 'pixi.js';
import { iso } from './iso';
import { Painter } from './draw2d';
import type { PropTK } from './draw2d';
import { PropBaker } from './sprites/props';
import type { LoadedProp } from './sprites/assets';
import type { Layout } from './layout';
import type { GameState } from '../core/state';

declare global {
  interface Window {
    Props?: {
      draw: Record<string, (g: PropTK, gx: number, gy: number, opt?: { col?: string }) => void>;
    };
  }
}

export class Scene {
  private sprites: Sprite[] = [];
  private readonly baker: PropBaker;
  private assets = new Map<string, LoadedProp>();

  constructor(
    private readonly world: Container,
    dpr: number,
  ) {
    this.baker = new PropBaker(dpr);
  }

  /** define os assets de imagem reais carregados (usados no lugar do procedural) */
  setAssets(assets: Map<string, LoadedProp>): void {
    this.assets = assets;
  }

  private add(posGx: number, posGy: number, zIndex: number, key: string, draw: (p: Painter) => void): void {
    const b = this.baker.get(key, draw);
    const sp = new Sprite(b.texture);
    sp.anchor.set(b.anchorX, b.anchorY);
    sp.width = b.w;
    sp.height = b.h;
    const p = iso(posGx, posGy);
    sp.position.set(p.x, p.y);
    sp.zIndex = zIndex;
    this.world.addChild(sp);
    this.sprites.push(sp);
  }

  /** adiciona um sprite de imagem real (asset PNG) na posição de grade */
  private addImage(gx: number, gy: number, zIndex: number, loaded: LoadedProp): void {
    const sp = new Sprite(loaded.texture);
    sp.anchor.set(loaded.cfg.anchorX, loaded.cfg.anchorY);
    sp.scale.set(loaded.cfg.scale);
    const p = iso(gx, gy);
    sp.position.set(p.x, p.y);
    sp.zIndex = zIndex;
    this.world.addChild(sp);
    this.sprites.push(sp);
  }

  /** posiciona um asset real pelo footprint (aplica o offset do centro) */
  private placeAsset(baseGx: number, baseGy: number, zIndex: number, loaded: LoadedProp): void {
    this.addImage(baseGx + (loaded.cfg.offGx ?? 0), baseGy + (loaded.cfg.offGy ?? 0), zIndex, loaded);
  }

  /** recompõe todos os sprites da cena (chamado quando o layout/equipe muda) */
  rebuild(layout: Layout, state: GameState): void {
    for (const sp of this.sprites) {
      this.world.removeChild(sp);
      sp.destroy(); // mantém a textura (cache do baker)
    }
    this.sprites = [];

    // mesas compradas + cadeiras (encosto na frente do futuro personagem)
    const deskAsset = this.assets.get('desk');
    layout.desks.forEach((d, i) => {
      if (i >= state.desks) return;
      if (deskAsset) this.placeAsset(d.gx, d.gy, d.gx + d.gy, deskAsset);
      else this.add(d.gx, d.gy, d.gx + d.gy, 'desk', (p) => p.desk(0, 0));
      this.add(d.gx, d.gy, d.gx + d.gy + 0.7, 'chair', (p) => p.chair(0, 0));
    });

    // móveis: usa o asset real quando existe; senão, o desenho procedural
    const Props = window.Props;
    layout.furniture.forEach((f) => {
      const asset = this.assets.get(f.type);
      if (asset) {
        this.placeAsset(f.gx, f.gy, f.gx + f.gy, asset);
        return;
      }
      const fn = Props?.draw[f.type];
      if (!fn) return;
      this.add(f.gx, f.gy, f.gx + f.gy, `f:${f.type}:${f.col ?? ''}`, (p) => fn(p.toolkit(0), 0, 0, { col: f.col }));
    });

    // paredes internas da cozinha (profundidade pelo centro, como no legado)
    layout.kwalls.forEach((wl) => {
      const z = wl.gx + wl.sx / 2 + (wl.gy + wl.sy / 2);
      this.add(wl.gx, wl.gy, z, `wall:${wl.sx}:${wl.sy}`, (p) => p.innerWall(0, 0, wl.sx, wl.sy));
    });

    // máquina de café (asset real ou procedural)
    const coffeeAsset = this.assets.get('coffee');
    const coffeeZ = layout.coffee.gx + layout.coffee.gy;
    if (coffeeAsset) this.placeAsset(layout.coffee.gx, layout.coffee.gy, coffeeZ, coffeeAsset);
    else this.add(layout.coffee.gx, layout.coffee.gy, coffeeZ, 'coffee', (p) => p.coffee(0, 0, 0));

    // árvores da frente (z-ordenadas com o resto)
    layout.trees.forEach((tr) => {
      this.add(tr.gx, tr.gy, tr.gx + tr.gy, `tree:${tr.s}`, (p) => p.tree({ gx: 0, gy: 0, s: tr.s }, 0));
    });
  }

  destroy(): void {
    for (const sp of this.sprites) sp.destroy();
    this.sprites = [];
    this.baker.destroy();
  }
}
