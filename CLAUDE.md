# App Agency Tycoon — guia para o Claude

Jogo web tycoon (pt-BR) de agência de desenvolvimento de apps, estilo The Sims /
idle tycoon. **Em migração para Vite + TypeScript + Pixi.js** — o plano completo
e o status por fase estão em **`docs/PRD.md`** (leia antes de mexer em
arquitetura ou gráficos). Publicado via GitHub Pages em
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

Motor já portado para `src/core/` (TS estrito, sem DOM/Pixi/localStorage);
o restante ainda é legado (IIFEs em `window.*`, carregados em ordem por
`src/main.ts` após os shims):

| Arquivo | Papel | Destino no PRD |
|---|---|---|
| `src/core/data.ts` | **Todo o balanceamento**: tiers, cargos (pts/DIA), upgrades, contratos, fases, eventos, produtos, conquistas, rivais (✔ tipado; `window.DATA` via `src/data-shim.ts`) | concluído (F1) |
| `src/core/` (bus, state, economy, events, save, engine) | **Motor puro**: estado, tick, economia, energia, eventos, offline, save v3 + migração. `createEngine()` monta a API; RNG/relógio injetáveis; persistência por porta. `window.Game` via `src/game-shim.ts` | concluído (F1) |
| `js/audio.js` | SFX e ambiente por WebAudio (sem arquivos de áudio) | `src/audio/` (F5) |
| `js/props.js` | Arte procedural: móveis isométricos (`Props.draw.*`) | `src/render/sprites/` (F2/F4) |
| `js/iso.js` | Cena isométrica Canvas 2D: layout, personagens/rotas, câmera, dia/noite | `src/render/` em Pixi (F2/F3) |
| `js/ui.js` | Painéis DOM (projetos, equipe, loja, empresa) | `src/ui/` (F5) |
| `js/main.js` | Cola tudo: eventos → toasts/sons, modais, velocidade, game loop | `src/ui/` (F5) |

Comunicação: `Game.on('event'|'change'|'tick', fn)`. O canvas lê `Game.state`
diretamente a cada frame; o DOM re-renderiza no `change` (ações) e `tick`
(barras/HUD).

Ferramentas: Vite (`vite.config.ts`, base `/Game/`), TS estrito
(`tsconfig.json`), ESLint + Prettier, Vitest (`test/`), PWA via
`vite-plugin-pwa` (gera o `sw.js` — o antigo manual foi removido; **não** é
mais preciso bump de cache). Estáticos ficam em `public/`.

## Regras do projeto

- **Idioma**: todo texto de UI, comentários e commits em **pt-BR**.
- **Arte e áudio 100% procedurais**: nenhum asset binário (PNG/MP3) no repo;
  texturas são geradas por código (no Pixi: `RenderTexture` em runtime).
- **Tempo**: 1 dia de jogo = `DAY_LENGTH` (1440s = 24 min). Velocidades de
  produção são **pontos por DIA** em `data`; `empSpeed()` converte p/ segundo.
  Qualquer nova mecânica temporal deve escalar por `DAY_LENGTH`.
- **Save é sagrado**: chave `appAgencyTycoon.save.v1`; mudanças de formato
  exigem bump de `SAVE_VERSION` + bloco em `migrate()` + teste com fixture em
  `test/`. Nunca quebre saves antigos.
- **Gameplay/balanceamento**: a migração técnica não altera números — qualquer
  ajuste de balanceamento é mudança separada e explícita.
- **Fronteira do core**: `src/core/` não importa DOM/Pixi/áudio (lint bloqueia).
- **Cena**: entidades novas entram no z-sort com profundidade `gx+gy`;
  personagens usam `routeTo()` (respeita a porta da cozinha).
- Commits descritivos em pt-BR; push na branch de trabalho publica o site.

## Skills do projeto (`.claude/skills/`)

- `balancear-jogo` — ajustar economia, ritmo e dificuldade (onde ficam os números + checagens de sanidade)
- `novo-movel` — adicionar móveis/decorações à cena isométrica (toolkit de desenho + armadilhas)
- `testar-jogo` — testar em headless com Playwright (esqueleto pronto + dicas do jogo)

## Onde mexer para tarefas comuns

- Continuar a migração (próxima: F2 — cena Pixi) → **`docs/PRD.md`** (roadmap + prompt executável).
- Balancear economia/ritmo → `src/core/data.ts` (tipado; valores em pts/DIA).
- Novo móvel/decoração → skill `novo-movel` (`.claude/skills/novo-movel/`).
- Novo evento aleatório → `EVENTS` em `src/core/data.ts` + `triggerRandomEvent`/`resolveEvent` em `src/core/events.ts`.
- Nova conquista → `ACHIEVEMENTS` em `src/core/data.ts` (só isso; o motor checa sozinho).
