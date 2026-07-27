# Modo Empresa Real — transformar o tycoon em espelho vivo da agência

## Contexto

O App Agency Tycoon hoje é um jogo 100% simulado e 100% front-end estático (GitHub Pages). O objetivo é adicionar um **"Modo Empresa Real"** no mesmo repo: a mesma cena isométrica e painéis, mas onde:

- **Funcionários = agentes de IA reais** (Claude **Managed Agents**, na nuvem da Anthropic) — são os bonecos da cena, com nome e cargo; **quando não estão trabalhando, ficam fora dos computadores** (vagando/na cozinha);
- **Projetos = cadastrados pelo dono dentro do próprio ambiente**, com formulário de **especificação completa e estruturada** (não um campo só);
- **Progresso real**: os agentes trabalham de verdade em sessões na nuvem e reportam etapas; cada projeto mostra **consumo de API em R$ e progresso atual**;
- **Financeiro de agência de verdade**: caixa que acompanha as entregas lançadas, **contas a receber**, **custos fixos mensais** (servidores etc.), relatórios de vendas/recebimentos/fluxo de caixa;
- **Botões de aceleração removidos** no modo real (tempo é real).

O jogo normal continua intocado (save v3 sagrado, `npm run check` verde). Decisões do dono: Managed Agents na nuvem; mesmo repo com modo novo; projetos de código e de entrega geral; receita manual + custo real de API.

## Arquitetura

O browser nunca fala com a Anthropic (chave secreta + SSE longos). Um **servidor ponte local** (`server/`, Node 20 + TypeScript + **Fastify**, projeto npm próprio) guarda o cadastro, dirige as sessões e serve o front:

```
Browser (?empresa=1)                server/ (npm run empresa)              Anthropic
┌──────────────────┐   REST/SSE    ┌───────────────────────────┐  SDK    ┌──────────────┐
│ RealAdapter      │ ────────────▶ │ rotas + store JSON        │ ──────▶ │ Agents (1x)  │
│ (fake Game.state)│ ◀──────────── │ driver de sessões (SSE    │ ◀────── │ Environment  │
│ iso.js / ui.js   │               │ stream-first + custom     │  eventos│ Sessions     │
│ ui-real (painéis)│               │ tool + custos → financeiro│         │ (por projeto)│
└──────────────────┘               └───────────────────────────┘         └──────────────┘
```

Decisões-chave (com o porquê):

- **Adapter com a mesma interface de `window.Game`** — `js/iso.js` e `js/ui.js` capturam `const G = window.Game` na carga do IIFE; um `RealAdapter` com a mesma forma do `Engine` (contrato em `src/core/engine.ts:355-406`) reusa a cena e os painéis sem tocar em ~1.900 linhas de renderer/UI.
- **Troca de modo por `?empresa=1` + reload** — `G` é capturado na carga; reload é limpo e o save do jogo (`appAgencyTycoon.save.v1`) fica intocado.
- **Managed Agents (beta `managed-agents-2026-04-01`, `@anthropic-ai/sdk`, `client.beta.*`)** — 1 **Agent** por funcionário (criado 1x, `agentId`+`version` persistidos; edição via `agents.update`, nunca recriar), 1 **Environment** global, 1 **Session** por projeto. Sessões seguem na nuvem se a ponte cair; reconciliação por `events.list()` + dedupe por id.
- **Armazenamento**: JSON em disco com escrita atômica (`server/data/*.json`) + lançamentos financeiros em NDJSON append-only. Camada `store/` isola uma futura troca por SQLite.
- **Tempo real front↔ponte**: SSE (`/api/stream`); comandos por REST.
- **Modelo padrão dos agentes**: `claude-opus-5` (configurável por funcionário).

## Árvore de arquivos novos

```
server/                              # projeto npm próprio (fora do build do Vite)
  package.json                       # fastify, @anthropic-ai/sdk, zod; dev: tsx, typescript, vitest
  tsconfig.json
  .env.example                       # ANTHROPIC_API_KEY=, GITHUB_TOKEN=, PORTA=3777
  src/
    index.ts                         # bootstrap Fastify + reconciliação de sessões + rotina diária
    config.ts                        # preços USD/MTok por modelo, câmbio USD→BRL, limites de custo
    store/tipos.ts                   # FuncionarioAgente, ProjetoReal, ContaReceber, CustoFixo, Lancamento
    store/db.ts                      # escrita atômica (tmp+rename) + lancamentos.ndjson
    financeiro/motor.ts              # contas a receber, custos fixos mensais, saldo/caixa, relatórios
    anthropic/cliente.ts             # new Anthropic() do .env
    anthropic/agentes.ts             # agents.create/update (system = persona+skills), environment 1x
    anthropic/sessoes.ts             # driver: stream-first, dedupe, custom tool, idle-gate, reconexão
    anthropic/custos.ts              # span.model_request_end.model_usage → USD → BRL
    rotas/{funcionarios,projetos,financeiro,estado}.ts
    tempoReal.ts                     # broadcast SSE ('estado','progresso','atividade','custo','alerta')
  data/                              # GITIGNORED — cadastros, lançamentos, atividade, entregas
src/real/                            # front TS (entra no typecheck/lint da raiz)
  api.ts                             # fetch + EventSource; detecção de ponte offline (/api/saude)
  tipos.ts                           # espelho dos tipos do server
  adapter.ts                         # RealAdapter compatível com window.Game
  ui-real.ts                         # painéis do modo real (cadastros, financeiro, atividade)
  boot.ts                            # decide o modo (?empresa=1); substitui a lógica do game-shim
```

## Modelo de dados (ponte)

```ts
interface FuncionarioAgente {
  id: string; nome: string;
  cargoVisual: CargoId;              // avatar/mesa na cena
  persona: string;                   // vira o `system` do Agent
  skills: string[];                  // skills atribuídas no cadastro (anthropic ou custom skill_id)
  modelo: string;                    // padrão 'claude-opus-5'
  agentId: string | null; agentVersion: number | null;
  status: 'ativo' | 'arquivado';
  custoTotalUSD: number; custoHojeUSD: number;   // "salário do dia"
}

interface EspecificacaoProjeto {     // formulário estruturado — spec completa
  objetivo: string;                  // o que o projeto resolve / para quê
  escopo: string;                    // funcionalidades / o que está incluso
  foraDoEscopo?: string;
  requisitosTecnicos?: string;       // stack, integrações, restrições
  designReferencias?: string;        // identidade visual, links de referência
  entregaveis: string;               // o que exatamente deve ser entregue
  criteriosAceite: string;           // como saber que está pronto
  observacoes?: string;
  anexos?: string[];                 // file_ids (upload via Files API, montados na sessão)
}

interface ProjetoReal {
  id: string; nome: string; cliente: string; emoji: string;
  tipo: 'codigo' | 'entrega';
  spec: EspecificacaoProjeto;
  repoUrl?: string; branch?: string;
  valorContratoBRL: number;
  pagamento: { forma: 'avista' | 'parcelado'; parcelas?: number; entradaBRL?: number };
  prazoDias: number; criadoEm: string;
  funcionarioId: string;             // 1 agente responsável na v1
  sessionId: string | null;
  etapasTotais: number; etapasConcluidas: number; resumoAtual: string;
  status: 'rascunho'|'em_andamento'|'pausado'|'aguardando_revisao'|'entregue'|'falhou';
  custoUSD: number;                  // consumo de API do projeto (exibido no card)
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

// ---- Financeiro de agência ----
interface ContaReceber {
  id: string; projetoId: string; descricao: string;    // ex. "Parcela 2/3 — App X"
  valorBRL: number; vencimento: string;                 // ISO
  status: 'aberta' | 'recebida' | 'atrasada';
  recebidaEm?: string;
}

interface CustoFixo {                // servidores, ferramentas, domínios...
  id: string; nome: string; categoria: 'servidor'|'ferramenta'|'imposto'|'outro';
  valorBRL: number; recorrencia: 'mensal'|'anual'|'unico';
  diaVencimento: number; ativo: boolean;
}

interface Lancamento {               // livro-razão (NDJSON append-only)
  id: string; data: string;
  tipo: 'venda' | 'recebimento' | 'custo_api' | 'custo_fixo' | 'ajuste';
  projetoId?: string; funcionarioId?: string; contaReceberId?: string; custoFixoId?: string;
  valorBRL: number;                  // entradas positivas, saídas negativas
  descricao: string;
  meta?: { modelo?: string; inputTokens?: number; outputTokens?: number; usd?: number };
}
```

**Regras do motor financeiro (`financeiro/motor.ts`):**
- **Venda**: registrada ao iniciar o projeto (contrato fechado) — aparece no relatório de vendas, não no caixa.
- **Entrega**: quando o dono lança "projeto entregue", geram-se as **contas a receber** conforme a forma de pagamento (à vista = 1 conta com vencimento hoje; parcelado = N contas mensais; entrada opcional).
- **Recebimento**: o dono marca a conta como recebida → lançamento `recebimento` → **o caixa sobe aqui** (regime de caixa). Contas vencidas viram `atrasada` automaticamente.
- **Custos fixos**: rotina diária da ponte lança automaticamente os custos recorrentes no dia do vencimento (`custo_fixo`).
- **Custo de API**: acumulado automaticamente por sessão (1 lançamento `custo_api` por sessão/dia, atualizado).
- **Relatórios**: vendas por período, recebimentos, contas a receber (abertas/atrasadas), fluxo de caixa mensal, DRE simplificado (receita − custo API − custos fixos = lucro), custo e margem por projeto, custo por funcionário.
- **Decisão do dono (2026-07-27)**: regime de caixa confirmado — nenhuma entrada automática no caixa na entrega, nem à vista; o caixa só sobe ao marcar a conta como recebida.

## Endpoints da ponte (`/api`)

| Rota | Ação |
|---|---|
| `GET /saude` | ping (front detecta ponte) |
| `GET /estado` | snapshot p/ o adapter |
| `GET /stream` | SSE de estado/progresso/atividade/custo/alerta |
| `GET/POST/PUT/DELETE /funcionarios[/:id]` | POST cria o Agent na Anthropic (nome+skills+persona); PUT usa `agents.update` |
| `GET/POST/PUT /projetos[/:id]` | cadastro com spec estruturada (PUT só rascunho/pausado) |
| `POST /projetos/:id/iniciar` | registra a venda; cria Session (resource `github_repository` se tipo=codigo, anexos montados), abre stream, envia a spec formatada |
| `POST /projetos/:id/pausar` / `retomar` | `user.interrupt` / `user.message` (o retomar aceita feedback do dono) |
| `POST /projetos/:id/entregar` | marca `entregue`, gera contas a receber, baixa outputs (`files.list({scope_id})`) p/ `server/data/entregas/`, arquiva sessão |
| `GET /projetos/:id/atividade` | log NDJSON da sessão |
| `GET /financeiro/resumo` | saldo, a receber, vencendo, custo do mês |
| `GET /financeiro/lancamentos?de=&ate=&tipo=` | livro-razão filtrável |
| `GET /financeiro/relatorios/{vendas,fluxo,dre}` | relatórios por período |
| `GET/POST/PUT /financeiro/contas-receber[/:id]` + `POST /:id/receber` | contas a receber; receber = caixa sobe |
| `GET/POST/PUT/DELETE /financeiro/custos-fixos[/:id]` | custos recorrentes (servidores etc.) |
| `GET/PUT /config` | câmbio, limites de custo |

## Driver de sessões — regras obrigatórias

1. **Stream antes de enviar** o `user.message` de kickoff (SSE não tem replay).
2. **Reconexão sem perda**: em toda (re)conexão, `events.list()` primeiro + dedupe por `event.id` (Set persistido por sessão), depois o stream ao vivo.
3. **Gate de idle correto**: encerrar só em `session.status_terminated` ou `status_idle` com `stop_reason.type !== 'requires_action'` (senão deadlock esperando tool). `end_turn` ⇒ projeto vira `aguardando_revisao` (dono revisa e entrega, ou manda feedback via retomar).
4. **Custom tool `reportar_progresso`** `{etapasConcluidas, etapasTotais, resumo}`: em `agent.custom_tool_use` → atualiza projeto, broadcast SSE, responde `user.custom_tool_result`. O system prompt do funcionário instrui: quebrar a spec em etapas, reportar (0, N, plano) no início e a cada etapa; entregas em `/mnt/session/outputs/` (tipo entrega) ou commit/push na branch (tipo código).
5. **Custos**: cada `span.model_request_end.model_usage` → tabela de preços + câmbio → acumula em projeto+funcionário e no livro-razão. Ao estourar limite (diário ou por projeto): alerta SSE + `user.interrupt` automático (status `pausado`).
6. **Reconciliação no boot**: para cada projeto `em_andamento`, `sessions.retrieve()`; religa stream (regra 2) ou marca terminado.

## Front — RealAdapter, cena e painéis

`src/real/boot.ts` (importado por `src/main.ts` no lugar de `./game-shim`): se `?empresa=1`, `window.Game = criarAdaptadorReal()`; senão, fluxo atual do `game-shim.ts`. Botão `🏢 Empresa Real` no `#startScreen`.

**Comportamento na cena (bonecos = agentes reais):**

| Situação real | Na cena |
|---|---|
| Funcionário com sessão rodando | Sentado na mesa, digitando (monitor aceso) |
| Funcionário sem projeto / sessão pausada | `resting: true` → **fora do computador** (vai à cozinha/vaga pelo escritório). Atenção: o `iso.js` atual só encurta os timers do ocioso — o boneco ainda volta à mesa e "digita" 1,5–4 s entre as voltinhas; no modo real o worker ocioso **nunca entra no estado `work`** (ver mudança em `js/iso.js`) |
| Projeto concluiu etapa | Toast + som (bus `event`), balão 💰 na entrega |
| Nenhum projeto ativo | Todos os bonecos vagam (comportamento `noWork` existente) |

**Botões de aceleração**: no modo real o body ganha a classe `modo-real` e os controles de velocidade (e Salvar) são **escondidos por CSS** — o tempo é o relógio de verdade. `setTimeScale` do adapter é no-op. Seletores reais (os botões de velocidade não têm id): `div.speed-group` / `button.speed-btn[data-speed]` (`index.html:59-63`) e os botões Salvar `#btnSave` e `#btnManualSave`; lembrar também dos atalhos de teclado Espaço/1/2/3 em `js/main.js:155-162`.

Mapeamentos principais do adapter (campos que `iso.js`/`ui.js` realmente leem):

| Membro | Implementação |
|---|---|
| `state.money` | **caixa real** (soma de recebimentos − custos) |
| `state.day` / `dayProgress` | relógio real (dia/noite da cena acompanha a hora real) |
| `state.employees[]` | `{uid, name, role: cargoVisual, assign: projeto ativo, energy, resting: sem sessão ativa}` |
| `state.active[]` | `{work: etapasTotais*100, done: etapasConcluidas*100, reward: valorContratoBRL, daysLeft}` |
| `state.available[]` | projetos `rascunho` (Aceitar = iniciar) |
| `tier/desks/upgrades/company` | derivados do cadastro (desks = funcionários + 1) |
| `on('change'/'tick')` | disparados por SSE / rAF do adapter; `tick/save` no-ops |
| `projectRates()/production()/empSpeed()` | estimativa real (etapas das últimas 6h extrapoladas) |
| `productsUnlocked()→false`, `hasSave()→false`, `takeOfflineReport()→null` | desligam produtos/continue/offline |
| ações (`hire`, `acceptProject`, ...) | chamadas REST ou abrem os painéis reais |

**Cuidados descobertos na verificação do código (2026-07-27):**

- `js/ui.js:9` desreferencia `const fmt = G.fmt` **no momento da carga** — o adapter precisa ser um objeto pronto (com `fmt`) antes dos IIFEs legados carregarem; Proxy tardio não serve. `js/iso.js:547` lê `G.DAY_LENGTH` — expor também.
- O contrato real do engine (`src/core/engine.ts:355-405`) tem **34 membros** — a tabela acima é amostra; o adapter cobre todos, com os demais virando no-op ou valor derivado: `tick`, `autoSaveTick`, `newGame`, `load`, `reset`, `save`, `maxDesks`, `projectSlots`, `deskCost`, `employeesSeated`, `contractValueMult`, `repMultiplier`, `assignedCount`, `promotionFor`, `canPromote`, `productCost`, `rankPosition`, `declineProject`, `fire`, `buyDesk`, `upgradeOffice`, `buyUpgrade`, `assignEmployee`, `promote`, `resolveEvent`, `launchProduct`, `setCompany`.

### Página de cadastro de projeto (dentro do ambiente)

Botão `+ Novo Projeto` na aba Projetos abre um **wizard em 4 passos** (modal grande, mesmo estilo dos modais do jogo), para a spec sair completa sem virar um formulário assustador:

1. **Contrato** — nome do projeto, cliente, emoji, tipo (`codigo` | `entrega`), valor do contrato (R$), forma de pagamento (à vista / entrada + N parcelas), prazo em dias, funcionário responsável (select dos agentes disponíveis).
2. **Especificação** — objetivo (o que o projeto resolve e para quem), escopo/funcionalidades (uma por linha), fora do escopo, requisitos técnicos (stack, integrações, restrições), design/referências (identidade visual, links).
3. **Entrega** — entregáveis exatos, **critérios de aceite** (uma por linha — viram checklist de revisão e, na F4, a rubric do QA), observações; se `codigo`: URL do repositório + branch de trabalho; anexos (upload → Files API → montados na sessão em `/workspace/anexos/`).
4. **Revisão** — preview da spec renderizada em markdown exatamente como o agente vai receber + estimativa de custo de API (faixa baseada no histórico de projetos do mesmo tipo). Salvar cria em `rascunho`; dali dá para **Iniciar** (registra a venda e dispara a sessão).

Validação com zod dos dois lados (front e ponte); rascunhos podem ser editados até iniciar. O kickoff enviado ao agente é a spec formatada em seções + instruções fixas (quebrar em etapas, `reportar_progresso`, onde escrever entregas).

**Card do projeto em andamento** mostra: barra de etapas (`3/8`), fase textual (ex. "implementando tela de login" = `resumoAtual`), prazo restante, **consumo de API ao vivo** (R$ e tokens), responsável, botões Pausar / Retomar (com campo de feedback) / Entregar / Atividade.

### Página de cadastro de funcionário (expansão da equipe)

Botão `+ Contratar` na aba Equipe abre o formulário:

- **Nome** (o nome que aparece em cima do boneco na cena) e **cargo visual** (junior/pleno/senior/designer/qa/manager — define roupa/acessório do avatar via `ROLE_STYLE` já existente);
- **Skills** — checklist de especialidades que compõem o system prompt por blocos prontos e editáveis (ex.: Desenvolvimento Web, Mobile, Backend/APIs, Design UI/UX, Copywriting/Conteúdo, Pesquisa/Análise, Planilhas/Financeiro, QA/Testes) + skills da Anthropic quando fizer sentido (`xlsx`, `docx`, `pptx`, `pdf`) + campo livre de persona ("como esse funcionário trabalha");
- **Modelo** (padrão `claude-opus-5`; opção de `claude-sonnet-5`/`claude-haiku-4-5` para funcionários "mais baratos" — o custo real por modelo aparece ao lado);
- Ao salvar: a ponte monta o `system` (persona + blocos de skill + instruções fixas de progresso/entrega) e chama `agents.create` — o `agent_...` fica vinculado; editar depois usa `agents.update` (nova versão, sessões em andamento não quebram). O boneco aparece na cena imediatamente (sentado só quando tiver projeto).

**Card do funcionário**: status (💼 trabalhando em X / ☕ disponível), salário do dia (custo de API de hoje em R$), custo total, modelo, skills, projetos entregues; ações Editar / Arquivar.

### Painel Financeiro (substitui a aba Empresa) — sistema financeiro de agência

Sub-abas dentro do painel:

- **Visão geral**: caixa atual, total a receber, contas vencendo em 7 dias, custo de API do mês, custos fixos do mês, lucro do mês (mini-DRE) — em cards estilo HUD.
- **Vendas**: contratos fechados por período (data de início do projeto), valor total vendido, ticket médio, vendas por cliente.
- **Contas a receber**: tabela (descrição, projeto, valor, vencimento, status aberta/recebida/atrasada) com botão **Receber** (efetiva o caixa) e edição de vencimento; badge de atrasadas no título da aba.
- **Custos**: (a) **custos fixos** — CRUD de despesas recorrentes (servidor VPS, domínio, ferramentas SaaS, contador...) com valor, recorrência mensal/anual, dia de vencimento — lançados automaticamente pela rotina diária da ponte; (b) **custos de API** — por funcionário e por projeto, dia a dia.
- **Relatórios**: fluxo de caixa mensal (entradas × saídas por mês), DRE simplificado do mês (receita recebida − custo de API − custos fixos = lucro), **margem por projeto** (valor do contrato − custo de API dele), custo por funcionário. Tabelas simples + barras CSS (sem lib de gráfico na v1).
- **Livro-razão**: todos os lançamentos filtráveis por período/tipo/projeto, com exportação CSV.

### Outros painéis

- **Atividade** (modal por projeto): log ao vivo da sessão — mensagens do agente, tools usadas, marcos de progresso, custos por request; campo de mensagem para falar com o agente no meio do trabalho (vira `user.message`).
- **Ponte offline** (falha em `/api/saude`): overlay "O Modo Empresa Real precisa da ponte local — rode `npm run empresa`" (caso do GitHub Pages).

## Mudanças em arquivos existentes (mínimas)

| Arquivo | Mudança |
|---|---|
| `index.html` | botão `#btnEmpresaReal` no start screen; container dos painéis reais |
| `src/main.ts` | `./real/boot` no lugar de `./game-shim`; `./real/ui-real` por último |
| `src/game-shim.ts` | criação do engine extraída p/ função que o boot reusa |
| `js/main.js` | ~5 linhas: listener do botão; no modo real, `showGame()` direto e classe `modo-real` no body (esconde velocidade/salvar) |
| `js/iso.js` | pequeno: (a) desenhar o **nome do funcionário** sobre o boneco quando `Game.modoReal` (a cena é a empresa — precisa dar para reconhecer quem é quem); (b) no modo real, worker ocioso/`resting` **nunca entra no estado `work`** na mesa — vai direto vagar/cozinha/lounge (hoje `iso.js:363-409` só encurta os timers e o boneco volta a "digitar" entre as voltinhas) |
| `vite.config.ts` | `server.proxy['/api'] → localhost:3777` (só dev) |
| package.json raiz | script `"empresa"` (concurrently: server dev + vite); devDep `concurrently` |
| .gitignore | `server/data/`, `server/.env` |
| css | estilos dos painéis novos |

Nada muda em `src/core/` — fronteira e save preservados.

## Fases de entrega

**F0 — Documentar.** Este plano gravado como `docs/PLANO-EMPRESA-REAL.md` (referenciado no PRD §6.1), versionado com o projeto.

**F1 — Ponte ponta-a-ponta (sem front).** `server/` completo (inclusive motor financeiro básico); 1 funcionário + 1 projeto `entrega` dirigidos por curl.
*Verificar:* POST funcionário cria `agent_...`; iniciar projeto e ver `etapasConcluidas`/`custoUSD` subirem; livro-razão com `custo_api` em R$; sessão visível no Console Anthropic; derrubar/religar a ponte no meio ⇒ reconcilia sem duplicar (dedupe); `npm --prefix server run check`.

**F2 — Modo no front com cena viva.** Botão, boot, adapter, api.ts (SSE), proxy; bonecos refletindo estado real (trabalhando/fora do PC); botões de velocidade escondidos.
*Verificar:* `npm run empresa` → `?empresa=1` renderiza sem erros de console (skill `testar-jogo`/Playwright + screenshot); progresso do agente move a barra em <2s; funcionário ocioso sai do computador; jogo normal intocado (`npm run check` verde, save antigo carrega).

**F3 — Cadastros completos + financeiro de agência + projetos de código + vida na cena.** Wizard de spec estruturada; pausar/retomar/entregar; painel Financeiro completo (contas a receber com parcelas, custos fixos recorrentes com lançamento automático, relatórios de vendas/fluxo/DRE, livro-razão); projetos `codigo` com `github_repository` (PAT via `.env`, checkout, push pelo proxy git); log de atividade; limites de custo com pausa automática; salário-do-dia. **Inclui da lista insana:** (a) **balões na cena** — o boneco mostra o `resumoAtual` em balão enquanto trabalha, e nome sobre o personagem; (b) **chat com o funcionário** — clicar no boneco abre o modal de Atividade com campo de mensagem que envia `user.message` na sessão dele.
*Verificar:* fluxo completo — cadastrar agente e projeto código num repo de teste, ver commits/push, entregar (gera parcelas), marcar parcela recebida (caixa sobe), custo fixo mensal lançado no vencimento, DRE do mês fecha; balão do boneco mostra a etapa atual; mensagem enviada pelo chat muda o rumo do trabalho do agente.

**F4 — Automação e qualidade.** ✅ **Concluída (2026-07-27).** (a) **QA com segundo agente**: um agente revisor fixo (criado pela ponte) avalia a entrega contra os critérios de aceite via `user.define_outcome`/rubric antes de `aguardando_revisao` e devolve feedback ao executor; `span.outcome_evaluation_*` também serve de fallback de progresso; (b) **standup diário automático**: `deployments.create` com cron matinal — cada funcionário com projeto ativo resume ontem/hoje; a ponte consolida no "relatório matinal" do painel + toast na cena; (c) **notificações no celular** (Telegram via bot token no `.env`): projeto concluído, agente travado esperando você (`requires_action`), conta a receber vencendo, limite de custo estourado; (d) PRs reais (GitHub MCP + vault); (e) memória por funcionário (memory store montado nas sessões — o agente aprende entre projetos).
*Verificar por item:* entrega reprovada no QA volta ao executor com feedback e o log mostra a avaliação da rubric; standup dispara no horário e aparece no painel; mensagem chega no Telegram em cada um dos 4 gatilhos; PR aberto em repo de teste; segunda sessão lê memória da primeira.

*Notas de implementação da F4 (como ficou de verdade):*
- **(a) QA** — o "revisor" é o **grader nativo de outcomes** (contexto independente da mesma sessão): com `qaAtivo` (checkbox do wizard, padrão ligado) o kickoff vira `user.define_outcome` com `rubric` = critérios de aceite (`montarRubric`) e `max_iterations: 3` — sem um segundo Agent/sessão para orquestrar, mesmo efeito. `needs_revision` devolve o feedback ao executor automaticamente; o card mostra rodada/resultado (`qaResultado`/`qaIteracao`/`qaFeedback`) e os `span.outcome_evaluation_*` viram `resumoAtual` (fallback de progresso na cena) + linhas `qa` no log. Pausar mata o outcome (`interrupted`); **Retomar com QA redefine um novo outcome** com a mesma rubrica.
- **(b) Standup** — 1 Agent "Gerente de Operações" + 1 deployment com cron local (`standupHora`, padrão 09:00; fuso da máquina). O gerente chama a custom tool `obter_contexto_standup` (a ponte responde com projetos/etapas/custos/financeiro/atividade de ontem) e publica com `publicar_standup`; a ponte detecta os runs por polling (5 min) com dedupe persistido, grava em `data/standup.json` (1/dia, o novo substitui), mostra no topo da aba Projetos e manda no Telegram. Botão **▶️ Rodar agora** usa o run manual do deployment (funciona até pausado). Custo entra no livro como `custo_api:standup:<dia>` e conta no limite diário.
- **(c) Telegram** — `server/src/notificar/telegram.ts` (fire-and-forget, nunca derruba o fluxo). Gatilhos: aguardando revisão (com link do PR), falhou/terminou incompleto, **travado**: `requires_action` parado por 2 min sem evento novo (watchdog `vigiarTravado`), contas vencendo hoje/atrasadas (1x/dia na rotina diária), limites de custo e o standup.
- **(d) PRs reais** — trocado **MCP + vault → proxy git da Anthropic**, que injeta o `authorization_token` do `github_repository` também em **chamadas REST do GitHub** feitas pelo agente (documentado). O kickoff (com `abrirPR`, padrão ligado p/ código) instrui `POST api.github.com/repos/<owner>/<repo>/pulls` via curl, sem credencial no sandbox; a ponte captura o link do PR nas mensagens (`extrairLinkPR`) → `prUrl` no card. Menos peças móveis e nenhum segredo novo na nuvem; o PAT precisa também de `Pull requests: Read and write`.
- **(e) Memória** — `memory_stores.create` 1x por funcionário (`garantirMemoria`, no 1º projeto; `memoryStoreId` no cadastro) e recurso `memory_store` (read_write) em toda sessão; instruções fixas do system mandam ler no início e registrar lições ao concluir. Falha na memória não bloqueia o início do projeto.

## Ideias para deixar insano (backlog priorizado)

**Já incorporadas ao escopo (F3/F4):** balões de fala + nome sobre o boneco, chat direto com o funcionário, standup diário automático, QA com segundo agente, notificações no celular (Telegram).

**✅ Entregues do backlog (2026-07-27):**
- **5. Conquistas reais** — 8 marcos avaliados sobre os dados reais (`server/src/conquistas.ts`, `avaliarConquistas` puro): primeira entrega, selo do QA, 1º PR, R$ 10 mil recebidos, mês no azul (via `fluxoMensal`), time de 3, meta batida, cliente fiel. Persistência 1x (`conquistas.json`), reavaliação em todo `aoMudarEstado` + boot; desbloqueio = alerta `conquista` (toast dourado/som de level do legado) + Telegram; painel no fim da aba Equipe com bloqueadas viradas metas 🔒.
- **7. CRM leve com funil** — entidades `ClienteCRM` + `OportunidadeCRM` (rotas `/api/crm/*`, zod), sub-aba **🧲 CRM** no Financeiro: funil lead → proposta → fechado | perdido (avançar/perder/reabrir/excluir), formulários inline de cliente e oportunidade, tabela de clientes com **LTV real** derivado dos projetos (join por nome) e contagem no funil; oportunidade fechada tem **📋 Virar projeto** (wizard pré-preenchido com título/cliente/valor).
- **2. Senioridade real** — o card do funcionário mostra nível real por projetos entregues (🌱 Novato → 🏆 Lenda), taxa de aprovação no QA e custo médio de API por projeto (tudo derivado do snapshot; a memória — F4e — já acumula as lições).
- **6. Sino de vendas + metas mensais** — `metaMensalBRL` na config (edição pelo card 🎯 da Visão geral); iniciar projeto emite alerta `venda` (sino `Sfx.bell` + cliente entra na cena via `spawnClient`); cruzar a meta emite `meta_batida` 1x/mês (`metaFoiBatida` puro + `metaBatidaMes` de dedupe) → fanfarra + confete DOM + 🎉 dos bonecos (`popMoney`) + Telegram.
- **8. Modo TV** — overlay tela cheia (`#modoTv`) com relógio, 4 KPIs grandes, barra da meta, projetos com barras ao vivo (SSE) e a manchete do standup; abre pelo botão 📺 do Financeiro ou direto com `?empresa=1&tv=1`; fecha no Esc.
- **9. Linha do tempo do projeto** — no modal de Atividade: as etapas reportadas (`tipo progresso`) viram linhas com horário real e duração (barras proporcionais) + previsão de conclusão extrapolada do ritmo, comparada ao prazo (✅ dentro / ⚠️ estoura em Nd).

- **1. Gerente de IA (multiagente)** — Agent coordenador criado pela ponte (`multiagent: {type:'coordinator', agents:[roster]}` — campo top-level, doc oficial), roster = funcionários ativos, atualizado via `agents.update` quando a equipe muda (`rosterMudou` puro). No wizard, o responsável ganha a opção **"👥 Equipe toda — o Gerente de IA delega"** (`funcionarioId: 'equipe'`); a sessão monta as memórias de até 8 ativos (container compartilhado entre threads). O driver loga `session.thread_created` / `agent.thread_message_sent|received` na atividade (📤/📥), **ecoa `session_thread_id`** nos `user.custom_tool_result` (tools de subagentes chegam no stream primário) e, no fim, **reconcilia o custo** somando o `usage` de todos os threads (o stream primário não traz os spans dos subagentes). Na cena, quem está livre senta e trabalha no projeto da equipe.
- **3. Propostas e orçamentos** — Agent "Comercial" (skills `pdf`+`docx`) criado 1x; botão **🤖 Gerar proposta** nos cards de lead/proposta do CRM monta o briefing (`montarBriefingProposta`: oportunidade + cliente + histórico real de contratos/custos para calibrar preço) e roda uma sessão em segundo plano; o PDF é baixado para `data/propostas/<oportunidade>/` com link de download no card; lead vira "proposta" sozinho ao ficar pronta; custo no livro (`custo_api:proposta:<dia>`).
- **4. Monitor "ao vivo" no PC do boneco** — com zoom na cena (≥1,35× do enquadramento), o funcionário trabalhando ganha um mini-terminal (fundo escuro, texto verde, cursor piscando) com as últimas linhas reais da sessão (`Game.realLinhas`, buffer alimentado pelo SSE de atividade; fallback = resumo da etapa).

**Longe (visão):**
10. **Acesso remoto** — expor a ponte via Tailscale/túnel para acompanhar a agência do celular (o PWA já existe); ou migrar a ponte para um VPS e a agência roda 24/7 mesmo com seu Mac desligado.
11. **Integração financeira real** — importar extrato/OFX ou planilha para conciliar recebimentos automaticamente; emissão de cobrança (Pix copia-e-cola no card da conta a receber); nota fiscal ligada à entrega.
12. **Múltiplos funcionários por projeto** — squads com fases (design → dev → QA) espelhando as fases que o jogo já tem (`PHASES`), cada fase com o agente do cargo certo; a barra do projeto mostra a fase real como no jogo.
13. **Rivais reais** — painel de benchmarking (metas mensais vs. realizado) no lugar do ranking fake de rivais.
14. **Reunião de fechamento de mês** — no dia 1º, os agentes "se reúnem" na mesa de reunião da cena e um agente-analista apresenta o mês: DRE comentado, projeto mais lucrativo, onde o custo de API estourou, sugestões para o próximo mês (vira um relatório no painel).
15. **Portal do cliente** — página pública (link com token) onde o cliente do projeto acompanha o progresso das etapas e os entregáveis liberados, sem ver nada do financeiro — a agência ganha cara de produto.
16. **Contratação assistida** — ao cadastrar um projeto cuja spec exige skills que nenhum funcionário tem, o sistema sugere "contratar" um novo agente com o perfil ideal (persona e skills pré-preenchidas a partir da spec).
17. **Dia/noite com expediente** — rotinas cron podem concentrar trabalho pesado de madrugada; a cena mostra o escritório aceso de noite quando alguém está trabalhando de verdade, e você acorda com o standup pronto.

## Riscos e cuidados

- **Chave de API** só em `server/.env` (gitignored; `.env.example` commitado). Browser nunca vê a chave.
- **Dados da empresa** (specs, financeiro, PAT) em `server/data/` gitignored — nunca vão pro repo público do Pages.
- **GitHub Pages** segue servindo só o jogo; modo real detecta ponte ausente e avisa.
- **Custo de tokens**: limites diário/por-projeto com pausa automática; preços/câmbio em config editável.
- **Deadlock de `requires_action`** e **SSE sem replay**: cobertos pelas regras do driver (itens 2 e 3).
- **Agents órfãos**: `agents.create` só no POST de funcionário; edição versiona com `agents.update`.
- **`npm run check` intacto**: `server/` tem check próprio; `src/real/` entra no lint/typecheck da raiz; save v3 nunca é tocado.

## Verificação end-to-end (após F3)

1. `npm run empresa`; abrir `http://localhost:5173/Game/?empresa=1`.
2. Cadastrar 1 funcionário-agente (nome, cargo, skills, persona) → ver `agent_...` criado e o boneco na cena, fora do computador (sem projeto).
3. Cadastrar projeto `entrega` pelo wizard com spec completa e valor parcelado → Iniciar → boneco senta e digita; barra anda conforme `reportar_progresso`; custo de API sobe no card; balão mostra a etapa atual.
4. Entregar → parcelas geradas em contas a receber; marcar a 1ª como recebida → caixa do HUD sobe; entregas baixadas em `server/data/entregas/`.
5. Cadastrar custo fixo mensal (ex. "VPS R$ 60, dia 5") → lançado automaticamente no vencimento; DRE do mês mostra receita − custo API − custos fixos.
6. Sem botões de velocidade na tela; relógio da cena = hora real.
7. `npm run check` na raiz verde; jogo normal (`/Game/` sem query) funciona e carrega save antigo; screenshot da cena no modo real confirmada.
