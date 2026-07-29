/* Decide o modo na carga: ?empresa=1 liga o Modo Empresa Real (RealAdapter);
   sem a query, o jogo normal segue idêntico (engine + localStorage).
   Importado por src/main.ts ANTES dos legados — eles capturam window.Game na carga. */

import { criarJogoNormal } from '../game-shim';
import { criarAdaptadorReal } from './adapter';

const modoReal = new URLSearchParams(location.search).get('empresa') === '1';

if (modoReal) {
  window.Game = criarAdaptadorReal();
  document.body.classList.add('modo-real');

  // overlay "ponte desligada": botões de ação
  document.getElementById('btnPonteRetry')?.addEventListener('click', () => location.reload());
  document.getElementById('btnSairModoReal')?.addEventListener('click', () => {
    location.href = location.pathname; // volta ao jogo normal (sem query)
  });
} else {
  window.Game = criarJogoNormal();
}
