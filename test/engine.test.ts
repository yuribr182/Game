/* ===========================================================
   Testes do motor tipado (src/core). Rodam em Node SEM stubs de
   browser: o engine é uma fábrica que recebe a persistência por
   injeção (Persistence) e rng/relógio opcionais. Garantem que a
   migração F1 não regrida economia, save, eventos e progressão.
   =========================================================== */
import { describe, expect, it } from 'vitest';
import { DATA } from '../src/core/data';
import { createEngine } from '../src/core/engine';
import type { Engine, EngineOptions, Persistence } from '../src/core/engine';
import { SAVE_KEY } from '../src/core/state';

/** Persistência em memória (equivalente ao localStorage nos testes). */
function memPersistence(): { persistence: Persistence; store: Map<string, string> } {
  const store = new Map<string, string>();
  const persistence: Persistence = {
    read: () => store.get(SAVE_KEY) ?? null,
    write: (d) => void store.set(SAVE_KEY, d),
    clear: () => void store.delete(SAVE_KEY),
  };
  return { persistence, store };
}

function makeEngine(opts: EngineOptions = {}): Engine {
  return createEngine(memPersistence().persistence, opts);
}

describe('dados de balanceamento', () => {
  it('tiers têm custo e requisito de reputação crescentes', () => {
    for (let i = 1; i < DATA.TIERS.length; i++) {
      expect(DATA.TIERS[i]!.cost).toBeGreaterThan(DATA.TIERS[i - 1]!.cost);
      expect(DATA.TIERS[i]!.repReq).toBeGreaterThan(DATA.TIERS[i - 1]!.repReq);
      expect(DATA.TIERS[i]!.maxDesks).toBeGreaterThan(DATA.TIERS[i - 1]!.maxDesks);
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
    const ends = DATA.PHASES.map((p) => p.ate);
    expect(ends).toEqual([...ends].sort((a, b) => a - b));
    expect(ends[ends.length - 1]).toBe(1.0);
  });
});

describe('ciclo de vida', () => {
  it('newGame cria estado jogável', () => {
    const G = makeEngine();
    G.newGame('Teste Labs');
    const s = G.state!;
    expect(s.company).toBe('Teste Labs');
    expect(s.money).toBeGreaterThan(0);
    expect(s.day).toBe(1);
    expect(s.available.length).toBeGreaterThan(0);
    expect(G.DAY_LENGTH).toBe(1440);
  });

  it('state é null antes de iniciar e após reset', () => {
    const G = makeEngine();
    expect(G.state).toBeNull();
    G.newGame('X');
    expect(G.state).not.toBeNull();
    G.reset();
    expect(G.state).toBeNull();
  });

  it('tick avança o relógio do dia', () => {
    const G = makeEngine();
    G.newGame('Tick Co');
    const before = G.state!.dayProgress;
    G.tick(10);
    expect(G.state!.dayProgress).toBeGreaterThan(before);
  });

  it('save/load preserva o estado (chave sagrada do PRD)', () => {
    const { persistence } = memPersistence();
    const G = createEngine(persistence);
    G.newGame('Persistência SA');
    G.hire('junior');
    const { money, company } = G.state!;
    const count = G.state!.employees.length;
    G.save();
    expect(G.hasSave()).toBe(true);

    // um novo engine sobre a MESMA persistência carrega o save
    const G2 = createEngine(persistence);
    expect(G2.load()).toBe(true);
    expect(G2.state!.company).toBe(company);
    expect(G2.state!.money).toBe(money);
    expect(G2.state!.employees.length).toBe(count);
  });
});

describe('economia', () => {
  it('contratar júnior debita dinheiro e adiciona funcionário', () => {
    const G = makeEngine();
    G.newGame('RH Ltda');
    const money = G.state!.money;
    const before = G.state!.employees.length; // o jogo começa com 1 júnior
    expect(G.hire('junior')).toBe(true);
    expect(G.state!.employees.length).toBe(before + 1);
    expect(G.state!.money).toBeLessThan(money);
    expect(G.state!.employees[before]!.energy).toBe(100);
  });

  it('hire falha sem dinheiro', () => {
    const G = makeEngine();
    G.newGame('Duro Ltda');
    G.state!.money = 0;
    expect(G.hire('junior')).toBe(false);
  });

  it('comprar mesa incrementa desks e debita custo', () => {
    const G = makeEngine();
    G.newGame('Mesas SA');
    const desks = G.state!.desks;
    const cost = G.deskCost();
    const money = G.state!.money;
    expect(G.buyDesk()).toBe(true);
    expect(G.state!.desks).toBe(desks + 1);
    expect(G.state!.money).toBe(money - cost);
  });

  it('upgradeOffice exige reputação e sobe de tier', () => {
    const G = makeEngine();
    G.newGame('Cresce Co');
    expect(G.upgradeOffice()).toBe(false); // rep 0
    G.state!.rep = 100;
    G.state!.money = 20000;
    expect(G.upgradeOffice()).toBe(true);
    expect(G.state!.tier).toBe(1);
  });

  it('buyUpgrade adiciona o upgrade e não repete', () => {
    const G = makeEngine();
    G.newGame('Up Co');
    G.state!.money = 5000;
    expect(G.buyUpgrade('pc1')).toBe(true);
    expect(G.state!.upgrades).toContain('pc1');
    expect(G.buyUpgrade('pc1')).toBe(false); // já comprado
  });

  it('aceitar contrato move de available para active', () => {
    const G = makeEngine();
    G.newGame('Contratos SA');
    G.state!.rep = 9999; // aceita qualquer contrato (mesmo os travados por reputação)
    const uid = G.state!.available[0]!.uid;
    expect(G.acceptProject(uid)).toBe(true);
    expect(G.state!.active.some((p) => p.uid === uid)).toBe(true);
    expect(G.state!.available.some((p) => p.uid === uid)).toBe(false);
  });

  it('promover júnior gasta dinheiro e troca o cargo', () => {
    const G = makeEngine();
    G.newGame('Carreira Co');
    const e = G.state!.employees[0]!;
    e.exp = 50; // acima do requisito de promoção do júnior
    G.state!.money = 5000;
    const money = G.state!.money;
    expect(G.canPromote(e)).toBe(true);
    expect(G.promote(e.uid)).toBe(true);
    expect(e.role).toBe('pleno');
    expect(G.state!.money).toBeLessThan(money);
    expect(G.state!.stats.promotions).toBe(1);
  });

  it('produção é positiva com um funcionário sentado', () => {
    const G = makeEngine();
    G.newGame('Prod Co');
    G.state!.rep = 9999; // aceita qualquer contrato (mesmo os travados por reputação)
    G.acceptProject(G.state!.available[0]!.uid);
    expect(G.production()).toBeGreaterThan(0);
    const rates = G.projectRates();
    const total = Object.values(rates).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('lançar produto requer 25 de reputação', () => {
    const G = makeEngine();
    G.newGame('Produtos SA');
    expect(G.productsUnlocked()).toBe(false);
    G.state!.rep = 30;
    G.state!.money = G.productCost() + 100;
    expect(G.launchProduct()).toBe(true);
    expect(G.state!.products.length).toBe(1);
  });
});

describe('progressão e eventos', () => {
  it('completar projeto rende dinheiro, reputação e XP', () => {
    const G = makeEngine();
    G.newGame('Entrega Co');
    G.state!.rep = 9999; // garante que o contrato é aceitável
    G.acceptProject(G.state!.available[0]!.uid);
    const p = G.state!.active[0]!;
    p.work = 0.1; // trabalho mínimo: o júnior conclui dentro do tick abaixo
    const money = G.state!.money;
    const rep = G.state!.rep;
    G.tick(300); // ~1,3 pts produzidos, sem cruzar a virada do dia (540+300<1440)
    expect(G.state!.active.length).toBe(0);
    expect(G.state!.stats.completed).toBe(1);
    expect(G.state!.money).toBeGreaterThan(money);
    expect(G.state!.rep).toBeGreaterThanOrEqual(rep);
  });

  it('avançar o dia paga salários', () => {
    const G = makeEngine();
    G.newGame('Folha SA');
    const money = G.state!.money;
    G.tick(G.DAY_LENGTH); // cruza exatamente um dia
    expect(G.state!.day).toBe(2);
    expect(G.state!.money).toBeLessThan(money); // salário do júnior debitado
  });

  it('resolveEvent(investor/accept) credita o aporte', () => {
    const G = makeEngine();
    G.newGame('Aporte Co');
    const s = G.state!;
    s.pendingEvent = {
      id: 'investor',
      title: '🦈 Proposta',
      text: 'aporte',
      data: { amount: 5000 },
      defaultOption: 'deny',
      day: s.day,
    };
    const money = s.money;
    expect(G.resolveEvent('accept')).toBe(true);
    expect(s.money).toBe(money + 5000);
    expect(s.pendingEvent).toBeNull();
  });

  it('contratar desbloqueia a conquista "primeiro contratado"', () => {
    const G = makeEngine();
    G.newGame('Conquista Co');
    G.hire('junior');
    expect(G.state!.achievements).toContain('first_hire');
  });
});

describe('save / migração', () => {
  it('migrate aceita save antigo sem os campos novos', () => {
    const { persistence, store } = memPersistence();
    const G = createEngine(persistence);
    G.newGame('Migração ME');
    G.save();
    // simula um save v1: remove campos que só existem nas versões novas
    const raw = JSON.parse(store.get(SAVE_KEY)!);
    delete raw.v;
    delete raw.achievements;
    delete raw.rivals;
    raw.employees = [{ role: 'junior' }]; // funcionário v1 cru
    store.set(SAVE_KEY, JSON.stringify(raw));

    const G2 = createEngine(persistence);
    expect(G2.load()).toBe(true);
    const e = G2.state!.employees[0]!;
    expect(e.name).toBeTruthy();
    expect(e.energy).toBe(100);
    expect(e.exp).toBe(0);
    expect(G2.state!.achievements).toEqual([]);
    expect(G2.state!.v).toBe(3); // migrado até a versão atual
  });

  it('migração v2->v3 converte exp de segundos (dia de 8s) para dias', () => {
    const { persistence, store } = memPersistence();
    const G = createEngine(persistence);
    G.newGame('V2 Co');
    G.save();
    const raw = JSON.parse(store.get(SAVE_KEY)!);
    raw.v = 2;
    raw.employees[0].exp = 80; // 80s no relógio antigo -> 10 dias
    store.set(SAVE_KEY, JSON.stringify(raw));

    const G2 = createEngine(persistence);
    expect(G2.load()).toBe(true);
    expect(G2.state!.employees[0]!.exp).toBeCloseTo(10, 5);
  });
});

describe('simulação offline', () => {
  it('load simula o tempo ausente e gera relatório', () => {
    let clock = 1_000_000_000; // ms controlados
    const opts: EngineOptions = { now: () => clock };
    const { persistence } = memPersistence();
    const G = createEngine(persistence, opts);
    G.newGame('Offline Co'); // salva com lastSeen = clock atual
    // avança o relógio 2 horas de ausência
    clock += 2 * 3600 * 1000;

    const G2 = createEngine(persistence, opts);
    expect(G2.load()).toBe(true);
    const report = G2.takeOfflineReport();
    expect(report).not.toBeNull();
    expect(report!.days).toBeGreaterThanOrEqual(1);
    expect(report!.seconds).toBeGreaterThanOrEqual(7200 - 1);
    // segunda leitura do relatório vem vazia
    expect(G2.takeOfflineReport()).toBeNull();
  });

  it('ausência curta (<90s) não gera relatório', () => {
    let clock = 5_000_000;
    const opts: EngineOptions = { now: () => clock };
    const { persistence } = memPersistence();
    const G = createEngine(persistence, opts);
    G.newGame('Curta Co');
    clock += 30 * 1000; // 30s
    const G2 = createEngine(persistence, opts);
    G2.load();
    expect(G2.takeOfflineReport()).toBeNull();
  });
});
