---
name: testar-jogo
description: Testar a Agência Real em navegador headless (Playwright) com a ponte local e dados semeados. Use antes de qualquer push, ao validar mudanças visuais ou de painel, ou quando algo "não funciona".
---

# Testar a Agência Real (headless)

Sempre nesta ordem: sintaxe → subir ponte+front → semear dados → teste → screenshot.

## 1. Sintaxe e checks

```bash
for f in js/*.js; do node --check "$f" || echo "FAIL $f"; done
npm run check                  # typecheck + lint + testes + build (front)
npm --prefix server run check  # typecheck + testes (ponte)
```

## 2. Subir ponte + front (sem chave de API serve para testar a UI)

```bash
(npm --prefix server run dev > /tmp/ponte.log 2>&1 &)
(npm run dev > /tmp/vite.log 2>&1 &)
sleep 8 && curl -s http://127.0.0.1:3777/api/saude
```

## 3. Semear cenário (o store lê o disco a cada request — sem restart)

Grave JSONs em `server/data/`: `config.json` (`{"nomeEmpresa":"..."}`),
`funcionarios.json`, `projetos.json`, `times.json`, `rotinas.json`,
`fluxos.json`, `fluxos-exec.json`. Campos: ver `server/src/store/tipos.ts`.
Um funcionário precisa de `agentId` qualquer (ex. `"agent_demo"`) e
`status:"ativo"`; um projeto `em_andamento` com `funcionarioId` dele faz o
boneco sentar e trabalhar. ⚠️ Apague `server/data/` ao terminar o teste.

## 4. Esqueleto de teste (Playwright)

Chromium global em `/opt/node22/lib/node_modules/playwright`. Modelo:

```js
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;
const errors = [];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('console', m => { if (m.type()==='error' && !m.text().includes('MIME')) errors.push(m.text()); });
p.on('pageerror', e => errors.push(e.message));
p.on('dialog', d => d.dismiss().catch(()=>{}));       // prompts/confirms
await p.goto('http://localhost:5173/Game/');           // abre DIRETO no escritório
await p.waitForTimeout(3000);                          // ponte + SSE + cena
// abas: p.click('.tab[data-tab="team"]') · painéis: #realProjetos/#realEquipe/#realFinanceiro
// estado real: p.evaluate(() => window.Game.real.snapshot())
await (await p.$('#officeCanvas')).screenshot({ path: '.../cena.png' });
console.log('ERRORS:', errors.join('\n') || 'none');
await b.close();
```

## 5. Dicas específicas

- `innerText` devolve MAIÚSCULAS onde o CSS usa `text-transform: uppercase` —
  compare com `.toLowerCase()` ou cheque o `innerHTML`.
- Painéis re-renderizam por SSE (debounce 300 ms) — re-busque elementos após
  esperar, não guarde handles.
- Zoom para o monitor ao vivo do boneco: `p.mouse.wheel(0, -220)` repetido.
- Modais: wizard `[data-acao="novo"]` → `#modalWizard`; contratar
  `[data-acao-func="contratar"]` → `#modalFuncionario`; atividade
  `[data-acao="atividade"]` → `#modalAtividade`; TV `#btnModoTv` (Esc fecha).
- Confirme movimento na cena: dois screenshots com ~1s de intervalo devem diferir.
