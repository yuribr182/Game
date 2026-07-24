/* ===========================================================
   App Agency Tycoon — persistência: migração + ids (F1 do PRD)
   Portado 1:1 de js/game.js (migrate/reseedIds) — NENHUM número
   foi alterado. Módulo PURO: não toca localStorage (a fronteira do
   core proíbe; o I/O real vive no `Persistence` injetado no engine).
   =========================================================== */
import { FIRST_NAMES } from './data';
import { DAY_LENGTH, freshState } from './state';
import type { Ctx, Employee, GameState } from './state';

/** Porta de persistência injetada pelo shim (localStorage no browser). */
export interface Persistence {
  read(): string | null;
  write(data: string): void;
  clear(): void;
}

/**
 * Migra saves de versões anteriores para o formato atual (v3).
 * NUNCA quebra saves antigos (regra sagrada do CLAUDE.md/PRD).
 */
export function migrate(ctx: Ctx, raw: Record<string, unknown>): GameState {
  // guarda a versão ANTES do merge: freshState() traz v atual e mascararia
  // saves antigos sem o campo v (que devem passar por todas as migrações)
  const version = (raw.v as number) || 1;
  const s: GameState = Object.assign(freshState(ctx), raw);
  s.v = version;
  // campos novos com defaults (independente de versão)
  s.achievements = s.achievements || [];
  s.stats.hires = s.stats.hires || 0;
  s.stats.promotions = s.stats.promotions || 0;
  if (!s.v || s.v < 2) {
    s.employees.forEach((e: Employee) => {
      if (!e.name) e.name = ctx.pick(FIRST_NAMES);
      if (e.energy == null) e.energy = 100;
      if (e.exp == null) e.exp = 0;
      if (e.salaryMult == null) e.salaryMult = 1;
      if (e.assign === undefined) e.assign = null;
      if (e.resting === undefined) e.resting = false;
      if (e.mood === undefined) e.mood = null;
    });
    s.products = s.products || [];
    s.effects = s.effects || [];
    s.pendingEvent = s.pendingEvent || null;
    s.v = 2;
  }
  if (s.v < 3) {
    // v3: dia passou de 8s para 1440s; exp era em segundos (dia de 8s) -> dias
    s.employees.forEach((e: Employee) => {
      e.exp = (e.exp || 0) / 8;
    });
    s.dayProgress = DAY_LENGTH * 0.375;
    s.contractTimer = 0;
    s.v = 3;
  }
  return s;
}

/**
 * Maior número de id ('eN') presente no save + 1, para o engine reiniciar
 * seu contador acima de todos os ids existentes (evita colisões).
 */
export function nextIdSeed(s: GameState): number {
  let max = 0;
  const scan = (uid: string | undefined) => {
    const m = /^e(\d+)$/.exec(uid || '');
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  };
  s.employees.forEach((e) => scan(e.uid));
  s.active.forEach((p) => scan(p.uid));
  s.available.forEach((p) => scan(p.uid));
  s.products.forEach((p) => scan(p.uid));
  return max + 1;
}
