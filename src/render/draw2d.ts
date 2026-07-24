/* ===========================================================
   App Agency Tycoon — primitivas de desenho Canvas 2D (F2 do PRD)
   Portado 1:1 de js/iso.js (cuboid/quad/shade/roundRect/shadow/tile
   + ambiente). O renderer Pixi usa isto para "assar" a arte procedural
   atual em texturas (RenderTexture/canvas), garantindo paridade visual
   (PRD §4.4). Também monta o toolkit `g` esperado por window.Props.
   =========================================================== */
import { iso, corner } from './iso';
import type { Layout } from './layout';

/** clareia/escurece cor hex -> rgb() (mesma função `shade` do js/iso.js) */
export function shade(hex: string, amt: number): string {
  const c = hex.replace('#', '');
  let r = parseInt(c.substr(0, 2), 16);
  let g = parseInt(c.substr(2, 2), 16);
  let b = parseInt(c.substr(4, 2), 16);
  r = Math.max(0, Math.min(255, Math.round(r + 255 * amt)));
  g = Math.max(0, Math.min(255, Math.round(g + 255 * amt)));
  b = Math.max(0, Math.min(255, Math.round(b + 255 * amt)));
  return `rgb(${r},${g},${b})`;
}

const mix = (a: number, b: number, k: number) => Math.round(a + (b - a) * k);
function mixColor(c1: number[], c2: number[], k: number): string {
  return `rgb(${mix(c1[0]!, c2[0]!, k)},${mix(c1[1]!, c2[1]!, k)},${mix(c1[2]!, c2[2]!, k)})`;
}

/** Toolkit passado ao pacote de arte legado (window.Props). */
export interface PropTK {
  ctx: CanvasRenderingContext2D;
  t: number;
  xy: typeof iso;
  corner: typeof corner;
  box: (gx: number, gy: number, sx: number, sy: number, h: number, top: string, left: string, right: string) => void;
  shade: typeof shade;
  roundRect: (x: number, y: number, w: number, h: number, r: number, fill: string) => void;
  quad: (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number, fill: string) => void;
  shadow: (gx: number, gy: number, rx: number, ry: number) => void;
}

/** Pincel isométrico sobre um contexto 2D (offscreen para o bake). */
export class Painter {
  constructor(public readonly ctx: CanvasRenderingContext2D) {}

  tile(gx: number, gy: number, w: number, h: number, fill: string | CanvasGradient, stroke?: string): void {
    const ctx = this.ctx;
    const a = iso(gx, gy),
      b = iso(gx + w, gy),
      c = iso(gx + w, gy + h),
      d = iso(gx, gy + h);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  quad(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number, fill: string | CanvasGradient): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  cuboid(gx: number, gy: number, sx: number, sy: number, h: number, top: string, left: string, right: string): void {
    const ctx = this.ctx;
    const A = iso(gx, gy),
      B = iso(gx + sx, gy),
      C = iso(gx + sx, gy + sy),
      D = iso(gx, gy + sy);
    this.quad(D.x, D.y, C.x, C.y, C.x, C.y - h, D.x, D.y - h, left);
    this.quad(B.x, B.y, C.x, C.y, C.x, C.y - h, B.x, B.y - h, right);
    ctx.beginPath();
    ctx.moveTo(A.x, A.y - h);
    ctx.lineTo(B.x, B.y - h);
    ctx.lineTo(C.x, C.y - h);
    ctx.lineTo(D.x, D.y - h);
    ctx.closePath();
    ctx.fillStyle = top;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(C.x, C.y - h);
    ctx.lineTo(C.x, C.y);
    ctx.stroke();
  }

  roundRect(x: number, y: number, w: number, h: number, r: number, fill: string): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  shadow(gx: number, gy: number, rx: number, ry: number): void {
    const ctx = this.ctx;
    const p = iso(gx, gy);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fill();
  }

  /** toolkit para o pacote de arte legado (window.Props). */
  toolkit(t = 0): PropTK {
    return {
      ctx: this.ctx,
      t,
      xy: iso,
      corner,
      box: this.cuboid.bind(this),
      shade,
      roundRect: this.roundRect.bind(this),
      quad: this.quad.bind(this),
      shadow: this.shadow.bind(this),
    };
  }

  // ---------- ambiente (portado das funções drawX de js/iso.js) ----------
  private drawTree(o: { gx: number; gy: number; s: number }, t: number): void {
    const ctx = this.ctx;
    const sc = o.s || 1;
    this.shadow(o.gx, o.gy, 10 * sc, 5 * sc);
    const p = iso(o.gx, o.gy);
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(p.x - 3 * sc, p.y - 18 * sc, 6 * sc, 18 * sc);
    const sway = Math.sin(t * 1.3 + o.gx * 2) * 2;
    ctx.fillStyle = '#2e8b48';
    ctx.beginPath();
    ctx.arc(p.x + sway, p.y - 26 * sc, 13 * sc, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#37a557';
    ctx.beginPath();
    ctx.arc(p.x + sway - 5 * sc, p.y - 31 * sc, 8 * sc, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawGround(W: number, H: number): void {
    this.tile(-2, -2, W + 4, H + 4.5, '#2e7d46');
    for (let gx = -2; gx < W + 2; gx += 1)
      for (let gy = -2; gy < H + 2.5; gy += 1) {
        if ((((gx + gy) | 0) % 2) === 0) this.tile(gx, gy, 1, 1, 'rgba(255,255,255,.02)');
      }
  }

  private drawRoad(W: number, H: number): void {
    const ctx = this.ctx;
    this.tile(-2.5, H + 1.1, W + 5, 1.1, '#33383f');
    ctx.save();
    for (let gx = -2; gx < W + 2.5; gx += 0.6) {
      const p = iso(gx, H + 1.65);
      ctx.fillStyle = 'rgba(255,220,120,.7)';
      ctx.fillRect(p.x - 5, p.y - 2, 10, 4);
    }
    ctx.restore();
  }

  private drawFloor(W: number, H: number): void {
    const ctx = this.ctx;
    for (let gx = 0; gx < W; gx += 1) {
      for (let gy = 0; gy < H; gy += 1) {
        const w = Math.min(1, W - gx),
          h = Math.min(1, H - gy);
        this.tile(gx, gy, w, h, (((gx + gy) | 0) % 2) === 0 ? '#6d7791' : '#646e88');
      }
    }
    ctx.save();
    ctx.beginPath();
    const a = iso(0, 0),
      b = iso(W, 0),
      c = iso(W, H),
      d = iso(0, H);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.clip();
    const cen = iso(W / 2, H / 2);
    const amb = ctx.createRadialGradient(cen.x, cen.y, 10, cen.x, cen.y, Math.max(W, H) * 32);
    amb.addColorStop(0, 'rgba(255,248,225,.18)');
    amb.addColorStop(1, 'rgba(255,248,225,0)');
    ctx.fillStyle = amb;
    ctx.fillRect(cen.x - 900, cen.y - 900, 1800, 1800);
    const glow = ctx.createLinearGradient(iso(0, 0).x, iso(0, 0).y, iso(W * 0.5, H * 0.5).x, iso(W * 0.5, H * 0.5).y);
    glow.addColorStop(0, 'rgba(255,180,80,.34)');
    glow.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.restore();
  }

  private drawFloorDecor(layout: Layout): void {
    const ctx = this.ctx;
    this.tile(0, 0, layout.KW, layout.KH, 'rgba(196,164,110,.28)');
    ctx.strokeStyle = 'rgba(0,0,0,.1)';
    ctx.lineWidth = 1;
    for (let gx = 0.55; gx < layout.KW; gx += 0.55) {
      const a = iso(gx, 0),
        b = iso(gx, layout.KH);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (let gy = 0.55; gy < layout.KH; gy += 0.55) {
      const a = iso(0, gy),
        b = iso(layout.KW, gy);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    layout.rugs.forEach((r) => {
      this.tile(r.gx, r.gy, r.w, r.h, r.col);
      this.tile(r.gx + 0.06, r.gy + 0.06, r.w - 0.12, r.h - 0.12, 'rgba(255,255,255,.04)');
    });
    layout.lamps.forEach((l) => {
      const p = iso(l.gx, l.gy);
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 46);
      g.addColorStop(0, 'rgba(255,244,210,.22)');
      g.addColorStop(1, 'rgba(255,244,210,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(1, 0.5);
      ctx.beginPath();
      ctx.arc(0, 0, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  private drawWalls(W: number, H: number, company: string, night: number): void {
    const ctx = this.ctx;
    const wallH = 74;
    const w0 = iso(0, 0),
      w1 = iso(0, H);
    const g = ctx.createLinearGradient(0, w0.y - wallH, 0, w1.y);
    g.addColorStop(0, '#2b3550');
    g.addColorStop(0.75, '#232c44');
    g.addColorStop(1, '#3a2f22');
    this.quad(w0.x, w0.y - wallH, w1.x, w1.y - wallH, w1.x, w1.y, w0.x, w0.y, g);
    this.quad(w0.x, w0.y, w1.x, w1.y, w1.x, w1.y - 6, w0.x, w0.y - 6, 'rgba(255,160,50,.35)');
    const n0 = iso(0, 0),
      n1 = iso(W, 0);
    const g2 = ctx.createLinearGradient(0, n0.y - wallH, 0, n1.y);
    g2.addColorStop(0, '#313b58');
    g2.addColorStop(0.75, '#28324c');
    g2.addColorStop(1, '#3a2f22');
    this.quad(n0.x, n0.y - wallH, n1.x, n1.y - wallH, n1.x, n1.y, n0.x, n0.y, g2);
    this.quad(n0.x, n0.y, n1.x, n1.y, n1.x, n1.y - 6, n0.x, n0.y - 6, 'rgba(255,160,50,.35)');

    const wallRect = (gxa: number, gxb: number, h1: number, h2: number, fill: string | null, stroke?: string) => {
      const A = iso(gxa, 0),
        B = iso(gxb, 0);
      if (fill) this.quad(A.x, A.y - h2, B.x, B.y - h2, B.x, B.y - h1, A.x, A.y - h1, fill);
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };
    const wallRectW = (gya: number, gyb: number, h1: number, h2: number, fill: string) => {
      const A = iso(0, gya),
        B = iso(0, gyb);
      this.quad(A.x, A.y - h2, B.x, B.y - h2, B.x, B.y - h1, A.x, A.y - h1, fill);
    };
    const winCol = night > 0.5 ? `rgba(255,214,120,${(0.1 + night * 0.3).toFixed(2)})` : 'rgba(150,200,255,.16)';
    for (let gy = 1.0; gy < H - 1.2; gy += 1.8) wallRectW(gy, gy + 0.9, 34, 60, winCol);

    if (W > 5) {
      wallRect(W - 2.3, W - 1.0, 26, 52, '#eef1f6');
      wallRect(W - 2.3, W - 1.0, 26, 52, null, 'rgba(0,0,0,.2)');
      const bp = iso(W - 1.65, 0);
      ctx.strokeStyle = '#4f8cff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bp.x - 14, bp.y - 44);
      ctx.lineTo(bp.x - 2, bp.y - 40);
      ctx.lineTo(bp.x + 10, bp.y - 46);
      ctx.stroke();
      ctx.strokeStyle = '#ff5c6c';
      ctx.beginPath();
      ctx.moveTo(bp.x - 12, bp.y - 34);
      ctx.lineTo(bp.x + 6, bp.y - 36);
      ctx.stroke();
    }

    const midp = iso(W / 2 - 1.1, 0);
    ctx.save();
    ctx.font = 'bold 19px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#4f8cff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#bcd4ff';
    ctx.fillText('★ ' + (company || 'AGÊNCIA').toUpperCase() + ' ★', midp.x, midp.y - wallH + 24);
    ctx.restore();
  }

  /** Desenha o ambiente completo (fundo estático) na ordem do js/iso.js. */
  drawEnvironment(layout: Layout, company: string, night: number, t = 0): void {
    const { W, H } = layout;
    this.drawGround(W, H);
    this.drawRoad(W, H);
    layout.bgTrees
      .slice()
      .sort((a, b) => a.gx + a.gy - (b.gx + b.gy))
      .forEach((tr) => this.drawTree(tr, t));
    this.drawWalls(W, H, company, night);
    this.drawFloor(W, H);
    this.drawFloorDecor(layout);
    layout.trees.forEach((tr) => this.drawTree(tr, t));
  }
}

/** cor do céu conforme o horário (dia -> noite), como no js/iso.js. */
export function skyStops(night: number): [string, string] {
  return [mixColor([58, 92, 140], [16, 24, 42], night), mixColor([26, 38, 58], [8, 12, 22], night)];
}
