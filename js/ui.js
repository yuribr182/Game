/* ===========================================================
   App Agency Tycoon — renderização da interface
   Expõe window.UI
   =========================================================== */
(function () {
  'use strict';
  const D = window.DATA;
  const G = window.Game;
  const $ = (s) => document.querySelector(s);
  const fmt = G.fmt;

  const el = {};
  function cache() {
    ['statMoney','statRep','statLevel','statProd','statDay','tierBadge','companyName',
     'officeCap','officeGrid','deskCost','activeCount','activeProjects','availableProjects',
     'hireList','teamList','teamCount','upgradeList','productList'].forEach((id) => (el[id] = document.getElementById(id)));
  }

  const money = (n) => 'R$ ' + fmt(n);

  // ---------- HUD ----------
  let lastMoney = null;
  function renderHUD(s) {
    el.statMoney.textContent = money(s.money);
    if (lastMoney !== null && s.money > lastMoney) {
      el.statMoney.classList.remove('flash-money');
      void el.statMoney.offsetWidth;
      el.statMoney.classList.add('flash-money');
    }
    lastMoney = s.money;
    el.statRep.textContent = fmt(s.rep);
    el.statLevel.textContent = 'Nv ' + s.level;
    el.statProd.textContent = (Math.round(G.production() * 10) / 10) + '/s';
    el.statDay.textContent = 'Dia ' + s.day;
    const t = G.tier();
    el.tierBadge.textContent = t.icon + ' ' + t.name;
    el.companyName.textContent = s.company;
  }

  // ---------- Escritório ----------
  function renderOffice(s) {
    const max = G.maxDesks();
    const n = s.employees.length;
    el.officeCap.textContent = `${s.desks}/${max} mesas · ${n} ${n === 1 ? 'funcionário' : 'funcionários'}`;
    el.deskCost.textContent = s.desks >= max ? 'lotado' : money(G.deskCost());
    // a cena isométrica (canvas) desenha o escritório e lê o estado sozinha
  }

  // ---------- Projetos ----------
  function renderActiveProjects(s) {
    el.activeCount.textContent = `${s.active.length}/${G.projectSlots()}`;
    if (s.active.length === 0) {
      el.activeProjects.innerHTML = `<div class="empty-msg">Nenhum projeto em andamento.<br>Aceite um contrato abaixo 👇</div>`;
    } else {
      const rates = G.projectRates();
      el.activeProjects.innerHTML = s.active.map((p) => {
        const pct = Math.min(100, (p.done / p.work) * 100);
        const dpct = (p.daysLeft / p.deadline) * 100;
        const warn = p.daysLeft <= 3;
        const rate = rates[p.uid] || 0;
        const pinned = G.assignedCount(p.uid);
        const ph = D.phaseFor(p.done / p.work);
        return `<div class="card">
          <div class="card-top">
            <div>
              <div class="card-title">${p.emoji} ${p.name}</div>
              <div class="card-sub">${p.client}</div>
            </div>
            <div>
              <span class="phase-badge">${ph.emoji} ${ph.name}</span>
              <span class="card-badge">${warn ? '⚠️ ' : '📅 '}${p.daysLeft}d</span>
            </div>
          </div>
          <div class="bar ${warn ? 'warn' : ''}"><span style="width:${pct}%"></span></div>
          <div class="card-meta">
            <span>${Math.floor(p.done)}/${p.work} pts</span>
            <span>⚡ ${(Math.round(rate * 10) / 10)}/s</span>
            <span>👥 ${pinned > 0 ? pinned + ' fixo' + (pinned > 1 ? 's' : '') : 'auto'}</span>
            <span class="reward">R$ ${fmt(p.reward)}</span>
            <span class="rep">+${p.rep} ⭐</span>
          </div>
          <div class="bar deadline"><span style="width:${dpct}%"></span></div>
        </div>`;
      }).join('');
    }
  }

  function renderAvailableProjects(s) {
    const slotsFull = s.active.length >= G.projectSlots();
    if (s.available.length === 0) {
      el.availableProjects.innerHTML = `<div class="empty-msg">Buscando novos clientes...</div>`;
    } else {
      el.availableProjects.innerHTML = s.available.map((p) => {
        const locked = s.rep < p.repReq;
        return `<div class="card" ${p.vip ? 'style="border-color:var(--gold)"' : ''}>
          <div class="card-top">
            <div>
              <div class="card-title">${p.emoji} ${p.name} ${p.vip ? '<span class="card-badge vip-badge">VIP</span>' : ''}</div>
              <div class="card-sub">${p.client}</div>
            </div>
            <div class="card-badge">📅 ${p.deadline}d</div>
          </div>
          <div class="card-meta">
            <span><b>${p.work}</b> pts</span>
            <span class="reward"><b>R$ ${fmt(p.reward)}</b></span>
            <span class="rep">+${p.rep} ⭐</span>
            ${p.repReq > 0 ? `<span>${locked ? '🔒 ' : ''}req ${Math.ceil(p.repReq)} ⭐</span>` : ''}
          </div>
          <div class="card-actions">
            <button class="btn btn-primary btn-mini" data-accept="${p.uid}" ${(slotsFull || locked) ? 'disabled' : ''}>
              ${slotsFull ? 'Sem vaga' : locked ? 'Bloqueado' : '✅ Aceitar'}
            </button>
            <button class="btn btn-mini" data-decline="${p.uid}">✖</button>
          </div>
        </div>`;
      }).join('');
    }
  }

  // ---------- Equipe ----------
  function renderTeam(s) {
    el.teamCount.textContent = s.employees.length;
    // contratar
    el.hireList.innerHTML = D.ROLES.map((role) => {
      const locked = s.rep < role.repReq;
      const noMoney = s.money < role.hire;
      const noDesk = s.employees.length >= s.desks;
      const disabled = locked || noMoney || noDesk;
      let reason = '';
      if (locked) reason = `🔒 ${role.repReq} ⭐`;
      else if (noDesk) reason = 'Sem mesa';
      else if (noMoney) reason = 'Sem R$';
      return `<div class="card">
        <div class="card-top">
          <div class="member">
            <div class="avatar">${role.emoji}</div>
            <div class="info">
              <div class="name">${role.name}</div>
              <div class="sub">${role.desc}</div>
            </div>
          </div>
        </div>
        <div class="card-meta">
          <span>⚡ <b>${role.speed}</b>/s</span>
          <span>💵 salário <b>R$ ${fmt(role.salary)}</b>/dia</span>
        </div>
        <div class="card-actions">
          <button class="btn btn-primary btn-mini" data-hire="${role.id}" ${disabled ? 'disabled' : ''}>
            ${disabled ? reason : `Contratar · R$ ${fmt(role.hire)}`}
          </button>
        </div>
      </div>`;
    }).join('');

    // sua equipe
    if (s.employees.length === 0) {
      el.teamList.innerHTML = `<div class="empty-msg">Sua equipe está vazia.<br>Contrate seu primeiro dev! 🧑‍💻</div>`;
    } else {
      // agrupar por função
      const counts = {};
      s.employees.forEach((e) => (counts[e.role] = (counts[e.role] || 0) + 1));
      el.teamList.innerHTML = s.employees.map((e, i) => {
        const role = D.ROLES.find((r) => r.id === e.role);
        const seated = i < s.desks;
        const opts = s.active.map((p) =>
          `<option value="${p.uid}" ${e.assign === p.uid ? 'selected' : ''}>${p.emoji} ${p.name} — ${p.client}</option>`).join('');
        const en = e.energy == null ? 100 : e.energy;
        const salary = Math.round(role.salary * (e.salaryMult || 1));
        const mood = e.mood ? (e.mood.mult > 1 ? ' 😊' : ' 😒') : '';
        const pr = G.promotionFor(e);
        let promoHtml = '';
        if (pr) {
          const toRole = D.ROLES.find((r) => r.id === pr.to);
          const ready = (e.exp || 0) >= pr.xp;
          const pct = Math.min(100, ((e.exp || 0) / pr.xp) * 100);
          promoHtml = ready
            ? `<button class="btn btn-accent btn-mini" data-promote="${e.uid}" ${s.money < pr.cost ? 'disabled' : ''} style="margin-top:7px;width:100%">
                 🎓 Promover a ${toRole.name} · R$ ${fmt(pr.cost)}</button>`
            : `<div class="xp-note">🎓 Experiência p/ ${toRole.name}: ${Math.floor(pct)}%</div>`;
        }
        return `<div class="card">
          <div class="member">
            <div class="avatar">${role.emoji}</div>
            <div class="info">
              <div class="name">${e.name || role.name}${mood} ${e.resting ? '☕' : ''} ${seated ? '' : '<span style="color:var(--red)">(sem mesa)</span>'}</div>
              <div class="sub">${role.name} · ⚡ ${role.speed}/s · R$ ${fmt(salary)}/dia</div>
            </div>
            <button class="btn btn-danger btn-mini" data-fire="${e.uid}">Demitir</button>
          </div>
          <div class="energy-bar ${en < 30 ? 'low' : ''}"><span data-energy="${e.uid}" style="width:${en}%"></span></div>
          ${promoHtml}
          <div class="assign-row">
            <span class="assign-label">🎯 Tarefa</span>
            <select class="assign-select" data-assign="${e.uid}">
              <option value="">Auto (divide entre projetos)</option>
              ${opts}
            </select>
          </div>
        </div>`;
      }).join('');
    }
  }

  // ---------- Loja ----------
  function renderShop(s) {
    const next = D.TIERS[s.tier + 1];
    let officeCard = '';
    if (next) {
      const locked = s.rep < next.repReq;
      const noMoney = s.money < next.cost;
      officeCard = `<div class="card" style="border-color:var(--accent2)">
        <div class="card-top">
          <div>
            <div class="card-title">${next.icon} Expandir para ${next.name}</div>
            <div class="card-sub">${next.maxDesks} mesas · ${next.slots} projetos simultâneos</div>
          </div>
        </div>
        <div class="card-meta">
          <span>Custo <b>R$ ${fmt(next.cost)}</b></span>
          <span>${locked ? '🔒 ' : ''}req <b>${next.repReq} ⭐</b></span>
        </div>
        <div class="card-actions">
          <button class="btn btn-accent btn-mini" id="shopUpgradeOffice" ${(locked || noMoney) ? 'disabled' : ''}>
            ${locked ? 'Reputação insuficiente' : noMoney ? 'Dinheiro insuficiente' : '🏗️ Expandir'}
          </button>
        </div>
      </div>`;
    } else {
      officeCard = `<div class="card"><div class="card-title">🏆 Escritório máximo!</div>
        <div class="card-sub">Você chegou ao topo do mercado imobiliário tech.</div></div>`;
    }

    const upg = D.UPGRADES.map((u) => {
      const owned = s.upgrades.includes(u.id);
      const noMoney = s.money < u.cost;
      return `<div class="card ${owned ? '' : ''}">
        <div class="card-top">
          <div class="member">
            <div class="avatar">${u.emoji}</div>
            <div class="info">
              <div class="name">${u.name}</div>
              <div class="sub">${u.desc}</div>
            </div>
          </div>
          ${owned ? '<span class="card-badge" style="color:var(--green)">✔ Comprado</span>' : ''}
        </div>
        ${owned ? '' : `<div class="card-actions">
          <button class="btn btn-primary btn-mini" data-upg="${u.id}" ${noMoney ? 'disabled' : ''}>
            ${noMoney ? 'Sem R$' : `Comprar · R$ ${fmt(u.cost)}`}
          </button>
        </div>`}
      </div>`;
    }).join('');

    el.upgradeList.innerHTML = officeCard + upg;
    const btn = document.getElementById('shopUpgradeOffice');
    if (btn) btn.onclick = () => G.upgradeOffice();
  }

  // ---------- Produtos próprios ----------
  function renderProducts(s) {
    if (!el.productList) return;
    const unlocked = G.productsUnlocked();
    const cost = G.productCost();
    const launchCard = unlocked
      ? `<div class="card" style="border-color:var(--gold)">
          <div class="card-title">💡 Lançar produto próprio</div>
          <div class="card-sub">Invista para criar um app seu que gera renda todo dia — sem depender de clientes.</div>
          <div class="card-actions" style="margin-top:9px">
            <button class="btn btn-primary btn-mini" id="btnLaunchProduct" ${s.money < cost ? 'disabled' : ''}>
              ${s.money < cost ? 'Sem R$' : `Lançar · R$ ${fmt(cost)}`}
            </button>
          </div>
        </div>`
      : `<div class="empty-msg">🔒 Alcance <b>25 ⭐</b> de reputação para lançar produtos próprios.</div>`;
    const items = (s.products || []).map((p) => `
      <div class="card">
        <div class="card-top">
          <div>
            <div class="card-title">📱 ${p.name}</div>
            <div class="card-sub">${p.ageDays} dias no mercado</div>
          </div>
          <div class="card-badge" style="color:var(--green)">+R$ ${fmt(p.income)}/dia</div>
        </div>
        <div class="card-meta"><span>Total ganho: <b>R$ ${fmt(p.total || 0)}</b></span></div>
      </div>`).join('');
    el.productList.innerHTML = launchCard + items;
    const btn = document.getElementById('btnLaunchProduct');
    if (btn) btn.onclick = () => G.launchProduct();
  }

  // ---------- render completo (mudanças estruturais) ----------
  function renderAll(s) {
    if (!s) return;
    renderHUD(s);
    renderOffice(s);
    renderActiveProjects(s);
    renderAvailableProjects(s);
    renderTeam(s);
    renderShop(s);
    renderProducts(s);
  }

  // ---------- render leve (a cada frame) ----------
  let lastDay = -1, lastActiveSig = '';
  function renderTick(s) {
    if (!s) return;
    renderHUD(s);
    renderActiveProjects(s); // barras de progresso animadas
    // barras de energia da equipe ao vivo (sem reconstruir a lista)
    s.employees.forEach((e) => {
      const bar = document.querySelector(`[data-energy="${e.uid}"]`);
      if (bar) {
        const en = e.energy == null ? 100 : e.energy;
        bar.style.width = en + '%';
        bar.parentElement.classList.toggle('low', en < 30);
      }
    });
    // quando o dia vira, prazos e contratos mudam -> render completo
    if (s.day !== lastDay) { lastDay = s.day; renderAvailableProjects(s); renderOffice(s); renderProducts(s); }
    // quando a quantidade de projetos ativos muda, atualiza disponíveis (vagas)
    const sig = s.active.length + '/' + s.available.length;
    if (sig !== lastActiveSig) { lastActiveSig = sig; renderAvailableProjects(s); renderOffice(s); }
  }

  // ---------- toasts ----------
  const toastBox = () => document.getElementById('toasts');
  function toast(msg, kind) {
    const box = toastBox();
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), 3600);
  }

  window.UI = { cache, renderAll, renderTick, renderHUD, toast };
})();
