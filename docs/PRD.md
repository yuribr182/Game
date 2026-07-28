# PRD — App Agency Tycoon 2.0: Reengenharia Técnica e Upgrade Visual

> **Status**: aprovado · **Autor**: Claude + yuribr182 · **Data**: 2026-07-23
> **Decisões de escopo** (tomadas pelo dono do projeto):
> 1. Estrutura: **build completo com Vite + TypeScript** (substitui a regra "sem build").
> 2. Gráficos: **motor WebGL com Pixi.js** (substitui o Canvas 2D imediato).
> 3. Entrega: PRD + implementação por fases, começando imediatamente.

---

## 1. Resumo Executivo

**Problema.** O jogo funciona, mas atingiu o teto da arquitetura atual: 7 IIFEs
acoplados por globais `window.*`, um `iso.js` de 1.200 linhas que mistura
renderização, IA de personagens, câmera e input, arte redesenhada por chamadas
vetoriais a cada frame (sem cache), animação de personagem com 1 "frame"
procedural (bob + swing), sem tipos, sem testes e sem lint — manutenção e
evolução visual estão caras e arriscadas.

**Solução.** Migração incremental para Vite + TypeScript estrito com módulos de
fronteira clara (core sem DOM / render / ui), e substituição do renderer por
Pixi.js (WebGL): sprites procedurais pré-renderizados em `RenderTexture`,
personagens com ciclo de caminhada articulado em 4 direções, texturas de móveis
com sombreamento/oclusão, partículas em GPU e iluminação dia/noite via filtros.
A arte continua **100% gerada por código** (nenhum asset binário no repo).

**Critérios de sucesso (KPIs).**
- **Zero quebra de save**: 100% dos saves v3 existentes carregam e migram (teste automatizado).
- **Desempenho**: 60 FPS estáveis com 48 personagens + partículas em desktop; ≥ 30 FPS em celular médio (Moto G-class); frame time p95 < 16 ms medido no cenário máximo (tier 5).
- **Qualidade de código**: `tsc --noEmit` sem erros com `strict: true`; ESLint zero warnings; cobertura de testes do `core/` ≥ 80% de linhas.
- **Bundle**: JS inicial ≤ 200 KB gzip (Pixi incluso, tree-shaken).
- **Visual**: personagens com ≥ 4 direções × ≥ 3 estados animados (andar, sentar/digitar, idle) a 8+ quadros de ciclo; todos os ~30 móveis com textura sombreada (não flat).
- **Deploy**: build automático via GitHub Actions publicando no GitHub Pages a cada push.

---

## 2. Experiência do Usuário e Funcionalidade

### Personas
- **Jogador casual (mobile/desktop)**: joga em sessões curtas no navegador; espera fluidez, visual caprichado e que o save nunca suma.
- **Mantenedor (dev + IA)**: precisa localizar qualquer mecânica em segundos, alterar com segurança (tipos + testes) e confiar que o deploy não quebra.

### Histórias de usuário

1. **Como jogador**, quero ver meus funcionários andando com animação real (pernas/braços articulados, virando para a direção do movimento) para que o escritório pareça vivo como em The Sims.
   - **AC**: ciclo de caminhada com ≥ 8 quadros lógicos; sprite vira nas 4 direções isométricas; transição andar↔parado sem "teleporte" de pose; digitação na mesa com braços animados; sentar de fato na cadeira (pose própria).
2. **Como jogador**, quero móveis e objetos com acabamento de estúdio (volume, brilho, oclusão, materiais distintos — madeira/metal/tecido) para que a cena tenha leitura clara mesmo com zoom.
   - **AC**: todo prop tem sombra própria + oclusão de contato; materiais com pelo menos 3 tons + highlight; telas (monitor/TV/arcade) com conteúdo animado; nenhum prop desenhado "flat" com uma cor só.
3. **Como jogador**, quero que o jogo continue abrindo instantaneamente e funcionando offline (PWA), com meu save intacto após a atualização.
   - **AC**: save v3 carrega na versão nova (migração testada); PWA atualiza sozinho o cache antigo do `sw.js` manual; primeiro paint < 2 s em 3G rápido.
4. **Como mantenedor**, quero que cada domínio (economia, cena, UI, áudio) viva em módulo próprio e tipado para alterar sem efeito colateral.
   - **AC**: `core/` não importa nada de DOM/Pixi (verificável por lint de fronteira); eventos tipados (sem strings soltas); nenhuma função > 80 linhas; constantes mágicas nomeadas.
5. **Como mantenedor**, quero testes que rodem em CI para saber que balanceamento, save e economia não regrediram.
   - **AC**: `npm test` cobre engine (tick, economia, energia, promoções, migração de save v1→v3→v4); CI bloqueia merge com teste vermelho.

### Não-objetivos (fora de escopo)
- **Nenhuma mudança de gameplay/balanceamento** — números de `data` são portados 1:1.
- Nada de 3D, multiplayer, backend ou monetização.
- Nada de assets binários (PNG/áudio) — arte e SFX continuam procedurais.
- Não traduzir o jogo (segue 100% pt-BR).
- Não redesenhar a UI DOM (painéis/abas ficam como estão nesta versão; apenas ajustes de integração).

---

## 3. Requisitos de Sistema de IA

Não se aplica — o jogo não possui recursos de IA em runtime. (O "Copilot de IA" é um upgrade fictício de gameplay.)

---

## 4. Especificações Técnicas

### 4.1 Stack alvo
| Camada | Ferramenta | Papel |
|---|---|---|
| Build | Vite 6 | dev server + bundle + HMR |
| Linguagem | TypeScript (strict) | tipos em todo o código novo |
| Render | Pixi.js v8 (WebGL2, fallback WebGL1) | cena isométrica |
| Testes | Vitest | unit no `core/`; smoke de render |
| Qualidade | ESLint + Prettier | estilo e fronteiras |
| PWA | vite-plugin-pwa (Workbox) | precache dos assets com hash; substitui `sw.js` manual |
| CI/CD | GitHub Actions | typecheck + lint + test + build + deploy Pages |

### 4.2 Arquitetura de pastas
```
src/
  core/            # motor puro: SEM DOM, SEM Pixi (portável/testável)
    data.ts        # balanceamento (portado 1:1 de js/data.js)
    state.ts       # tipos do estado + criação/validação
    save.ts        # persistência, SAVE_VERSION, migrate()
    economy.ts     # produção, salários, contratos, produtos
    events.ts      # eventos aleatórios (instant/choice)
    engine.ts      # tick(), advanceDay(), API pública tipada
    bus.ts         # EventEmitter tipado (change/tick/event)
  render/          # tudo de Pixi
    app.ts         # Application, resize, DPR, ticker
    camera.ts      # zoom/pan/pinça (portado de iso.js)
    iso.ts         # projeção isométrica, z-sort por gx+gy
    scene.ts       # composição do escritório (layout por tier)
    sprites/       # geração procedural -> RenderTexture (cache)
      characters.ts# spritesheet de personagem: 4 direções × estados
      props.ts     # móveis (portado/expandido de js/props.js)
      environment.ts # chão, paredes, rua, árvores
    anim.ts        # state machine de animação (idle/walk/sit/type)
    fx.ts          # partículas (ParticleContainer), popups, dia/noite
  ui/              # DOM: painéis, abas, modais, toasts (js/ui.js + main.js)
  audio/           # WebAudio SFX (js/audio.js tipado)
  main.ts          # bootstrap: core -> render -> ui
test/              # vitest
docs/PRD.md        # este documento
```

**Regra de fronteira** (lint): `core/` não importa de `render/`, `ui/`, `audio/`.
Comunicação continua por eventos (`bus`), agora tipados:
`bus.on('projectDone', (p: Project) => …)`.

### 4.3 Estratégia de migração (sempre jogável)
O repo nunca fica quebrado; cada fase termina com o jogo rodando e screenshot de verificação:
1. **Strangler pattern**: Vite passa a servir o jogo atual (IIFEs viram side-effect imports em ordem). Nada muda visualmente.
2. `data.js` e `game.js` são portados para `core/` em TS, mantendo *shims* `window.DATA`/`window.Game` para os consumidores legados.
3. O renderer Pixi nasce em paralelo (`?renderer=pixi` para comparar lado a lado) e substitui o `iso.js` quando atinge paridade.
4. `ui.js`, `main.js` e `audio.js` são tipados por último (menor risco/valor).

### 4.4 Renderização Pixi — técnica "de fábrica"
- **Sprites procedurais cacheados**: cada móvel/personagem é desenhado UMA vez
  (via `Graphics`/Canvas offscreen com a arte atual como base) e "assado" em
  `RenderTexture` num atlas em runtime. O frame vira só transformações de GPU —
  elimina o custo atual de redesenhar vetores 60×/s.
- **Personagens**: spritesheet procedural gerado por um "boneco" paramétrico
  (tronco, cabeça, 2 braços, 2 pernas com pivôs) renderizado em
  4 direções × {idle 4f, walk 8f, sit/type 4f} × variações (pele/cabelo/camisa
  por tintura de camadas, acessório por cargo como sprite anexo). Troca de
  frame por `AnimatedSprite` + state machine (`anim.ts`).
- **Cena**: um `Container` por camada (chão → tapetes → props+personagens com
  z-sort `zIndex = gx+gy` → overlay). `cullable` para o que sai da câmera.
- **Texturas de móveis**: gradientes multi-stop, ruído procedural sutil
  (madeira com veios, metal escovado, tecido), *ambient occlusion* de contato
  (elipse suave sob cada objeto), highlight especular em superfícies duras.
- **Dia/noite**: `ColorMatrixFilter`/tint animado por camada + janelas emissivas
  à noite (sprites aditivos), poças de luz das luminárias como sprites `ADD`.
- **Partículas**: `ParticleContainer` para vapor de café, confete de entrega,
  fumaça — orçamento de 500 partículas simultâneas.
- **Câmera**: mesma UX atual (roda = zoom no cursor, arrasto, pinça, duplo
  clique reenquadra) portada para transformar o `Container` raiz.

### 4.5 Pontos de integração
- **Save**: mesma chave `appAgencyTycoon.save.v1` no localStorage. Formato não
  muda na migração técnica (continua v3); qualquer mudança futura bump +
  `migrate()` — agora coberto por teste com fixtures de saves reais.
- **PWA**: `vite-plugin-pwa` gera `sw.js` (mesmo nome/escopo do atual, então o
  browser troca o service worker antigo automaticamente) com precache dos
  bundles hasheados e `autoUpdate`.
- **GitHub Pages**: `base: '/Game/'` no Vite; workflow `deploy.yml` faz
  typecheck → lint → test → build → publica `dist/` via `actions/deploy-pages`.
  ⚠️ Ação manual única: mudar em Settings → Pages a origem para "GitHub Actions".
- **Segurança/privacidade**: sem backend, sem coleta de dados; save 100% local.

### 4.6 Convenções de engenharia
- TS `strict`, `noUncheckedIndexedAccess`; proibido `any` sem justificativa.
- Nomes de domínio em pt-BR nos textos, código/identificadores em inglês (padrão da base atual: `hire`, `tick`…), comentários em pt-BR.
- Commits em pt-BR, um assunto por commit; CI verde obrigatório.
- Constantes de tuning continuam centralizadas em `core/data.ts` (regra viva do CLAUDE.md).
- Toda mudança visual confirmada com screenshot antes do push (regra mantida).

---

## 5. Riscos e Roadmap

### Roadmap por fases
| Fase | Entrega | Critério de aceite |
|---|---|---|
| **F0 — Fundação** | Vite+TS servindo o jogo atual intacto; ESLint/Prettier/Vitest; CI + deploy Pages; PWA migrada | jogo idêntico ao atual rodando via `npm run dev` e no Pages; saves carregam |
| **F1 — Core tipado** | `data.ts` + `core/` (engine) em TS estrito com shims `window.*`; testes de economia/save | cobertura ≥ 80% no core; zero regressão de gameplay |
| **F2 — Cena Pixi (paridade)** | Renderer Pixi com layout, props cacheados, câmera e dia/noite equivalentes ao atual | comparação lado a lado aprovada; 60 FPS tier 5 |
| **F3 — Personagens 2.0** | Boneco paramétrico, spritesheet 4 direções, walk/sit/type/idle, state machine | KPIs visuais da história #1 |
| **F4 — Texturas & FX** | Materiais nos ~30 props, oclusão, emissivos noturnos, partículas GPU | KPIs da história #2; frame p95 < 16 ms |
| **F5 — Limpeza final** | `ui/audio` tipados, remoção dos shims e do renderer legado, CLAUDE.md 2.0 | zero `window.*` global; docs atualizados |

### Riscos técnicos
| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Quebra de save na migração | média | crítico | fixtures de saves reais em teste; chave/formato intocados até F5 |
| SW antigo servindo app velho | média | alto | plugin PWA reusa o nome `sw.js` + `skipWaiting`; testar upgrade real |
| Desempenho Pixi em mobile fraco | baixa | médio | sprites cacheados (não Graphics por frame); `ParticleContainer`; medir cedo em device real |
| Bundle estourar 200 KB gzip | média | baixo | import seletivo do Pixi v8 (tree-shaking); análise `rollup-plugin-visualizer` |
| Regressão visual sutil no port | alta | médio | screenshots Playwright antes/depois por fase; renderer legado mantido até paridade |
| Pages exige troca manual de config | certa | baixo | instrução única documentada acima |

---

## 6. Como retomar o trabalho

**Para continuar, basta dizer numa sessão nova: "continue a migração do PRD".**
O CLAUDE.md aponta para este arquivo e a seção 6.1 abaixo registra o ponto
exato de parada. O prompt em 6.2 é opcional — só um atalho com as regras
resumidas, útil se o CLAUDE.md um dia não estiver disponível.

### 6.1 Ponto exato de parada (atualizado a cada sessão)

**Última sessão: 2026-07-28 — Modo Empresa Real ganhou Times, Rotinas, Fluxos
e painel profissional** (plano em `docs/PLANO-TIMES-FLUXOS.md`, inspiração
WeStack): **T1 Times** — squads por demanda com Agent coordenador multiagente
próprio (responsável `time:<id>` em projetos); **T2 Rotinas** — trabalhos
recorrentes 24/7 (cron na nuvem, generalização do standup) com contexto real
(CRM/projetos/financeiro) e ações estruturadas com guard-rails
(criar_oportunidade, registrar_nota_cliente, criar_rascunho_projeto);
**T3 Fluxos** — esteiras configuráveis ligando agentes/times, cada estágio numa
sessão própria, a ponte faz o handoff (carga = resumo + arquivos) com aprovação
manual entre estágios; **T4 Painel profissional** — `css/painel.css` (tema SaaS
claro escopado em `body.modo-real`) + botão ⛶ que expande a gestão para a tela
toda. Checks verdes: 55 testes no jogo, 70 na ponte. Próximo: F-ML (integração
real Mercado Livre, atrás de OAuth) e disparo de fluxo a partir do CRM/rotinas.

**Sessão 2026-07-24.** F1 concluída (motor tipado, 55 testes, cobertura
do core 94%). **MUDANÇA DE RUMO (decisão do dono): a migração para Pixi (F2–F5)
foi CANCELADA.** A arte passou a ser por **imagem real (PNG)** em vez de
procedural — e, com imagens, o renderer **Canvas 2D** (`js/iso.js`) ficou
melhor que o Pixi: **nítido** (Pixi assava a cena numa textura e escalava,
borrando), simples, e mantém todas as funções (pad "+", cliques, animações,
dia/noite). O renderer Pixi e a dependência `pixi.js` foram **removidos**
(ficam no histórico do git). `npm run check` verde (55 testes).

**Direção atual — Canvas 2D + assets de imagem:**
- ✔ Arte real integrada no `js/iso.js` via `drawImage` (downscale nítido de PNG
  de alta resolução). Assets em `public/assets/props/` (guia `LEIA-ME.md`,
  prompts `PROMPTS-IA.md`). Config de âncora/tamanho/posição por item no
  `ASSET_CFG` do `js/iso.js`; onde não há asset, cai no procedural (fallback).
  Já reais: `desk.png`, `sofa.png`, `coffee-machine.png`.
- ⏳ Enviar o resto dos assets (móveis, personagens, ambiente) e plotar cada um.
- ⏳ Backlog pedido pelo dono: (a) monitor animado sobre a mesa (código rolando/
  tela preta por estado), (b) bônus de foco de equipe (+12% por colega no mesmo
  projeto, teto +60%) + botão "focar todos", (c) mover "comprar mesa"/"expandir"
  pra Loja, (d) jogo em tela cheia + painel direito retrátil (gaveta sobreposta).
- ⏳ (opcional) portar `js/iso.js`/`ui.js`/`main.js`/`audio.js` para TS.

**Modo Empresa Real (novo trilho — plano completo em `docs/PLANO-EMPRESA-REAL.md`):**
transformar o tycoon em espelho vivo da agência: funcionários = agentes de IA
reais (Claude Managed Agents), projetos cadastrados pelo dono, financeiro de
agência de verdade. Fases próprias (F0–F4) no plano. **F0 (plano), F1 (ponte
`server/`), F2 (cena viva), F3 (painéis reais) e F4 (automação e qualidade)
concluídas em 2026-07-27**:
- F1 — servidor Fastify com cadastros, motor financeiro (regime de caixa),
  driver de sessões (stream-first, dedupe, `reportar_progresso`, limites de
  custo com pausa automática) e SSE — dirigível por curl, com check próprio
  (`npm --prefix server run check`, 31 testes).
- F2 — botão `🏢 Empresa Real` no start screen; `src/real/` (boot por
  `?empresa=1`, api SSE, RealAdapter com a MESMA forma do Engine — contrato
  mapeado campo a campo do que iso/ui/main leem); bonecos com nome sobre a
  cabeça e **ocioso nunca senta no PC** no modo real; velocidade/salvar
  escondidos por CSS; overlay "ponte desligada"; proxy `/api` no Vite.
- F3 — painéis reais (`src/real/ui-real.ts`): wizard de projeto em 4 passos
  (spec completa + preview + estimativa de custo), contratar/editar/arquivar
  funcionário (skills → system do agente), painel **💰 Financeiro** no lugar da
  aba Empresa (visão, vendas, a receber com Receber, custos fixos CRUD,
  relatórios com DRE/margem/fluxo, livro-razão com CSV), modal de Atividade com
  **chat com o agente** e Retomar-com-feedback; na cena, balão com a etapa
  atual e clique no boneco abre a Atividade. Suíte Playwright 23/23 verde nos
  dois modos (jogo normal intocado).
- F4 — automação e qualidade: **QA automático** por projeto (kickoff vira
  `user.define_outcome` com rubrica = critérios de aceite; grader independente
  avalia até 3 rodadas e devolve feedback ao executor; selo/rodada no card e
  linhas 🔎 no log); **standup diário** (Agent gerente + deployment com cron —
  relatório matinal no topo da aba Projetos, botão ▶️ Rodar agora, custo no
  livro); **Telegram** (projeto pronto/falhou, travado em `requires_action` por
  2 min, contas vencendo, limites de custo, standup); **PR real** em projeto de
  código via proxy git (REST injetado — sem credencial no sandbox; link 🔀 no
  card); **memória por funcionário** (memory store montado em toda sessão —
  lê lições no início, registra ao concluir). Ponte com 46 testes; suíte
  Playwright F4 22/22 verde (jogo normal intocado).
- Backlog "insano" (1ª leva, 2026-07-27): **sino de vendas + meta mensal**
  (🎯 card na Visão geral, sino procedural + cliente entra na cena a cada
  venda; bater a meta = fanfarra + confete + 🎉 dos bonecos + Telegram, 1x/mês),
  **Modo TV** (dashboard de parede em tela cheia com KPIs ao vivo — botão 📺 no
  Financeiro ou `?empresa=1&tv=1`), **linha do tempo do projeto** (etapas em
  horários reais + previsão de conclusão extrapolada vs prazo, no modal de
  Atividade) e **senioridade real** (nível por entregas + taxa de aprovação no
  QA + custo médio no card do funcionário). Suíte Playwright 20/20.
- Backlog "insano" (2ª leva, 2026-07-27): **CRM leve com funil** (sub-aba 🧲
  no Financeiro: clientes com LTV real derivado dos projetos, funil lead →
  proposta → fechado/perdido, "Virar projeto" pré-preenche o wizard) e
  **conquistas reais** (8 marcos de verdade avaliados pela ponte — primeira
  entrega, selo do QA, 1º PR, R$ 10 mil, mês no azul, time de 3, meta batida,
  cliente fiel — bloqueadas viram metas na aba Equipe; desbloqueio = toast
  dourado + Telegram). Suíte Playwright 13/13.
- Backlog "insano" (3ª leva, 2026-07-27 — **backlog de médio prazo 100%
  entregue**): **gerente de IA multiagente** (opção "👥 Equipe toda" no wizard —
  Agent coordenador com o roster dos ativos delega as tarefas; threads no log
  📤/📥, custo reconciliado, cena com todo mundo trabalhando), **propostas em
  PDF** (botão 🤖 no CRM: agente Comercial com skills pdf/docx gera a proposta
  do briefing + histórico real; download no card) e **monitor ao vivo** (zoom
  no boneco trabalhando mostra um mini-terminal com as linhas reais da
  sessão). Suíte Playwright 12/12 + regressões F4–F6 verdes.
Guia de uso: **`EMPRESA-REAL.md`** na raiz. Rodar: **`npm run empresa`** e abrir
`http://localhost:5173/Game/?empresa=1` (chave em `server/.env`). Restante do
plano: só as ideias "Longe (visão)" (acesso remoto/VPS 24-7 etc.).

**F1 (concluída):** `js/game.js` portado para `src/core/` tipado, validado no
navegador (save real v3 preservado, zero erro de console, cena idêntica).

Estado por arquivo:
- ✔ `src/core/data.ts` — balanceamento completo, tipado (`js/data.js` REMOVIDO).
- ✔ `src/core/` — motor portado de `js/game.js` (REMOVIDO), tipado estrito e
  modular: `bus.ts` (EventEmitter tipado), `state.ts` (tipos + `freshState` +
  interface `Ctx`), `economy.ts` (produção/contratos/equipe/compras/produtos),
  `events.ts` (eventos aleatórios + conquistas), `save.ts` (`migrate`/ids,
  PURO — não toca `localStorage`), `engine.ts` (`createEngine` = tick/advanceDay/
  offline + API pública `window.Game`). RNG e relógio são injetáveis (testes
  determinísticos); a persistência entra por uma porta `Persistence`.
- ✔ `src/data-shim.ts` / `src/game-shim.ts` — expõem `window.DATA`/`window.Game`
  para os legados; importados em `src/main.ts` ANTES de `iso.js`/`ui.js`/`main.js`
  (ordem importa: imports são içados). `game-shim.ts` injeta o `localStorage`.
- ✔ Infra: `vite.config.ts` (base `/Game/`, PWA com `sw-limpeza.js`),
  `tsconfig.json`, `eslint.config.js`, `test/engine.test.ts` (25 testes),
  workflow `deploy-pages.yml` buildando `dist/`. Origem do Pages já está em
  "GitHub Actions" (virada manual feita em 2026-07-23 — não reverter).
- ⏳ Ainda legados (IIFEs em `window.*`): `js/audio.js`, `js/props.js`,
  `js/iso.js`, `js/ui.js`, `js/main.js`.

**PRÓXIMA TAREFA:** ver o backlog em §6.1 (tela cheia + painel retrátil →
botões pra Loja → monitor animado → bônus de foco), e continuar plotando os
assets de imagem que o dono for enviando. O renderer é o Canvas `js/iso.js`
(Pixi foi removido — ver §6.1). ⚠️ As tabelas §4.1/§4.4 e o roadmap §5 abaixo
falam de Pixi/WebGL: estão OBSOLETOS (mantidos só como histórico da decisão).

### 6.2 Prompt de atalho (opcional)

```
Leia docs/PRD.md e continue a implementação do App Agency Tycoon 2.0 pela
próxima fase pendente do roadmap (F0→F5). Regras inegociáveis:
1. O jogo deve rodar ao fim de CADA fase (npm run dev) — nunca deixe o repo
   quebrado; confirme com screenshot da cena antes de commitar.
2. Save de jogador é sagrado: não altere chave/formato sem bump de versão +
   migrate() + teste com fixture.
3. Gameplay/balanceamento intocados: os números de core/data.ts são os de
   js/data.js originais.
4. Arte 100% procedural (nenhum PNG/binário); Pixi renderiza texturas geradas
   em runtime.
5. Qualidade: tsc strict sem erros, ESLint zero warnings, testes verdes, core/
   sem imports de DOM/Pixi.
6. Textos e commits em pt-BR.
Ao terminar a fase: rode typecheck+lint+testes, tire screenshot, faça commit
descritivo e atualize a tabela de status do roadmap no PRD (marque a fase).
```

### Status do roadmap
- [x] F0 — Fundação (concluída em 2026-07-23: Vite+TS+ESLint+Prettier+Vitest, PWA via vite-plugin-pwa, CI buildando e publicando `dist/`, 9 testes do motor, bug de migração de save v1 corrigido)
- [x] F1 — Core tipado (concluída em 2026-07-24: `core/data.ts` + motor completo em `src/core/` tipado estrito e modular — bus/state/economy/events/save/engine —, `js/data.js` e `js/game.js` removidos, shims `window.DATA`/`window.Game`, 25 testes verdes, `core/` sem DOM/Pixi/localStorage; validado no navegador com save real preservado)
- [x] F1.5 — Cobertura do core ≥80% (2026-07-24: 94% de linhas, `@vitest/coverage-v8` + `npm run coverage`, 55 testes)
- [~] ~~F2 — Cena Pixi (paridade)~~ **CANCELADA (2026-07-24)** — trocada por "Canvas 2D + assets de imagem real". O renderer Pixi chegou a rodar (ambiente + mobília + personagens) mas ficava embaçado (textura escalada) e sem as funções da UI; com arte por imagem, o Canvas `js/iso.js` (nítido, completo) venceu. Pixi removido do repo. (ver §6.1)
- [ ] ~~F3 — Personagens 2.0~~ · ~~F4 — Texturas & FX~~ · ~~F5 — Limpeza final~~ (eram etapas do plano Pixi — obsoletas)
- [ ] **Nova direção (Canvas + imagens):** plotar os assets enviados + backlog do dono (tela cheia/painel retrátil, botões pra Loja, monitor animado, bônus de foco de equipe). Ver §6.1.
