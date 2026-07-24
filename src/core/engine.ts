/* ===========================================================
   App Agency Tycoon — motor: tick/advanceDay + API pública (F1 do PRD)
   Portado 1:1 de js/game.js — NENHUMA regra de gameplay/balanceamento
   foi alterada. Monta o Ctx (estado + rng/relógio/ids injetáveis) e
   expõe a mesma API que o antigo `window.Game` (o shim em
   src/game-shim.ts liga isso ao localStorage e a window.Game).
   Módulo puro: sem DOM, sem Pixi (fronteira do core, lint).
   =========================================================== */
import { ROLES } from './data';
import { Bus } from './bus';
import { DAY_LENGTH, fmt, freshState } from './state';
import type { Ctx, Employee, GameState, OfflineReport, Project } from './state';
import {
  acceptProject,
  assignEmployee,
  assignedCount,
  buyDesk,
  buyUpgrade,
  canPromote,
  clearAssignments,
  completeProject,
  contractValueMult,
  declineProject,
  deskCost,
  empSpeed,
  employeesSeated,
  failProject,
  fire,
  generateContract,
  hire,
  launchProduct,
  maxDesks,
  production,
  productCost,
  productsUnlocked,
  projectRates,
  projectSlots,
  promote,
  promotionFor,
  rankPosition,
  refillContracts,
  repMultiplier,
  tier,
  upgradeEffect,
  upgradeOffice,
} from './economy';
import { checkAchievements, resolveEvent, triggerRandomEvent } from './events';
import { migrate, nextIdSeed } from './save';
import type { Persistence } from './save';

export type { Persistence } from './save';

/** Injeções opcionais (testes): rng determinístico e relógio controlável. */
export interface EngineOptions {
  random?: () => number;
  now?: () => number;
}

export function createEngine(persistence: Persistence, opts: EngineOptions = {}) {
  const random = opts.random ?? Math.random;
  const now = opts.now ?? (() => Date.now());
  const bus = new Bus();

  let started = false; // há jogo carregado?
  let idc = 1; // contador de ids de entidade
  let achTimer = 0; // checagem periódica de conquistas
  let saveTimer = 0; // auto-save
  let timeScale = 1; // ⏸ 0 · 1x · 2x · 3x (estilo The Sims)
  let offlineReport: OfflineReport | null = null;

  // avisos/render são silenciados durante a simulação offline (ctx.offline)
  function emitChange(): void {
    if (!ctx.offline) bus.emit('change', ctx.state);
  }
  function emitTick(): void {
    if (!ctx.offline) bus.emit('tick', ctx.state);
  }

  const ctx: Ctx = {
    // preenchido em newGame/load; `started` guarda o acesso público
    state: undefined as unknown as GameState,
    bus,
    offline: false,
    random,
    now,
    emit: (ev) => {
      if (!ctx.offline) bus.emit('event', ev);
    },
    rand: (a, b) => a + random() * (b - a),
    pick: (arr) => arr[Math.floor(random() * arr.length)]!,
    nextId: () => 'e' + idc++,
    changed: () => changed(),
  };

  // ---------- persistência ----------
  function changed(): void {
    checkAchievements(ctx);
    emitChange();
    save();
  }

  function save(): void {
    if (!started) return;
    ctx.state.lastSeen = now();
    try {
      persistence.write(JSON.stringify(ctx.state));
    } catch {
      /* localStorage indisponível/cheio: ignora (save é best-effort) */
    }
  }

  function autoSaveTick(dt: number): void {
    saveTimer += dt;
    if (saveTimer >= 5) {
      saveTimer = 0;
      save();
    }
  }

  // ---------- loop principal ----------
  function tick(dt: number): void {
    if (!started) return;
    const state = ctx.state;

    // produção por projeto (respeita o direcionamento de tarefas)
    const working = state.active.length > 0;
    if (working) {
      const rates = projectRates(ctx);
      for (let i = state.active.length - 1; i >= 0; i--) {
        const p = state.active[i]!;
        p.done += (rates[p.uid] || 0) * dt;
        if (p.done >= p.work) {
          completeProject(ctx, p);
          state.active.splice(i, 1);
          clearAssignments(ctx, p.uid);
        }
      }
    }

    // energia e experiência individual (não drena na simulação offline)
    // trabalhando: esgota em ~0,7 dia; descansando: recupera em ~0,15 dia
    if (!ctx.offline) {
      const capacity = Math.min(state.employees.length, state.desks);
      const coffeeBoost = 1 + upgradeEffect(ctx, 'prodMult') * 0.3; // escritório melhor = pausa melhor
      const drain = 140 / DAY_LENGTH;
      const recover = 500 / DAY_LENGTH;
      state.employees.forEach((e, i) => {
        if (e.energy == null) e.energy = 100;
        const seated = i < capacity;
        if (seated && working && !e.resting) {
          e.energy = Math.max(0, e.energy - drain * dt);
          e.exp = (e.exp || 0) + dt / DAY_LENGTH; // experiência em dias trabalhados
          if (e.energy <= 15) e.resting = true; // pausa silenciosa (sem toast)
        } else {
          e.energy = Math.min(100, e.energy + recover * coffeeBoost * dt);
          if (e.resting && e.energy >= 85) e.resting = false;
        }
      });
    }

    // passagem do tempo (dias)
    state.dayProgress += dt;
    while (state.dayProgress >= DAY_LENGTH) {
      state.dayProgress -= DAY_LENGTH;
      advanceDay();
    }

    // conquistas: checagem periódica (pega progresso feito pelo tick)
    achTimer += dt;
    if (achTimer >= 5 && !ctx.offline) {
      achTimer = 0;
      checkAchievements(ctx);
    }

    // fluxo de novos contratos: um a cada ~1/3 de dia (marketing acelera)
    state.contractTimer -= dt;
    const flowBonus = upgradeEffect(ctx, 'contractFlow');
    if (state.contractTimer <= 0) {
      if (state.available.length < 6) state.available.push(generateContract(ctx));
      state.contractTimer = Math.max(0.12, 0.34 - flowBonus * 0.1) * DAY_LENGTH;
    }

    emitTick();
  }

  function advanceDay(): void {
    const state = ctx.state;
    state.day++;
    // prazos dos projetos
    for (let i = state.active.length - 1; i >= 0; i--) {
      const p = state.active[i]!;
      p.daysLeft--;
      if (p.daysLeft <= 0 && p.done < p.work) {
        failProject(ctx, p);
        state.active.splice(i, 1);
        clearAssignments(ctx, p.uid);
      }
    }
    // prazos dos contratos disponíveis expiram lentamente
    state.available.forEach((p) => (p.daysLeft = Math.max(0, p.daysLeft - 1)));
    state.available = state.available.filter((p) => p.daysLeft > 0);
    refillContracts(ctx);

    // pagamento de salários (por dia, considerando aumentos)
    let salaries = 0;
    state.employees.forEach((e) => {
      const role = ROLES.find((r) => r.id === e.role);
      if (role) salaries += role.salary * (e.salaryMult || 1);
    });
    if (salaries > 0) {
      state.money -= salaries;
      if (state.money < 0) {
        // dívida: perde reputação, não pode ficar negativo demais
        const debt = -state.money;
        state.money = 0;
        state.rep = Math.max(0, state.rep - Math.ceil(debt / 200));
        ctx.emit({ type: 'warn', msg: `💸 Sem caixa para salários! Reputação caiu.` });
      }
    }

    // humor (motivado/desmotivado) expira
    state.employees.forEach((e) => {
      if (e.mood && --e.mood.daysLeft <= 0) e.mood = null;
    });

    // efeitos temporários expiram
    state.effects = state.effects.filter((ef) => --ef.daysLeft > 0);

    // renda dos produtos próprios
    let productIncome = 0;
    state.products.forEach((pr) => {
      pr.ageDays++;
      pr.income *= ctx.rand(0.97, 1.04); // flutuação de mercado
      if (!ctx.offline && ctx.random() < 0.05) {
        pr.income *= 1.35;
        ctx.emit({ type: 'upgrade', msg: `🚀 ${pr.name} viralizou! Renda +35%` });
      } else if (ctx.random() < 0.04) {
        pr.income *= 0.85; // concorrência
      }
      pr.income = Math.max(10, pr.income);
      productIncome += pr.income;
      pr.total = (pr.total || 0) + pr.income;
    });
    if (productIncome > 0) state.money += Math.round(productIncome);

    // evento aleatório do dia (não durante a simulação offline)
    if (!ctx.offline && !state.pendingEvent && state.day >= 2 && ctx.random() < 0.25) {
      triggerRandomEvent(ctx);
    }
    // evento com escolha ignorado por 3 dias resolve sozinho (opção padrão)
    if (state.pendingEvent && state.day - state.pendingEvent.day >= 3) {
      resolveEvent(ctx, state.pendingEvent.defaultOption);
    }

    // concorrência: rivais crescem um pouco todo dia
    state.rivals.forEach((r) => {
      r.rep += r.growth * ctx.rand(0.5, 1.4);
    });
    const pos = rankPosition(ctx);
    if (state.rankPos != null && pos < state.rankPos) {
      ctx.emit({ type: 'upgrade', msg: `📈 Sua agência subiu para ${pos}º lugar no ranking!` });
    }
    state.rankPos = pos;

    checkAchievements(ctx);
  }

  // ---------- offline ----------
  // simula o tempo que o jogador ficou fora (cap de 8h, eficiência 60%)
  function simulateOffline(): OfflineReport | null {
    const state = ctx.state;
    const away = (now() - (state.lastSeen || now())) / 1000;
    if (away < 90) return null;
    const secs = Math.min(away, 8 * 3600);
    const before = {
      money: state.money,
      completed: state.stats.completed,
      failed: state.stats.failed,
      day: state.day,
      rep: state.rep,
    };
    ctx.offline = true;
    const step = 1;
    for (let tAcc = 0; tAcc < secs; tAcc += step) tick(step);
    ctx.offline = false;
    // a equipe voltou descansada
    state.employees.forEach((e) => {
      e.energy = 100;
      e.resting = false;
    });
    return {
      seconds: Math.round(away),
      money: Math.round(state.money - before.money),
      completed: state.stats.completed - before.completed,
      failed: state.stats.failed - before.failed,
      days: state.day - before.day,
      rep: Math.round(state.rep - before.rep),
    };
  }

  // ---------- ciclo de vida ----------
  function newGame(companyName?: string): void {
    ctx.state = freshState(ctx, companyName);
    started = true;
    refillContracts(ctx);
    save();
  }

  function load(): boolean {
    try {
      const raw = persistence.read();
      if (!raw) return false;
      ctx.state = migrate(ctx, JSON.parse(raw));
      started = true;
      idc = nextIdSeed(ctx.state);
      refillContracts(ctx);
      offlineReport = simulateOffline();
      save();
      return true;
    } catch {
      return false;
    }
  }

  function hasSave(): boolean {
    return !!persistence.read();
  }

  function reset(): void {
    persistence.clear();
    started = false;
  }

  function takeOfflineReport(): OfflineReport | null {
    const r = offlineReport;
    offlineReport = null;
    return r;
  }

  function setCompany(name: string): void {
    if (!started || !name) return;
    ctx.state.company = String(name).slice(0, 28);
    changed();
  }

  function setTimeScale(x: number): void {
    timeScale = [0, 1, 2, 3].includes(x) ? x : 1;
    emitChange();
  }

  // ---------- API pública (mesma forma do antigo window.Game) ----------
  return {
    on: bus.on.bind(bus),
    tick,
    autoSaveTick,
    newGame,
    load,
    hasSave,
    reset,
    save,
    get state(): GameState | null {
      return started ? ctx.state : null;
    },
    get timeScale(): number {
      return timeScale;
    },
    setTimeScale,
    // getters de balanceamento
    tier: () => tier(ctx),
    maxDesks: () => maxDesks(ctx),
    projectSlots: () => projectSlots(ctx),
    deskCost: () => deskCost(ctx),
    production: () => production(ctx),
    employeesSeated: () => employeesSeated(ctx),
    contractValueMult: () => contractValueMult(ctx),
    repMultiplier: () => repMultiplier(ctx),
    projectRates: () => projectRates(ctx),
    assignedCount: (projectUid: string) => assignedCount(ctx, projectUid),
    promotionFor: (e: Employee) => promotionFor(e),
    canPromote: (e: Employee) => canPromote(ctx, e),
    productCost: () => productCost(ctx),
    productsUnlocked: () => productsUnlocked(ctx),
    empSpeed: (e: Employee, project: Project | null) => empSpeed(e, project),
    takeOfflineReport,
    rankPosition: () => rankPosition(ctx),
    // ações
    acceptProject: (uid: string) => acceptProject(ctx, uid),
    declineProject: (uid: string) => declineProject(ctx, uid),
    hire: (roleId: Employee['role']) => hire(ctx, roleId),
    fire: (uid: string) => fire(ctx, uid),
    buyDesk: () => buyDesk(ctx),
    upgradeOffice: () => upgradeOffice(ctx),
    buyUpgrade: (id: string) => buyUpgrade(ctx, id),
    assignEmployee: (empUid: string, projectUid: string | null) => assignEmployee(ctx, empUid, projectUid),
    promote: (uid: string) => promote(ctx, uid),
    resolveEvent: (optionId: string) => resolveEvent(ctx, optionId),
    launchProduct: () => launchProduct(ctx),
    setCompany,
    // helpers
    fmt,
    DAY_LENGTH,
  };
}

/** Tipo da API pública do motor (usado pelo shim window.Game e nos testes). */
export type Engine = ReturnType<typeof createEngine>;
