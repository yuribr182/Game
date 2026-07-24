/* ===========================================================
   App Agency Tycoon — camada de personagens (F2.2 do PRD)
   Cada personagem é um Sprite com um canvas próprio redesenhado a
   cada frame (bob/andar/digitar/balões) e enviado à GPU via
   texture.source.update(). Z-ordenado junto com os móveis (gx+gy).
   O boneco articulado por spritesheet é a fase F3.
   =========================================================== */
import { Container, Sprite, Texture } from 'pixi.js';
import { iso } from '../iso';
import { Painter } from '../draw2d';
import type { Worker } from '../entities';

// canvas por personagem: origem (pés) do boneco -> (AX, AY) no canvas
const CW = 64;
const CH = 96;
const AX = 32;
const AY = 80;

interface CharSprite {
  sprite: Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  painter: Painter;
  texture: Texture;
}

export class CharacterLayer {
  private items: CharSprite[] = [];

  constructor(
    private readonly world: Container,
    private readonly dpr: number,
  ) {}

  private create(): CharSprite {
    const canvas = document.createElement('canvas');
    canvas.width = CW * this.dpr;
    canvas.height = CH * this.dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context indisponível para personagem');
    // transforma origem(0,0) do boneco -> (AX,AY) em px CSS, na densidade dpr
    ctx.setTransform(this.dpr, 0, 0, this.dpr, AX * this.dpr, AY * this.dpr);
    const texture = Texture.from(canvas);
    const sprite = new Sprite(texture);
    sprite.anchor.set(AX / CW, AY / CH);
    sprite.width = CW;
    sprite.height = CH;
    this.world.addChild(sprite);
    return { sprite, canvas, ctx, painter: new Painter(ctx), texture };
  }

  /** desenha todos os personagens no frame t e reposiciona/z-ordena */
  render(workers: Worker[], t: number): void {
    while (this.items.length < workers.length) this.items.push(this.create());
    while (this.items.length > workers.length) {
      const it = this.items.pop()!;
      this.world.removeChild(it.sprite);
      it.sprite.destroy();
      it.texture.destroy(true);
    }
    workers.forEach((w, i) => {
      const it = this.items[i]!;
      // limpa o canvas preservando a transformação de âncora
      it.ctx.save();
      it.ctx.setTransform(1, 0, 0, 1, 0, 0);
      it.ctx.clearRect(0, 0, it.canvas.width, it.canvas.height);
      it.ctx.restore();
      it.painter.worker(w, t);
      it.texture.source.update();
      const p = iso(w.gx, w.gy);
      it.sprite.position.set(p.x, p.y);
      it.sprite.zIndex = w.gx + w.gy + 0.01;
    });
  }

  destroy(): void {
    for (const it of this.items) {
      it.sprite.destroy();
      it.texture.destroy(true);
    }
    this.items = [];
  }
}
