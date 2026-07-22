# 💻 App Agency Tycoon

Jogo web no estilo **tycoon** para empreendedores. Você comanda uma agência de
desenvolvimento de aplicativos: começa com **uma mesa numa garagem** e faz a
empresa crescer até virar um campus de tecnologia.

## 🎮 Como jogar

Abra o arquivo **`index.html`** no navegador (não precisa de servidor, instalação
ou internet). Clique em **Novo Jogo** e comece a empreender.

### Loop do jogo

1. **Contrate** desenvolvedores na aba **Equipe** (júnior → pleno → sênior, além
   de designer, QA e gerente).
2. **Aceite contratos** de apps na aba **Projetos**. Cada projeto precisa de
   pontos de trabalho e tem um prazo em dias.
3. Sua equipe produz **pontos de trabalho por segundo** — as barras de progresso
   avançam automaticamente. Ao concluir, você ganha **dinheiro 💵 e reputação ⭐**.
4. Use o lucro para **comprar mesas 🪑**, contratar mais gente e comprar
   **melhorias 🛒** (PCs, café, CI/CD, IA...).
5. Com reputação suficiente, **expanda o escritório** para tiers maiores, que
   liberam mais mesas e mais projetos simultâneos.
6. Cuidado com os **salários** (cobrados por dia) e os **prazos** — estourar um
   prazo custa reputação.

### Crescimento do escritório

| Tier | Escritório | Mesas | Projetos simultâneos |
|------|------------|:-----:|:-------------------:|
| 🏚️ | Garagem | 2 | 1 |
| 🏬 | Sala compartilhada | 4 | 2 |
| 🏢 | Escritório | 8 | 3 |
| 🏙️ | Andar próprio | 14 | 4 |
| 🏰 | Sede corporativa | 24 | 6 |
| 🌆 | Campus Tech | 40 | 9 |

O progresso é **salvo automaticamente** no navegador (localStorage).

## 🗂️ Estrutura do projeto

```
index.html        # marcação e telas
css/styles.css    # visual (tema escuro)
js/data.js        # dados e balanceamento (tiers, cargos, upgrades, contratos)
js/game.js        # motor: estado, regras, economia e loop
js/ui.js          # renderização da interface
js/main.js        # inicialização, eventos e game loop
```

Feito com HTML, CSS e JavaScript puro — sem dependências nem build.
