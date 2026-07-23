/* ===========================================================
   App Agency Tycoon — motor do jogo (estado + regras)
   Expõe window.Game
   =========================================================== */
(function () {
  'use strict';
  const D = window.DATA;
  const SAVE_KEY = 'appAgencyTycoon.save.v1';

  // segundos reais por "dia" do jogo
  const DAY_LENGTH = 8;
  // pontos de trabalho -> XP
  const XP_PER_WORK = 0.35;

  let state = null;
  const listeners = { change: [], event: [], tick: [] };

  // ---------- utilidades ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  let idc = 1;
  const nextId = () => 'e' + (idc++);

  function emit(type, payload) {
    (listeners[type] || []).forEach((fn) => fn(payload));
  }
  function on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }

  // ---------- estado inicial ----------
  function freshState() {
    return {
      company: 'Minha Agência',
      money: 1500,
      rep: 0,
      level: 1,
      xp: 0,
      day: 1,
      dayProgress: 0,
      tier: 0,
      desks: 3,          // 3 mesas de desenvolvedor (a secretária tem mesa própria)
      employees: [{ uid: nextId(), role: 'junior', assign: null }], // 1 programador de largada
      active: [],        // projetos em andamento
      available: [],     // contratos ofertados
      upgrades: [],      // ids comprados
      contractTimer: 0,
      salaryTimer: 0,
      stats: { completed: 0, earned: 0, failed: 0 },
      muted: false,
      createdAt: Date.now(),
    };
  }

  // ---------- getters de balanceamento ----------
  function tier() { return D.TIERS[state.tier]; }
  function maxDesks() { return tier().maxDesks; }
  function projectSlots() { return tier().slots; }

  function upgradeEffect(key) {
    let mult = 0;
    state.upgrades.forEach((id) => {
      const u = D.UPGRADES.find((x) => x.id === id);
      if (u && u.effect[key]) mult += u.effect[key];
    });
    return mult;
  }

  // multiplicador de produção total da equipe
  function prodMultiplier() {
    let m = 1 + upgradeEffect('prodMult');
    // gerente: +10% por gerente
    const managers = state.employees.filter((e) => e.role === 'manager').length;
    m *= 1 + managers * 0.10;
    return m;
  }

  // produção base (soma das velocidades dos funcionários que têm mesa)
  function baseProduction() {
    const capacity = Math.min(state.employees.length, state.desks);
    let sum = 0;
    for (let i = 0; i < capacity; i++) {
      const role = D.ROLES.find((r) => r.id === state.employees[i].role);
      if (role) sum += role.speed;
    }
    return sum;
  }

  function production() { return baseProduction() * prodMultiplier(); }

  // ---- direcionamento de tarefas ----
  // Cada funcionário pode ser fixado num projeto (emp.assign = uid) ou ficar
  // em "auto" (null): o pool auto é dividido igualmente entre os projetos.
  function assignEmployee(empUid, projectUid) {
    const emp = state.employees.find((e) => e.uid === empUid);
    if (!emp) return false;
    emp.assign = projectUid || null;
    changed();
    return true;
  }

  // produção efetiva de cada projeto ativo (pts/s), respeitando atribuições
  function projectRates() {
    const rates = {};
    if (!state.active.length) return rates;
    state.active.forEach((p) => (rates[p.uid] = 0));
    const mult = prodMultiplier();
    const capacity = Math.min(state.employees.length, state.desks);
    let autoPool = 0;
    for (let i = 0; i < capacity; i++) {
      const e = state.employees[i];
      const role = D.ROLES.find((r) => r.id === e.role);
      if (!role) continue;
      if (e.assign && rates[e.assign] !== undefined) rates[e.assign] += role.speed * mult;
      else autoPool += role.speed * mult;
    }
    const share = autoPool / state.active.length;
    state.active.forEach((p) => (rates[p.uid] += share));
    return rates;
  }

  // conta funcionários fixados num projeto (para a UI)
  function assignedCount(projectUid) {
    return state.employees.filter((e) => e.assign === projectUid).length;
  }

  function repMultiplier() {
    let m = 1 + upgradeEffect('repMult');
    if (state.employees.some((e) => e.role === 'qa')) m += 0.08 * state.employees.filter(e => e.role === 'qa').length;
    return m;
  }
  function contractValueMult() { return 1 + upgradeEffect('contractValue'); }

  function deskCost() {
    // custo cresce com a quantidade já comprada
    return Math.floor(500 * Math.pow(1.35, state.desks - 1));
  }

  function employeesSeated() { return Math.min(state.employees.length, state.desks); }

  // ---------- contratos ----------
  function generateContract() {
    // contratos do tier atual (e abaixo) são sempre aceitáveis;
    // os do próximo tier aparecem como metas travadas por reputação.
    const base = D.PROJECT_TYPES.filter((p) => p.tier <= state.tier);
    const stretch = D.PROJECT_TYPES.filter((p) => p.tier === state.tier + 1);
    let pool;
    if (stretch.length && Math.random() < 0.3) pool = stretch;
    else pool = base.length ? base : D.PROJECT_TYPES.filter((p) => p.tier <= state.tier + 1);
    const type = pick(pool);
    const variance = rand(0.8, 1.3);
    const work = Math.round(type.workBase * variance);
    const reward = Math.round(type.rewardBase * variance * contractValueMult());
    const rep = Math.max(1, Math.round(type.repBase * variance));
    const deadline = Math.max(4, Math.round(work / 6 + rand(3, 9)));
    return {
      uid: nextId(),
      typeId: type.id,
      name: type.name,
      emoji: type.emoji,
      client: pick(D.CLIENTS),
      work,
      done: 0,
      reward,
      rep,
      deadline,
      daysLeft: deadline,
      repReq: type.tier > state.tier ? Math.round(D.TIERS[type.tier].repReq * 0.6) : 0,
    };
  }

  function refillContracts() {
    const target = 4;
    while (state.available.length < target) {
      state.available.push(generateContract());
    }
  }

  function acceptProject(uid) {
    if (state.active.length >= projectSlots()) {
      emit('event', { type: 'error', msg: 'Sem vagas de projeto. Expanda o escritório.' });
      return false;
    }
    const idx = state.available.findIndex((p) => p.uid === uid);
    if (idx < 0) return false;
    const p = state.available[idx];
    if (state.rep < p.repReq) {
      emit('event', { type: 'error', msg: `Reputação insuficiente (precisa de ${Math.ceil(p.repReq)} ⭐).` });
      return false;
    }
    state.available.splice(idx, 1);
    state.active.push(p);
    emit('event', { type: 'info', msg: `Contrato aceito: ${p.name}` });
    changed();
    return true;
  }

  function declineProject(uid) {
    const idx = state.available.findIndex((p) => p.uid === uid);
    if (idx >= 0) { state.available.splice(idx, 1); changed(); }
  }

  function completeProject(p) {
    const gain = Math.round(p.reward);
    const repGain = Math.round(p.rep * repMultiplier());
    state.money += gain;
    state.rep += repGain;
    state.stats.completed++;
    state.stats.earned += gain;
    addXp(p.work * XP_PER_WORK);
    emit('event', { type: 'complete', msg: `✅ ${p.name} entregue! +R$ ${fmt(gain)} · +${repGain} ⭐`, gain });
  }

  function clearAssignments(projectUid) {
    state.employees.forEach((e) => { if (e.assign === projectUid) e.assign = null; });
  }

  function failProject(p) {
    const penalty = Math.max(1, Math.round(p.rep * 0.5));
    state.rep = Math.max(0, state.rep - penalty);
    state.stats.failed++;
    emit('event', { type: 'fail', msg: `⌛ Prazo estourado: ${p.name}. -${penalty} ⭐` });
  }

  // ---------- equipe ----------
  function hire(roleId) {
    const role = D.ROLES.find((r) => r.id === roleId);
    if (!role) return false;
    if (state.rep < role.repReq) {
      emit('event', { type: 'error', msg: `Reputação insuficiente para ${role.name}.` });
      return false;
    }
    if (state.money < role.hire) {
      emit('event', { type: 'error', msg: 'Dinheiro insuficiente.' });
      return false;
    }
    if (state.employees.length >= state.desks) {
      emit('event', { type: 'error', msg: 'Sem mesas livres. Compre uma mesa.' });
      return false;
    }
    state.money -= role.hire;
    state.employees.push({ uid: nextId(), role: roleId, assign: null });
    emit('event', { type: 'info', msg: `${role.emoji} ${role.name} contratado!` });
    changed();
    return true;
  }

  function fire(uid) {
    const idx = state.employees.findIndex((e) => e.uid === uid);
    if (idx >= 0) {
      const role = D.ROLES.find((r) => r.id === state.employees[idx].role);
      state.employees.splice(idx, 1);
      emit('event', { type: 'info', msg: `${role ? role.name : 'Funcionário'} demitido.` });
      changed();
    }
  }

  // ---------- compras ----------
  function buyDesk() {
    const cost = deskCost();
    if (state.desks >= maxDesks()) {
      emit('event', { type: 'error', msg: 'Escritório cheio. Expanda para mais mesas.' });
      return false;
    }
    if (state.money < cost) { emit('event', { type: 'error', msg: 'Dinheiro insuficiente.' }); return false; }
    state.money -= cost;
    state.desks++;
    emit('event', { type: 'info', msg: '🪑 Nova mesa instalada!' });
    changed();
    return true;
  }

  function upgradeOffice() {
    const next = D.TIERS[state.tier + 1];
    if (!next) { emit('event', { type: 'error', msg: 'Você já tem o maior escritório!' }); return false; }
    if (state.rep < next.repReq) {
      emit('event', { type: 'error', msg: `Precisa de ${next.repReq} ⭐ de reputação.` });
      return false;
    }
    if (state.money < next.cost) { emit('event', { type: 'error', msg: 'Dinheiro insuficiente.' }); return false; }
    state.money -= next.cost;
    state.tier++;
    emit('event', { type: 'upgrade', msg: `${next.icon} Mudança para ${next.name}!` });
    changed();
    return true;
  }

  function buyUpgrade(id) {
    if (state.upgrades.includes(id)) return false;
    const u = D.UPGRADES.find((x) => x.id === id);
    if (!u) return false;
    if (state.money < u.cost) { emit('event', { type: 'error', msg: 'Dinheiro insuficiente.' }); return false; }
    state.money -= u.cost;
    state.upgrades.push(id);
    emit('event', { type: 'upgrade', msg: `${u.emoji} ${u.name} adquirido!` });
    changed();
    return true;
  }

  // ---------- progressão ----------
  function addXp(amount) {
    state.xp += amount;
    let need = D.xpForLevel(state.level);
    while (state.xp >= need) {
      state.xp -= need;
      state.level++;
      emit('event', { type: 'level', msg: `🎉 Nível ${state.level}! Nova reputação e bônus.` });
      state.rep += 5;
      need = D.xpForLevel(state.level);
    }
  }

  // ---------- loop principal ----------
  function tick(dt) {
    if (!state) return;

    // produção por projeto (respeita o direcionamento de tarefas)
    if (state.active.length > 0) {
      const rates = projectRates();
      for (let i = state.active.length - 1; i >= 0; i--) {
        const p = state.active[i];
        p.done += (rates[p.uid] || 0) * dt;
        if (p.done >= p.work) {
          completeProject(p);
          state.active.splice(i, 1);
          clearAssignments(p.uid);
        }
      }
    }

    // passagem do tempo (dias)
    state.dayProgress += dt;
    while (state.dayProgress >= DAY_LENGTH) {
      state.dayProgress -= DAY_LENGTH;
      advanceDay();
    }

    // fluxo de novos contratos
    state.contractTimer -= dt;
    const flowBonus = upgradeEffect('contractFlow');
    if (state.contractTimer <= 0) {
      if (state.available.length < 6) state.available.push(generateContract());
      state.contractTimer = Math.max(3, 9 - flowBonus * 4);
    }

    emit('tick', state);
  }

  function advanceDay() {
    state.day++;
    // prazos dos projetos
    for (let i = state.active.length - 1; i >= 0; i--) {
      const p = state.active[i];
      p.daysLeft--;
      if (p.daysLeft <= 0 && p.done < p.work) {
        failProject(p);
        state.active.splice(i, 1);
        clearAssignments(p.uid);
      }
    }
    // prazos dos contratos disponíveis expiram lentamente
    state.available.forEach((p) => (p.daysLeft = Math.max(0, p.daysLeft - 1)));
    state.available = state.available.filter((p) => p.daysLeft > 0);
    refillContracts();

    // pagamento de salários (por dia)
    let salaries = 0;
    state.employees.forEach((e) => {
      const role = D.ROLES.find((r) => r.id === e.role);
      if (role) salaries += role.salary;
    });
    if (salaries > 0) {
      state.money -= salaries;
      if (state.money < 0) {
        // dívida: perde reputação, não pode ficar negativo demais
        const debt = -state.money;
        state.money = 0;
        state.rep = Math.max(0, state.rep - Math.ceil(debt / 200));
        emit('event', { type: 'warn', msg: `💸 Sem caixa para salários! Reputação caiu.` });
      }
    }
  }

  // ---------- persistência ----------
  let changeQueued = false;
  function changed() { emit('change', state); save(); }
  function changedThrottled() {
    if (changeQueued) return;
    changeQueued = true;
    requestAnimationFrame(() => { changeQueued = false; emit('change', state); });
  }

  let saveTimer = 0;
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function autoSaveTick(dt) {
    saveTimer += dt;
    if (saveTimer >= 5) { saveTimer = 0; save(); }
  }

  function hasSave() { return !!localStorage.getItem(SAVE_KEY); }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      state = JSON.parse(raw);
      // migração/segurança de campos
      const base = freshState();
      state = Object.assign(base, state);
      // recomputa idc para evitar colisão de ids
      idc = 1;
      refillContracts();
      return true;
    } catch (e) { return false; }
  }
  function reset() {
    localStorage.removeItem(SAVE_KEY);
    state = null;
  }
  function newGame() {
    state = freshState();
    refillContracts();
    save();
  }

  function fmt(n) {
    return Math.round(n).toLocaleString('pt-BR');
  }

  // ---------- API pública ----------
  window.Game = {
    on,
    tick, autoSaveTick,
    newGame, load, hasSave, reset, save,
    get state() { return state; },
    // getters
    tier, maxDesks, projectSlots, deskCost, production, employeesSeated,
    contractValueMult, repMultiplier, projectRates, assignedCount,
    // ações
    acceptProject, declineProject, hire, fire, buyDesk, upgradeOffice, buyUpgrade,
    assignEmployee,
    // helpers
    fmt,
    DAY_LENGTH,
  };
})();
