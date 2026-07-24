# Assets de arte — App Agency Tycoon

Guia para você (dono do projeto) me enviar as imagens que vão **substituir a
arte procedural** por arte de verdade. Coloque os arquivos nas pastas abaixo
com os **nomes exatos** e me avise; eu integro no renderer Pixi.

## Regras técnicas (valem para TODAS as imagens)

- **Formato:** PNG com **fundo transparente** (canal alpha). Nada de fundo branco.
- **Ângulo:** **isométrico** (vista ¾, de cima na diagonal) — o mesmo do jogo.
  Imagem frontal ou top-down vai destoar da cena.
- **Estilo único:** todos os objetos no **mesmo estilo** (flat/cartoon OU
  semi-realista — escolha um e mantenha). Misturar estilos fica pior.
- **Resolução:** ~**256 a 512 px** de largura por objeto (maior é melhor; eu
  reduzo). Consistente entre os itens.
- **Enquadramento:** objeto **centralizado na horizontal**, com a **base
  (onde toca o chão) perto da parte de baixo** da imagem e pouca margem sobrando.
- **Escala relativa:** mantenha proporção entre eles (geladeira > banquinho).

## Como enviar (escolha 1)

1. **(melhor)** Coloque os PNGs nas pastas abaixo com os nomes exatos e me diga
   "pronto". A pasta `public/` já é servida pelo jogo.
2. Me mande um **link** (Google Drive/Dropbox/URL) que eu baixo.
3. Deixe um **.zip** na pasta do projeto que eu extraio.

---

## FASE 1 — Móveis (comece por aqui) → `public/assets/props/`

| Arquivo | Objeto |
|---|---|
| `desk.png` | mesa de trabalho (com monitor/PC) |
| `office-chair.png` | cadeira de escritório |
| `meeting-table.png` | mesa de reunião |
| `reception.png` | balcão de recepção |
| `sofa.png` | sofá |
| `coffee-table.png` | mesa de centro |
| `tv.png` | televisão / painel |
| `fridge.png` | geladeira |
| `stove.png` | fogão |
| `sink.png` | pia / bancada |
| `microwave.png` | micro-ondas |
| `dining-table.png` | mesa de refeição (cozinha) |
| `stool.png` | banquinho |
| `plant.png` | planta / vaso grande |
| `server-rack.png` | rack de servidores |
| `water-cooler.png` | bebedouro |
| `printer.png` | impressora |
| `coffee-machine.png` | máquina de café / cafeteira |
| `arcade.png` | fliperama (decoração) |
| `pool-table.png` | mesa de sinuca (decoração) |
| `beanbag.png` | pufe (decoração) |

> **Itens coloridos** (sofá, cadeira, banquinho, pufe): mande **1 versão** em tom
> claro/neutro que eu recoloro no jogo — ou, se preferir cores fixas, mande do
> jeito que quiser e eu uso como está.

## FASE 2 — Personagens → `public/assets/characters/`

| Arquivo | Objeto |
|---|---|
| `employee.png` | funcionário (base; eu recoloro a camisa por cargo) |
| `client.png` | cliente/visitante (com pastinha) |

> Animação de andar é mais complexa: se puder, mande uma **spritesheet** (vários
> quadros do ciclo de caminhada) ou me diga que começamos com o boneco parado e
> evoluímos depois. Se conseguir 4 direções isométricas, melhor ainda.

## FASE 3 — Ambiente → `public/assets/env/`

| Arquivo | Objeto |
|---|---|
| `floor-tile.png` | piso (1 tile losango, repetível) |
| `wall.png` | parede |
| `tree.png` | árvore |
| `car.png` | carro (vista lateral isométrica) |
| `package.png` | caixa/pacote de entrega |

---

**Dica de onde achar/criar:** itch.io (filtre por licença), OpenGameArt, packs
do Kenney (baixe o zip e extraia os PNGs isométricos), ou gere por IA
(ex.: "isometric coffee machine, game asset, transparent background, flat style").
O importante é **estilo único + isométrico + PNG transparente**.
