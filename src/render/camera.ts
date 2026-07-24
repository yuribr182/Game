/* ===========================================================
   App Agency Tycoon — câmera da cena (F2 do PRD)
   Portada de js/iso.js (buildCamera + input): roda = zoom no cursor,
   arrastar = pan, 2 dedos = pinça, duplo clique = reenquadra.
   Transforma um Container do Pixi em vez do ctx 2D.
   =========================================================== */
import type { Container } from 'pixi.js';
import { iso } from './iso';
import type { Layout } from './layout';

interface Cam {
  scale: number;
  ox: number;
  oy: number;
}
interface Ptr {
  x: number;
  y: number;
}

export interface CameraClick {
  worldX: number;
  worldY: number;
  screenX: number;
  screenY: number;
}

export class Camera {
  private cam: Cam = { scale: 1, ox: 0, oy: 0 };
  private fit: Cam = { scale: 1, ox: 0, oy: 0 };
  private dragging: { sx: number; sy: number; ox: number; oy: number; moved: boolean } | null = null;
  private readonly pointers = new Map<number, Ptr>();
  private pinch: { d0: number; cx0: number; cy0: number; scale0: number; ox0: number; oy0: number } | null = null;
  private layout: Layout | null = null;

  /** callback de clique (sem arrasto) — usado a partir do F2.1b (mesa/personagem) */
  onClick: ((c: CameraClick) => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('dblclick', this.reframe);
  }

  destroy(): void {
    const c = this.canvas;
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerCancel);
    c.removeEventListener('dblclick', this.reframe);
  }

  /** recomputa o enquadramento automático a partir do layout e do tamanho CSS */
  recompute(layout: Layout, cssW: number, cssH: number): void {
    this.layout = layout;
    const { W, H } = layout;
    const pts = [iso(-1.6, -1.6), iso(W + 1.6, -1.6), iso(W + 1.6, H + 2.4), iso(-1.6, H + 2.4)];
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    pts.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });
    minY -= 78; // altura das paredes
    maxY += 34; // personagens
    const contentW = maxX - minX,
      contentH = maxY - minY;
    const scale = Math.min(cssW / contentW, cssH / contentH) * 0.96;
    this.fit = {
      scale,
      ox: (cssW - contentW * scale) / 2 - minX * scale,
      oy: (cssH - contentH * scale) / 2 - minY * scale,
    };
    this.cam = { ...this.fit };
  }

  /** aplica a transformação da câmera ao container raiz da cena */
  apply(root: Container): void {
    root.scale.set(this.cam.scale);
    root.position.set(this.cam.ox, this.cam.oy);
  }

  private reframe = (): void => {
    this.cam = { ...this.fit };
  };

  private localXY(ev: { clientX: number; clientY: number }): Ptr {
    const r = this.canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  private onWheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    const m = this.localXY(ev);
    const factor = Math.pow(1.0015, -ev.deltaY);
    const ns = Math.max(this.fit.scale * 0.5, Math.min(this.fit.scale * 3.2, this.cam.scale * factor));
    this.cam.ox = m.x - (m.x - this.cam.ox) * (ns / this.cam.scale);
    this.cam.oy = m.y - (m.y - this.cam.oy) * (ns / this.cam.scale);
    this.cam.scale = ns;
  };

  private pinchInfo(): { d: number; cx: number; cy: number } {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), cx: (a!.x + b!.x) / 2, cy: (a!.y + b!.y) / 2 };
  }

  private onPointerDown = (ev: PointerEvent): void => {
    const m = this.localXY(ev);
    this.pointers.set(ev.pointerId, m);
    this.canvas.setPointerCapture(ev.pointerId);
    if (this.pointers.size === 2) {
      this.dragging = null;
      const pi = this.pinchInfo();
      this.pinch = { d0: pi.d, cx0: pi.cx, cy0: pi.cy, scale0: this.cam.scale, ox0: this.cam.ox, oy0: this.cam.oy };
    } else if (this.pointers.size === 1) {
      this.dragging = { sx: m.x, sy: m.y, ox: this.cam.ox, oy: this.cam.oy, moved: false };
    }
  };

  private onPointerMove = (ev: PointerEvent): void => {
    if (!this.pointers.has(ev.pointerId)) return;
    this.pointers.set(ev.pointerId, this.localXY(ev));
    if (this.pointers.size === 2 && this.pinch) {
      const pi = this.pinchInfo();
      const p = this.pinch;
      const ns = Math.max(this.fit.scale * 0.5, Math.min(this.fit.scale * 3.2, p.scale0 * (pi.d / Math.max(20, p.d0))));
      this.cam.ox = pi.cx - (p.cx0 - p.ox0) * (ns / p.scale0);
      this.cam.oy = pi.cy - (p.cy0 - p.oy0) * (ns / p.scale0);
      this.cam.scale = ns;
      return;
    }
    if (!this.dragging) return;
    const m = this.localXY(ev);
    const dx = m.x - this.dragging.sx,
      dy = m.y - this.dragging.sy;
    if (Math.hypot(dx, dy) > 5) this.dragging.moved = true;
    if (this.dragging.moved) {
      this.cam.ox = this.dragging.ox + dx;
      this.cam.oy = this.dragging.oy + dy;
    }
  };

  private onPointerUp = (ev: PointerEvent): void => {
    this.pointers.delete(ev.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const wasDrag = this.dragging && this.dragging.moved;
    this.dragging = null;
    if (wasDrag) return; // arrastou: não é clique
    const m = this.localXY(ev);
    if (this.onClick) {
      this.onClick({
        worldX: (m.x - this.cam.ox) / this.cam.scale,
        worldY: (m.y - this.cam.oy) / this.cam.scale,
        screenX: m.x,
        screenY: m.y,
      });
    }
  };

  private onPointerCancel = (ev: PointerEvent): void => {
    this.pointers.delete(ev.pointerId);
    this.pinch = null;
    this.dragging = null;
  };

  /** escala relativa ao enquadramento (para raios de clique dependentes do zoom) */
  get relScale(): number {
    return this.cam.scale / this.fit.scale;
  }
}
