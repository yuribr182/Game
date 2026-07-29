/* ===========================================================
   Agência Real — inicialização e loop da cena
   (o jogo simulado foi aposentado em 2026-07-28: sem tela
   inicial, sem velocidade, sem save — tudo aqui é real)
   =========================================================== */
(function () {
  'use strict';
  const G = window.Game;
  const UI = window.UI;
  const $ = (s) => document.querySelector(s);

  const hud = $('#hud');
  const game = $('#game');

  // ---------- entrada direta no escritório ----------
  let isoStarted = false;
  function iniciar() {
    hud.classList.remove('hidden');
    game.classList.remove('hidden');
    UI.cache();
    UI.renderAll(G.state);
    if (!isoStarted) { window.IsoOffice.init(document.getElementById('officeCanvas')); isoStarted = true; }
    else window.IsoOffice.resize();
  }

  // ---------- avisos da ponte -> toasts + cena ----------
  const kindMap = { complete: 'good', level: 'gold', upgrade: 'gold', achieve: 'gold', accept: '', fail: 'bad', error: 'bad', warn: 'bad', info: '' };
  const sfxMap = { complete: 'complete', level: 'level', upgrade: 'upgrade', achieve: 'level', accept: 'buy', fail: 'fail', warn: 'fail', error: 'error', info: 'hire' };
  G.on('event', (e) => {
    UI.toast(e.msg, kindMap[e.type] || '');
    if (window.Sfx && sfxMap[e.type]) Sfx.play(sfxMap[e.type]);
    if (e.type === 'complete' && e.gain) window.IsoOffice.popMoney('+R$ ' + G.fmt(e.gain));
    if (e.type === 'accept') window.IsoOffice.spawnClient(); // cliente vem fechar negócio
  });
  G.on('change', (s) => UI.renderAll(s));
  G.on('tick', (s) => UI.renderTick(s));

  // ---------- gaveta lateral (abre/fecha por cima da cena) ----------
  const sidePanel = $('#sidePanel');
  const drawerToggle = $('#drawerToggle');
  if (drawerToggle && sidePanel) {
    drawerToggle.onclick = () => {
      const open = sidePanel.classList.toggle('open');
      drawerToggle.textContent = open ? '›' : '‹'; // › = fechar · ‹ = abrir
    };
  }

  // ---------- som ambiente liga/desliga ----------
  $('#btnMute').onclick = (e) => {
    if (!G.state) return;
    G.state.muted = !G.state.muted;
    e.target.textContent = G.state.muted ? '🔇' : '🔊';
  };

  // ---------- clique no personagem: abre a Atividade (chat com o agente) ----------
  const workerCard = $('#workerCard');
  function hideWorkerCard() { workerCard.classList.add('hidden'); }
  window.addEventListener('scenebgclick', hideWorkerCard);
  window.addEventListener('workerclick', (ev) => {
    const { kind, idx, sx, sy } = ev.detail;
    if (kind === 'emp' && window.UIReal) { window.UIReal.abrirAtividadePorFuncionario(idx); return; }
    // secretária/NPCs: cartão informativo simples
    const info = window.IsoOffice.npcInfo && window.IsoOffice.npcInfo(idx);
    if (!info) return;
    workerCard.innerHTML = `
      <button class="wc-close" data-wc-close>✖</button>
      <h4>💁 ${info.name}</h4>
      <div class="wc-sub">Secretária · Recepção</div>
      <div>📞 Atende os clientes e mantém a agência girando.</div>`;
    workerCard.classList.remove('hidden');
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

  // ---------- loop da cena (tempo real; tick/save do adapter são no-ops) ----------
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.5) dt = 0.5; // evita saltos ao voltar de aba inativa
    if (G.state) {
      G.tick(dt);
      // ambiente sonoro (teclado digitando, rua)
      if (window.Sfx && Sfx.ambientTick) {
        Sfx.ambientTick(dt, {
          working: G.state.active.length > 0,
          workers: G.employeesSeated(),
          paused: false,
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

  // ---------- PWA (só no build de produção — em dev o sw.js não existe) ----------
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && import.meta.env.PROD) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ---------- boot: a cena É a empresa ----------
  iniciar();
  requestAnimationFrame(loop);
})();
