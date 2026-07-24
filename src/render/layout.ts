/* ===========================================================
   App Agency Tycoon — layout do escritório por tier (F2 do PRD)
   Portado 1:1 de buildLayout() do js/iso.js — mesma geometria.
   Puro (só matemática): recebe o estado + maxDesks e devolve o
   layout que o renderer Pixi compõe.
   =========================================================== */
import type { GameState } from '../core/state';

export interface Cell {
  gx: number;
  gy: number;
}
export interface WallSeg {
  gx: number;
  gy: number;
  sx: number;
  sy: number;
}
export interface FurnItem {
  type: string;
  gx: number;
  gy: number;
  col?: string;
}
export interface Rug {
  gx: number;
  gy: number;
  w: number;
  h: number;
  col: string;
}
export interface TreeItem {
  gx: number;
  gy: number;
  s: number;
}

export interface Layout {
  W: number;
  H: number;
  desks: Cell[];
  perRow: number;
  max: number;
  door: Cell;
  KW: number;
  KH: number;
  doorIn: Cell;
  doorOut: Cell;
  coffee: Cell;
  kwalls: WallSeg[];
  furniture: FurnItem[];
  reception: Cell;
  rugs: Rug[];
  lamps: Cell[];
  trees: TreeItem[];
  bgTrees: TreeItem[];
}

/** rng determinístico (LCG) para o jitter das árvores de fundo — mantém a
 *  cena estável entre re-bakes do mesmo layout (sem "pulos"). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function buildLayout(state: GameState, maxDesks: number): Layout {
  const max = maxDesks;
  const perRow = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(max))));
  const rows = Math.ceil(max / perRow);
  const DX = 1.45,
    DY = 1.7;
  // zona de trabalho deslocada: cozinha + lounge à esquerda; recepção/reunião à direita
  const WX0 = 3.0,
    WY0 = 2.1;
  const desks: Cell[] = [];
  for (let i = 0; i < max; i++) {
    desks.push({ gx: WX0 + (i % perRow) * DX, gy: WY0 + Math.floor(i / perRow) * DY });
  }
  const W = WX0 + perRow * DX + 2.4;
  const H = WY0 + rows * DY + 2.3;

  const door: Cell = { gx: W - 0.9, gy: H - 0.1 };

  // ---- COZINHA: cômodo separado no canto noroeste ----
  const KW = 2.35,
    KH = 2.65;
  const doorIn: Cell = { gx: KW - 0.4, gy: 1.85 };
  const doorOut: Cell = { gx: KW + 0.45, gy: 1.85 };
  const coffee: Cell = { gx: 1.85, gy: 0.5 };
  const seg = (gx: number, gy: number, sx: number, sy: number): WallSeg => ({ gx, gy, sx, sy });
  const kwalls: WallSeg[] = [
    seg(KW, 0, 0.1, 0.8),
    seg(KW, 0.8, 0.1, 0.65),
    seg(KW, 2.25, 0.1, KH - 2.25 + 0.1),
    seg(0, KH, 0.85, 0.1),
    seg(0.85, KH, 0.8, 0.1),
    seg(1.65, KH, KW - 1.65 + 0.1, 0.1),
  ];

  // ---- MÓVEIS por zona ----
  const F: FurnItem[] = [];
  // COZINHA
  F.push({ type: 'fridge', gx: 0.25, gy: 0.3 });
  F.push({ type: 'stove', gx: 0.3, gy: 1.05 });
  F.push({ type: 'sink', gx: 0.3, gy: 1.7 });
  F.push({ type: 'microwave', gx: 1.1, gy: 0.35 });
  F.push({ type: 'diningTable', gx: 1.3, gy: 1.5 });
  F.push({ type: 'stool', gx: 1.15, gy: 1.3, col: '#e0a54b' });
  F.push({ type: 'stool', gx: 1.95, gy: 1.95, col: '#c94f4f' });
  // LOUNGE
  F.push({ type: 'sofa', gx: 0.45, gy: H - 1.75, col: '#3f6fd6' });
  F.push({ type: 'coffeeTable', gx: 0.62, gy: H - 1.0 });
  F.push({ type: 'tv', gx: 0.25, gy: H - 2.55 });
  // decorações desbloqueáveis (loja)
  const upg = state.upgrades || [];
  if (upg.includes('pufes')) {
    F.push({ type: 'pufe', gx: 1.85, gy: H - 1.15, col: '#ff9f45' });
    F.push({ type: 'pufe', gx: 2.15, gy: H - 0.8, col: '#37d67a' });
    F.push({ type: 'pufe', gx: 1.7, gy: H - 0.65, col: '#4f8cff' });
  }
  if (upg.includes('arcade')) F.push({ type: 'arcade', gx: 0.35, gy: H - 3.1 });
  if (upg.includes('sinuca')) F.push({ type: 'poolTable', gx: 2.7, gy: H - 1.5 });
  // RECEPÇÃO
  const reception: Cell = { gx: W - 2.2, gy: H - 1.7 };
  F.push({ type: 'reception', gx: W - 2.2, gy: H - 1.7 });
  F.push({ type: 'chair', gx: W - 0.7, gy: H - 1.6, col: '#7c5cff' });
  F.push({ type: 'chair', gx: W - 0.7, gy: H - 1.0, col: '#7c5cff' });
  F.push({ type: 'plantBig', gx: W - 0.4, gy: H - 2.3 });
  // REUNIÃO
  F.push({ type: 'meetingTable', gx: W - 2.2, gy: 0.6 });
  (
    [
      [-0.2, 0.4],
      [-0.2, 1.0],
      [1.35, 0.4],
      [1.35, 1.0],
      [0.5, -0.15],
      [0.5, 1.5],
    ] as [number, number][]
  ).forEach(([dx, dy]) => F.push({ type: 'chair', gx: W - 2.2 + dx, gy: 0.6 + dy, col: '#556071' }));
  // EQUIPAMENTOS
  F.push({ type: 'serverRack', gx: 0.35, gy: H * 0.5 });
  F.push({ type: 'waterCooler', gx: W - 0.5, gy: H * 0.5 });
  F.push({ type: 'printer', gx: WX0 - 0.55, gy: WY0 + 1.9 });
  F.push({ type: 'plantBig', gx: W - 0.4, gy: 2.4 });

  // tapetes e luminárias
  const rugs: Rug[] = [
    { gx: 0.55, gy: H - 1.3, w: 1.1, h: 0.9, col: 'rgba(90,120,200,.16)' },
    { gx: W - 2.0, gy: 0.8, w: 1.4, h: 0.8, col: 'rgba(120,92,255,.12)' },
  ];
  const lamps: Cell[] = [];
  for (let gx = WX0; gx < WX0 + perRow * DX; gx += 1.6)
    for (let gy = WY0; gy < WY0 + rows * DY; gy += 1.7) lamps.push({ gx: gx + 0.5, gy: gy + 0.4 });

  // árvores de frente (cantos externos)
  const trees: TreeItem[] = [
    { gx: -0.9, gy: H + 0.6, s: 0.9 },
    { gx: -0.9, gy: H + 1.6, s: 0.75 },
    { gx: W + 0.9, gy: H + 0.7, s: 0.95 },
    { gx: W + 1.6, gy: H + 1.5, s: 0.8 },
    { gx: W + 0.9, gy: -0.6, s: 0.8 },
  ];
  // árvores de fundo (norte + oeste) — jitter determinístico
  const rnd = seeded(Math.round((W + H) * 1000));
  const jit = (a: number, b: number) => a + rnd() * (b - a);
  const bgTrees: TreeItem[] = [];
  for (let g = -1.2; g < W + 1.2; g += 1.4) bgTrees.push({ gx: g + jit(-0.2, 0.2), gy: -1.5, s: jit(0.7, 1.0) });
  for (let g = -1.2; g < H + 1.2; g += 1.4) bgTrees.push({ gx: -1.5, gy: g + jit(-0.2, 0.2), s: jit(0.7, 1.0) });

  return {
    W,
    H,
    desks,
    perRow,
    max,
    door,
    KW,
    KH,
    doorIn,
    doorOut,
    coffee,
    kwalls,
    furniture: F,
    reception,
    rugs,
    lamps,
    trees,
    bgTrees,
  };
}
