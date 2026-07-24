# App Agency Tycoon — guia para o Claude

Jogo web tycoon (pt-BR) de agência de desenvolvimento de apps, estilo The Sims /
idle tycoon. **Stack: Vite + TypeScript** (o motor já é TS; o renderer é
Canvas 2D em `js/iso.js` com arte de imagem real — a migração p/ Pixi foi
cancelada). O status e o backlog estão em **`docs/PRD.md` §6.1** (leia antes de
mexer em arquitetura ou gráficos). Publicado via GitHub Pages em
https://yuribr182.github.io/Game/ (o workflow builda e publica a cada push).

## Como rodar e testar

- Instalar: `npm install` (Node 20+).
- Rodar: `npm run dev` (Vite; abre em http://localhost:5173/Game/).
- Qualidade: `npm run check` = typecheck + lint + testes (Vitest) + build.
  Rode antes de todo push; o CI executa o mesmo e bloqueia o deploy se falhar.
- Teste funcional: abrir o dev server no navegador, clicar em `#btnNewGame`,
  manipular `Game.state` via console/evaluate para montar cenários.
- **Toda mudança visual deve ser confirmada com screenshot** antes do push.

## Arquitetura (migração em curso — PRD F0 concluída)

> **Renderer: Canvas 2D (`js/iso.js`).** A migração para Pixi/WebGL foi
> **cancelada** (2026-07-24): a arte virou imagem real, e com imagens o Canvas
> ficou melhor (nítido, simples, com todas as funções). Pixi removido do repo.

Motor já portado para `src/core/` (TS estrito, sem DOM/localStorage);
o resto ainda é legado (IIFEs em `window.*`, carregados em ordem por
`src/main.ts` após os shims):

| Arquivo | Papel | Status |
|---|---|---|
| `src/core/data.ts` | **Todo o balanceamento**: tiers, cargos (pts/DIA), upgrades, contratos, fases, eventos, produtos, conquistas, rivais (✔ tipado; `window.DATA` via `src/data-shim.ts`) | tipado (F1) |
| `src/core/` (bus, state, economy, events, save, engine) | **Motor puro**: estado, tick, economia, energia, eventos, offline, save v3 + migração. `createEngine()` monta a API; RNG/relógio injetáveis; persistência por porta. `window.Game` via `src/game-shim.ts` | tipado (F1) |
| `js/iso.js` | Cena isométrica Canvas 2D: layout, personagens/rotas, câmera, dia/noite. **Arte real via `drawImage`** (`ASSET_CFG` + `public/assets/`); fallback procedural | ativo (a portar p/ TS) |
| `js/props.js` | Arte procedural (fallback): móveis isométricos (`Props.draw.*`) | ativo (a portar p/ TS) |
| `js/audio.js` | SFX e ambiente por WebAudio (sem arquivos de áudio) | ativo (a portar p/ TS) |
| `js/ui.js` | Painéis DOM (projetos, equipe, loja, empresa) | ativo (a portar p/ TS) |
| `js/main.js` | Cola tudo: eventos → toasts/sons, modais, velocidade, game loop | ativo (a portar p/ TS) |

Comunicação: `Game.on('event'|'change'|'tick', fn)`. O canvas lê `Game.state`
diretamente a cada frame; o DOM re-renderiza no `change` (ações) e `tick`
(barras/HUD).

Ferramentas: Vite (`vite.config.ts`, base `/Game/`), TS estrito
(`tsconfig.json`), ESLint + Prettier, Vitest (`test/`), PWA via
`vite-plugin-pwa` (gera o `sw.js` — o antigo manual foi removido; **não** é
mais preciso bump de cache). Estáticos ficam em `public/`.

## Regras do projeto

- **Idioma**: todo texto de UI, comentários e commits em **pt-BR**.
- **Arte**: **assets de imagem reais** (PNG isométrico) — a regra antiga
  "100% procedural" foi substituída a pedido do dono (2026-07-24). Os PNGs ficam
  em `public/assets/props|characters|env/` (guia em `public/assets/LEIA-ME.md`;
  prompts de IA em `PROMPTS-IA.md`) e são desenhados por `drawImage` no renderer
  Canvas `js/iso.js` — o mapa `ASSET_CFG` ali guarda `anchorX/anchorY/worldW/
  offGx/offGy` por item. Onde não há asset, cai no **desenho procedural**
  (`js/props.js`), então os dois coexistem durante a troca.
- **Áudio 100% procedural**: SFX por WebAudio, sem arquivos de áudio no repo.
- **Tempo**: 1 dia de jogo = `DAY_LENGTH` (1440s = 24 min). Velocidades de
  produção são **pontos por DIA** em `data`; `empSpeed()` converte p/ segundo.
  Qualquer nova mecânica temporal deve escalar por `DAY_LENGTH`.
- **Save é sagrado**: chave `appAgencyTycoon.save.v1`; mudanças de formato
  exigem bump de `SAVE_VERSION` + bloco em `migrate()` + teste com fixture em
  `test/`. Nunca quebre saves antigos.
- **Gameplay/balanceamento**: a migração técnica não altera números — qualquer
  ajuste de balanceamento é mudança separada e explícita.
- **Fronteira do core**: `src/core/` não importa DOM/render/áudio (lint bloqueia).
- **Cena**: entidades novas entram no z-sort com profundidade `gx+gy`;
  personagens usam `routeTo()` (respeita a porta da cozinha).
- Commits descritivos em pt-BR; push na branch de trabalho publica o site.

## Skills do projeto (`.claude/skills/`)

- `balancear-jogo` — ajustar economia, ritmo e dificuldade (onde ficam os números + checagens de sanidade)
- `novo-movel` — adicionar móveis/decorações à cena isométrica (toolkit de desenho + armadilhas)
- `testar-jogo` — testar em headless com Playwright (esqueleto pronto + dicas do jogo)

## Onde mexer para tarefas comuns

- Próximas tarefas + backlog → **`docs/PRD.md` §6.1**. Renderer é Canvas `js/iso.js` (Pixi cancelado).
- Adicionar/ajustar arte de imagem → `ASSET_CFG` em `js/iso.js` + PNG em `public/assets/`.
- Balancear economia/ritmo → `src/core/data.ts` (tipado; valores em pts/DIA).
- Novo móvel/decoração → skill `novo-movel` (`.claude/skills/novo-movel/`).
- Novo evento aleatório → `EVENTS` em `src/core/data.ts` + `triggerRandomEvent`/`resolveEvent` em `src/core/events.ts`.
- Nova conquista → `ACHIEVEMENTS` em `src/core/data.ts` (só isso; o motor checa sozinho).
