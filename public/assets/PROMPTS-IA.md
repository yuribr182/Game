# Prompts de IA para gerar os assets — App Agency Tycoon

Prompts prontos para gerar os 3 primeiros itens (teste do pipeline) em imagem,
no estilo/formato que o jogo precisa. Depois é só repetir o mesmo **bloco de
estilo** para os demais objetos, mantendo o pack coeso.

Destino dos arquivos: `public/assets/props/` · Nomes exatos ao final.

---

## 🧩 Bloco de ESTILO + FORMATO (cole no FIM de todo prompt)

Use este bloco **idêntico** em todos os itens — é o que garante que geladeira,
sofá, mesa etc. pareçam do mesmo jogo.

```
isometric view, 45° top-down game asset, single object centered, no scene,
modern clean low-poly 3D render style, soft studio lighting, smooth matte
surfaces, subtle ambient occlusion, soft contact shadow, vibrant slightly
muted colors, plain solid background for easy cutout, high detail, 1:1, 1024x1024
```

---

## 🎯 Os 3 prompts (objeto + bloco de estilo)

### desk.png

```
A modern office desk with a computer monitor showing colorful code, a keyboard,
a mouse and a small coffee mug on top; wooden desktop with slim metal legs.
isometric view, 45° top-down game asset, single object centered, no scene,
modern clean low-poly 3D render style, soft studio lighting, smooth matte
surfaces, subtle ambient occlusion, soft contact shadow, vibrant slightly
muted colors, plain solid background for easy cutout, high detail, 1:1, 1024x1024
```

### sofa.png

```
A cozy modern 3-seat lounge sofa with soft back and seat cushions and small
wooden feet, upholstered in a neutral LIGHT GRAY fabric.
isometric view, 45° top-down game asset, single object centered, no scene,
modern clean low-poly 3D render style, soft studio lighting, smooth matte
surfaces, subtle ambient occlusion, soft contact shadow, vibrant slightly
muted colors, plain solid background for easy cutout, high detail, 1:1, 1024x1024
```

### coffee-machine.png

```
A stainless-steel espresso coffee machine with a portafilter group head, a bean
hopper on top, a couple of control buttons and a small white cup underneath.
No steam.
isometric view, 45° top-down game asset, single object centered, no scene,
modern clean low-poly 3D render style, soft studio lighting, smooth matte
surfaces, subtle ambient occlusion, soft contact shadow, vibrant slightly
muted colors, plain solid background for easy cutout, high detail, 1:1, 1024x1024
```

> ⚠️ **Sofá em cinza claro** de propósito → recolorido dentro do jogo.
> **Cafeteira sem fumaça** → a fumaça é o efeito animado feito no código.

---

## 🛠️ Ajustes por ferramenta

- **Midjourney (v6+):** acrescente `--ar 1:1 --style raw` no fim. Não faz fundo
  transparente — gere com fundo sólido e recorte depois.
- **DALL·E / ChatGPT / Ideogram:** troque `plain solid background for easy cutout`
  por `on a plain solid white background, no shadow touching the edges`.
  (Se a ferramenta suportar, peça `transparent background`.)
- **Fundo transparente (passo-chave):** se não sair transparente, passe o PNG no
  **remove.bg** (grátis) antes de salvar. O jogo precisa de **alpha de verdade**.

---

## ✅ Checklist antes de enviar

- [ ] PNG **transparente** (sem fundo)
- [ ] Vista **isométrica** (não frontal / não top-down puro)
- [ ] Os 3 no **mesmo estilo** (mesmo bloco de prompt)
- [ ] Objeto **centralizado**, base (chão) perto de baixo
- [ ] Nomes exatos: `desk.png`, `sofa.png`, `coffee-machine.png`
- [ ] Salvos em `public/assets/props/`

Depois é só avisar "pronto" (ou mandar o link) que eu monto o carregador de
sprites no Pixi e mostro os itens reais na cena.
