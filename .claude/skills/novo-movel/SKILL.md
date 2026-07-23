---
name: novo-movel
description: Adicionar um novo móvel, objeto ou decoração à cena isométrica do App Agency Tycoon. Use quando o pedido for criar/melhorar mobília, itens do escritório ou decorações compráveis na loja.
---

# Novo móvel / decoração

A arte é 100% procedural (Canvas 2D). Cada objeto é uma função no pacote de
arte que desenha com o toolkit `g`.

## Passos

1. **Desenhar**: adicione `Props.draw.meuItem(g, gx, gy, opt)` em `js/props.js`.
   Toolkit `g`: `box(gx,gy,sx,sy,h,top,left,right)` (cuboide com contorno),
   `corner(gx,gy,h)` e `xy(gx,gy)` (projeção), `quad`, `roundRect`, `shade(cor,±k)`,
   `shadow(gx,gy,rx,ry)`, `ctx` cru e `t` (clock p/ animar).
   Estilo: cores chapadas + `shade` para as faces, sombra elíptica no chão,
   detalhes pequenos (luzes piscando com `Math.sin(g.t...)`) dão vida.
2. **Posicionar**: em `js/iso.js` → `buildLayout()`, adicione
   `F.push({ type: 'meuItem', gx, gy })` na zona certa (cozinha, lounge,
   recepção, reunião). Cuidado para não sobrepor mesas (zona de trabalho começa
   em `WX0/WY0`) nem o cômodo da cozinha (`KW × KH`).
3. **Se for decoração comprável**: adicione em `UPGRADES` (`src/core/data.ts`) com
   `decor: true` e um efeito pequeno (ex.: `prodMult: 0.06`), e condicione o
   `F.push` a `upg.includes('id')` como pufes/fliperama/sinuca.
4. **Testar**: screenshot headless com zoom no objeto (padrão do projeto) e
   conferir o z-sort — objetos entram no sort por `gx+gy`; se o personagem deve
   passar por trás/na frente, confira a profundidade.

## Armadilhas conhecidas

- Elipses "arredondadas" precisam de rotação alinhada ao eixo isométrico
  (~±0.46 rad) — rotação errada vira bolha.
- `box` desenha as laterais desde o chão: para tampos salientes use a técnica
  de `slab` (ver `Props.draw.reception`).
- Emoji/textos no canvas: fonte pequena e `textAlign` restaurado depois.
