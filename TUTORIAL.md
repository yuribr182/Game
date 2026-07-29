# 📘 Tutorial completo — como trabalhar no seu projeto

> Este é o guia "de tudo": o que **depende de você**, como **operar a agência**
> no dia a dia e como **desenvolver** o projeto (pedir mudanças, testar,
> publicar). Guarde este arquivo como referência.

---

## 1. O que é o projeto (visão de 1 minuto)

> ⚠️ **Pivô (2026-07-28): não é mais um jogo.** A simulação foi removida.

A **Agência Real** é a sua agência de verdade com uma identidade única: um
escritório isométrico **animado** onde cada personagem é um **funcionário-agente
de IA real** (Claude, na nuvem da Anthropic) executando **projetos reais** —
com CRM, financeiro de agência, times, rotinas 24/7 e fluxos entre agentes.
**Tudo que aparece na tela é informação real** (caixa, contas, custo de API,
data/hora). Roda **só no seu computador** (`npm run empresa`) — dados e chave
nunca vão para a internet.

---

## 2. ✅ O que DEPENDE DE VOCÊ (checklist)

### 2.1 Uma vez só (setup)

| # | O quê | Como | Obrigatório? |
|---|---|---|---|
| 1 | **Node 20+** instalado | https://nodejs.org | ✅ Sim |
| 2 | **Clonar e instalar** | `git clone` → `npm install` → `npm --prefix server install` | ✅ Sim |
| 3 | **Chave da API da Anthropic** (`sk-ant-…`) | [console.anthropic.com](https://console.anthropic.com) → API Keys → colar em `server/.env` | ✅ Sim (💸 **custa dinheiro por uso** — veja limites em 4.8) |
| 4 | **PAT do GitHub** (fine-grained) | GitHub → Settings → Developer settings → Fine-grained tokens, com `Contents: Read and write` **e** `Pull requests: Read and write` nos repos dos projetos | Só para projetos de **código** (o agente clona, commita e abre PR) |
| 5 | **Bot do Telegram** | Criar com o @BotFather → token + chat id em `server/.env` | Opcional (notificações no celular) |
| 6 | **Conta Mercado Livre (futuro)** | Quando formos integrar a operação ML de verdade: criar um app em developers.mercadolivre.com.br e autorizar via OAuth | Ainda não — fase F-ML do plano |

O arquivo `server/.env` (copie de `server/.env.example`):

```env
ANTHROPIC_API_KEY=sk-ant-...   # obrigatória p/ Empresa Real
GITHUB_TOKEN=github_pat_...    # só p/ projetos de código
TELEGRAM_BOT_TOKEN=...         # opcional
TELEGRAM_CHAT_ID=...           # opcional (mande "oi" pro bot e pegue em /getUpdates)
PORTA=3777
```

### 2.2 No dia a dia (as decisões são SEMPRE suas)

Os agentes **nunca** fazem isto sozinhos — o sistema espera o seu clique:

- 🚀 **Iniciar** um projeto (rascunhos criados por agentes ficam esperando você);
- ✅ **Aprovar** um estágio de fluxo marcado com 👀 ("Aprovar e passar adiante");
- 📦 **Entregar** um projeto (gera as contas a receber);
- 💵 **Receber** uma conta (só aí o caixa sobe — regime de caixa);
- 📤 **Enviar** qualquer coisa a um cliente (proposta em PDF, mensagens);
- ⚙️ Ajustar **limites de custo** e **meta mensal** quando quiser.

---

## 3. 🚀 Rodando

```bash
# A agência (ponte + interface juntas) — o jeito normal de abrir:
npm run empresa        # abrir http://localhost:5173/Game/

# Modo TV (telão da agência num monitor dedicado):
#   http://localhost:5173/Game/?tv=1   (Esc sai)
```

- A interface abre **direto no escritório** — sem tela inicial.
- O painel de gestão é a **gaveta à direita**; o botão **⛶** na barra de abas
  expande para a tela toda (visual profissional); **🏢** volta ao escritório.
- **Renomear a agência**: clique no nome dela no topo (HUD).
- Overlay "🔌 A ponte está desligada"? → rode `npm run empresa`.

---

## 4. 🏢 Operando a agência (Modo Empresa Real)

### 4.1 Contratar funcionários (aba Equipe → + Contratar)

Dê um **nome**, escolha o **cargo visual** (roupa do boneco), marque as
**especialidades** (viram o cérebro do agente), escolha o **modelo** (Opus 5 =
melhor; Sonnet/Haiku = mais baratos) e escreva a **persona** (como ele
trabalha). Salvar cria o agente na nuvem — o boneco aparece na cena.

> 💡 Cada funcionário tem **memória profissional**: aprende de projeto em
> projeto. E o card mostra a senioridade real dele (🌱→🏆), taxa de aprovação
> no QA e custo médio.

### 4.2 Montar times (aba Equipe → Times → + Novo time)

Times são **squads por demanda**: "Time do Projeto X", "Time Mercado Livre"…
Escolha nome, **missão** e **membros**. Cada time ganha um **coordenador de IA**
que delega o trabalho só entre os membros daquele time. Monte e arquive quantos
quiser — nada é fixo.

### 4.3 Cadastrar e tocar projetos (aba Projetos)

1. **+ Novo Projeto** → wizard em 4 passos (contrato → especificação →
   entrega → revisão). No responsável você escolhe **um funcionário, um Time
   ou a Equipe toda**.
2. **🚀 Iniciar** no card → registra a venda (sino 🔔), o(s) boneco(s) sentam
   e trabalham de verdade; a barra anda conforme o agente reporta etapas; o
   custo de API sobe ao vivo.
3. **Clique no boneco** (ou 📡 Atividade) → log ao vivo + **chat com o agente**
   no meio do trabalho. Dá para ⏸ Pausar e ▶️ Retomar com feedback.
4. **🔎 QA automático** (padrão ligado): um revisor independente avalia cada
   rodada contra os critérios de aceite antes de chegar em você.
5. Projeto *👀 aguardando revisão* → confira (e o PR, se código) → **📦
   Entregar** → arquivos baixados em `server/data/entregas/`, contas a receber
   geradas.
6. **💰 Financeiro → A receber → Receber** → o caixa sobe.

### 4.4 Rotinas 24/7 (aba Projetos → Rotinas)

Trabalho recorrente sem projeto: **+ Nova rotina** → responsável (funcionário
ou time), **horário/dias**, **briefing**, quais **dados reais** o agente recebe
(CRM / projetos / financeiro) e quais **ações** pode executar:

- 🧲 Criar oportunidade no CRM
- 📝 Anotar em cliente
- 📋 Criar rascunho de projeto (você revisa e inicia)
- 🔗 Disparar fluxo (encaminha um caso para uma esteira)

O cron roda **na nuvem** (dispara mesmo com seu computador desligado; a ponte
sincroniza ao religar). Resultado no **feed** + Telegram. Botão **▶️ Rodar
agora** testa na hora.

> 💡 Exemplo pronto: rotina "Caçador de leads" (Comercial, seg–sex 08:00,
> contexto CRM, ações criar_oportunidade + registrar_nota_cliente).

### 4.5 Fluxos — agentes passando trabalho entre si (aba Projetos → Fluxos)

A esteira que liga tudo: **+ Novo fluxo** → estágios em sequência, cada um com
**responsável** (funcionário ou time), **instrução** e **como passa adiante**
(👀 com sua aprovação, ou ⚡ automático).

- **🚀 Disparar** cria uma execução (dê um título + contexto inicial);
- A saída de cada estágio (resumo + arquivos) **vira a entrada do próximo**;
- Entre estágios 👀, os botões são seus: **✅ Aprovar e passar adiante · 🔧
  Refazer com feedback · 🚫 Cancelar**;
- No **CRM**, toda oportunidade tem **🔗 Disparar fluxo** com os dados do
  cliente já preenchidos.

> 💡 Exemplo de esteira comercial: Captação (Comercial) 👀 → Proposta
> (Comercial) 👀 → Execução (Time do projeto) 👀 → você entrega e recebe.

### 4.6 CRM (aba Financeiro → CRM)

Clientes + funil (lead → proposta → fechado). Cada card tem **🤖 Gerar
proposta (PDF)** (o agente Comercial calibra preço pelo seu histórico real),
**📋 Virar projeto** e **🔗 Disparar fluxo**. Clientes mostram LTV real.

### 4.7 Standup e Modo TV

- **📋 Standup matinal** (09:00 por padrão): o Gerente de Operações lê os dados
  reais e publica o relatório no painel + Telegram.
- **📺 Modo TV**: KPIs grandes, meta do mês, projetos ao vivo — para deixar num
  monitor.

### 4.8 💸 Custos e limites (importante!)

Cada projeto/rotina/fluxo consome tokens da API (aparece em R$ nos cards e no
financeiro). Proteções automáticas em `server/data/config.json` (ou card ⚙️):

| Limite | Padrão | Efeito ao estourar |
|---|---|---|
| `limiteDiarioUSD` | US$ 25/dia | pausa TODOS os projetos |
| `limitePorProjetoUSD` | US$ 50/projeto | pausa AQUELE projeto |

Rotinas e fluxos contam no limite diário. Ajuste como quiser — e você recebe
alerta no painel/Telegram quando estourar.

### 4.9 Seus dados

Tudo local em **`server/data/`** (gitignored — nunca sobe pro GitHub):
cadastros em JSON, livro-razão em NDJSON, entregas, propostas, execuções de
fluxo. **Backup = copiar a pasta.**

---

## 5. 🤝 Receita pronta: agentes trabalhando entre si, 24/7

> O exemplo abaixo monta uma **operação completa e recorrente**: atendimento
> de Mercado Livre + captação de clientes + execução + campanhas de marketing
> para Google e Instagram. É copiar, colar e ajustar ao seu negócio.
>
> ⚠️ **Honestidade primeiro**: hoje os agentes **produzem tudo pronto**
> (respostas, propostas, anúncios, posts) e **você aprova e publica** — a
> publicação automática dentro do Mercado Livre/Google/Instagram exige as
> integrações de API de cada plataforma (fase F-ML do roadmap, precisa das
> suas credenciais). O ciclo de trabalho entre os agentes já é 100% real.

### Passo 1 — Monte os times (aba Equipe → Times)

Cada time ganha **uma sala no mapa** e um coordenador de IA próprio:

| Time | Membros sugeridos (contrate antes) | Missão (cole no campo) |
|---|---|---|
| 🛒 **Mercado Livre** | 1 Atendimento (persona de pós-venda) + 1 Anúncios (persona de catálogo/SEO ML) | "Operar a conta do Mercado Livre: responder perguntas e reclamações com rapidez e cordialidade, e manter anúncios competitivos (título, descrição, preço)." |
| 🧲 **Comercial** | 1 SDR (persona de vendas consultivas) | "Captar e qualificar leads, nutrir o funil do CRM e preparar propostas que fecham." |
| 📣 **Marketing** | 1 Social (copy) + 1 Performance (copy/pesquisa) | "Criar e otimizar campanhas: anúncios de Google Ads, posts e reels de Instagram, sempre com CTA claro e métricas em mente." |
| 💻 **Execução** | seus devs/designer | "Entregar os projetos vendidos com qualidade, no prazo." |

### Passo 2 — Rotinas recorrentes (aba Projetos → Rotinas)

**Rotina A · "Atendimento Mercado Livre" — 2x ao dia**
- Responsável: 🛒 Time Mercado Livre · Horário: 09:00 (crie uma segunda às 16:00) · Dias: todos
- Contexto: CRM ✓ · Ações: *Anotar em cliente* ✓
- Briefing (cole e ajuste):
  > Você opera a conta do Mercado Livre da loja X. Analise as perguntas e
  > reclamações abaixo do contexto (enquanto a integração de API não chega, o
  > dono cola as pendências nas notas do cliente "Mercado Livre — pendências").
  > Para CADA pergunta: rascunhe a resposta ideal (cordial, direta, que
  > converte). Para reclamações: proponha a tratativa. Liste sugestões de
  > melhoria nos anúncios citados (título/descrição/preço vs. concorrência).
  > Publique tudo organizado para o dono aprovar e colar no ML.

**Rotina B · "Captação de clientes" — seg–sex 08:00**
- Responsável: 🧲 Time Comercial
- Contexto: CRM ✓ + Financeiro ✓ · Ações: *Criar oportunidade* ✓, *Anotar em cliente* ✓, *Disparar fluxo* ✓
- Briefing:
  > Garimpe e qualifique os leads do funil. Classifique cada um
  > (quente/morno/frio) e anote o racional no cliente. Lead QUENTE com fit:
  > crie/atualize a oportunidade e **dispare o fluxo "Cliente novo"** com
  > todo o contexto. Sem inventar contato — trabalhe só com os dados reais.

**Rotina C · "Campanhas Google + Instagram" — seg/qua/sex 10:00**
- Responsável: 📣 Time Marketing
- Contexto: CRM ✓ + Projetos ✓ · Ações: *Anotar em cliente* ✓
- Briefing:
  > Para cada cliente com campanha ativa (veja notas do cliente): produza o
  > pacote do dia — 2 variações de anúncio de Google Ads (títulos ≤30, descrições
  > ≤90 caracteres, palavras-chave), 1 post de feed e 1 roteiro de reel para o
  > Instagram, com legenda e hashtags. Se o dono anotou métricas da rodada
  > anterior, comece otimizando: corte o que não performou e explique o porquê.
  > Entregue tudo pronto para copiar e publicar.

### Passo 3 — O fluxo que liga tudo (aba Projetos → Fluxos)

Crie o fluxo **"Cliente novo"** — é ele que a Rotina B dispara sozinha:

| # | Estágio | Responsável | Instrução (resumo) | Passa adiante |
|---|---|---|---|---|
| 1 | Qualificação | 🧲 Comercial | Aprofundar o lead: necessidade, orçamento, urgência, decisor | 👀 sua aprovação |
| 2 | Proposta | 🧲 Comercial | Escrever a proposta comercial calibrada pelo histórico | 👀 (você envia ao cliente) |
| 3 | Execução | 💻 Execução | Executar o que foi vendido (o coordenador delega no time) | 👀 |
| 4 | Campanha de lançamento | 📣 Marketing | Kit Google + Instagram para lançar a entrega | 👀 |

### Passo 4 — O ciclo rodando (o que acontece sozinho vs. o que é seu)

```
        (cron na nuvem, mesmo com seu PC desligado)
 09:00/16:00  🛒 ML responde pendências  ──► feed + Telegram ──► VOCÊ cola no ML
 08:00        🧲 Captação qualifica      ──► cria oportunidade no CRM
                    └── lead quente ────► 🔗 dispara o fluxo "Cliente novo"
 fluxo        Qualificação 👀 → Proposta 👀 → Execução 👀 → Campanha 👀
 10:00 (3x/sem) 📣 Marketing produz/otimiza anúncios ──► VOCÊ publica e anota métricas
```

- **Sozinho**: rodar no horário, analisar, produzir, criar oportunidades,
  anotar em clientes, disparar o fluxo, passar carga entre estágios.
- **Sempre você (👀)**: aprovar estágios, enviar proposta, publicar
  anúncios/respostas, receber dinheiro.
- **Custo**: cada execução conta no limite diário (padrão US$ 25/dia, com
  pausa automática) — comece com as rotinas em dias úteis e ajuste.

### Dica de retroalimentação

O elo que fecha o ciclo é **anotar resultados no cliente** (funciona hoje):
depois de publicar uma campanha, anote no CRM "CTR 2,1%, 34 cliques, 3
matrículas". Na próxima execução a rotina de Marketing **lê essas notas no
contexto e otimiza** — é assim que os agentes "conversam" com o mundo real
enquanto as integrações diretas (F-ML) não chegam.

---

## 6. 🛠 Desenvolvendo o projeto (mudanças no código)

### 5.1 Fluxo de trabalho com o Claude

O projeto foi feito para você **pedir em português e o Claude executar**:

1. Abra uma sessão do Claude Code no repositório (web, desktop ou terminal).
2. O `CLAUDE.md` dá o contexto automaticamente; o status vive em
   **`docs/PRD.md` §6.1** (basta dizer *"continue do PRD"*).
3. Peça o que quiser: *"adicione um móvel novo"*, *"deixe o jogo mais
   difícil"*, *"crie uma rotina de relatório semanal"*…
4. O Claude roda os checks, tira screenshot e faz commit/push.

**Skills prontas** (atalhos que o Claude usa sozinho): `balancear-jogo`
(economia/ritmo), `novo-movel` (mobília da cena), `testar-jogo` (teste headless
com screenshot).

### 5.2 Se você mesmo for mexer no código

```bash
npm run check                  # typecheck + lint + testes + build (RODE ANTES DE TODO PUSH)
npm --prefix server run check  # checks da ponte (typecheck + testes)
npm run dev                    # dev server com hot-reload
```

Mapa do código:

| Pasta | O quê |
|---|---|
| `src/core/` | Motor do jogo (TypeScript puro, testado — números de balanceamento em `data.ts`) |
| `js/` | Cena isométrica (`iso.js`), arte procedural (`props.js`), som (`audio.js`), painéis do jogo (`ui.js`) |
| `server/` | Ponte do Modo Empresa Real (Fastify + SDK da Anthropic) — agentes, sessões, financeiro, rotinas, fluxos |
| `src/real/` | Front do Modo Empresa Real (adapter da cena + painéis) |
| `css/painel.css` | Tema profissional da gestão (só no modo real) |
| `docs/` | `PRD.md` (status/backlog) · `PLANO-EMPRESA-REAL.md` · `PLANO-TIMES-FLUXOS.md` |
| `test/` e `server/test/` | Testes (Vitest) — 55 do jogo + 70+ da ponte |

Regras de ouro (o CI bloqueia se quebrar):

- **Tudo em pt-BR** (UI, commits, comentários);
- **Save do jogador é sagrado** (mudou formato? bump de versão + migração + teste);
- `src/core/` **não** importa DOM/render (lint bloqueia);
- Toda mudança visual → **screenshot antes do push**.

### 5.3 Publicação (deploy)

- Push na **`master`** → GitHub Actions builda e publica o **jogo** no GitHub
  Pages automaticamente (2–3 min).
- O **Modo Empresa Real nunca vai para o Pages** — é local por desenho (chave
  e dados ficam com você). No site, ele mostra o aviso de ponte desligada.
- Branches: desenvolvimento acontece em branches (`claude/...` ou `dev`);
  merge na `master` quando estiver pronto.

---

## 7. 🧭 Roadmap — o que ainda falta e o que depende de você

| Item | Status | Depende de você? |
|---|---|---|
| Times, Rotinas, Fluxos, painel profissional | ✅ Entregue (2026-07-28) | Usar e dar feedback |
| Disparo de fluxo pelo CRM e por rotinas | ✅ Entregue | — |
| **F-ML: operação Mercado Livre real** (responder perguntas, editar anúncios/preços) | 🔜 Próxima grande fase | **Sim**: criar o app no [developers.mercadolivre.com.br](https://developers.mercadolivre.com.br), me passar client id/secret e autorizar sua conta de vendedor (OAuth). Até lá, o time ML trabalha com dados que você colar. |
| Portal do cliente (link público de acompanhamento) | 💡 Backlog | Decidir se quer |
| Ponte 24/7 num servidor (VPS) — agência roda com o PC desligado | 💡 Backlog | Contratar um VPS (~R$ 25/mês) quando quiser |
| Conciliação financeira (extrato/Pix/NF) | 💡 Backlog | Decidir se quer |

---

## 8. 🆘 Problemas comuns

A tabela completa está em **`EMPRESA-REAL.md`** (seção "Problemas comuns").
Os três mais frequentes:

| Sintoma | Solução |
|---|---|
| "🔌 A ponte está desligada" | `npm run empresa` |
| "ANTHROPIC_API_KEY ausente" | preencher `server/.env` e reiniciar |
| Projeto pausou sozinho | limite de custo estourou — ajuste e clique ▶️ Retomar |

---

*Guias relacionados: [`EMPRESA-REAL.md`](EMPRESA-REAL.md) (passo a passo do
modo real) · [`docs/PLANO-TIMES-FLUXOS.md`](docs/PLANO-TIMES-FLUXOS.md) (como
os agentes conversam entre si) · [`docs/PRD.md`](docs/PRD.md) (status técnico).*
