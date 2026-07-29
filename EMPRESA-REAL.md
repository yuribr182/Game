# 🏢 Agência Real — como rodar

> **Pivô 2026-07-28: este é o modo ÚNICO.** O jogo simulado foi aposentado —
> a interface abre direto na agência (não precisa mais de `?empresa=1`).

A **Agência Real** é a cena isométrica animada onde os funcionários são
**agentes de IA de verdade** (Claude Managed Agents, na nuvem da Anthropic)
que executam projetos reais que você cadastra, com um financeiro de agência de
verdade (contas a receber, custos fixos, DRE), times, rotinas 24/7 e fluxos.

O plano completo com a arquitetura está em
[`docs/PLANO-EMPRESA-REAL.md`](docs/PLANO-EMPRESA-REAL.md).

## O que você precisa

| Requisito | Para quê |
|---|---|
| **Node 20+** e npm | rodar o front (Vite) e a ponte local (`server/`) |
| **Chave da API da Anthropic** (`sk-ant-…`) | os funcionários-agentes trabalham em sessões na nuvem — [console.anthropic.com](https://console.anthropic.com) → API Keys |
| **PAT do GitHub** (opcional) | só para projetos do tipo *código* (o agente clona, commita, faz push e **abre PR**). Fine-grained, com `Contents: Read and write` — e `Pull requests: Read and write` para os PRs — no(s) repo(s) do projeto |
| **Bot do Telegram** (opcional) | notificações no celular: projeto pronto, agente travado, conta vencendo, limite de custo e o standup matinal |

> 💸 **Custo real:** cada projeto consome tokens da API (aparece em R$ nos
> cards e no financeiro). Há limites com pausa automática — ver "Limites de
> custo" abaixo.

## Instalação (uma vez)

```bash
npm install                 # raiz (front)
npm --prefix server install # ponte local
cp server/.env.example server/.env
```

Edite `server/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...   # obrigatória
GITHUB_TOKEN=github_pat_...    # só para projetos de código
TELEGRAM_BOT_TOKEN=...         # opcional — notificações no celular (crie com o @BotFather)
TELEGRAM_CHAT_ID=...           # opcional — mande "oi" pro bot e pegue em /getUpdates
ML_CLIENT_ID=...               # opcional — rotinas respondendo/editando no Mercado Livre
ML_CLIENT_SECRET=...
ML_REFRESH_TOKEN=...           # rotaciona sozinho: a ponte guarda o mais novo
META_ACCESS_TOKEN=...          # opcional — rotina publicando posts no Instagram
META_IG_USER_ID=...
GOOGLE_ADS_...=                # opcionais — CSV p/ Ads Editor funciona SEM chave
PORTA=3777                     # porta da ponte (padrão)
```

O `server/.env.example` traz todos os campos comentados — campos vazios só
desligam a integração correspondente (nada quebra sem eles).

## Rodar

```bash
npm run empresa
```

Isso sobe **ponte + front juntos**. Depois abra:

```
http://localhost:5173/Game/
```

A interface abre **direto no escritório** (sem tela inicial). Para renomear a
agência, clique no nome dela no topo.

## Primeiro uso (passo a passo)

1. **Contrate um funcionário** — aba **Equipe → + Contratar**: dê um nome (vai
   aparecer sobre o boneco), escolha o cargo visual, marque as especialidades,
   escolha o modelo (Opus 5 é o padrão; Sonnet/Haiku são mais baratos) e
   escreva a persona. Salvar cria o **Agent na Anthropic** e o boneco entra na
   cena (fora do computador, porque ainda não tem projeto).
2. **Cadastre um projeto** — aba **Projetos → + Novo Projeto**: wizard em 4
   passos (contrato → especificação → entrega → revisão). No passo 3 você
   decide se liga o **🔎 QA automático** (padrão: ligado) e, em projetos de
   código, se o agente **abre Pull Request** ao final. No passo 4 você vê
   exatamente o texto que o agente vai receber. Salvar cria um **rascunho**.
3. **Inicie** — botão **🚀 Iniciar** no card. Isso registra a venda, cria a
   sessão na nuvem e envia a spec (com QA ligado, ela vira uma **meta com
   rubrica**: um revisor independente avalia cada rodada contra os critérios de
   aceite e devolve o feedback ao funcionário — até 3 rodadas — antes de chegar
   em você). O boneco senta e começa a digitar; a barra anda conforme ele
   reporta etapas; o balão mostra a etapa atual; o custo de API sobe em tempo
   real no card.
4. **Acompanhe / converse** — clique no boneco (ou botão **📡 Atividade**) para
   ver o log ao vivo (as linhas roxas 🔎 são o QA) e **mandar mensagem para o
   agente no meio do trabalho**. Dá para **⏸ Pausar** e **▶️ Retomar com
   feedback** (com QA ligado, o feedback vira uma nova meta re-avaliada).
5. **Entregue** — quando o projeto ficar *👀 aguardando revisão* (com o selo do
   QA e, se for código, o link **🔀 Pull Request** no card), revise e clique
   **📦 Entregar**: os arquivos produzidos são baixados para
   `server/data/entregas/<projeto>/`, a sessão é arquivada e as **contas a
   receber** são geradas (à vista ou entrada + parcelas).
6. **Receba** — aba **💰 Financeiro → A receber → Receber**: só aí o caixa do
   HUD sobe (regime de caixa, como uma agência de verdade).

## Automação (F4)

- **🔎 QA automático por projeto** — os critérios de aceite do wizard viram a
  rubrica de um revisor com contexto independente. Reprovou? O funcionário
  recebe o feedback e revisa sozinho (o card mostra a rodada). O selo do card
  ao chegar em *aguardando revisão* diz se foi **aprovado no QA**.
- **📋 Standup matinal** — um agente "Gerente de Operações" roda todo dia no
  horário configurado (padrão **09:00**, cron na nuvem — dispara mesmo com a
  ponte desligada; ela sincroniza ao religar). Ele lê os dados reais de
  ontem/hoje e publica o **Relatório matinal** no topo da aba Projetos (e no
  Telegram). Teste na hora com o botão **▶️ Rodar standup agora**.
- **📱 Telegram** — com o bot configurado, você recebe no celular: projeto
  pronto para revisão (com link do PR), projeto falhou/travado esperando você,
  conta a receber vencendo/atrasada, limite de custo estourado e o standup.
- **🔀 Pull Request real** — em projetos de código o agente termina abrindo um
  PR de verdade da branch de trabalho para a branch padrão (o token nunca sai
  do proxy — o agente não vê credenciais). O link aparece no card e na
  notificação.
- **🧠 Memória por funcionário** — cada funcionário tem uma memória
  profissional na nuvem, montada em toda sessão: ele lê as lições dos projetos
  anteriores antes de começar e registra novas ao concluir. Quanto mais
  projetos, melhor ele fica.

## Vida de agência

- **🎯 Meta de vendas do mês** — defina no card da **Visão geral** do
  Financeiro. Cada projeto iniciado é uma venda: **toca o sino** e um cliente
  entra na cena fechar negócio. Bateu a meta? **Fanfarra, chuva de confete e a
  equipe comemora** (1 vez por mês) — e chega no Telegram.
- **📺 Modo TV** — botão no topo do Financeiro (ou abra direto
  `…?tv=1` num monitor dedicado): tela cheia com relógio, caixa, a
  receber, vendas × meta, custo de API de hoje, os projetos com barras ao vivo
  e a manchete do standup. `Esc` sai.
- **📈 Linha do tempo do projeto** — no modal de Atividade: cada etapa
  reportada vira uma linha com horário real e duração, e o ritmo é extrapolado
  numa **previsão de conclusão** comparada ao prazo (✅ dentro / ⚠️ estoura).
- **📊 Senioridade real** — o card do funcionário mostra o nível dele pela
  carreira de verdade (🌱 Novato → 🥉 Batalhador → 🥈 Referência → 🥇 Veterano
  → 🏆 Lenda), a taxa de aprovação no QA e o custo médio por projeto.
- **🧲 CRM com funil comercial** — sub-aba **CRM** do Financeiro: cadastre
  clientes (contato, origem) e oportunidades que andam no funil **lead →
  proposta → fechado** (ou perdido/reabrir). Cada cliente mostra o **LTV real**
  (soma dos contratos dos projetos dele) e quantos projetos já entregou. Uma
  oportunidade fechada tem o botão **📋 Virar projeto**, que abre o wizard já
  pré-preenchido.
- **🏆 Conquistas reais** — no fim da aba Equipe: 8 marcos de verdade
  (primeira entrega, selo do QA, 1º Pull Request, R$ 10 mil recebidos, mês no
  azul, time de 3, meta batida, cliente fiel). As bloqueadas aparecem como
  metas 🔒; desbloquear é toast dourado na cena + aviso no Telegram.
- **👥 Gerente de IA (multiagente)** — no wizard, escolha **"Equipe toda"**
  como responsável: um Agent coordenador recebe a spec, **quebra em tarefas e
  delega para os seus funcionários** (cada um com as próprias especialidades e
  memória). O log de Atividade mostra as delegações (📤 Gerente → Bia) e os
  retornos (📥); na cena, quem estiver livre senta e trabalha junto. O custo
  dos subagentes é somado ao projeto no fim.
- **🤖 Propostas em PDF** — nos cards de lead/proposta do CRM, o botão
  **Gerar proposta (PDF)** chama o agente Comercial: ele recebe a oportunidade,
  o cliente e o **histórico real de contratos/custos** para calibrar preço e
  prazo, e devolve um PDF pronto (link de download no card, arquivo em
  `server/data/propostas/`).
- **🖥️ Monitor ao vivo** — dê zoom num funcionário trabalhando: o boneco ganha
  um mini-terminal verde com as **linhas reais da sessão** correndo (com
  cursor piscando e tudo).

## Financeiro

A aba **💰 Financeiro** (substitui a aba Empresa no modo real) tem:

- **Visão geral** — caixa, a receber, atrasadas, vencendo em 7 dias, mini-DRE do mês;
- **Vendas** — contratos fechados, ticket médio, por cliente;
- **A receber** — parcelas com vencimento; atrasadas ficam marcadas;
- **Custos** — custos fixos recorrentes (servidor, ferramentas…) lançados
  automaticamente no vencimento + custo de API por funcionário;
- **Relatórios** — fluxo de caixa mensal, DRE, margem por projeto;
- **Livro-razão** — todos os lançamentos, com exportação CSV.

## Limites de custo

Em `server/data/config.json` (ou via `PUT /api/config`):

| Campo | Padrão | Efeito |
|---|---|---|
| `cambioUsdBrl` | 5.40 | conversão do custo de API para R$ |
| `limiteDiarioUSD` | 25 | estourou a soma do dia (projetos + standup) → **pausa todos** os projetos |
| `limitePorProjetoUSD` | 50 | estourou num projeto → **pausa aquele projeto** |
| `standupAtivo` | true | liga/desliga o cron do relatório matinal |
| `standupHora` | "09:00" | horário local do standup (mudar recria o cron na nuvem) |
| `metaMensalBRL` | 0 | meta de vendas do mês (0 = desligada) — editável pelo card 🎯 da Visão geral |

## Onde ficam os dados

Tudo local, em `server/data/` (**gitignored** — specs, financeiro e chave nunca
vão para o repositório público): cadastros em JSON, livro-razão em NDJSON
(append-only, auditável), logs de atividade por projeto e as entregas baixadas.
Backup = copiar a pasta.

## Problemas comuns

| Sintoma | Causa / solução |
|---|---|
| Overlay "🔌 A ponte está desligada" | a ponte não está rodando — `npm run empresa` (ou `npm --prefix server run dev`) |
| Erro "ANTHROPIC_API_KEY ausente" ao contratar | preencha `server/.env` e reinicie a ponte |
| Projeto de código não inicia | falta `GITHUB_TOKEN` no `server/.env`, ou o `repoUrl` não é `https://github.com/...` |
| Projeto pausou sozinho | limite de custo estourado (veja o alerta/toast) — ajuste os limites e **Retomar** |
| Ponte caiu no meio de um trabalho | pode religar sem medo: a sessão continua na nuvem e a ponte **reconcilia** os eventos sem duplicar nada |
| Standup não apareceu no painel | o cron dispara na nuvem e a ponte detecta em até ~5 min; confira `standupAtivo`/`standupHora` em `GET /api/config` ou use **▶️ Rodar standup agora** |
| Nada chega no Telegram | preencha `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` no `server/.env` e reinicie; mande um "oi" para o bot antes (ele não pode iniciar conversa) |
| Agente não abriu o PR | o PAT precisa de `Pull requests: Read and write`; a branch de trabalho não pode ser a branch padrão (o agente cria `entrega/...` sozinho se for) |

## Checks e testes

```bash
npm run check                  # jogo (typecheck + lint + 55 testes + build)
npm --prefix server run check  # ponte (typecheck + 46 testes)
```

O modo real roda 100% em dev local. O GitHub Pages continua servindo só o jogo
normal — lá o modo real mostra o overlay de ponte desligada, por desenho.
