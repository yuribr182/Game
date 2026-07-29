# 🏢 Agência Real — escritório vivo de agentes de IA

> 📘 **Novo por aqui? Leia o [TUTORIAL.md](TUTORIAL.md)** — o guia completo:
> o que depende de você (chaves, tokens, aprovações), como operar a agência e
> como desenvolver o projeto.

**Não é um jogo.** É a sua agência de verdade, com uma cara única: um
**escritório isométrico animado** onde cada personagem é um **funcionário-agente
de IA real** (Claude, na nuvem da Anthropic) trabalhando em **projetos reais**
que você cadastra — e tudo que aparece na tela é informação real: caixa,
contas, clientes, custo de API, data e hora.

> O projeto nasceu como o jogo *App Agency Tycoon* e foi **pivotado em
> 2026-07-28**: a temática e a animação ficaram; a simulação foi removida.

## O que você vê

- 🏙️ **Cena viva**: funcionários andam, sentam, digitam (com **balões** da
  etapa real que estão executando e um **mini-terminal ao vivo** com zoom),
  clientes entram na recepção quando uma venda fecha, dia/noite acompanha o
  **relógio real**.
- 📋 **Projetos reais**: wizard de especificação, progresso reportado pelo
  agente, QA automático, Pull Request de verdade em projetos de código, chat
  com o funcionário no meio do trabalho.
- 👥 **Equipe e Times**: contrate agentes com persona/especialidades, monte
  **squads por demanda** — o coordenador do time delega entre os membros.
- 🔁 **Rotinas 24/7**: trabalhos recorrentes com cron na nuvem (qualificar
  leads toda manhã, relatórios…), com ações no CRM sob guard-rails.
- 🔗 **Fluxos**: esteiras ligando agentes/times (captação → proposta →
  execução → entrega) com **sua aprovação** entre estágios.
- 💰 **Financeiro de agência**: vendas, contas a receber (regime de caixa),
  custos fixos + custo de API ao vivo, DRE, margem por projeto, CRM com funil,
  propostas em PDF geradas por agente, standup matinal e Modo TV.

## Como rodar

```bash
npm install && npm --prefix server install
cp server/.env.example server/.env    # coloque sua ANTHROPIC_API_KEY
npm run empresa                        # ponte + interface
# abra http://localhost:5173/agencia/
```

Tudo roda **100% na sua máquina**: a chave da API e os dados da agência ficam
em `server/data/` (gitignored). Sem a ponte rodando, a interface mostra o
overlay "🔌 A ponte está desligada".

## Qualidade

```bash
npm run check                  # typecheck + lint + testes + build (front)
npm --prefix server run check  # typecheck + testes (ponte)
```

Documentação: [`TUTORIAL.md`](TUTORIAL.md) (guia completo) ·
[`EMPRESA-REAL.md`](EMPRESA-REAL.md) (operação passo a passo) ·
[`docs/PLANO-TIMES-FLUXOS.md`](docs/PLANO-TIMES-FLUXOS.md) (como os agentes
conversam entre si) · [`docs/PRD.md`](docs/PRD.md) (status técnico).
