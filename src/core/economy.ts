/* ===========================================================
   App Agency Tycoon — economia (F1 do PRD)
   Produção, contratos, equipe, compras, produtos e progressão.
   Portado 1:1 de js/game.js — NENHUM número foi alterado.
   Funções puras: recebem o Ctx e mutam ctx.state; avisos via ctx.emit.
   =========================================================== */
import {
  TIERS,
  ROLES,
  UPGRADES,
  PROJECT_TYPES,
  CLIENTS,
  PROMOTIONS,
  PRODUCT_NAMES,
  phaseFor,
  xpForLevel,
} from './data';
import type { Cargo, CargoId, Promocao, Tier } from './data';
import { DAY_LENGTH, XP_PER_WORK, fmt, newEmployee } from './state';
import type { Ctx, Employee, Project } from './state';

// ---------- getters de balanceamento ----------
// state.tier é sempre um índice válido de TIERS (0..5).
export function tier(ctx: Ctx): Tier {
  return TIERS[ctx.state.tier]!;
}
export function maxDesks(ctx: Ctx): number {
  return tier(ctx).maxDesks;
}
export function projectSlots(ctx: Ctx): number {
  return tier(ctx).slots;
}

type UpgradeEffectKey = 'prodMult' | 'repMult' | 'contractFlow' | 'contractValue';
export function upgradeEffect(ctx: Ctx, key: UpgradeEffectKey): number {
  let mult = 0;
  ctx.state.upgrades.forEach((id) => {
    const u = UPGRADES.find((x) => x.id === id);
    if (u && u.effect[key]) mult += u.effect[key]!;
  });
  return mult;
}

// multiplicador de produção total da equipe
export function prodMultiplier(ctx: Ctx): number {
  const state = ctx.state;
  let m = 1 + upgradeEffect(ctx, 'prodMult');
  // gerente: +10% por gerente
  const managers = state.employees.filter((e) => e.role === 'manager').length;
  m *= 1 + managers * 0.1;
  // efeitos temporários (ex.: queda de energia)
  state.effects.forEach((ef) => {
    if (ef.prod) m *= ef.prod;
  });
  return m;
}

// bônus de foco de equipe: +12% por colega no mesmo projeto (teto +60%)
export function teamFocusBonus(ctx: Ctx, projectUid: string): number {
  const assigned = assignedCount(ctx, projectUid);
  if (assigned <= 1) return 1;
  const bonus = Math.min(0.6, (assigned - 1) * 0.12);
  return 1 + bonus;
}

// velocidade efetiva de um funcionário em pts/SEGUNDO
// (role.speed é pts/dia; considera energia, humor e fase do projeto)
export function empSpeed(e: Employee, project: Project | null, ctx?: Ctx): number {
  if (e.resting) return 0;
  const role = ROLES.find((r) => r.id === e.role);
  if (!role) return 0;
  let s = role.speed / DAY_LENGTH;
  const en = e.energy == null ? 100 : e.energy;
  s *= 0.5 + 0.6 * (en / 100); // 50%..110% conforme a energia
  if (e.mood && e.mood.daysLeft > 0) s *= e.mood.mult;
  if (project) {
    const ph = phaseFor(project.done / project.work);
    const w = ph.weights[e.role];
    s *= w == null ? 1 : w;
    // aplica bônus de foco de equipe (se ctx e projeto atribuído)
    if (ctx && e.assign === project.uid) {
      s *= teamFocusBonus(ctx, project.uid);
    }
  }
  return s;
}

// produção "geral" para o HUD (sem pesos de fase)
export function production(ctx: Ctx): number {
  const state = ctx.state;
  const capacity = Math.min(state.employees.length, state.desks);
  let sum = 0;
  for (let i = 0; i < capacity; i++) {
    const e = state.employees[i];
    if (e) sum += empSpeed(e, null, undefined);
  }
  return sum * prodMultiplier(ctx);
}

// ---- direcionamento de tarefas ----
// Cada funcionário pode ser fixado num projeto (emp.assign = uid) ou ficar
// em "auto" (null): o pool auto é dividido igualmente entre os projetos.
export function assignEmployee(ctx: Ctx, empUid: string, projectUid: string | null): boolean {
  const emp = ctx.state.employees.find((e) => e.uid === empUid);
  if (!emp) return false;
  emp.assign = projectUid || null;
  ctx.changed();
  return true;
}

// produção efetiva de cada projeto ativo (pts/s), respeitando atribuições,
// fases (design/código/testes) e energia de cada um
export function projectRates(ctx: Ctx): Record<string, number> {
  const state = ctx.state;
  const rates: Record<string, number> = {};
  if (!state.active.length) return rates;
  state.active.forEach((p) => (rates[p.uid] = 0));
  const mult = prodMultiplier(ctx) * (ctx.offline ? 0.6 : 1); // offline rende 60%
  const capacity = Math.min(state.employees.length, state.desks);
  const byUid: Record<string, Project> = {};
  state.active.forEach((p) => (byUid[p.uid] = p));
  for (let i = 0; i < capacity; i++) {
    const e = state.employees[i];
    if (!e) continue;
    const target = e.assign ? byUid[e.assign] : undefined;
    if (target) {
      rates[e.assign!] = (rates[e.assign!] ?? 0) + empSpeed(e, target, ctx) * mult;
    } else {
      // auto: divide igualmente, cada parte com o peso da fase daquele projeto
      state.active.forEach((p) => {
        rates[p.uid] = (rates[p.uid] ?? 0) + (empSpeed(e, p, ctx) * mult) / state.active.length;
      });
    }
  }
  return rates;
}

// conta funcionários fixados num projeto (para a UI)
export function assignedCount(ctx: Ctx, projectUid: string): number {
  return ctx.state.employees.filter((e) => e.assign === projectUid).length;
}

// ---- evolução de carreira ----
export function promotionFor(e: Employee): Promocao | null {
  return PROMOTIONS[e.role] || null;
}
export function canPromote(ctx: Ctx, e: Employee): boolean {
  const pr = promotionFor(e);
  return !!pr && (e.exp || 0) >= pr.xp && ctx.state.money >= pr.cost;
}
export function promote(ctx: Ctx, uid: string): boolean {
  const state = ctx.state;
  const e = state.employees.find((x) => x.uid === uid);
  if (!e) return false;
  const pr = promotionFor(e);
  if (!pr) return false;
  if ((e.exp || 0) < pr.xp) {
    ctx.emit({ type: 'error', msg: 'Ainda não tem experiência para promover.' });
    return false;
  }
  if (state.money < pr.cost) {
    ctx.emit({ type: 'error', msg: 'Dinheiro insuficiente para a promoção.' });
    return false;
  }
  state.money -= pr.cost;
  const toRole = ROLES.find((r) => r.id === pr.to);
  e.role = pr.to;
  e.exp = 0;
  e.mood = { mult: 1.2, daysLeft: 4 }; // promovido = motivado
  state.stats.promotions++;
  ctx.emit({ type: 'upgrade', msg: `🎓 ${e.name} promovido a ${toRole ? toRole.name : pr.to}!` });
  ctx.changed();
  return true;
}

export function repMultiplier(ctx: Ctx): number {
  const state = ctx.state;
  let m = 1 + upgradeEffect(ctx, 'repMult');
  if (state.employees.some((e) => e.role === 'qa')) {
    m += 0.08 * state.employees.filter((e) => e.role === 'qa').length;
  }
  return m;
}
export function contractValueMult(ctx: Ctx): number {
  return 1 + upgradeEffect(ctx, 'contractValue');
}

export function deskCost(ctx: Ctx): number {
  // custo cresce com a quantidade já comprada
  return Math.floor(500 * Math.pow(1.35, ctx.state.desks - 1));
}

export function employeesSeated(ctx: Ctx): number {
  return Math.min(ctx.state.employees.length, ctx.state.desks);
}

// ---------- contratos ----------
export function generateContract(ctx: Ctx): Project {
  const state = ctx.state;
  // contratos do tier atual (e abaixo) são sempre aceitáveis;
  // os do próximo tier aparecem como metas travadas por reputação.
  const base = PROJECT_TYPES.filter((p) => p.tier <= state.tier);
  const stretch = PROJECT_TYPES.filter((p) => p.tier === state.tier + 1);
  let pool;
  if (stretch.length && ctx.random() < 0.3) pool = stretch;
  else pool = base.length ? base : PROJECT_TYPES.filter((p) => p.tier <= state.tier + 1);
  const type = ctx.pick(pool);
  const variance = ctx.rand(0.8, 1.3);
  const work = Math.round(type.workBase * variance);
  const reward = Math.round(type.rewardBase * variance * contractValueMult(ctx));
  const rep = Math.max(1, Math.round(type.repBase * variance));
  // prazo em dias, dimensionado para equipes de ~8-40 pts/dia
  const deadline = Math.max(3, Math.round(work / 15 + ctx.rand(2, 6)));
  return {
    uid: ctx.nextId(),
    typeId: type.id,
    name: type.name,
    emoji: type.emoji,
    client: ctx.pick(CLIENTS),
    work,
    done: 0,
    reward,
    rep,
    deadline,
    daysLeft: deadline,
    repReq: type.tier > state.tier ? Math.round(TIERS[type.tier]!.repReq * 0.6) : 0,
  };
}

export function refillContracts(ctx: Ctx): void {
  const target = 4;
  while (ctx.state.available.length < target) {
    ctx.state.available.push(generateContract(ctx));
  }
}

export function acceptProject(ctx: Ctx, uid: string): boolean {
  const state = ctx.state;
  if (state.active.length >= projectSlots(ctx)) {
    ctx.emit({ type: 'error', msg: 'Sem vagas de projeto. Expanda o escritório.' });
    return false;
  }
  const idx = state.available.findIndex((p) => p.uid === uid);
  if (idx < 0) return false;
  const p = state.available[idx]!;
  if (state.rep < p.repReq) {
    ctx.emit({ type: 'error', msg: `Reputação insuficiente (precisa de ${Math.ceil(p.repReq)} ⭐).` });
    return false;
  }
  state.available.splice(idx, 1);
  state.active.push(p);
  ctx.emit({ type: 'accept', msg: `🤝 Contrato aceito: ${p.name} (${p.client})` });
  ctx.changed();
  return true;
}

export function declineProject(ctx: Ctx, uid: string): void {
  const idx = ctx.state.available.findIndex((p) => p.uid === uid);
  if (idx >= 0) {
    ctx.state.available.splice(idx, 1);
    ctx.changed();
  }
}

export function completeProject(ctx: Ctx, p: Project): void {
  const state = ctx.state;
  const gain = Math.round(p.reward);
  const repGain = Math.round(p.rep * repMultiplier(ctx));
  state.money += gain;
  state.rep += repGain;
  state.stats.completed++;
  state.stats.earned += gain;
  addXp(ctx, p.work * XP_PER_WORK);
  ctx.emit({ type: 'complete', msg: `✅ ${p.name} entregue! +R$ ${fmt(gain)} · +${repGain} ⭐`, gain });
}

export function clearAssignments(ctx: Ctx, projectUid: string): void {
  ctx.state.employees.forEach((e) => {
    if (e.assign === projectUid) e.assign = null;
  });
}

export function failProject(ctx: Ctx, p: Project): void {
  const state = ctx.state;
  const penalty = Math.max(1, Math.round(p.rep * 0.5));
  state.rep = Math.max(0, state.rep - penalty);
  state.stats.failed++;
  ctx.emit({ type: 'fail', msg: `⌛ Prazo estourado: ${p.name}. -${penalty} ⭐` });
}

// ---------- equipe ----------
export function hire(ctx: Ctx, roleId: CargoId): boolean {
  const state = ctx.state;
  const role: Cargo | undefined = ROLES.find((r) => r.id === roleId);
  if (!role) return false;
  if (state.rep < role.repReq) {
    ctx.emit({ type: 'error', msg: `Reputação insuficiente para ${role.name}.` });
    return false;
  }
  if (state.money < role.hire) {
    ctx.emit({ type: 'error', msg: 'Dinheiro insuficiente.' });
    return false;
  }
  if (state.employees.length >= state.desks) {
    ctx.emit({ type: 'error', msg: 'Sem mesas livres. Compre uma mesa.' });
    return false;
  }
  state.money -= role.hire;
  const e = newEmployee(ctx, roleId);
  state.employees.push(e);
  state.stats.hires++;
  ctx.emit({ type: 'info', msg: `${role.emoji} ${e.name} contratado como ${role.name}!` });
  ctx.changed();
  return true;
}

export function fire(ctx: Ctx, uid: string): void {
  const state = ctx.state;
  const idx = state.employees.findIndex((e) => e.uid === uid);
  if (idx >= 0) {
    const emp = state.employees[idx]!;
    const role = ROLES.find((r) => r.id === emp.role);
    // se o funcionário estava alocado a um projeto, verifica expiração
    if (emp.assign) {
      const proj = state.active.find((p) => p.uid === emp.assign);
      if (proj && !proj.noStaffDays) proj.noStaffDays = 0;
    }
    state.employees.splice(idx, 1);
    ctx.emit({ type: 'info', msg: `${role ? role.name : 'Funcionário'} demitido.` });
    ctx.changed();
  }
}

// verifica e expira projetos que ficaram 5+ dias sem ninguém atribuído
export function checkProjectStaffExpiry(ctx: Ctx): void {
  const state = ctx.state;
  for (let i = state.active.length - 1; i >= 0; i--) {
    const p = state.active[i]!;
    const hasStaff = state.employees.some((e) => e.assign === p.uid);
    if (!hasStaff) {
      p.noStaffDays = (p.noStaffDays ?? 0) + 1;
      if (p.noStaffDays >= 5) {
        ctx.emit({
          type: 'info',
          msg: `${p.emoji} Projeto "${p.name}" cancelado (sem funcionários por 5 dias).`,
        });
        state.active.splice(i, 1);
      }
    } else {
      p.noStaffDays = 0;
    }
  }
}

// ---------- compras ----------
export function buyDesk(ctx: Ctx): boolean {
  const state = ctx.state;
  const cost = deskCost(ctx);
  if (state.desks >= maxDesks(ctx)) {
    ctx.emit({ type: 'error', msg: 'Escritório cheio. Expanda para mais mesas.' });
    return false;
  }
  if (state.money < cost) {
    ctx.emit({ type: 'error', msg: 'Dinheiro insuficiente.' });
    return false;
  }
  state.money -= cost;
  state.desks++;
  ctx.emit({ type: 'info', msg: '🪑 Nova mesa instalada!' });
  ctx.changed();
  return true;
}

export function upgradeOffice(ctx: Ctx): boolean {
  const state = ctx.state;
  const next = TIERS[state.tier + 1];
  if (!next) {
    ctx.emit({ type: 'error', msg: 'Você já tem o maior escritório!' });
    return false;
  }
  if (state.rep < next.repReq) {
    ctx.emit({ type: 'error', msg: `Precisa de ${next.repReq} ⭐ de reputação.` });
    return false;
  }
  if (state.money < next.cost) {
    ctx.emit({ type: 'error', msg: 'Dinheiro insuficiente.' });
    return false;
  }
  state.money -= next.cost;
  state.tier++;
  ctx.emit({ type: 'upgrade', msg: `${next.icon} Mudança para ${next.name}!` });
  ctx.changed();
  return true;
}

export function buyUpgrade(ctx: Ctx, id: string): boolean {
  const state = ctx.state;
  if (state.upgrades.includes(id)) return false;
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return false;
  if (state.money < u.cost) {
    ctx.emit({ type: 'error', msg: 'Dinheiro insuficiente.' });
    return false;
  }
  state.money -= u.cost;
  state.upgrades.push(id);
  ctx.emit({ type: 'upgrade', msg: `${u.emoji} ${u.name} adquirido!` });
  ctx.changed();
  return true;
}

// ---------- progressão ----------
export function addXp(ctx: Ctx, amount: number): void {
  const state = ctx.state;
  state.xp += amount;
  let need = xpForLevel(state.level);
  while (state.xp >= need) {
    state.xp -= need;
    state.level++;
    ctx.emit({ type: 'level', msg: `🎉 Nível ${state.level}! Nova reputação e bônus.` });
    state.rep += 5;
    need = xpForLevel(state.level);
  }
}

// ---------- produtos próprios ----------
export function productCost(ctx: Ctx): number {
  return Math.round(6000 * Math.pow(1.7, ctx.state.products.length));
}
export function productsUnlocked(ctx: Ctx): boolean {
  return ctx.state.rep >= 25 || ctx.state.products.length > 0;
}
export function launchProduct(ctx: Ctx): boolean {
  const state = ctx.state;
  if (!productsUnlocked(ctx)) {
    ctx.emit({ type: 'error', msg: 'Alcance 25 ⭐ para lançar produtos próprios.' });
    return false;
  }
  const cost = productCost(ctx);
  if (state.money < cost) {
    ctx.emit({ type: 'error', msg: 'Dinheiro insuficiente.' });
    return false;
  }
  state.money -= cost;
  const used = state.products.map((p) => p.name.replace(/ \d+$/, ''));
  const free = PRODUCT_NAMES.filter((n) => !used.includes(n));
  const name = free.length ? ctx.pick(free) : ctx.pick(PRODUCT_NAMES) + ' ' + (state.products.length + 1);
  const income = Math.round((cost / 22) * ctx.rand(0.85, 1.25));
  state.products.push({ uid: ctx.nextId(), name, income, total: 0, ageDays: 0 });
  ctx.emit({ type: 'upgrade', msg: `💡 ${name} lançado! Renda estimada: R$ ${fmt(income)}/dia` });
  ctx.changed();
  return true;
}

// posição do jogador no ranking (1 = líder)
export function rankPosition(ctx: Ctx): number {
  return 1 + ctx.state.rivals.filter((r) => r.rep > ctx.state.rep).length;
}
