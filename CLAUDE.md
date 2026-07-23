# App Agency Tycoon — guia para o Claude

Jogo web tycoon (pt-BR) de agência de desenvolvimento de apps, estilo The Sims /
idle tycoon. **HTML/CSS/JS puro, sem dependências, sem build** — abrir o
`index.html` já roda o jogo. Publicado via GitHub Pages em
https://yuribr182.github.io/Game/ (deploy automático a cada push).

## Como rodar e testar

- Rodar: abrir `index.html` no navegador (ou `python3 -m http.server` para
  testar o PWA/service worker).
- Testar mudanças: use Playwright headless (Chromium pré-instalado no ambiente
  remoto). Padrão usado no projeto: abrir `file:///.../index.html`, clicar em
  `#btnNewGame`, manipular `Game.state` via `page.evaluate` para montar
  cenários, tirar screenshot do `#officeCanvas` e checar erros de console.
  Sempre verifique `node --check js/*.js` antes.
- **Toda mudança visual deve ser confirmada com screenshot** antes do push.

## Arquitetura (ordem de carga importa)

| Arquivo | Papel |
|---|---|
| `js/data.js` | **Todo o balanceamento**: tiers, cargos (pts/DIA), upgrades, tipos de contrato, fases, promoções, eventos, produtos, conquistas, rivais |
| `js/game.js` | Motor puro (sem DOM): estado, tick, economia, energia, tarefas, eventos, offline, save v3 + migração |
| `js/audio.js` | SFX e ambiente por WebAudio (sem arquivos de áudio) |
| `js/props.js` | Pacote de arte: móveis isométricos desenhados por código (`Props.draw.*`) |
| `js/iso.js` | Cena isométrica em Canvas 2D: layout do escritório, personagens/rotas, câmera (zoom/pan/pinça), dia/noite, clientes NPC |
| `js/ui.js` | Painéis DOM (projetos, equipe, loja, empresa) |
| `js/main.js` | Cola tudo: eventos → toasts/sons, modais, velocidade, game loop |

Comunicação: `Game.on('event'|'change'|'tick', fn)`. O canvas lê `Game.state`
diretamente a cada frame; o DOM re-renderiza no `change` (ações) e `tick`
(barras/HUD).

## Regras do projeto

- **Idioma**: todo texto de UI, comentários e commits em **pt-BR**.
- **Sem dependências/build**: nada de npm no jogo em si; assets externos são
  bloqueados pela política (arte é 100% procedural).
- **Tempo**: 1 dia de jogo = `DAY_LENGTH` (1440s = 24 min). Velocidades de
  produção são **pontos por DIA** em `data.js`; `empSpeed()` converte p/ segundo.
  Qualquer nova mecânica temporal deve escalar por `DAY_LENGTH`.
- **Save**: mudanças no formato exigem bump de `SAVE_VERSION` em `game.js` +
  bloco em `migrate()`. Nunca quebre saves antigos.
- **Service worker**: ao mudar qualquer arquivo do jogo, bump do `CACHE` em
  `sw.js` (senão o PWA serve versão velha).
- **Cena**: entidades novas entram no z-sort de `draw()` com profundidade
  `gx+gy`; personagens usam `routeTo()` (respeita a porta da cozinha).
- Commits descritivos em pt-BR; push na branch de trabalho publica o site.

## Skills do projeto (`.claude/skills/`)

- `balancear-jogo` — ajustar economia, ritmo e dificuldade (onde ficam os números + checagens de sanidade)
- `novo-movel` — adicionar móveis/decorações à cena isométrica (toolkit de desenho + armadilhas)
- `testar-jogo` — testar em headless com Playwright (esqueleto pronto + dicas do jogo)

## Onde mexer para tarefas comuns

- Balancear economia/ritmo → `js/data.js` (quase tudo) e constantes no topo de
  `js/game.js` (energia, fluxo de contratos, chances de evento).
- Novo móvel/decoração → skill `novo-movel` (`.claude/skills/novo-movel/`).
- Novo evento aleatório → `EVENTS` em `data.js` + `triggerRandomEvent`/
  `resolveEvent` em `game.js` (instant vs choice).
- Nova conquista → `ACHIEVEMENTS` em `data.js` (só isso; o motor checa sozinho).
