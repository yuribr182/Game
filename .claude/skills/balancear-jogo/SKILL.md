---
name: balancear-jogo
description: Ajustar o balanceamento do App Agency Tycoon (economia, ritmo, dificuldade). Use quando o pedido envolver deixar o jogo mais fácil/difícil/rápido/lento, ajustar salários, preços, recompensas, energia, eventos ou prazos.
---

# Balancear o jogo

Todo o balanceamento vive em poucos lugares. Ajuste números, teste e reporte o
antes/depois.

## Onde ficam os números

- `js/data.js`
  - `TIERS`: mesas, slots de projeto, custo e reputação para expandir
  - `ROLES`: velocidade (**pts/DIA**), custo de contratação, salário/dia
  - `UPGRADES`: preços e efeitos (`prodMult`, `repMult`, `contractValue`, `contractFlow`)
  - `PROJECT_TYPES`: trabalho, recompensa e reputação por tipo de app
  - `PROMOTIONS`: XP (em dias trabalhados) e custo das promoções
  - `EVENTS`: chance relativa de cada evento
  - `xpForLevel()`: curva de nível
- `js/game.js`
  - `DAY_LENGTH` (1440s = 1 dia) — não mudar sem repensar tudo
  - Energia: `drain`/`recover` no tick (~140/dia e ~500/dia)
  - Fluxo de contratos: `contractTimer` (~1/3 de dia)
  - Chance diária de evento (`0.25`) e valores em `triggerRandomEvent`/`resolveEvent`
  - Offline: eficiência 0.6 e cap de 8h em `simulateOffline`
  - `deadline` dos contratos em `generateContract`

## Regras

1. Velocidades/durações sempre em unidades por DIA escaladas por `DAY_LENGTH`.
2. Depois de mexer: `node --check js/*.js` e um teste headless rápido (novo
   jogo → aceitar projeto → conferir pts/dia no HUD e o tempo estimado de
   entrega vs prazo).
3. Sanidade: um dev júnior sozinho deve entregar uma landing page (12 pts) em
   ~1,5 dia; salários de 1 dev não podem quebrar o caixa inicial em < 5 dias.
4. Reporte a mudança como tabela antes → depois no commit.
