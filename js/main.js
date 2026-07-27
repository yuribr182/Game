/* ===========================================================
   App Agency Tycoon — inicialização e loop
   =========================================================== */
(function () {
  'use strict';
  const G = window.Game;
  const UI = window.UI;
  const $ = (s) => document.querySelector(s);

  const startScreen = $('#startScreen');
  const hud = $('#hud');
  const game = $('#game');
  const menuModal = $('#menuModal');

  // ---------- telas ----------
  let isoStarted = false;
  function showGame() {
    startScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    game.classList.remove('hidden');
    UI.cache();
    UI.renderAll(G.state);
    // inicializa a cena isométrica (uma vez); depois só se ajusta ao tamanho
    if (!isoStarted) { window.IsoOffice.init(document.getElementById('officeCanvas')); isoStarted = true; }
    else window.IsoOffice.resize();
  }
  function showStart() {
    startScreen.classList.remove('hidden');
    hud.classList.add('hidden');
    game.classList.add('hidden');
    $('#btnContinue').disabled = !G.hasSave();
  }

  // ---------- eventos do jogo -> toasts ----------
  const kindMap = { complete: 'good', level: 'gold', upgrade: 'gold', achieve: 'gold', accept: '', fail: 'bad', error: 'bad', warn: 'bad', info: '' };
  const sfxMap = { complete: 'complete', level: 'level', upgrade: 'upgrade', achieve: 'level', accept: 'buy', fail: 'fail', warn: 'fail', error: 'error', info: 'hire' };
  G.on('event', (e) => {
    UI.toast(e.msg, kindMap[e.type] || '');
    if (window.Sfx && sfxMap[e.type]) Sfx.play(sfxMap[e.type]);
    if (e.type === 'complete' && e.gain) window.IsoOffice.popMoney('+R$ ' + G.fmt(e.gain));
    if (e.type === 'accept') window.IsoOffice.spawnClient();   // o cliente vem fechar negócio
  });
  G.on('change', (s) => UI.renderAll(s));
  G.on('tick', (s) => UI.renderTick(s));

  // ---------- direcionamento de tarefas (selects da equipe) ----------
  document.addEventListener('change', (ev) => {
    const sel = ev.target.closest('[data-assign]');
    if (sel) { G.assignEmployee(sel.dataset.assign, sel.value || null); if (window.Sfx) Sfx.play('click'); }
  });

  // ---------- delegação de cliques ----------
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-accept],[data-decline],[data-hire],[data-fire],[data-upg],[data-promote]');
    if (!t) return;
    if (t.dataset.accept) G.acceptProject(t.dataset.accept);
    else if (t.dataset.decline) G.declineProject(t.dataset.decline);
    else if (t.dataset.hire) G.hire(t.dataset.hire);
    else if (t.dataset.fire) G.fire(t.dataset.fire);
    else if (t.dataset.upg) G.buyUpgrade(t.dataset.upg);
    else if (t.dataset.promote) G.promote(t.dataset.promote);
  });

  // ---------- modal de evento com escolha ----------
  const eventModal = $('#eventModal');
  function syncEventModal(s) {
    const pe = s && s.pendingEvent;
    if (!pe) { eventModal.classList.add('hidden'); return; }
    $('#eventTitle').textContent = pe.title;
    $('#eventText').textContent = pe.text;
    $('#eventOptions').innerHTML = pe.options.map((o) =>
      `<button class="btn ${o.id === pe.defaultOption ? '' : 'btn-primary'}" data-event-opt="${o.id}">
         ${o.label}<span class="event-opt-hint">${o.hint}</span></button>`).join('');
    eventModal.classList.remove('hidden');
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-event-opt]');
    if (b) { G.resolveEvent(b.dataset.eventOpt); if (window.Sfx) Sfx.play('click'); }
  });
  G.on('change', syncEventModal);

  // ---------- resumo offline ----------
  function showOfflineReport() {
    const r = G.takeOfflineReport();
    if (!r) return;
    const h = Math.floor(r.seconds / 3600), m = Math.floor((r.seconds % 3600) / 60);
    const dur = h > 0 ? `${h}h ${m}min` : `${m}min`;
    const rows = [
      ['⏰ Tempo fora', dur],
      ['📅 Dias de jogo', `+${r.days}`],
      ['✅ Apps entregues', `${r.completed}`],
      r.failed > 0 ? ['⌛ Prazos estourados', `${r.failed}`] : null,
      ['💵 Saldo do período', `${r.money >= 0 ? '+' : ''}R$ ${G.fmt(r.money)}`],
      ['⭐ Reputação', `${r.rep >= 0 ? '+' : ''}${r.rep}`],
    ].filter(Boolean);
    $('#offlineBody').innerHTML = rows.map(([k, v]) => `<div class="offline-row"><span>${k}</span><b>${v}</b></div>`).join('');
    $('#offlineModal').classList.remove('hidden');
    if (window.Sfx) Sfx.play('money');
  }
  $('#btnOfflineOk').onclick = () => $('#offlineModal').classList.add('hidden');

  // ---------- botões fixos ----------
  $('#btnNewGame').onclick = () => {
    if (G.hasSave() && !confirm('Isso vai sobrescrever o jogo salvo. Continuar?')) return;
    G.newGame($('#companyInput').value.trim() || undefined);
    showGame();
  };
  $('#btnContinue').onclick = () => { if (G.load()) { showGame(); showOfflineReport(); syncEventModal(G.state); } };
  // Modo Empresa Real: recarrega com ?empresa=1 (o boot troca o window.Game)
  const btnEmpresa = $('#btnEmpresaReal');
  if (btnEmpresa) btnEmpresa.onclick = () => { location.href = location.pathname + '?empresa=1'; };
  $('#btnRename').onclick = () => {
    const name = $('#renameInput').value.trim();
    if (name) { G.setCompany(name); $('#renameInput').value = ''; UI.toast('✏️ Agência renomeada!', 'good'); }
  };
  $('#btnBuyDesk').onclick = () => G.buyDesk();
  $('#btnUpgradeOffice').onclick = () => G.upgradeOffice();

  // ---------- gaveta lateral (abre/fecha por cima da cena) ----------
  const sidePanel = $('#sidePanel');
  const drawerToggle = $('#drawerToggle');
  if (drawerToggle && sidePanel) {
    drawerToggle.onclick = () => {
      const open = sidePanel.classList.toggle('open');
      drawerToggle.textContent = open ? '›' : '‹';   // › = fechar · ‹ = abrir
    };
  }
  $('#btnSave').onclick = () => { G.save(); UI.toast('💾 Jogo salvo!', 'good'); };
  $('#btnMenu').onclick = () => menuModal.classList.remove('hidden');
  $('#btnResume').onclick = () => menuModal.classList.add('hidden');
  $('#btnManualSave').onclick = () => { G.save(); UI.toast('💾 Jogo salvo!', 'good'); menuModal.classList.add('hidden'); };
  $('#btnReset').onclick = () => {
    if (confirm('Apagar todo o progresso e reiniciar? Esta ação não pode ser desfeita.')) {
      G.reset();
      menuModal.classList.add('hidden');
      showStart();
    }
  };
  $('#btnMute').onclick = (e) => {
    if (!G.state) return;
    G.state.muted = !G.state.muted;
    e.target.textContent = G.state.muted ? '🔇' : '🔊';
  };

  // fechar modal clicando fora
  menuModal.addEventListener('click', (e) => { if (e.target === menuModal) menuModal.classList.add('hidden'); });

  // ---------- velocidade do tempo (⏸/1x/2x/3x) ----------
  function setSpeed(x) {
    G.setTimeScale(x);
    document.querySelectorAll('.speed-btn').forEach((b) =>
      b.classList.toggle('active', Number(b.dataset.speed) === x));
    if (window.Sfx) Sfx.play('click');
  }
  document.querySelectorAll('.speed-btn').forEach((b) => {
    b.onclick = () => setSpeed(Number(b.dataset.speed));
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.target.matches('input, select, textarea')) return;
    if (!G.state) return;
    if (ev.code === 'Space') { ev.preventDefault(); setSpeed(G.timeScale === 0 ? 1 : 0); }
    else if (ev.key === '1') setSpeed(1);
    else if (ev.key === '2') setSpeed(2);
    else if (ev.key === '3') setSpeed(3);
  });

  // ---------- cartão de personagem (clique na cena) ----------
  const workerCard = $('#workerCard');
  function hideWorkerCard() { workerCard.classList.add('hidden'); }
  window.addEventListener('scenebgclick', hideWorkerCard);
  window.addEventListener('workerclick', (ev) => {
    const { kind, idx, sx, sy } = ev.detail;
    // Modo Empresa Real: clicar no boneco abre a Atividade do projeto dele (chat com o agente)
    if (G.modoReal && kind === 'emp' && window.UIReal) { window.UIReal.abrirAtividadePorFuncionario(idx); return; }
    const s = G.state; if (!s) return;
    let html = '';
    if (kind === 'emp') {
      const e = s.employees[idx]; if (!e) return;
      const role = window.DATA.ROLES.find((r) => r.id === e.role);
      const en = Math.round(e.energy == null ? 100 : e.energy);
      const proj = e.assign ? s.active.find((p) => p.uid === e.assign) : null;
      const task = e.resting ? '☕ Fazendo pausa' : proj ? `${proj.emoji} ${proj.name}` : (s.active.length ? '🔀 Auto (todos os projetos)' : '😴 Sem projeto');
      const salary = Math.round(role.salary * (e.salaryMult || 1));
      html = `
        <button class="wc-close" data-wc-close>✖</button>
        <h4>${role.emoji} ${e.name}</h4>
        <div class="wc-sub">${role.name} · R$ ${G.fmt(salary)}/dia</div>
        <div>🎯 ${task}</div>
        <div style="margin-top:6px">🔋 Energia: <b>${en}%</b></div>
        <div class="energy-bar ${en < 30 ? 'low' : ''}"><span style="width:${en}%"></span></div>`;
    } else {
      const info = window.IsoOffice.npcInfo(idx); if (!info) return;
      html = `
        <button class="wc-close" data-wc-close>✖</button>
        <h4>💁 ${info.name}</h4>
        <div class="wc-sub">Secretária · Recepção</div>
        <div>📞 Atende os clientes e mantém a agência girando.</div>`;
    }
    workerCard.innerHTML = html;
    workerCard.classList.remove('hidden');
    // posiciona perto do clique (coordenadas de janela), sem sair da tela
    const cv = document.getElementById('officeCanvas').getBoundingClientRect();
    const x = Math.min(cv.left + sx + 14, window.innerWidth - 240);
    const y = Math.max(8, Math.min(cv.top + sy - 10, window.innerHeight - 170));
    workerCard.style.left = x + 'px';
    workerCard.style.top = y + 'px';
    if (window.Sfx) Sfx.play('click');
  });
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-wc-close]')) hideWorkerCard();
  });

  // ---------- abas ----------
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach((x) => x.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    };
  });

  // ---------- game loop ----------
  let last = performance.now();
  let acc = 0;
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.5) dt = 0.5; // evita saltos ao voltar de aba inativa
    if (G.state) {
      G.tick(dt * G.timeScale);   // ⏸ pausa · 2x/3x aceleram
      G.autoSaveTick(dt);
      // ambiente sonoro (teclado digitando, rua)
      if (window.Sfx && Sfx.ambientTick) {
        Sfx.ambientTick(dt, {
          working: G.state.active.length > 0,
          workers: G.employeesSeated(),
          paused: G.timeScale === 0,
        });
      }
    }
    requestAnimationFrame(loop);
  }

  // ---------- áudio: destrava no primeiro toque/clique ----------
  document.addEventListener('pointerdown', function unlockOnce() {
    if (window.Sfx) Sfx.unlock();
    document.removeEventListener('pointerdown', unlockOnce);
  });

  // ---------- PWA (só quando servido por http/https) ----------
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ---------- boot ----------
  if (G.modoReal) {
    // Empresa Real: a cena É a empresa — sem tela inicial, direto ao escritório
    showGame();
  } else {
    showStart();
  }
  // auto-continua se houver save (mas mantém a tela inicial para o jogador escolher)
  requestAnimationFrame(loop);
})();
