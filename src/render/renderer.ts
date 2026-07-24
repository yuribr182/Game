/* ===========================================================
   App Agency Tycoon — renderer Pixi (F2 do PRD)
   Nasce em paralelo ao js/iso.js (ativado por ?renderer=pixi, §4.3).
   F2.1a: bootstrap + câmera + ambiente "assado" numa textura WebGL a
   partir da arte procedural atual (Painter -> canvas -> Texture, §4.4).
   Lê window.Game.state; personagens/FX chegam nos marcos seguintes.
   =========================================================== */
import { Application, Container, Sprite, Texture } from 'pixi.js';
import { iso } from './iso';
import { Painter, skyStops } from './draw2d';
import { buildLayout } from './layout';
import type { Layout } from './layout';
import { Camera } from './camera';
import { DAY_LENGTH } from '../core/state';
import type { GameState } from '../core/state';

const dpr = Math.min(window.devicePixelRatio || 1, 2);

/** 0 = dia claro, 1 = noite (segue o relógio do dia, como no js/iso.js) */
function nightFactor(s: GameState): number {
  return 1 - Math.sin((s.dayProgress / DAY_LENGTH) * Math.PI);
}

interface EnvBounds {
  minX: number;
  minY: number;
  w: number;
  h: number;
}

function envBounds(layout: Layout): EnvBounds {
  const { W, H } = layout;
  const corners: [number, number][] = [
    [-2.6, -1.8],
    [W + 2.2, -1.8],
    [W + 2.2, H + 2.6],
    [-2.6, H + 2.6],
  ];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [gx, gy] of corners) {
    const p = iso(gx, gy);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  minX -= 24;
  maxX += 24;
  minY -= 96; // paredes + letreiro
  maxY += 44; // árvores da frente / personagens
  return { minX, minY, w: maxX - minX, h: maxY - minY };
}

export class PixiRenderer {
  private app: Application | null = null;
  private readonly world = new Container();
  private readonly envSprite = new Sprite();
  private sky: Sprite | null = null;
  private camera: Camera;
  private layout: Layout | null = null;
  private lastTier = -1;
  private lastDecor = '';
  private lastCompany = '';
  private envTexture: Texture | null = null;
  private skyTexture: Texture | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.camera = new Camera(canvas);
    window.addEventListener('resize', this.resize);
  }

  async start(): Promise<void> {
    const app = new Application();
    const [w, h] = this.viewportSize();
    await app.init({
      canvas: this.canvas,
      width: w,
      height: h,
      resolution: dpr,
      autoDensity: true,
      antialias: true,
      background: '#0d1420',
    });
    this.app = app;
    this.sky = new Sprite();
    app.stage.addChild(this.sky);
    app.stage.addChild(this.world);
    this.world.sortableChildren = true;
    this.envSprite.zIndex = -1000;
    this.world.addChild(this.envSprite);
    this.rebuildIfNeeded(true);
    app.ticker.add(this.frame);
  }

  private viewportSize(): [number, number] {
    const el = this.canvas.parentElement ?? this.canvas;
    return [Math.max(1, el.clientWidth), Math.max(1, el.clientHeight)];
  }

  private stateChanged(): boolean {
    const s = window.Game.state;
    if (!s) return false;
    const decor = (s.upgrades || []).join(',');
    return s.tier !== this.lastTier || decor !== this.lastDecor || s.company !== this.lastCompany;
  }

  private rebuildIfNeeded(force = false): void {
    const s = window.Game.state;
    if (!s) return;
    if (!force && !this.stateChanged()) return;
    this.lastTier = s.tier;
    this.lastDecor = (s.upgrades || []).join(',');
    this.lastCompany = s.company;
    this.layout = buildLayout(s, window.Game.maxDesks());
    this.bakeEnvironment(s);
    this.bakeSky(nightFactor(s));
    const [w, h] = this.viewportSize();
    this.camera.recompute(this.layout, w, h);
  }

  /** desenha o ambiente na arte procedural atual e "assa" numa textura WebGL */
  private bakeEnvironment(s: GameState): void {
    if (!this.layout) return;
    const b = envBounds(this.layout);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(b.w * dpr));
    cv.height = Math.max(1, Math.ceil(b.h * dpr));
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.translate(-b.minX, -b.minY);
    new Painter(ctx).drawEnvironment(this.layout, s.company, nightFactor(s));
    this.envTexture?.destroy(true);
    this.envTexture = Texture.from(cv);
    this.envSprite.texture = this.envTexture;
    this.envSprite.position.set(b.minX, b.minY);
    this.envSprite.width = b.w;
    this.envSprite.height = b.h;
  }

  /** céu em gradiente (dia -> noite) como sprite de tela cheia */
  private bakeSky(night: number): void {
    if (!this.sky) return;
    const [c0, c1] = skyStops(night);
    const cv = document.createElement('canvas');
    cv.width = 8;
    cv.height = 256;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, c0);
    grad.addColorStop(1, c1);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 8, 256);
    this.skyTexture?.destroy(true);
    this.skyTexture = Texture.from(cv);
    this.sky.texture = this.skyTexture;
    this.fitSky();
  }

  private fitSky(): void {
    if (!this.sky || !this.app) return;
    this.sky.width = this.app.renderer.width / dpr;
    this.sky.height = this.app.renderer.height / dpr;
  }

  private frame = (): void => {
    if (!window.Game.state) return;
    this.rebuildIfNeeded();
    this.camera.apply(this.world);
  };

  resize = (): void => {
    if (!this.app) return;
    const [w, h] = this.viewportSize();
    this.app.renderer.resize(w, h);
    this.fitSky();
    if (this.layout) this.camera.recompute(this.layout, w, h);
  };

  destroy(): void {
    window.removeEventListener('resize', this.resize);
    this.camera.destroy();
    this.envTexture?.destroy(true);
    this.skyTexture?.destroy(true);
    this.app?.destroy(true, { children: true });
    this.app = null;
  }
}
