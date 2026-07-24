/* ===========================================================
   App Agency Tycoon — simulação de personagens (F2.2 do PRD)
   Portado de js/iso.js (makeWorker/update/routeTo/stepToward/pickDest):
   funcionários sentam, digitam, levantam para o café/lounge e voltam,
   entrando/saindo da cozinha pela porta. Sem DOM/Pixi (só estado).
   =========================================================== */
import type { Cell, Layout } from './layout';
import type { GameState } from '../core/state';
import type { CharacterVisual } from './draw2d';

const SHIRTS = ['#4f8cff', '#37d67a', '#ffca4b', '#ff5c6c', '#7c5cff', '#ff9f45', '#28c0d6', '#e05fb0'];
const ROLE_STYLE: Record<string, { shirt: string; acc: string | null }> = {
  junior: { shirt: '#4f8cff', acc: 'cap' },
  pleno: { shirt: '#37d67a', acc: null },
  senior: { shirt: '#ffca4b', acc: 'glasses' },
  designer: { shirt: '#e05fb0', acc: 'beret' },
  qa: { shirt: '#28c0d6', acc: 'phones' },
  manager: { shirt: '#2f3a4d', acc: 'tie' },
  atendente: { shirt: '#7c5cff', acc: 'headset' },
};
const SKINS = ['#f2c49b', '#e0a878', '#c68642', '#8d5524', '#ffd9b3'];
const HAIRS = ['#2b2118', '#4a342a', '#111', '#6b4a2b', '#d9c27a', '#7a3b2b'];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]): T => a[(Math.random() * a.length) | 0]!;

export interface Worker extends CharacterVisual {
  i: number;
  desk: Cell;
  role: string | null;
  gx: number;
  gy: number;
  hx: number;
  hy: number;
  path: Cell[];
  timer: number;
  sp: number;
  errand?: string;
}

function makeWorker(i: number, d: Cell, roleId: string): Worker {
  const style = ROLE_STYLE[roleId] || { shirt: pick(SHIRTS), acc: null };
  return {
    i,
    desk: d,
    role: roleId,
    gx: d.gx,
    gy: d.gy + 0.55,
    hx: d.gx,
    hy: d.gy + 0.55,
    path: [],
    state: 'work',
    timer: rand(3, 10),
    phase: rand(0, Math.PI * 2),
    shirt: style.shirt,
    acc: style.acc,
    skin: pick(SKINS),
    hair: pick(HAIRS),
    moving: false,
    dir: 1,
    sp: rand(1.1, 1.7),
    mug: 0,
    bubble: null,
  };
}

export class Entities {
  workers: Worker[] = [];
  private layout: Layout | null = null;

  /** sincroniza a lista de personagens com os funcionários sentados */
  sync(layout: Layout, state: GameState): void {
    if (this.layout !== layout) {
      this.layout = layout;
      this.workers = [];
    }
    const emp = Math.min(state.employees.length, state.desks);
    while (this.workers.length < emp) {
      const i = this.workers.length;
      this.workers.push(makeWorker(i, layout.desks[i]!, state.employees[i]!.role));
    }
    while (this.workers.length > emp) this.workers.pop();
    this.workers.forEach((w, i) => {
      w.i = i;
      w.desk = layout.desks[i]!;
      const roleId = state.employees[i]!.role;
      if (w.role !== roleId) {
        w.role = roleId;
        const st = ROLE_STYLE[roleId];
        if (st) {
          w.shirt = st.shirt;
          w.acc = st.acc;
        }
      }
      if (w.state === 'work') {
        w.hx = w.desk.gx;
        w.hy = w.desk.gy + 0.55;
        w.path = [];
      }
    });
  }

  update(dt: number, layout: Layout, state: GameState): void {
    const noWork = state.active.length === 0;
    this.workers.forEach((w) => {
      const emp = state.employees[w.i];
      const idle = noWork || (emp != null && emp.resting);
      w.timer -= dt;
      if (w.mug > 0) w.mug -= dt;
      if (w.bubble && (w.bubble.life -= dt) <= 0) w.bubble = null;
      if (!w.bubble) {
        if (emp && emp.resting && Math.random() < dt * 0.25) w.bubble = { emoji: '😴', life: 2.2 };
        else if (w.mug > 0 && Math.random() < dt * 0.2) w.bubble = { emoji: '☕', life: 2 };
        else if (w.state === 'work' && !noWork && Math.random() < dt * 0.05)
          w.bubble = { emoji: pick(['💡', '🐛', '🚀', '🤔']), life: 2.2 };
      }
      if (w.state === 'work') {
        if (w.timer <= 0) {
          const dest = pickDest(layout, idle);
          routeTo(layout, w, dest.gx, dest.gy);
          w.state = 'walk';
          w.errand = dest.errand;
        }
      } else if (w.state === 'walk') {
        if (reached(w)) {
          w.state = 'pause';
          if (w.errand === 'coffee') {
            w.mug = rand(6, 11);
            w.timer = idle ? rand(3, 7) : rand(1.2, 2.6);
          } else {
            w.timer = idle ? rand(2.5, 6) : rand(0.6, 2.2);
          }
        }
      } else if (w.state === 'pause') {
        if (w.timer <= 0) {
          if (idle && Math.random() < 0.55) {
            const dest = pickDest(layout, true);
            routeTo(layout, w, dest.gx, dest.gy);
            w.state = 'walk';
            w.errand = dest.errand;
          } else {
            routeTo(layout, w, w.desk.gx, w.desk.gy + 0.55);
            w.state = 'return';
          }
        }
      }
      if (w.state === 'return' && reached(w)) {
        w.state = 'work';
        w.timer = idle ? rand(1.5, 4) : rand(6, 14);
      }
      stepToward(w, dt);
    });
  }
}

function inKitchen(layout: Layout, gx: number, gy: number): boolean {
  return gx < layout.KW && gy < layout.KH;
}

function routeTo(layout: Layout, w: Worker, tx: number, ty: number): void {
  const from = inKitchen(layout, w.gx, w.gy),
    to = inKitchen(layout, tx, ty);
  let pts: Cell[];
  if (from && !to) pts = [layout.doorIn, layout.doorOut, { gx: tx, gy: ty }];
  else if (!from && to) pts = [layout.doorOut, layout.doorIn, { gx: tx, gy: ty }];
  else pts = [{ gx: tx, gy: ty }];
  w.path = pts.slice(1);
  w.hx = pts[0]!.gx;
  w.hy = pts[0]!.gy;
}

function pickDest(layout: Layout, idle: boolean): { gx: number; gy: number; errand: string } {
  const r = Math.random();
  if (idle) {
    if (r < 0.5)
      return { gx: layout.coffee.gx + rand(-0.15, 0.15), gy: layout.coffee.gy + rand(0.35, 0.6), errand: 'coffee' };
    if (r < 0.78) return { gx: rand(0.9, 2.0), gy: rand(1.2, 2.2), errand: 'kitchen' };
    return { gx: rand(0.5, 2.2), gy: layout.H - rand(0.7, 1.7), errand: 'lounge' };
  }
  if (r < 0.35) return { gx: layout.coffee.gx, gy: layout.coffee.gy + 0.5, errand: 'coffee' };
  if (r < 0.65 && layout.desks.length > 1) {
    const d = pick(layout.desks);
    return { gx: d.gx - 0.6, gy: d.gy + 0.5, errand: 'chat' };
  }
  return { gx: rand(layout.KW + 0.5, layout.W - 0.6), gy: rand(0.8, layout.H - 0.8), errand: 'walk' };
}

function reached(w: Worker): boolean {
  return w.path.length === 0 && Math.hypot(w.hx - w.gx, w.hy - w.gy) < 0.06;
}

function stepToward(w: Worker, dt: number): void {
  const dx = w.hx - w.gx,
    dy = w.hy - w.gy,
    d = Math.hypot(dx, dy);
  if (d < 0.02) {
    if (w.path.length) {
      const n = w.path.shift()!;
      w.hx = n.gx;
      w.hy = n.gy;
    } else w.moving = false;
    return;
  }
  const sp = w.sp * dt;
  if (sp >= d) {
    w.gx = w.hx;
    w.gy = w.hy;
    return;
  }
  w.gx += (dx / d) * sp;
  w.gy += (dy / d) * sp;
  w.moving = true;
  w.dir = dx - dy >= 0 ? 1 : -1;
}
