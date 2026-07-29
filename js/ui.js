/* ===========================================================
   Agência Real — HUD (dados reais) + toasts
   Expõe window.UI. Os painéis de gestão são do src/real/ui-real.ts;
   os painéis do antigo jogo simulado foram removidos (2026-07-28).
   =========================================================== */
(function () {
  'use strict';
  const G = window.Game;

  const el = {};
  function cache() {
    ['statMoney', 'statDay', 'tierBadge', 'companyName'].forEach(
      (id) => (el[id] = document.getElementById(id)),
    );
  }

  const money = (n) => 'R$ ' + G.fmt(n);

  // ---------- HUD (caixa real + relógio real) ----------
  let lastMoney = null;
  function renderHUD(s) {
    if (!s || !el.statMoney) return;
    el.statMoney.textContent = money(s.money);
    if (lastMoney !== null && s.money > lastMoney) {
      el.statMoney.classList.remove('flash-money');
      void el.statMoney.offsetWidth;
      el.statMoney.classList.add('flash-money');
    }
    lastMoney = s.money;
    // data e hora REAIS (nada de "dia de jogo")
    const agora = new Date();
    el.statDay.textContent = agora
      .toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      .replace(/\.,?/g, '');
    const t = G.tier();
    if (el.tierBadge && t) el.tierBadge.textContent = t.icon + ' ' + t.name;
    if (el.companyName) el.companyName.textContent = s.company;
  }

  // renderAll/renderTick mantêm a assinatura esperada pelo main.js
  function renderAll(s) { renderHUD(s); }
  function renderTick(s) { renderHUD(s); }

  // ---------- toasts ----------
  const toastBox = () => document.getElementById('toasts');
  function toast(msg, kind) {
    const box = toastBox();
    if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), 3600);
  }

  window.UI = { cache, renderAll, renderTick, renderHUD, toast };
})();
