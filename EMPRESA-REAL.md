# 🏢 Modo Empresa Real — como rodar

O App Agency Tycoon tem dois modos: o **jogo normal** (simulado, publicado no
GitHub Pages) e o **Modo Empresa Real** — a mesma cena isométrica, mas onde os
funcionários são **agentes de IA de verdade** (Claude Managed Agents, na nuvem
da Anthropic) que executam projetos reais que você cadastra, com um financeiro
de agência de verdade (contas a receber, custos fixos, DRE).

O plano completo com a arquitetura está em
[`docs/PLANO-EMPRESA-REAL.md`](docs/PLANO-EMPRESA-REAL.md).

## O que você precisa

| Requisito | Para quê |
|---|---|
| **Node 20+** e npm | rodar o front (Vite) e a ponte local (`server/`) |
| **Chave da API da Anthropic** (`sk-ant-…`) | os funcionários-agentes trabalham em sessões na nuvem — [console.anthropic.com](https://console.anthropic.com) → API Keys |
| **PAT do GitHub** (opcional) | só para projetos do tipo *código* (o agente clona, commita e faz push). Fine-grained, com `Contents: Read and write` no(s) repo(s) do projeto |

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
PORTA=3777                     # porta da ponte (padrão)
```

## Rodar

```bash
npm run empresa
```

Isso sobe **ponte + front juntos**. Depois abra:

```
http://localhost:5173/Game/?empresa=1
```

(ou clique no botão **🏢 Empresa Real** na tela inicial do jogo).

Sem a query `?empresa=1`, o jogo normal continua funcionando como sempre — os
dois modos não se misturam e o save do jogo não é tocado.

## Primeiro uso (passo a passo)

1. **Contrate um funcionário** — aba **Equipe → + Contratar**: dê um nome (vai
   aparecer sobre o boneco), escolha o cargo visual, marque as especialidades,
   escolha o modelo (Opus 5 é o padrão; Sonnet/Haiku são mais baratos) e
   escreva a persona. Salvar cria o **Agent na Anthropic** e o boneco entra na
   cena (fora do computador, porque ainda não tem projeto).
2. **Cadastre um projeto** — aba **Projetos → + Novo Projeto**: wizard em 4
   passos (contrato → especificação → entrega → revisão). No passo 4 você vê
   exatamente o texto que o agente vai receber. Salvar cria um **rascunho**.
3. **Inicie** — botão **🚀 Iniciar** no card. Isso registra a venda, cria a
   sessão na nuvem e envia a spec. O boneco senta e começa a digitar; a barra
   anda conforme ele reporta etapas; o balão mostra a etapa atual; o custo de
   API sobe em tempo real no card.
4. **Acompanhe / converse** — clique no boneco (ou botão **📡 Atividade**) para
   ver o log ao vivo e **mandar mensagem para o agente no meio do trabalho**.
   Dá para **⏸ Pausar** e **▶️ Retomar com feedback**.
5. **Entregue** — quando o projeto ficar *👀 aguardando revisão*, revise e
   clique **📦 Entregar**: os arquivos produzidos são baixados para
   `server/data/entregas/<projeto>/`, a sessão é arquivada e as **contas a
   receber** são geradas (à vista ou entrada + parcelas).
6. **Receba** — aba **💰 Financeiro → A receber → Receber**: só aí o caixa do
   HUD sobe (regime de caixa, como uma agência de verdade).

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
| `limiteDiarioUSD` | 25 | estourou a soma do dia → **pausa todos** os projetos |
| `limitePorProjetoUSD` | 50 | estourou num projeto → **pausa aquele projeto** |

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

## Checks e testes

```bash
npm run check                  # jogo (typecheck + lint + 55 testes + build)
npm --prefix server run check  # ponte (typecheck + 31 testes)
```

O modo real roda 100% em dev local. O GitHub Pages continua servindo só o jogo
normal — lá o modo real mostra o overlay de ponte desligada, por desenho.
