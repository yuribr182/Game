/* ===========================================================
   App Agency Tycoon — motor do jogo (estado + regras)
   Expõe window.Game
   =========================================================== */
(function () {
  'use strict';
  const D = window.DATA;
  const SAVE_KEY = 'appAgencyTycoon.save.v1';

  // segundos reais por "dia" do jogo — estilo The Sims: 1 dia = 24 minutos
  const DAY_LENGTH = 1440;
  // pontos de trabalho -> XP
  const XP_PER_WORK = 0.35;

  const SAVE_VERSION = 3;

  let state = null;
  let offlineMode = false;   // simulando tempo fora: silencia eventos/toasts
  const listeners = { change: [], event: [], tick: [] };

  // ---------- utilidades ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  let idc = 1;
  const nextId = () => 'e' + (idc++);

  function emit(type, payload) {
    if (offlineMode) return;   // sem toasts/render durante a simulação offline
    (listeners[type] || []).forEach((fn) => fn(payload));
  }
  function on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }

  function newEmployee(roleId) {
    return {
      uid: nextId(), role: roleId, assign: null,
      name: pick(D.FIRST_NAMES),
      energy: 100, resting: false,
      exp: 0, salaryMult: 1,
      mood: null,               // { mult, daysLeft } — motivado/desmotivado
    };
  }

  // ---------- estado inicial ----------
  function freshState(companyName) {
    return {
      v: SAVE_VERSION,
      company: companyName || 'Minha Agência',
      money: 1500,
      rep: 0,
      level: 1,
      xp: 0,
      day: 1,
      dayProgress: DAY_LENGTH * 0.375,   // começa às 9h da manhã
      tier: 0,
      desks: 3,          // 3 mesas de desenvolvedor (a secretária tem mesa própria)
      employees: [newEmployee('junior')], // 1 programador de largada
      active: [],        // projetos em andamento
      available: [],     // contratos ofertados
      upgrades: [],      // ids comprados
      products: [],      // produtos próprios (renda passiva)
      effects: [],       // efeitos temporários de eventos { id, daysLeft, prod }
      pendingEvent: null,// evento aguardando escolha do jogador
      contractTimer: 0,
      salaryTimer: 0,
      stats: { completed: 0, earned: 0, failed: 0 },
      muted: false,
      lastSeen: Date.now(),
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
    // efeitos temporários (ex.: queda de energia)
    (state.effects || []).forEach((ef) => { if (ef.prod) m *= ef.prod; });
    return m;
  }

  // velocidade efetiva de um funcionário em pts/SEGUNDO
  // (role.speed é pts/dia; considera energia, humor e fase do projeto)
  function empSpeed(e, project) {
    if (e.resting) return 0;
    const role = D.ROLES.find((r) => r.id === e.role);
    if (!role) return 0;
    let s = role.speed / DAY_LENGTH;
    const en = e.energy == null ? 100 : e.energy;
    s *= 0.5 + 0.6 * (en / 100);                 // 50%..110% conforme a energia
    if (e.mood && e.mood.daysLeft > 0) s *= e.mood.mult;
    if (project) {
      const ph = D.phaseFor(project.done / project.work);
      const w = ph.weights[e.role];
      s *= (w == null ? 1 : w);
    }
    return s;
  }

  // produção "geral" para o HUD (sem pesos de fase)
  function production() {
    const capacity = Math.min(state.employees.length, state.desks);
    let sum = 0;
    for (let i = 0; i < capacity; i++) sum += empSpeed(state.employees[i], null);
    return sum * prodMultiplier();
  }

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

  // produção efetiva de cada projeto ativo (pts/s), respeitando atribuições,
  // fases (design/código/testes) e energia de cada um
  function projectRates() {
    const rates = {};
    if (!state.active.length) return rates;
    state.active.forEach((p) => (rates[p.uid] = 0));
    const mult = prodMultiplier() * (offlineMode ? 0.6 : 1);  // offline rende 60%
    const capacity = Math.min(state.employees.length, state.desks);
    const byUid = {};
    state.active.forEach((p) => (byUid[p.uid] = p));
    for (let i = 0; i < capacity; i++) {
      const e = state.employees[i];
      if (e.assign && byUid[e.assign]) {
        rates[e.assign] += empSpeed(e, byUid[e.assign]) * mult;
      } else {
        // auto: divide igualmente, cada parte com o peso da fase daquele projeto
        state.active.forEach((p) => {
          rates[p.uid] += (empSpeed(e, p) * mult) / state.active.length;
        });
      }
    }
    return rates;
  }

  // conta funcionários fixados num projeto (para a UI)
  function assignedCount(projectUid) {
    return state.employees.filter((e) => e.assign === projectUid).length;
  }

  // ---- evolução de carreira ----
  function promotionFor(e) { return D.PROMOTIONS[e.role] || null; }
  function canPromote(e) {
    const pr = promotionFor(e);
    return pr && (e.exp || 0) >= pr.xp && state.money >= pr.cost;
  }
  function promote(uid) {
    const e = state.employees.find((x) => x.uid === uid);
    if (!e) return false;
    const pr = promotionFor(e);
    if (!pr) return false;
    if ((e.exp || 0) < pr.xp) { emit('event', { type: 'error', msg: 'Ainda não tem experiência para promover.' }); return false; }
    if (state.money < pr.cost) { emit('event', { type: 'error', msg: 'Dinheiro insuficiente para a promoção.' }); return false; }
    state.money -= pr.cost;
    const toRole = D.ROLES.find((r) => r.id === pr.to);
    e.role = pr.to;
    e.exp = 0;
    e.mood = { mult: 1.2, daysLeft: 4 };   // promovido = motivado
    emit('event', { type: 'upgrade', msg: `🎓 ${e.name} promovido a ${toRole.name}!` });
    changed();
    return true;
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
    // prazo em dias, dimensionado para equipes de ~8-40 pts/dia
    const deadline = Math.max(3, Math.round(work / 15 + rand(2, 6)));
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
    const e = newEmployee(roleId);
    state.employees.push(e);
    emit('event', { type: 'info', msg: `${role.emoji} ${e.name} contratado como ${role.name}!` });
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
    const working = state.active.length > 0;
    if (working) {
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

    // energia e experiência individual (não drena na simulação offline)
    // trabalhando: esgota em ~0,7 dia; descansando: recupera em ~0,15 dia
    if (!offlineMode) {
      const capacity = Math.min(state.employees.length, state.desks);
      const coffeeBoost = 1 + upgradeEffect('prodMult') * 0.3;  // escritório melhor = pausa melhor
      const drain = 140 / DAY_LENGTH, recover = 500 / DAY_LENGTH;
      state.employees.forEach((e, i) => {
        if (e.energy == null) e.energy = 100;
        const seated = i < capacity;
        if (seated && working && !e.resting) {
          e.energy = Math.max(0, e.energy - drain * dt);
          e.exp = (e.exp || 0) + dt / DAY_LENGTH;   // experiência em dias trabalhados
          if (e.energy <= 15) e.resting = true;     // pausa silenciosa (sem toast)
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

    // fluxo de novos contratos: um a cada ~1/3 de dia (marketing acelera)
    state.contractTimer -= dt;
    const flowBonus = upgradeEffect('contractFlow');
    if (state.contractTimer <= 0) {
      if (state.available.length < 6) state.available.push(generateContract());
      state.contractTimer = Math.max(0.12, 0.34 - flowBonus * 0.1) * DAY_LENGTH;
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

    // pagamento de salários (por dia, considerando aumentos)
    let salaries = 0;
    state.employees.forEach((e) => {
      const role = D.ROLES.find((r) => r.id === e.role);
      if (role) salaries += role.salary * (e.salaryMult || 1);
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

    // humor (motivado/desmotivado) expira
    state.employees.forEach((e) => {
      if (e.mood && --e.mood.daysLeft <= 0) e.mood = null;
    });

    // efeitos temporários expiram
    state.effects = (state.effects || []).filter((ef) => --ef.daysLeft > 0);

    // renda dos produtos próprios
    let productIncome = 0;
    (state.products || []).forEach((pr) => {
      pr.ageDays++;
      pr.income *= rand(0.97, 1.04);                       // flutuação de mercado
      if (!offlineMode && Math.random() < 0.05) { pr.income *= 1.35; emit('event', { type: 'upgrade', msg: `🚀 ${pr.name} viralizou! Renda +35%` }); }
      else if (Math.random() < 0.04) pr.income *= 0.85;    // concorrência
      pr.income = Math.max(10, pr.income);
      productIncome += pr.income;
      pr.total = (pr.total || 0) + pr.income;
    });
    if (productIncome > 0) state.money += Math.round(productIncome);

    // evento aleatório do dia (não durante a simulação offline)
    if (!offlineMode && !state.pendingEvent && state.day >= 2 && Math.random() < 0.25) {
      triggerRandomEvent();
    }
    // evento com escolha ignorado por 3 dias resolve sozinho (opção padrão)
    if (state.pendingEvent && state.day - state.pendingEvent.day >= 3) {
      resolveEvent(state.pendingEvent.defaultOption);
    }
  }

  // ---------- eventos aleatórios ----------
  function triggerRandomEvent() {
    const weighted = [];
    D.EVENTS.forEach((ev) => { for (let k = 0; k < Math.round(ev.chance * 10); k++) weighted.push(ev); });
    const ev = pick(weighted);
    if (ev.id === 'vip') {
      const p = generateContract();
      p.reward = Math.round(p.reward * 2.2);
      p.rep = Math.round(p.rep * 1.5);
      p.deadline = p.daysLeft = Math.max(4, Math.floor(p.deadline * 0.6));
      p.vip = true;
      state.available.unshift(p);
      emit('event', { type: 'upgrade', msg: `🤩 Cliente VIP! ${p.name} pagando R$ ${fmt(p.reward)}` });
    } else if (ev.id === 'midia') {
      const gain = 4 + state.level * 2;
      state.rep += gain;
      emit('event', { type: 'upgrade', msg: `📰 Sua agência saiu na mídia! +${gain} ⭐` });
    } else if (ev.id === 'blackout') {
      state.effects.push({ id: 'blackout', daysLeft: 2, prod: 0.5, label: '🔌 Sem luz (-50% produção)' });
      emit('event', { type: 'warn', msg: '🔌 Queda de energia! Produção reduzida por 2 dias.' });
    } else if (ev.id === 'bug') {
      if (state.employees.some((e) => e.role === 'qa')) {
        state.rep += 3;
        emit('event', { type: 'info', msg: '🕵️ Seu QA pegou um bug antes do cliente ver. +3 ⭐' });
        return;
      }
      const cost = Math.round(300 + state.rep * 6 + state.level * 150);
      openChoiceEvent(ev, { cost }, ev.text + ` Corrigir custa R$ ${fmt(cost)}.`, 'ignore');
    } else if (ev.id === 'raise') {
      const devs = state.employees.filter((e) => (e.salaryMult || 1) < 1.8);
      if (!devs.length) return;
      const emp = pick(devs);
      const role = D.ROLES.find((r) => r.id === emp.role);
      openChoiceEvent(ev, { empUid: emp.uid },
        `${role ? role.emoji : '🧑‍💻'} ${emp.name} (${role ? role.name : ''}) ` + ev.text, 'deny');
    } else if (ev.id === 'investor') {
      const amount = Math.round(2000 + state.level * 1200 + state.rep * 25);
      openChoiceEvent(ev, { amount }, ev.text + ` Aporte de R$ ${fmt(amount)}.`, 'deny');
    }
  }

  function openChoiceEvent(ev, data, text, defaultOption) {
    state.pendingEvent = {
      id: ev.id, title: ev.title, text, options: ev.options,
      data, defaultOption, day: state.day,
    };
    emit('event', { type: 'warn', msg: `${ev.title} — decida no aviso!` });
    changed();
  }

  function resolveEvent(optionId) {
    const pe = state.pendingEvent;
    if (!pe) return false;
    state.pendingEvent = null;
    if (pe.id === 'bug') {
      if (optionId === 'fix') {
        state.money = Math.max(0, state.money - pe.data.cost);
        emit('event', { type: 'info', msg: `🔧 Bug corrigido por R$ ${fmt(pe.data.cost)}. Cliente satisfeito.` });
      } else {
        const loss = Math.max(5, Math.round(state.rep * 0.12));
        state.rep = Math.max(0, state.rep - loss);
        emit('event', { type: 'fail', msg: `🙈 O bug viralizou nas reviews... -${loss} ⭐` });
      }
    } else if (pe.id === 'raise') {
      const emp = state.employees.find((e) => e.uid === pe.data.empUid);
      if (emp) {
        if (optionId === 'accept') {
          emp.salaryMult = (emp.salaryMult || 1) * 1.2;
          emp.mood = { mult: 1.25, daysLeft: 6 };
          emit('event', { type: 'info', msg: `🤝 ${emp.name} está motivado! (+25% produção por 6 dias)` });
        } else if (Math.random() < 0.25) {
          state.employees = state.employees.filter((e) => e.uid !== emp.uid);
          emit('event', { type: 'fail', msg: `😞 ${emp.name} pediu demissão...` });
        } else {
          emp.mood = { mult: 0.7, daysLeft: 4 };
          emit('event', { type: 'warn', msg: `😒 ${emp.name} ficou desmotivado. (-30% produção por 4 dias)` });
        }
      }
    } else if (pe.id === 'investor') {
      if (optionId === 'accept') {
        state.money += pe.data.amount;
        const loss = Math.max(3, Math.round(state.rep * 0.08));
        state.rep = Math.max(0, state.rep - loss);
        emit('event', { type: 'info', msg: `💰 Aporte de R$ ${fmt(pe.data.amount)} recebido! (-${loss} ⭐)` });
      } else {
        const gain = Math.max(3, Math.round(state.rep * 0.05) + 2);
        state.rep += gain;
        emit('event', { type: 'info', msg: `🚫 Independência mantida. O mercado respeita! +${gain} ⭐` });
      }
    }
    changed();
    return true;
  }

  // ---------- produtos próprios ----------
  function productCost() {
    return Math.round(6000 * Math.pow(1.7, (state.products || []).length));
  }
  function productsUnlocked() { return state.rep >= 25 || (state.products || []).length > 0; }
  function launchProduct() {
    if (!productsUnlocked()) { emit('event', { type: 'error', msg: 'Alcance 25 ⭐ para lançar produtos próprios.' }); return false; }
    const cost = productCost();
    if (state.money < cost) { emit('event', { type: 'error', msg: 'Dinheiro insuficiente.' }); return false; }
    state.money -= cost;
    const used = state.products.map((p) => p.name.replace(/ \d+$/, ''));
    const free = D.PRODUCT_NAMES.filter((n) => !used.includes(n));
    const name = free.length ? pick(free) : pick(D.PRODUCT_NAMES) + ' ' + (state.products.length + 1);
    const income = Math.round((cost / 22) * rand(0.85, 1.25));
    state.products.push({ uid: nextId(), name, income, total: 0, ageDays: 0 });
    emit('event', { type: 'upgrade', msg: `💡 ${name} lançado! Renda estimada: R$ ${fmt(income)}/dia` });
    changed();
    return true;
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
    if (!state) return;
    state.lastSeen = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function autoSaveTick(dt) {
    saveTimer += dt;
    if (saveTimer >= 5) { saveTimer = 0; save(); }
  }

  // migra saves de versões anteriores para o formato atual
  function migrate(s) {
    const base = freshState();
    s = Object.assign(base, s);
    if (!s.v || s.v < 2) {
      s.employees.forEach((e) => {
        if (!e.name) e.name = pick(D.FIRST_NAMES);
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
      s.employees.forEach((e) => { e.exp = (e.exp || 0) / 8; });
      s.dayProgress = DAY_LENGTH * 0.375;
      s.contractTimer = 0;
      s.v = 3;
    }
    return s;
  }

  // recomputa o contador de ids acima de todos os ids existentes no save
  function reseedIds(s) {
    let max = 0;
    const scan = (uid) => {
      const m = /^e(\d+)$/.exec(uid || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    };
    (s.employees || []).forEach((e) => scan(e.uid));
    (s.active || []).forEach((p) => scan(p.uid));
    (s.available || []).forEach((p) => scan(p.uid));
    (s.products || []).forEach((p) => scan(p.uid));
    idc = max + 1;
  }

  // simula o tempo que o jogador ficou fora (cap de 8h, eficiência 60%)
  function simulateOffline() {
    const away = (Date.now() - (state.lastSeen || Date.now())) / 1000;
    if (away < 90) return null;
    const secs = Math.min(away, 8 * 3600);
    const before = {
      money: state.money, completed: state.stats.completed,
      failed: state.stats.failed, day: state.day, rep: state.rep,
    };
    offlineMode = true;
    const step = 1;
    for (let tAcc = 0; tAcc < secs; tAcc += step) tick(step);
    offlineMode = false;
    // a equipe voltou descansada
    state.employees.forEach((e) => { e.energy = 100; e.resting = false; });
    return {
      seconds: Math.round(away),
      money: Math.round(state.money - before.money),
      completed: state.stats.completed - before.completed,
      failed: state.stats.failed - before.failed,
      days: state.day - before.day,
      rep: Math.round(state.rep - before.rep),
    };
  }

  function hasSave() { return !!localStorage.getItem(SAVE_KEY); }
  let offlineReport = null;
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      state = migrate(JSON.parse(raw));
      reseedIds(state);
      refillContracts();
      offlineReport = simulateOffline();
      save();
      return true;
    } catch (e) { return false; }
  }
  function takeOfflineReport() { const r = offlineReport; offlineReport = null; return r; }
  function reset() {
    localStorage.removeItem(SAVE_KEY);
    state = null;
  }
  function newGame(companyName) {
    state = freshState(companyName);
    refillContracts();
    save();
  }

  function setCompany(name) {
    if (!state || !name) return;
    state.company = String(name).slice(0, 28);
    changed();
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
    promotionFor, canPromote, productCost, productsUnlocked, empSpeed,
    takeOfflineReport,
    // ações
    acceptProject, declineProject, hire, fire, buyDesk, upgradeOffice, buyUpgrade,
    assignEmployee, promote, resolveEvent, launchProduct, setCompany,
    // helpers
    fmt,
    DAY_LENGTH,
  };
})();
