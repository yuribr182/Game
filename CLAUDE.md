# Agência Real — guia para o Claude

> ⚠️ **PIVÔ (2026-07-28, decisão do dono): NÃO é mais um jogo.** O produto é a
> **Agência Real** — a cena isométrica animada (Canvas 2D, `js/iso.js`) ficou
> como identidade visual, mas **tudo que aparece na tela é real**: os
> funcionários são agentes de IA (Claude Managed Agents) executando projetos
> reais, com CRM, financeiro, times, rotinas 24/7 e fluxos. O boot liga direto
> o RealAdapter (sem `?empresa=1`); tela inicial de jogo, velocidade, save,
> loja, contratos/eventos/ranking simulados foram **removidos da UI**.
> `src/core/` permanece como base tipada (tipos/constantes que a cena consome)
> e o balanceamento antigo em `data.ts` está inerte — não crie features de
> jogo simulado. Novas mecânicas = dados reais via ponte (`server/`).

Plataforma web (pt-BR) de operação de agência com agentes de IA. **Stack: Vite
+ TypeScript** (front) + **Fastify** (`server/`, a ponte local). O status e o
backlog estão em **`docs/PRD.md` §6.1** (leia antes de mexer em arquitetura ou
gráficos). O GitHub Pages (https://yuribr182.github.io/Game/) segue publicando
o front a cada push — sem a ponte, ele mostra o overlay "ponte desligada".

## Como rodar e testar

- Instalar: `npm install` + `npm --prefix server install` (Node 20+).
- Rodar: **`npm run empresa`** (ponte + Vite) e abrir
  http://localhost:5173/Game/ — a interface abre direto no escritório. Sem a
  ponte, aparece o overlay "ponte desligada". Guia em `EMPRESA-REAL.md`;
  arquitetura em `docs/PLANO-EMPRESA-REAL.md` e `docs/PLANO-TIMES-FLUXOS.md`.
- Qualidade: `npm run check` (front) e `npm --prefix server run check` (ponte).
  Rode ambos antes de todo push; o CI roda o do front e bloqueia o deploy.
- **Teste funcional sem chave de API**: a ponte sobe sem `ANTHROPIC_API_KEY`
  (só criar agente/iniciar projeto falham) — dá para semear cenários gravando
  JSONs em `server/data/` (funcionarios/projetos/times/rotinas/fluxos.json;
  o store lê do disco a cada request) e testar a UI inteira via Playwright.
- **Toda mudança visual deve ser confirmada com screenshot** antes do push.

## Arquitetura

> **Renderer: Canvas 2D (`js/iso.js`).** A migração para Pixi/WebGL foi
> **cancelada** (2026-07-24): a arte virou imagem real, e com imagens o Canvas
> ficou melhor (nítido, simples, com todas as funções). Pixi removido do repo.

Camadas (o boot em `src/real/boot.ts` põe o RealAdapter em `window.Game`;
os módulos da cena são IIFEs em `window.*`, carregados em ordem por
`src/main.ts`):

| Arquivo | Papel | Status |
|---|---|---|
| `server/` | **A ponte local** (Fastify + SDK Anthropic): agentes/sessões (`anthropic/`), financeiro (`financeiro/motor.ts`), rotinas, fluxos, CRM, snapshot + SSE. Dados em `server/data/` (gitignored) | ativo (fonte da verdade) |
| `src/real/` | Front real: `adapter.ts` (espelha a ponte na forma do antigo Engine p/ a cena), `api.ts` (REST+SSE), `ui-real.ts` (painéis), `boot.ts` | ativo |
| `src/core/` | Base tipada da cena (tipos/constantes; o motor de jogo está **inerte** — não criar features simuladas) | congelado |
| `js/iso.js` | Cena isométrica Canvas 2D: layout, personagens/rotas, câmera, dia/noite. **Arte real via `drawImage`** (`ASSET_CFG` + `public/assets/`); fallback procedural | ativo (a portar p/ TS) |
| `js/props.js` | Arte procedural (fallback): móveis isométricos (`Props.draw.*`) | ativo (a portar p/ TS) |
| `js/audio.js` | SFX e ambiente por WebAudio (sem arquivos de áudio) | ativo (a portar p/ TS) |
| `js/ui.js` | HUD real (caixa + relógio) e toasts | enxuto pós-pivô |
| `js/main.js` | Cola a cena: avisos → toasts/sons, gaveta, cliques nos bonecos, loop | enxuto pós-pivô |

Comunicação: `Game.on('event'|'change'|'tick', fn)`; o canvas lê `Game.state`
a cada frame. O adapter alimenta tudo com o snapshot da ponte (REST + SSE).

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
- **Tempo é REAL**: o relógio da cena e do HUD segue a hora de verdade
  (`adapter.ts` converte para a fração de `DAY_LENGTH` que a cena entende).
  Nada de velocidade/aceleração.
- **Dados do dono são sagrados**: tudo vive em `server/data/` (gitignored) —
  escrita atômica via `Store`; nunca gravar direto sem passar pelo store, e
  novos campos precisam de padrão retrocompatível (merge com `CONFIG_PADRAO`
  ou campo opcional).
- **Nada simulado**: toda mecânica nova nasce na ponte com dado real
  (rota + snapshot + SSE) — nunca inventar números no front.
- **Fronteira do core**: `src/core/` não importa DOM/render/áudio (lint bloqueia).
- **Cena**: entidades novas entram no z-sort com profundidade `gx+gy`;
  personagens usam `routeTo()` (respeita a porta da cozinha).
- Commits descritivos em pt-BR; push na branch de trabalho publica o site.

## Skills do projeto (`.claude/skills/`)

- `novo-movel` — adicionar móveis/decorações à cena isométrica (toolkit de desenho + armadilhas)
- `testar-jogo` — testar a interface em headless (Playwright) com a ponte + dados semeados

## Onde mexer para tarefas comuns

- Próximas tarefas + backlog → **`docs/PRD.md` §6.1**.
- Nova mecânica real (rotina/fluxo/relatório/integração) → ponte (`server/src/`)
  + tipo espelho em `src/real/tipos.ts` + painel em `src/real/ui-real.ts`.
- Adicionar/ajustar arte de imagem → `ASSET_CFG` em `js/iso.js` + PNG em `public/assets/`.
- Novo móvel/decoração → skill `novo-movel` (`.claude/skills/novo-movel/`).
- Comportamento dos bonecos na cena → `js/iso.js` (quem senta/vaga vem do
  `adapter.ts`: `resting`/`assign`).
- Conquistas reais → `server/src/conquistas.ts` (avaliadas sobre dados reais).
