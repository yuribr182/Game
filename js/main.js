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
  const kindMap = { complete: 'good', level: 'gold', upgrade: 'gold', fail: 'bad', error: 'bad', warn: 'bad', info: '' };
  const sfxMap = { complete: 'complete', level: 'level', upgrade: 'upgrade', fail: 'fail', warn: 'fail', error: 'error', info: 'hire' };
  G.on('event', (e) => {
    UI.toast(e.msg, kindMap[e.type] || '');
    if (window.Sfx && sfxMap[e.type]) Sfx.play(sfxMap[e.type]);
    if (e.type === 'complete' && e.gain) window.IsoOffice.popMoney('+R$ ' + G.fmt(e.gain));
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
    const t = ev.target.closest('[data-accept],[data-decline],[data-hire],[data-fire],[data-upg]');
    if (!t) return;
    if (t.dataset.accept) G.acceptProject(t.dataset.accept);
    else if (t.dataset.decline) G.declineProject(t.dataset.decline);
    else if (t.dataset.hire) G.hire(t.dataset.hire);
    else if (t.dataset.fire) G.fire(t.dataset.fire);
    else if (t.dataset.upg) G.buyUpgrade(t.dataset.upg);
  });

  // ---------- botões fixos ----------
  $('#btnNewGame').onclick = () => {
    if (G.hasSave() && !confirm('Isso vai sobrescrever o jogo salvo. Continuar?')) return;
    G.newGame();
    showGame();
  };
  $('#btnContinue').onclick = () => { if (G.load()) showGame(); };
  $('#btnBuyDesk').onclick = () => G.buyDesk();
  $('#btnUpgradeOffice').onclick = () => G.upgradeOffice();
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
      G.tick(dt);
      G.autoSaveTick(dt);
    }
    requestAnimationFrame(loop);
  }

  // ---------- boot ----------
  showStart();
  // auto-continua se houver save (mas mantém a tela inicial para o jogador escolher)
  requestAnimationFrame(loop);
})();
