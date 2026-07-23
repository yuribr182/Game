# 💻 App Agency Tycoon

Jogo web no estilo **tycoon** para empreendedores. Você comanda uma agência de
desenvolvimento de aplicativos: começa com **uma mesa numa garagem** e faz a
empresa crescer até virar um campus de tecnologia.

O escritório é uma **cena isométrica 3D animada** (renderizada em Canvas, sem
imagens externas): trabalhadores andam pelo ambiente, digitam nas mesas com telas
brilhando, um robô aspirador patrulha, entregas de apps deslizam até a porta,
carros passam na rua e o letreiro neon exibe o nome da empresa — tudo em
movimento contínuo.

Você já começa com uma **sala montada com cara de escritório**: **3 mesas de
desenvolvedor**, a **mesa da secretária** na recepção, uma **cozinha em cômodo
separado** (geladeira, fogão, pia, microondas, mesa de jantar e máquina de café),
lounge com sofá e TV e sala de reunião. Funcionários **desocupados vão até a
cozinha tomar café** — atravessando a porta, pegando a caneca e voltando.

### Direcionamento de tarefas

Na aba **Equipe**, cada funcionário tem um seletor **🎯 Tarefa**: deixe em
*Auto* (a produção é dividida entre os projetos) ou **fixe-o num projeto
específico** para priorizar uma entrega. Os cartões de projeto mostram a
velocidade efetiva (⚡ pts/s) e quantos estão fixados.

### Sistemas de jogo

- **Ganhos offline**: a agência continua produzindo enquanto o jogo está
  fechado (eficiência 60%, cap de 8h). Ao voltar, um resumo mostra dias
  passados, apps entregues, saldo e reputação do período.
- **Eventos aleatórios**: cliente VIP, destaque na mídia, queda de energia,
  bug em produção, pedido de aumento e proposta de investidor — vários com
  **escolhas** que afetam dinheiro, reputação e moral da equipe (ter um QA
  no time evita o evento de bug!).
- **Energia individual**: trabalhar cansa; funcionário exausto pausa sozinho
  para um café e volta renovado. A energia afeta a produção (50%–110%).
- **Fases de projeto**: todo app passa por Design 🎨 → Código ⌨️ → Testes 🧪.
  Designers brilham na 1ª fase, devs na 2ª e QAs na 3ª — escale bem!
- **Evolução de carreira**: devs acumulam experiência e podem ser
  **promovidos** (júnior → pleno → sênior) pagando a taxa de promoção.
- **Produtos próprios**: com 25 ⭐, lance apps seus que geram renda passiva
  diária — podem viralizar (+35%) ou sofrer com a concorrência.
- **Ciclo dia/noite** na cena, com janelas acesas à noite.
- **Personagens clicáveis**: clique em alguém na cena para ver nome, cargo,
  energia e tarefa atual.

### Câmera

- **Roda do mouse**: zoom (centrado no cursor)
- **Arrastar**: mover a câmera
- **Duplo clique**: reenquadrar

### Cargos com visual próprio

Júnior usa **boné**, sênior usa **óculos**, designer usa **boina**, QA usa
**fones**, gerente usa **terno e gravata** e a secretária usa **headset** — dá
para reconhecer a equipe só de olhar a cena.

### Pacote de arte

Todo o mobiliário é um **pacote de arte vetorial próprio** (`js/props.js`):
geladeira, fogão, bancada, pia, microondas, mesa de jantar, sofá, mesa de centro,
TV, balcão de recepção, mesa de reunião, cadeiras, bebedouro, impressora, rack de
servidores, estante e plantas — cada objeto desenhado por código com sombreamento
isométrico. Não depende de nenhuma imagem externa e é fácil de estender: basta
adicionar uma função em `Props.draw` e posicioná-la no layout.

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
js/game.js        # motor: estado, regras, economia, tarefas e loop
js/audio.js       # efeitos sonoros gerados por WebAudio (sem arquivos)
js/props.js       # pacote de arte: móveis/objetos isométricos (Canvas 2D)
js/iso.js         # cena isométrica animada (cozinha, rotas, câmera, cargos)
js/ui.js          # renderização dos painéis (projetos, equipe, loja)
js/main.js        # inicialização, eventos e game loop
```

Dica: clique no **pad "+"** pulsante no chão do escritório para comprar uma nova
mesa direto na cena.

Feito com HTML, CSS e JavaScript puro — sem dependências nem build.

Inclui `manifest.json` + `sw.js`: quando servido por HTTP(S), o jogo é um
**PWA instalável** que funciona offline. O save usa versionamento (v2) com
migração automática de versões antigas.
