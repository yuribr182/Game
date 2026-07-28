# Times, Rotinas e Fluxos — a agência que se opera sozinha

> **Status**: aprovado pelo dono (2026-07-28) · complementa `docs/PLANO-EMPRESA-REAL.md`
> **Inspiração**: WeStack (westack.com.br) — "escritório virtual de agentes IA":
> squads autônomos por função (comercial, marketing, operação Mercado Livre)
> que trabalham entre si 24/7, humano só na estratégia.

## O pedido do dono (2026-07-28)

1. **Nada fixo/estático**: times montados **por demanda** — um time para o
   projeto X, outro para o projeto Y, outro para a operação de Mercado Livre.
   As ligações entre agentes são **configuradas pelo dono quando fizer
   sentido**, não pré-programadas.
2. **Agentes que conversam entre si**: ex. o de captação de leads alimenta o
   que gera contrato/proposta, que alimenta quem desenvolve, que alimenta a
   entrega. Precisa ficar claro **como** isso funciona por baixo.
3. **Gestão com cara profissional**: a cena animada fica (é a vitrine), mas
   relatórios, CRM e financeiro devem parecer **painel de empresa (SaaS)** —
   mais espaço, mais sobriedade, mais confiança, menos "joguinho".

---

## 1. Os três blocos de construção

### 1.1 Time (squad dinâmico)

Um **Time** é um grupo nomeado de funcionários com uma missão, criado e
desfeito quando o dono quiser:

```ts
interface Time {
  id: string;
  nome: string;              // "Time App do Cliente X", "Mercado Livre", "Comercial"
  emoji: string;
  missao: string;            // o que esse time faz — vira contexto do coordenador
  membros: string[];         // funcionarioIds (um funcionário pode estar em N times)
  coordenadorAgentId: string | null;  // Agent multiagente criado pela ponte
  coordenadorVersion: number | null;
  status: 'ativo' | 'arquivado';
  criadoEm: string;
}
```

- Criar um time cria (1x) um **Agent coordenador** na Anthropic com
  `multiagent: { type: 'coordinator', agents: [membros do time] }` — o mesmo
  mecanismo do "Gerente de IA" de hoje, mas **um por time**, com roster
  próprio e a missão no system prompt.
- Editar membros → `agents.update` no coordenador (igual `rosterMudou` hoje).
- **Projeto pode ter como responsável**: um funcionário, "equipe toda"
  (comportamento atual) ou **um Time** (`timeId`) — a sessão roda com o
  coordenador daquele time, que delega só entre os membros dele.

### 1.2 Rotina (trabalho recorrente 24/7)

Uma **Rotina** é um trabalho que se repete sem projeto: "toda manhã, qualificar
os leads novos do CRM", "toda segunda, relatório dos concorrentes", "2x/dia,
rascunhar respostas às perguntas do Mercado Livre".

```ts
interface Rotina {
  id: string;
  nome: string;
  emoji: string;
  responsavelTipo: 'funcionario' | 'time';
  responsavelId: string;
  agenda: string;            // hora local "HH:MM" + dias (ex. seg-sex) → cron
  briefing: string;          // instrução fixa do trabalho
  contexto: ContextoRotina[];// quais dados reais a ponte fornece (ver 2.2)
  acoes: AcaoRotina[];       // o que o agente PODE fazer no sistema (ver 2.3)
  ativa: boolean;
  deploymentId: string | null;  // cron na nuvem (mesmo mecanismo do standup)
  ultimaExecucao: string | null;
}
```

- Mecanismo: **igual ao standup de hoje, generalizado** — `deployments.create`
  com cron; o agente chama uma custom tool para receber o contexto real
  (`obter_contexto` com os blocos configurados) e publica o resultado
  (`publicar_resultado`). A ponte detecta runs por polling com dedupe.
- Cada execução vira um item no **feed de Rotinas** do painel (+ Telegram
  opcional) e pode disparar **ações estruturadas** (2.3).

### 1.3 Fluxo (esteira que liga agentes/times)

Um **Fluxo** é uma sequência de estágios que o dono monta — a "ligação" entre
agentes que ele pediu para poder configurar quando quiser:

```ts
interface Fluxo {
  id: string;
  nome: string;              // "Comercial completo", "Operação ML", "Conteúdo"
  emoji: string;
  estagios: EstagioFluxo[];
  ativo: boolean;
}

interface EstagioFluxo {
  id: string;
  nome: string;              // "Captação", "Proposta", "Desenvolvimento", "Entrega"
  responsavelTipo: 'funcionario' | 'time';
  responsavelId: string;
  instrucao: string;         // o que fazer NESTE estágio (além da carga recebida)
  aprovacao: 'manual' | 'automatica'; // manual = dono revisa antes de passar adiante
}

interface ExecucaoFluxo {     // uma "descida" pela esteira
  id: string;
  fluxoId: string;
  titulo: string;            // ex. "Lead: Padaria do João"
  estagioAtual: number;
  status: 'em_andamento' | 'aguardando_aprovacao' | 'concluida' | 'cancelada';
  carga: CargaEstagio[];     // histórico: saída de cada estágio (ver 2.1)
  origem: { tipo: 'manual' | 'rotina' | 'crm'; refId?: string };
}
```

---

## 2. Como os agentes conversam entre si (o coração do sistema)

Há **dois mecanismos complementares**, cada um bom para uma coisa:

### 2.1 Dentro de um time — conversa em tempo real (threads na mesma sessão)

Quando um projeto/estágio é de um **Time**, a sessão roda com o **Agent
coordenador** daquele time. A conversa acontece **dentro da nuvem da
Anthropic**, via threads multiagente:

```
Sessão do projeto (1 sessão, N threads)
┌─────────────────────────────────────────────┐
│  Coordenador do "Time App X"                │
│  ├─ 📤 thread → Bia (backend): "faça a API" │
│  ├─ 📤 thread → Léo (front): "faça a tela"  │
│  ├─ 📥 Bia devolve: código + resumo         │
│  ├─ 📥 Léo devolve: código + resumo         │
│  └─ consolida, reporta progresso, entrega   │
└─────────────────────────────────────────────┘
```

- O coordenador **quebra a spec em tarefas e delega**; cada membro trabalha
  com a própria persona, skills e **memória individual**.
- O log de Atividade mostra as delegações (📤 Gerente → Bia) e retornos (📥)
  — isso já existe hoje no "Gerente de IA"; os Times generalizam para
  quantos squads o dono quiser.
- Custo: somado por thread ao final (reconciliação que já existe).
- **Bom para**: trabalho paralelo e coordenado num mesmo objetivo (um projeto,
  um estágio complexo). Tudo acontece numa tacada, sem esperar humano.

### 2.2 Entre estágios de um fluxo — handoff orquestrado pela ponte

Entre estágios, quem faz o correio é a **ponte local** (nosso servidor). Cada
estágio é uma **sessão separada**, e a saída de um vira a entrada do próximo:

```
Estágio 1: Captação          Estágio 2: Proposta         Estágio 3: Execução
(funcionário Comercial)      (funcionário Comercial)     (Time App X)
┌──────────────────┐  carga  ┌──────────────────┐  carga ┌──────────────────┐
│ qualifica leads  │ ──────▶ │ gera proposta    │ ─────▶ │ coordenador      │
│ do CRM, resume   │  (JSON  │ em PDF calibrada │  (spec │ delega e o time  │
│ quem está quente │  + MD)  │ pelo histórico   │  + PDF)│ desenvolve       │
└──────────────────┘         └──────────────────┘        └──────────────────┘
        │                            │                          │
        ▼ (aprovação manual?)        ▼ (dono envia ao cliente)  ▼ QA → entrega
```

A **carga** (`CargaEstagio`) padroniza o que passa adiante:

```ts
interface CargaEstagio {
  estagioId: string;
  resumo: string;            // markdown produzido pelo agente ao concluir
  dados?: Record<string, unknown>; // campos estruturados (ex. lead, valor, prazo)
  arquivos?: string[];       // caminhos em server/data/fluxos/<execucao>/
  custoUSD: number;
  concluidoEm: string;
}
```

- Ao concluir um estágio (sessão fica idle com `end_turn`), a ponte:
  1. baixa os outputs e o resumo final;
  2. se `aprovacao: 'manual'` → status `aguardando_aprovacao`, aparece no
     painel (e Telegram) com botões **Aprovar e passar adiante / Refazer com
     feedback / Cancelar**;
  3. se `automatica` (ou aprovado) → monta o kickoff do próximo estágio =
     instrução do estágio + **toda a carga acumulada** + anexos.
- **Bom para**: processos com etapas de natureza diferente, custo/QA/log
  separados por etapa, e **pontos de controle humano** entre elas (dinheiro
  só se move com o dono aprovando).

### 2.3 Ações estruturadas — agentes mexendo no sistema (com limites)

Rotinas e estágios podem receber **custom tools de ação** que a ponte executa
localmente — é assim que "o agente de captação alimenta o CRM de verdade":

| Ação (custom tool) | O que faz | Guard-rail |
|---|---|---|
| `criar_oportunidade` | cria lead/oportunidade no CRM | sempre permitido |
| `mover_oportunidade` | avança/perde no funil | sempre permitido |
| `disparar_fluxo` | inicia uma ExecucaoFluxo (ex. lead quente → fluxo comercial) | só se a rotina tiver a ação habilitada |
| `criar_rascunho_projeto` | cria projeto `rascunho` pré-preenchido | dono ainda revisa e inicia |
| `registrar_nota_cliente` | anota no cliente do CRM | sempre permitido |

O dono escolhe **quais ações cada rotina/estágio pode usar** no cadastro
(checkboxes). Nada de agente iniciando projeto ou gastando dinheiro sozinho:
**criar é permitido, iniciar/pagar é sempre humano**.

### 2.4 Exemplo completo 1 — Fluxo comercial (o do vídeo da WeStack)

1. **Rotina "Caçador"** (funcionário Comercial, seg–sex 08:00): lê os leads e
   oportunidades do CRM (`obter_contexto: crm`), qualifica, anota os quentes
   (`registrar_nota_cliente`) e para os muito quentes **dispara o fluxo
   "Comercial"** (`disparar_fluxo`).
2. **Fluxo "Comercial"**:
   - Estágio *Proposta* (Comercial): gera proposta em PDF calibrada pelo
     histórico real (mecanismo que já existe) → **aprovação manual** (você
     revisa e envia ao cliente).
   - Estágio *Contrato* (Comercial): cliente topou? você aprova → o agente
     monta o rascunho do projeto (`criar_rascunho_projeto`) com spec
     pré-preenchida da conversa toda.
   - Estágio *Execução* (**Time do projeto** — você escolhe qual na
     aprovação): o coordenador delega, o time desenvolve, QA automático roda.
   - Estágio *Entrega*: fica `aguardando_revisao` como hoje → você entrega →
     contas a receber → caixa (nada muda no financeiro).
3. Tudo aparece no **feed** e na cena (bonecos trabalhando de verdade).

### 2.5 Exemplo completo 2 — Time "Mercado Livre"

1. **Time "Mercado Livre"** com 2 funcionários: *Anúncios* (persona de
   catálogo/SEO ML) e *Atendimento* (persona de pós-venda).
2. **Rotina 2x/dia** (time): ler perguntas abertas e reclamações →
   **rascunhar** respostas → aprovação manual em lote no painel.
3. **Rotina semanal** (Anúncios): auditar títulos/descrições/atributos dos
   anúncios → propor edições (diff no painel) → você aprova → aplica.
4. ⚠️ **Integração real com a API do Mercado Livre é uma fase própria** (F-ML):
   exige app/credenciais do ML (OAuth do vendedor), endpoints de perguntas,
   itens e mensagens, e fica atrás de aprovação manual SEMPRE no início.
   Até lá, a rotina trabalha com dados exportados/colados manualmente.

---

## 3. Gestão profissional (menos jogo, mais SaaS)

A cena isométrica **fica** — é a vitrine e o diferencial. O que muda é a
**camada de gestão** no modo real:

- **Shell de painel**: no `?empresa=1`, os painéis saem do "cartão de jogo"
  (borda pixel, emojis grandes, gradientes) e entram num **dashboard**
  com **sidebar à esquerda** (Visão geral · Projetos · Equipe & Times ·
  Rotinas & Fluxos · CRM · Financeiro · Relatórios) ocupando a tela toda,
  com a cena acessível por um botão "🏢 Escritório" (e continua atrás,
  visível num split opcional).
- **Linguagem visual**: fundo neutro (claro/escuro sóbrio), tipografia
  system-ui/Inter, tabelas densas com linhas finas, cards brancos com sombra
  leve, número grande + label pequeno (KPI), badges discretos de status,
  botões sólidos de 1 cor. Emojis só como ícones pequenos de navegação.
- **Zero mudança no jogo normal** (sem `?empresa=1` nada disso carrega).

Implementação: classe `painel-pro` no `<body>` no modo real + `css/painel.css`
próprio; os painéis existentes (ui-real) são re-agrupados no shell (conteúdo
aproveitado, estilo trocado).

---

## 4. Fases de entrega

| Fase | Entrega | Verificação |
|---|---|---|
| **T0 — Este plano** | doc versionado + referência no PRD §6.1 | — |
| **T1 — Times** | entidade + CRUD `/api/times` + coordenador por time + select no wizard + painel de times | criar time de 2, projeto com o time, log mostra delegação entre os 2 membros |
| **T2 — Rotinas** | entidade + CRUD + deployment/cron genérico + feed no painel + ações `criar_oportunidade`/`registrar_nota_cliente` | rotina de teste roda no horário e publica no feed; lead aparece no CRM |
| **T3 — Fluxos** | entidade + builder simples (lista de estágios) + orquestração de handoff com aprovação manual + `disparar_fluxo`/`criar_rascunho_projeto` | fluxo de 2 estágios: saída do 1º chega como entrada do 2º após aprovação |
| **T4 — Painel profissional** | shell dashboard (sidebar + tela cheia) + restyle dos painéis | screenshot antes/depois; jogo normal intocado (`npm run check`) |
| **F-ML (futuro)** | OAuth Mercado Livre + perguntas/itens reais | responder pergunta real com aprovação manual |

Ordem: **T1 → T2 → T3 → T4** (cada uma commitada e testável sozinha;
`npm --prefix server run check` + `npm run check` verdes em todas).

## 5. Riscos e guard-rails

- **Custo**: rotinas em cron gastam sozinhas → toda rotina mostra custo/mês
  estimado e entra no limite diário global (pausa automática já existente).
- **Autonomia**: ações estruturadas só criam/anotam; iniciar projeto, mover
  dinheiro e enviar coisas para clientes é **sempre** clique do dono.
- **Complexidade de UI**: o builder de fluxos da T3 é uma lista vertical de
  estágios (sem canvas/drag-drop na v1).
- **Mercado Livre**: nada de credencial ML até a F-ML; rotinas trabalham com
  dados fornecidos manualmente até lá.
