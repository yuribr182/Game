/* ===========================================================
   Testes de fumaça do motor legado (js/data.js + js/game.js).
   Rodam em Node com stubs mínimos de browser — garantem que a
   migração (PRD F1+) não regrida economia, save e progressão.
   =========================================================== */
import { beforeAll, describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyObj = Record<string, any>;
let G: AnyObj;
let DATA: AnyObj;

beforeAll(async () => {
  const g = globalThis as AnyObj;
  // as IIFEs legadas esperam window/localStorage/requestAnimationFrame
  g.window = g;
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  g.requestAnimationFrame = (fn: () => void) => setTimeout(fn, 0);
  DATA = (await import('../src/core/data')).DATA;
  g.DATA = DATA; // shim: game.js legado lê window.DATA
  await import('../js/game.js');
  G = g.Game;
});

describe('dados de balanceamento', () => {
  it('tiers têm custo e requisito de reputação crescentes', () => {
    for (let i = 1; i < DATA.TIERS.length; i++) {
      expect(DATA.TIERS[i].cost).toBeGreaterThan(DATA.TIERS[i - 1].cost);
      expect(DATA.TIERS[i].repReq).toBeGreaterThan(DATA.TIERS[i - 1].repReq);
      expect(DATA.TIERS[i].maxDesks).toBeGreaterThan(DATA.TIERS[i - 1].maxDesks);
    }
  });

  it('todo cargo tem os campos usados pelo motor', () => {
    for (const r of DATA.ROLES) {
      expect(r.id).toBeTruthy();
      expect(r.speed).toBeGreaterThan(0);
      expect(r.salary).toBeGreaterThan(0);
      expect(r.hire).toBeGreaterThan(0);
    }
  });

  it('xpForLevel é positivo e monotônico', () => {
    let prev = 0;
    for (let lv = 1; lv <= 20; lv++) {
      const need = DATA.xpForLevel(lv);
      expect(need).toBeGreaterThan(prev);
      prev = need;
    }
  });

  it('fases de projeto cobrem 0..1 em ordem', () => {
    const ends = DATA.PHASES.map((p: AnyObj) => p.ate);
    expect(ends).toEqual([...ends].sort((a, b) => a - b));
    expect(ends[ends.length - 1]).toBe(1.0);
  });
});

describe('motor', () => {
  it('newGame cria estado jogável', () => {
    G.newGame('Teste Labs');
    const s = G.state;
    expect(s.company).toBe('Teste Labs');
    expect(s.money).toBeGreaterThan(0);
    expect(s.day).toBe(1);
    expect(s.available.length).toBeGreaterThan(0);
    expect(G.DAY_LENGTH).toBe(1440);
  });

  it('tick avança o relógio do dia', () => {
    G.newGame('Tick Co');
    const before = G.state.dayProgress;
    G.tick(10);
    expect(G.state.dayProgress).toBeGreaterThan(before);
  });

  it('contratar júnior debita dinheiro e adiciona funcionário', () => {
    G.newGame('RH Ltda');
    const money = G.state.money;
    const before = G.state.employees.length; // o jogo começa com 1 júnior
    G.hire('junior');
    expect(G.state.employees.length).toBe(before + 1);
    expect(G.state.money).toBeLessThan(money);
    expect(G.state.employees[before].energy).toBe(100);
  });

  it('save/load preserva o estado (chave sagrada do PRD)', () => {
    G.newGame('Persistência SA');
    G.hire('junior');
    const { money, company } = G.state;
    const count = G.state.employees.length;
    G.save();
    expect(G.hasSave()).toBe(true);
    expect(G.load()).toBe(true);
    expect(G.state.company).toBe(company);
    expect(G.state.money).toBe(money);
    expect(G.state.employees.length).toBe(count);
  });

  it('migrate aceita save antigo sem os campos novos', () => {
    G.newGame('Migração ME');
    G.save();
    // simula um save v1: remove campos que só existem nas versões novas
    const key = 'appAgencyTycoon.save.v1';
    const raw = JSON.parse((globalThis as AnyObj).localStorage.getItem(key));
    delete raw.v;
    delete raw.achievements;
    delete raw.rivals;
    raw.employees = [{ role: 'junior' }]; // funcionário v1 cru
    (globalThis as AnyObj).localStorage.setItem(key, JSON.stringify(raw));
    expect(G.load()).toBe(true);
    const e = G.state.employees[0];
    expect(e.name).toBeTruthy();
    expect(e.energy).toBe(100);
    expect(G.state.achievements).toEqual([]);
  });
});
