---
name: testar-jogo
description: Testar o App Agency Tycoon em navegador headless (Playwright) com screenshots e checagem de erros. Use antes de qualquer push, ao validar mudanças visuais ou de mecânica, ou quando algo "não funciona".
---

# Testar o jogo (headless)

Sempre nesta ordem: sintaxe → teste funcional → screenshot.

## 1. Sintaxe

```bash
for f in js/*.js sw.js; do node --check "$f" || echo "FAIL $f"; done
```

## 2. Esqueleto de teste (Playwright)

O Chromium já está instalado no ambiente remoto (playwright global em
`/opt/node22/lib/node_modules/playwright`). Modelo:

```js
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));
// limpa o save só na 1ª carga (sobrevive a reload p/ testar offline/continuar)
await page.addInitScript(() => {
  if (!sessionStorage.getItem('c')) { localStorage.clear(); sessionStorage.setItem('c','1'); }
});
await page.goto('file:///home/user/Game/index.html');
await page.click('#btnNewGame');
// monte o cenário direto no estado:
await page.evaluate(() => { Game.state.money = 50000; Game.state.rep = 100; });
// ... ações via seletores ([data-accept], [data-hire="junior"], .tab[data-tab="team"]) ...
await (await page.$('#officeCanvas')).screenshot({ path: '.../cena.png' });
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
```

## 3. Dicas específicas do jogo

- Ritmo é lento (1 dia = 24 min): para testar progressão use
  `page.click('[data-speed="3"]')` ou manipule `Game.state.dayProgress = 1439`
  para forçar a virada do dia.
- Zoom para inspecionar arte: `page.mouse.wheel(0, -220)` repetido com o mouse
  sobre a área; duplo clique reenquadra.
- Posição de personagem na tela: `IsoOffice.workerScreenPos(i)`.
- Cliques em botões re-renderizados podem "descolar" (DOM trocado entre `$` e
  `click`) — re-busque o elemento ou use a API `Game.*` direto no evaluate.
- Confirme movimento: dois screenshots com ~1s de intervalo devem diferir.
