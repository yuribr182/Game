/* ===========================================================
   App Agency Tycoon — cena isométrica animada (Canvas 2D)
   Escritório 2.5D com trabalhadores andando, entregas, carros
   e telas piscando. Lê window.Game.state a cada frame.
   Expõe window.IsoOffice
   =========================================================== */
(function () {
  'use strict';
  const G = window.Game;

  // dimensões de tile isométrico (2:1)
  const TW = 64, TH = 32;
  const HW = TW / 2, HH = TH / 2;

  let canvas, ctx, dpr = 1;
  let cam = { scale: 1, ox: 0, oy: 0 };
  let fit = { scale: 1, ox: 0, oy: 0 };   // enquadramento automático (referência p/ zoom)
  let dragging = null;                     // estado do arrastar da câmera
  let layout = null;         // { W, H, desks:[{gx,gy}] , perRow }
  let workers = [];          // personagens (funcionários)
  let npcs = [];             // NPCs fixos (atendente)
  let clients = [];          // clientes visitando a recepção
  let clientTimer = 45;      // próximo visitante aleatório (s, escalado pela velocidade)
  let packages = [];         // entregas em movimento
  let pops = [];             // popups flutuantes (+R$)
  let cars = [];             // carros na rua
  let particles = [];        // fumacinha / faíscas
  let lastTier = -1, lastDesks = -1, lastEmp = -1, lastDecorSig = '';
  let t = 0, lastNow = 0;
  let running = false;
  let plusPad = null;        // posição do pad "+" clicável (raw screen)

  const SHIRTS = ['#4f8cff', '#37d67a', '#ffca4b', '#ff5c6c', '#7c5cff', '#ff9f45', '#28c0d6', '#e05fb0'];
  // visual por cargo: cor da camisa + acessório
  const ROLE_STYLE = {
    junior:   { shirt: '#4f8cff', acc: 'cap' },
    pleno:    { shirt: '#37d67a', acc: null },
    senior:   { shirt: '#ffca4b', acc: 'glasses' },
    designer: { shirt: '#e05fb0', acc: 'beret' },
    qa:       { shirt: '#28c0d6', acc: 'phones' },
    manager:  { shirt: '#2f3a4d', acc: 'tie' },
    atendente:{ shirt: '#7c5cff', acc: 'headset' },
  };
  const SKINS = ['#f2c49b', '#e0a878', '#c68642', '#8d5524', '#ffd9b3'];
  const HAIRS = ['#2b2118', '#4a342a', '#111', '#6b4a2b', '#d9c27a', '#7a3b2b'];

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const lerp = (a, b, k) => a + (b - a) * k;

  // ---- projeção isométrica (coordenadas "mundo" -> tela crua) ----
  function iso(gx, gy) {
    return { x: (gx - gy) * HW, y: (gx + gy) * HH };
  }
  // canto de um cuboide (com altura h em pixels)
  function corner(gx, gy, h) {
    return { x: (gx - gy) * HW, y: (gx + gy) * HH - (h || 0) };
  }

  // toolkit passado ao pacote de arte (js/props.js)
  let TK = null;
  function buildTK() {
    TK = {
      get ctx() { return ctx; }, t: 0,
      xy: iso, corner,
      box: cuboid, shade, roundRect, quad,
      shadow: (gx, gy, rx, ry) => shadow(gx, gy, rx, ry),
    };
  }
  function prop(type, gx, gy, opt) {
    if (window.Props && Props.draw[type]) { TK.t = t; Props.draw[type](TK, gx, gy, opt); }
  }

  // ---------- arte real (imagens PNG) sobre o renderer Canvas nítido ----------
  // Cada tipo com asset usa drawImage (downscale nítido da imagem de alta
  // resolução); os que não têm asset caem no desenho procedural (fallback).
  // Ajuste por item: worldW (largura em px de mundo), anchorY (~ponto que toca
  // o chão), offGx/offGy (desloca o (gx,gy) da grade p/ o centro do móvel).
  // anchorX = 0.5 e offsets = 0 por padrão. A CHAVE é o tipo do móvel no jogo.
  const ASSET_CFG = {
    // especiais (mesa de trabalho e cafeteira — cafeteira pequena, vai no balcão)
    desk:          { file: 'desk.png',           worldW: 50, anchorY: 0.72, offGx: 0.35, offGy: 0.28 },
    coffee:        { file: 'coffee-machine.png', worldW: 26, anchorY: 0.82 },
    // cozinha
    counter:       { file: 'counter.png',        worldW: 50, anchorY: 0.82, offGx: 0.3, offGy: 0.22 },
    fridge:        { file: 'fridge.png',         worldW: 38, anchorY: 0.84, offGx: 0.25, offGy: 0.21 },
    sink:          { file: 'sink.png',           worldW: 44, anchorY: 0.80, offGx: 0.25, offGy: 0.21 },
    microwave:     { file: 'microwave.png',      worldW: 26, anchorY: 0.80, offGx: 0.15, offGy: 0.12 },
    stool:         { file: 'stool.png',          worldW: 26, anchorY: 0.82, offGx: 0.17, offGy: 0.17 },
    // lounge
    sofa:          { file: 'sofa.png',           worldW: 66, anchorY: 0.74, offGx: 0.49, offGy: 0.25 },
    coffeeTable:   { file: 'coffee-table.png',   worldW: 40, anchorY: 0.78, offGx: 0.22, offGy: 0.18 },
    tv:            { file: 'tv.png',             worldW: 46, anchorY: 0.86, offGx: 0.25, offGy: 0.03 },
    pufe:          { file: 'beanbag.png',        worldW: 32, anchorY: 0.80 },
    arcade:        { file: 'arcade.png',         worldW: 40, anchorY: 0.85 },
    poolTable:     { file: 'pool-table.png',     worldW: 62, anchorY: 0.76, offGx: 0.35, offGy: 0.25 },
    // recepção / reunião
    reception:     { file: 'reception.png',      worldW: 72, anchorY: 0.74, offGx: 0.5,  offGy: 0.35 },
    plantBig:      { file: 'plant.png',          worldW: 30, anchorY: 0.85 },
    meetingTable:  { file: 'meeting-table.png',  worldW: 92, anchorY: 0.74, offGx: 0.7,  offGy: 0.35 },
    // cadeira de escritório (direcional): frente / esquerdo / direito (+ base)
    chair:         { file: 'office-chair.png',        worldW: 28, anchorY: 0.82 },
    'chair-frente':   { file: 'office-chair-frente.png',   worldW: 28, anchorY: 0.82 },
    'chair-esquerdo': { file: 'office-chair-esquerdo.png', worldW: 28, anchorY: 0.82 },
    'chair-direito':  { file: 'office-chair-direito.png',  worldW: 28, anchorY: 0.82 },
    // equipamentos
    serverRack:    { file: 'server-rack.png',    worldW: 36, anchorY: 0.86 },
    waterCooler:   { file: 'water-cooler.png',   worldW: 28, anchorY: 0.88 },
    printer:       { file: 'printer.png',        worldW: 32, anchorY: 0.80 },
  };
  const assets = {};
  function loadAssets() {
    Object.keys(ASSET_CFG).forEach((type) => {
      const cfg = ASSET_CFG[type];
      const img = new Image();
      img.onload = () => { assets[type] = { img: img, cfg: cfg }; };
      img.src = new URL('assets/props/' + cfg.file, document.baseURI).href;
    });
  }
  function drawSprite(a, gx, gy, elevate) {
    const cfg = a.cfg;
    const ax = cfg.anchorX != null ? cfg.anchorX : 0.5;
    const ay = cfg.anchorY != null ? cfg.anchorY : 0.78;
    const p = iso(gx + (cfg.offGx || 0), gy + (cfg.offGy || 0));
    const w = cfg.worldW, h = w * a.img.height / a.img.width;
    ctx.drawImage(a.img, p.x - ax * w, p.y - ay * h - (elevate || 0), w, h);
  }
  // asset de um móvel (cadeira usa a variante direcional se tiver `dir`)
  function assetFor(item) {
    if (item.type === 'chair' && item.dir && assets['chair-' + item.dir]) return assets['chair-' + item.dir];
    return assets[item.type];
  }

  // ---------- inicialização ----------
  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';   // downscale nítido dos PNGs
    buildTK();
    loadAssets();
    window.addEventListener('resize', resize);
    // câmera: zoom (roda), arrastar (mouse/touch), duplo clique = enquadrar
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', (ev) => { pointers.delete(ev.pointerId); pinch = null; dragging = null; });
    canvas.addEventListener('dblclick', () => { cam.scale = fit.scale; cam.ox = fit.ox; cam.oy = fit.oy; });
    resize();
    if (!running) { running = true; lastNow = performance.now(); requestAnimationFrame(frame); }
  }

  function resize() {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(r.width * dpr));
    canvas.height = Math.max(1, Math.floor(r.height * dpr));
    buildCamera();
  }

  // ---------- layout do escritório conforme o tier ----------
  function buildLayout() {
    const s = G.state;
    const max = G.maxDesks();
    const perRow = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(max))));
    const rows = Math.ceil(max / perRow);
    const DX = 1.45, DY = 1.7;
    // zona de trabalho deslocada: cozinha (cômodo) + lounge à esquerda,
    // recepção+reunião à direita/frente
    const WX0 = 3.0, WY0 = 2.1;
    const desks = [];
    for (let i = 0; i < max; i++) {
      const gx = WX0 + (i % perRow) * DX;
      const gy = WY0 + Math.floor(i / perRow) * DY;
      desks.push({ gx, gy });
    }
    const W = WX0 + perRow * DX + 2.4;
    const H = WY0 + rows * DY + 2.3;
    layout = { W, H, desks, perRow, max };

    layout.door = { gx: W - 0.9, gy: H - 0.1 };

    // ---- COZINHA: cômodo separado no canto noroeste ----
    const KW = 2.35, KH = 2.65;               // dimensões do cômodo
    layout.KW = KW; layout.KH = KH;
    layout.doorIn = { gx: KW - 0.4, gy: 1.85 };  // waypoint dentro da porta
    layout.doorOut = { gx: KW + 0.45, gy: 1.85 }; // waypoint fora da porta
    layout.coffee = { gx: 1.85, gy: 0.5 };        // máquina de café na cozinha
    // paredes internas (meia-altura), com vão de porta na parede leste
    const seg = (gx, gy, sx, sy) => ({ gx, gy, sx, sy });
    layout.kwalls = [
      seg(KW, 0, 0.1, 0.8), seg(KW, 0.8, 0.1, 0.65),      // leste, acima da porta
      seg(KW, 2.25, 0.1, KH - 2.25 + 0.1),                 // leste, abaixo da porta
      seg(0, KH, 0.85, 0.1), seg(0.85, KH, 0.8, 0.1), seg(1.65, KH, KW - 1.65 + 0.1, 0.1), // sul
    ];

    // ---- MÓVEIS por zona (curados, arte real) ----
    const F = [];
    const tier = s.tier;
    // COZINHA — balcão fixo; os itens surgem conforme o escritório cresce:
    // tier 0-1: só cafeteira · tier 2: +geladeira · tier 3+: +pia/bancos/micro-ondas
    F.push({ type: 'counter', gx: 1.35, gy: 0.32 });                      // balcão à direita, junto à parede/porta
    F.push({ type: 'coffee', gx: 1.55, gy: 0.5, elevate: 24 });           // cafeteira EM CIMA do balcão
    if (tier >= 3) F.push({ type: 'microwave', gx: 2.0, gy: 0.5, elevate: 22 }); // micro-ondas EM CIMA do balcão
    if (tier >= 2) F.push({ type: 'fridge', gx: 0.3, gy: 1.0 });          // geladeira (nível 2) à esquerda
    if (tier >= 3) {                                                       // pia + bancos (nível 3)
      F.push({ type: 'sink', gx: 0.35, gy: 1.95 });
      F.push({ type: 'stool', gx: 1.2, gy: 2.05 });
      F.push({ type: 'stool', gx: 1.85, gy: 2.1 });
    }
    layout.coffee = { gx: 1.4, gy: 0.95 };   // fluxo do café vai até o balcão (não a geladeira)
    // LOUNGE (frente-esquerda) — mais espaçado
    F.push({ type: 'sofa', gx: 0.4, gy: H - 2.0 });
    F.push({ type: 'coffeeTable', gx: 0.55, gy: H - 1.05 });
    F.push({ type: 'tv', gx: 0.22, gy: H - 2.9 });
    const upg = s.upgrades || [];
    if (upg.includes('pufes')) {
      F.push({ type: 'pufe', gx: 1.75, gy: H - 1.5 });
      F.push({ type: 'pufe', gx: 2.15, gy: H - 0.95 });
    }
    if (upg.includes('arcade')) F.push({ type: 'arcade', gx: 0.3, gy: H - 3.3 });
    if (upg.includes('sinuca')) F.push({ type: 'poolTable', gx: 2.75, gy: H - 1.5 });
    // RECEPÇÃO (frente-direita)
    layout.reception = { gx: W - 2.2, gy: H - 1.7 };
    F.push({ type: 'reception', gx: W - 2.2, gy: H - 1.7 });
    F.push({ type: 'chair', dir: 'esquerdo', gx: W - 0.75, gy: H - 1.5 });
    F.push({ type: 'plantBig', gx: W - 0.4, gy: H - 2.3 });
    // REUNIÃO (fundo-direita) — cadeiras viram para a mesa conforme o lado
    F.push({ type: 'meetingTable', gx: W - 2.2, gy: 0.6 });
    [
      [-0.45, 0.55, 'esquerdo'], [-0.45, 1.15, 'esquerdo'],  // lado esquerdo
      [1.55, 0.55, 'direito'], [1.55, 1.15, 'direito'],      // lado direito
      [0.55, -0.35, 'frente'], [0.55, 1.7, null],            // topo = frente · baixo = office-chair base
    ].forEach(([dx, dy, dir]) => F.push({ type: 'chair', dir: dir, gx: W - 2.2 + dx, gy: 0.6 + dy }));
    // EQUIPAMENTOS
    F.push({ type: 'serverRack', gx: 0.35, gy: H * 0.5 });
    F.push({ type: 'waterCooler', gx: W - 0.5, gy: H * 0.5 });
    F.push({ type: 'printer', gx: WX0 - 0.55, gy: WY0 + 1.9 });
    F.push({ type: 'plantBig', gx: W - 0.4, gy: 2.4 });
    layout.furniture = F;

    // tapetes e luminárias (decoração de piso)
    layout.rugs = [
      { gx: 0.55, gy: H - 1.3, w: 1.1, h: 0.9, col: 'rgba(90,120,200,.16)' },   // lounge
      { gx: W - 2.0, gy: 0.8, w: 1.4, h: 0.8, col: 'rgba(120,92,255,.12)' },     // reunião
    ];
    layout.lamps = [];
    for (let gx = WX0; gx < WX0 + perRow * DX; gx += 1.6)
      for (let gy = WY0; gy < WY0 + rows * DY; gy += 1.7) layout.lamps.push({ gx: gx + 0.5, gy: gy + 0.4 });
    // árvores de FRENTE (cantos externos) — pequenas, só pra emoldurar
    layout.trees = [];
    layout.trees.push({ gx: -0.9, gy: H + 0.6, s: 0.9 });
    layout.trees.push({ gx: -0.9, gy: H + 1.6, s: 0.75 });
    layout.trees.push({ gx: W + 0.9, gy: H + 0.7, s: 0.95 });
    layout.trees.push({ gx: W + 1.6, gy: H + 1.5, s: 0.8 });
    layout.trees.push({ gx: W + 0.9, gy: -0.6, s: 0.8 });
    // árvores de FUNDO (norte + oeste) — desenhadas ANTES das paredes (ficam atrás)
    layout.bgTrees = [];
    for (let g = -1.2; g < W + 1.2; g += 1.4) layout.bgTrees.push({ gx: g + rand(-0.2, 0.2), gy: -1.5, s: rand(0.7, 1.0) });
    for (let g = -1.2; g < H + 1.2; g += 1.4) layout.bgTrees.push({ gx: -1.5, gy: g + rand(-0.2, 0.2), s: rand(0.7, 1.0) });

    buildCamera();
  }

  function buildCamera() {
    if (!layout || !canvas) return;
    const { W, H } = layout;
    // amostra cantos (incluindo margem externa, altura de parede e rua da frente)
    const pts = [
      iso(-1.6, -1.6), iso(W + 1.6, -1.6), iso(W + 1.6, H + 2.4), iso(-1.6, H + 2.4),
    ];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach((p) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
    minY -= 78;  // altura das paredes
    maxY += 34;  // personagens
    const cw = canvas.width / dpr, ch = canvas.height / dpr;
    const contentW = (maxX - minX), contentH = (maxY - minY);
    const scale = Math.min(cw / contentW, ch / contentH) * 0.96;
    fit.scale = scale;
    fit.ox = (cw - contentW * scale) / 2 - minX * scale;
    fit.oy = (ch - contentH * scale) / 2 - minY * scale;
    cam.scale = fit.scale; cam.ox = fit.ox; cam.oy = fit.oy;
  }

  // ---------- sincroniza entidades com o estado ----------
  function syncEntities() {
    const s = G.state;
    const decorSig = (s.upgrades || []).join(',');
    if (!layout || s.tier !== lastTier) { lastTier = s.tier; lastDecorSig = decorSig; buildLayout(); workers = []; npcs = []; }
    else if (decorSig !== lastDecorSig) { lastDecorSig = decorSig; buildLayout(); }
    const emp = Math.min(s.employees.length, s.desks);

    // NPCs decorativos: atendente (recepção) + cliente ocasional
    if (npcs.length === 0 && layout) {
      const r = layout.reception;
      const att = makeWorker(-1, { gx: r.gx + 0.35, gy: r.gy - 0.5 }, 'atendente');
      att.pname = window.DATA && window.DATA.FIRST_NAMES ? pick(window.DATA.FIRST_NAMES) : 'Recepção';
      att.home = { gx: r.gx + 0.35, gy: r.gy - 0.5 };
      att.hx = att.home.gx; att.hy = att.home.gy; att.gx = att.hx; att.gy = att.hy;
      att.state = 'work'; att.desk = { gx: att.home.gx, gy: att.home.gy - 0.55 };
      npcs.push(att);
    }

    // trabalhadores = funcionários sentados
    while (workers.length < emp) {
      const i = workers.length;
      const d = layout.desks[i];
      workers.push(makeWorker(i, d, s.employees[i].role));
    }
    while (workers.length > emp) workers.pop();
    // reatribui mesa e cargo (caso layout ou equipe mudou)
    workers.forEach((w, i) => {
      w.i = i;
      w.desk = layout.desks[i];
      const roleId = s.employees[i].role;
      if (w.role !== roleId) {
        w.role = roleId;
        const st = ROLE_STYLE[roleId];
        if (st) { w.shirt = st.shirt; w.acc = st.acc; }
      }
      if (w.state === 'work') { w.hx = w.desk.gx; w.hy = w.desk.gy + 0.8; w.path = []; }
    });

    lastDesks = s.desks; lastEmp = emp;

    // carros na rua (2 fixos, um em cada sentido)
    if (cars.length === 0 && layout) {
      cars.push({ gx: -2, gy: layout.H + 1.38, sp: 0.9, col: pick(SHIRTS) });
      cars.push({ gx: layout.W + 2, gy: layout.H + 1.82, sp: -0.7, col: pick(SHIRTS) });
    }
  }

  function makeWorker(i, d, roleId) {
    const style = ROLE_STYLE[roleId] || { shirt: pick(SHIRTS), acc: null };
    return {
      i, desk: d, role: roleId || null,
      gx: d.gx, gy: d.gy + 0.8,
      hx: d.gx, hy: d.gy + 0.8,          // waypoint atual
      path: [],                            // waypoints restantes
      state: 'work', timer: rand(3, 10),
      phase: rand(0, Math.PI * 2),
      shirt: style.shirt, acc: style.acc, skin: pick(SKINS), hair: pick(HAIRS),
      moving: false, dir: 1, sp: rand(1.1, 1.7),
      mug: 0,                              // segurando caneca de café (segundos)
    };
  }

  // ---- roteamento: entra/sai da cozinha pela porta ----
  function inKitchen(gx, gy) { return gx < layout.KW && gy < layout.KH; }
  function routeTo(w, tx, ty) {
    const from = inKitchen(w.gx, w.gy), to = inKitchen(tx, ty);
    let pts;
    if (from && !to) pts = [layout.doorIn, layout.doorOut, { gx: tx, gy: ty }];
    else if (!from && to) pts = [layout.doorOut, layout.doorIn, { gx: tx, gy: ty }];
    else pts = [{ gx: tx, gy: ty }];
    w.path = pts.slice(1);
    w.hx = pts[0].gx; w.hy = pts[0].gy;
  }

  // ---------- atualização ----------
  function update(dt) {
    const s = G.state;
    t += dt;
    const producing = s.active.length > 0 && G.production() > 0;

    // trabalhadores (sem projeto OU descansando -> vão à cozinha tomar café)
    const noWork = s.active.length === 0;
    workers.forEach((w) => {
      const emp = s.employees[w.i];
      const idle = noWork || (emp && emp.resting);
      w.timer -= dt;
      if (w.mug > 0) w.mug -= dt;
      if (w.bubble && (w.bubble.life -= dt) <= 0) w.bubble = null;
      // balões contextuais
      if (!w.bubble) {
        if (emp && emp.resting && Math.random() < dt * 0.25) w.bubble = { emoji: '😴', life: 2.2 };
        else if (w.mug > 0 && Math.random() < dt * 0.2) w.bubble = { emoji: '☕', life: 2 };
        else if (w.state === 'work' && !noWork && Math.random() < dt * 0.05) w.bubble = { emoji: pick(['💡', '🐛', '🚀', '🤔']), life: 2.2 };
      }
      if (w.state === 'work') {
        // na mesa; desocupado levanta logo, ocupado só de vez em quando
        if (w.timer <= 0) {
          const dest = pickDest(idle);
          routeTo(w, dest.gx, dest.gy);
          w.state = 'walk'; w.errand = dest.errand;
        }
      } else if (w.state === 'walk') {
        if (reached(w)) {
          w.state = 'pause';
          if (w.errand === 'coffee') {
            w.mug = rand(6, 11);                       // pegou café: leva a caneca
            w.timer = idle ? rand(3, 7) : rand(1.2, 2.6);
          } else {
            w.timer = idle ? rand(2.5, 6) : rand(0.6, 2.2);
          }
        }
      } else if (w.state === 'pause') {
        if (w.timer <= 0) {
          if (idle && Math.random() < 0.55) {
            // continua vagando (cozinha/lounge) enquanto não há trabalho
            const dest = pickDest(true);
            routeTo(w, dest.gx, dest.gy);
            w.state = 'walk'; w.errand = dest.errand;
          } else {
            routeTo(w, w.desk.gx, w.desk.gy + 0.8);
            w.state = 'return';
          }
        }
      }
      if (w.state === 'return' && reached(w)) {
        w.state = 'work';
        w.timer = idle ? rand(1.5, 4) : rand(6, 14);
      }
      stepToward(w, dt);
    });

    // clientes visitantes: entram pela porta, falam com a secretária e saem
    clientTimer -= dt;
    if (clientTimer <= 0) { clientTimer = rand(50, 120); spawnClient(); }
    for (let i = clients.length - 1; i >= 0; i--) {
      const c = clients[i];
      c.timer -= dt;
      if (c.bubble && (c.bubble.life -= dt) <= 0) c.bubble = null;
      if (c.state === 'in' && reached(c)) {
        c.state = 'talk'; c.timer = rand(5, 9);
        c.bubble = { emoji: pick(['💼', '📱', '💬', '🤝']), life: 3 };
        // a secretária responde
        if (npcs[0]) npcs[0].bubble = { emoji: '💬', life: 2.5 };
      } else if (c.state === 'talk' && c.timer <= 0) {
        routeTo(c, c.exit.gx, c.exit.gy); c.state = 'out';
      } else if (c.state === 'out' && reached(c)) {
        clients.splice(i, 1); continue;
      }
      stepToward(c, dt);
    }

    // NPCs (atendente): fica na recepção e dá voltinhas curtas por perto
    npcs.forEach((n) => {
      n.timer -= dt;
      if (n.state === 'work' && n.timer <= 0) {
        routeTo(n, n.home.gx + rand(-0.6, 0.6), n.home.gy + rand(-0.3, 0.6));
        n.state = 'walk'; n.timer = 3;
      } else if (n.state === 'walk' && reached(n)) {
        n.state = 'pause'; n.timer = rand(0.8, 2.5);
      } else if (n.state === 'pause' && n.timer <= 0) {
        routeTo(n, n.home.gx, n.home.gy); n.state = 'return'; n.timer = 4;
      } else if (n.state === 'return' && reached(n)) {
        n.state = 'work'; n.timer = rand(4, 9);
      }
      stepToward(n, dt);
    });

    // (removido a pedido do dono) as caixas de entrega que saíam das mesas
    // em direção à recepção não são mais geradas.
    // move pacotes
    for (let i = packages.length - 1; i >= 0; i--) {
      const p = packages[i];
      const dx = p.tx - p.gx, dy = p.ty - p.gy, d = Math.hypot(dx, dy);
      if (d < 0.08) { spawnPuff(p.gx, p.gy); packages.splice(i, 1); continue; }
      p.gx += (dx / d) * p.sp * dt; p.gy += (dy / d) * p.sp * dt;
    }

    // carros loop
    cars.forEach((c) => {
      c.gx += c.sp * dt;
      if (c.sp > 0 && c.gx > layout.W + 2.5) c.gx = -2.5;
      if (c.sp < 0 && c.gx < -2.5) c.gx = layout.W + 2.5;
    });

    // partículas / popups
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt2 = particles[i]; pt2.life -= dt; pt2.gy -= dt * 0.2; pt2.z += dt * 12;
      if (pt2.life <= 0) particles.splice(i, 1);
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.life -= dt; p.y -= dt * 34;
      if (p.life <= 0) pops.splice(i, 1);
    }

    // pad "+" de comprar mesa REMOVIDO da cena (o botão já vive na Loja)
    plusPad = null;
  }
  let spawnAcc = 0;

  function pickDest(idle) {
    const r = Math.random();
    if (idle) {
      // desocupado: prioridade é a cozinha — café e mesa de jantar
      if (r < 0.5) return { gx: layout.coffee.gx + rand(-0.15, 0.15), gy: layout.coffee.gy + rand(0.35, 0.6), errand: 'coffee' };
      if (r < 0.78) return { gx: rand(0.9, 2.0), gy: rand(1.2, 2.2), errand: 'kitchen' };  // perto da mesa de jantar
      return { gx: rand(0.5, 2.2), gy: layout.H - rand(0.7, 1.7), errand: 'lounge' };       // sofá/lounge
    }
    if (r < 0.35) return { gx: layout.coffee.gx, gy: layout.coffee.gy + 0.5, errand: 'coffee' };
    if (r < 0.65 && workers.length > 1) { const d = pick(layout.desks); return { gx: d.gx - 0.6, gy: d.gy + 0.5, errand: 'chat' }; }
    return { gx: rand(layout.KW + 0.5, layout.W - 0.6), gy: rand(0.8, layout.H - 0.8), errand: 'walk' };
  }
  // chegou ao destino final (sem waypoints pendentes)
  function reached(w) { return w.path.length === 0 && Math.hypot(w.hx - w.gx, w.hy - w.gy) < 0.06; }
  function stepToward(w, dt) {
    const dx = w.hx - w.gx, dy = w.hy - w.gy, d = Math.hypot(dx, dy);
    if (d < 0.02) {
      if (w.path.length) { const n = w.path.shift(); w.hx = n.gx; w.hy = n.gy; }
      else w.moving = false;
      return;
    }
    const sp = w.sp * dt;
    if (sp >= d) { w.gx = w.hx; w.gy = w.hy; return; }
    w.gx += (dx / d) * sp; w.gy += (dy / d) * sp; w.moving = true;
    w.dir = (dx - dy) >= 0 ? 1 : -1;
  }

  // cliente entra pela porta e vai até a frente do balcão da recepção
  function spawnClient() {
    if (!layout || clients.length >= 2) return;
    const start = { gx: layout.door.gx, gy: layout.H + 0.9 };
    const c = makeWorker(-1, start, null);
    c.shirt = pick(SHIRTS); c.acc = null;
    c.briefcase = true;
    c.sp = rand(1.0, 1.4);
    c.exit = start;
    const r = layout.reception;
    routeTo(c, r.gx + 0.5, r.gy + 0.75);   // frente do balcão
    c.state = 'in'; c.timer = 30;
    clients.push(c);
  }

  function spawnPuff(gx, gy) { for (let k = 0; k < 4; k++) particles.push({ gx: gx + rand(-0.1, 0.1), gy, z: rand(6, 12), life: rand(0.4, 0.7), r: rand(3, 6) }); }
  function spawnSmoke(gx, gy) { particles.push({ gx, gy, z: 30, life: 0.6, r: 4 }); }

  // popup de dinheiro + comemoração da equipe
  function popMoney(text) {
    if (!workers.length || !layout) return;
    const w = pick(workers);
    const p = iso(w.gx, w.gy);
    pops.push({ x: p.x, y: p.y - 40, text, life: 1.6, color: '#ffca4b' });
    workers.forEach((wk) => { if (Math.random() < 0.6) wk.bubble = { emoji: '🎉', life: 2.4 }; });
  }

  // ---------- desenho ----------
  function frame(now) {
    let dt = (now - lastNow) / 1000; lastNow = now;
    if (dt > 0.1) dt = 0.1;
    const sc = G.timeScale == null ? 1 : G.timeScale;   // cena acompanha ⏸/2x/3x
    if (G.state) { syncEntities(); update(dt * sc); draw(); }
    requestAnimationFrame(frame);
  }

  // 0 = dia claro, 1 = noite — segue o relógio do dia (0h escuro, 12h claro)
  function nightFactor() {
    const s = G.state;
    const cyc = s.dayProgress / G.DAY_LENGTH;   // 0..1 dentro do dia
    return 1 - Math.sin(cyc * Math.PI);
  }
  const mix = (a, b, k) => Math.round(a + (b - a) * k);
  function mixColor(c1, c2, k) {
    return `rgb(${mix(c1[0], c2[0], k)},${mix(c1[1], c2[1], k)},${mix(c1[2], c2[2], k)})`;
  }

  function draw() {
    const { W, H } = layout;
    const night = nightFactor();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // céu muda com o horário (dia -> noite)
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, mixColor([58, 92, 140], [16, 24, 42], night));
    sky.addColorStop(1, mixColor([26, 38, 58], [8, 12, 22], night));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(cam.scale * dpr, 0, 0, cam.scale * dpr, cam.ox * dpr, cam.oy * dpr);

    // chão externo (grama/asfalto)
    drawGround(W, H);
    // rua
    drawRoad(W, H);

    // árvores de fundo (atrás das paredes)
    layout.bgTrees.slice().sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy)).forEach(drawTree);

    // paredes de fundo (norte + oeste)
    drawWalls(W, H);

    // piso interno
    drawFloor(W, H);
    // tapetes e luminárias no piso
    drawFloorDecor();

    // coleta de entidades para z-sort
    const ents = [];
    layout.desks.forEach((d, i) => {
      if (i >= G.state.desks) return;   // só desenha mesas compradas (o "+" marca o próximo slot)
      ents.push({ d: d.gx + d.gy, kind: 'desk', o: d, idx: i });
      ents.push({ d: d.gx + d.gy + 0.75, kind: 'chair', o: d });  // cadeira logo atrás do funcionário sentado
    });
    layout.furniture.forEach((f) => ents.push({ d: f.gx + f.gy, kind: 'furn', o: f }));
    layout.kwalls.forEach((wl) => ents.push({ d: wl.gx + wl.sx / 2 + wl.gy + wl.sy / 2, kind: 'wall', o: wl }));
    layout.trees.forEach((tr) => ents.push({ d: tr.gx + tr.gy, kind: 'tree', o: tr }));
    workers.forEach((w) => ents.push({ d: w.gx + w.gy + 0.01, kind: 'worker', o: w }));
    npcs.forEach((n) => ents.push({ d: n.gx + n.gy + 0.01, kind: 'worker', o: n }));
    clients.forEach((c) => ents.push({ d: c.gx + c.gy + 0.01, kind: 'worker', o: c }));
    packages.forEach((p) => ents.push({ d: p.gx + p.gy + 0.02, kind: 'pkg', o: p }));
    cars.forEach((c) => ents.push({ d: c.gx + c.gy, kind: 'car', o: c }));
    particles.forEach((p) => ents.push({ d: p.gx + p.gy + 0.5, kind: 'part', o: p }));

    ents.sort((a, b) => a.d - b.d);
    ents.forEach((e) => {
      if (e.kind === 'desk') { if (assets.desk) drawSprite(assets.desk, e.o.gx, e.o.gy); else drawDesk(e.o, e.idx); }
      else if (e.kind === 'furn') { const a = assetFor(e.o); if (a) drawSprite(a, e.o.gx, e.o.gy, e.o.elevate); else prop(e.o.type, e.o.gx, e.o.gy, e.o); }
      else if (e.kind === 'wall') drawInnerWall(e.o);
      else if (e.kind === 'worker') drawWorker(e.o);
      else if (e.kind === 'tree') drawTree(e.o);
      else if (e.kind === 'pkg') drawPackage(e.o);
      else if (e.kind === 'car') drawCar(e.o);
      else if (e.kind === 'chair') { const a = assets.chair; if (a) drawSprite(a, e.o.gx + 0.3, e.o.gy + 0.8); else drawChair(e.o); }
      else if (e.kind === 'part') drawParticle(e.o);
    });

    // pad "+"
    if (plusPad) drawPlus(plusPad);

    // véu noturno sobre a cena (mantém interior aconchegante)
    if (night > 0.05) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(8,12,34,${(night * 0.30).toFixed(3)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    // popups em espaço de tela
    pops.forEach((p) => {
      ctx.font = 'bold 22px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillText(p.text, p.x + 1, p.y + 1);
      ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    });
    ctx.textAlign = 'left';
  }

  // tile diamante
  function tile(gx, gy, w, h, fill, stroke) {
    const a = iso(gx, gy), b = iso(gx + w, gy), c = iso(gx + w, gy + h), d = iso(gx, gy + h);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function drawGround(W, H) {
    // um grande diamante de grama sob tudo
    tile(-2, -2, W + 4, H + 4.5, '#2e7d46');
    // textura sutil
    for (let gx = -2; gx < W + 2; gx += 1) for (let gy = -2; gy < H + 2.5; gy += 1) {
      if (((gx + gy) | 0) % 2 === 0) tile(gx, gy, 1, 1, 'rgba(255,255,255,.02)');
    }
  }

  function drawRoad(W, H) {
    tile(-2.5, H + 1.1, W + 5, 1.1, '#33383f');
    // faixa central tracejada
    ctx.save();
    for (let gx = -2; gx < W + 2.5; gx += 0.6) {
      const p = iso(gx, H + 1.65);
      ctx.fillStyle = 'rgba(255,220,120,.7)';
      ctx.fillRect(p.x - 5, p.y - 2, 10, 4);
    }
    ctx.restore();
  }

  function drawFloor(W, H) {
    // piso de concreto claro dentro das paredes
    for (let gx = 0; gx < W; gx += 1) {
      for (let gy = 0; gy < H; gy += 1) {
        const w = Math.min(1, W - gx), h = Math.min(1, H - gy);
        tile(gx, gy, w, h, ((gx + gy) | 0) % 2 === 0 ? '#6d7791' : '#646e88');
      }
    }
    ctx.save(); ctx.beginPath();
    const a = iso(0, 0), b = iso(W, 0), c = iso(W, H), d = iso(0, H);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
    ctx.clip();
    // luz ambiente central (clareia o miolo do escritório)
    const cen = iso(W / 2, H / 2);
    const amb = ctx.createRadialGradient(cen.x, cen.y, 10, cen.x, cen.y, Math.max(W, H) * TH);
    amb.addColorStop(0, 'rgba(255,248,225,.18)'); amb.addColorStop(1, 'rgba(255,248,225,0)');
    ctx.fillStyle = amb; ctx.fillRect(cen.x - 900, cen.y - 900, 1800, 1800);
    // brilho quente perto das paredes de fundo
    const glow = ctx.createLinearGradient(iso(0, 0).x, iso(0, 0).y, iso(W * .5, H * .5).x, iso(W * .5, H * .5).y);
    glow.addColorStop(0, 'rgba(255,180,80,.34)'); glow.addColorStop(1, 'rgba(255,180,80,0)');
    ctx.fillStyle = glow; ctx.fill();
    ctx.restore();
  }

  function drawFloorDecor() {
    // piso cerâmico quente na cozinha
    tile(0, 0, layout.KW, layout.KH, 'rgba(196,164,110,.28)');
    ctx.strokeStyle = 'rgba(0,0,0,.1)'; ctx.lineWidth = 1;
    for (let gx = 0.55; gx < layout.KW; gx += 0.55) {
      const a = iso(gx, 0), b = iso(gx, layout.KH);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let gy = 0.55; gy < layout.KH; gy += 0.55) {
      const a = iso(0, gy), b = iso(layout.KW, gy);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // tapetes
    (layout.rugs || []).forEach((r) => {
      tile(r.gx, r.gy, r.w, r.h, r.col);
      tile(r.gx + 0.06, r.gy + 0.06, r.w - 0.12, r.h - 0.12, 'rgba(255,255,255,.04)');
    });
    // luz das luminárias no piso (poças quentes)
    (layout.lamps || []).forEach((l) => {
      const p = iso(l.gx, l.gy);
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 46);
      g.addColorStop(0, 'rgba(255,244,210,.22)'); g.addColorStop(1, 'rgba(255,244,210,0)');
      ctx.fillStyle = g;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.5);
      ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
  }

  // cuboide isométrico com contorno leve (acabamento de sprite)
  function cuboid(gx, gy, sx, sy, h, top, left, right) {
    const A = iso(gx, gy), B = iso(gx + sx, gy), C = iso(gx + sx, gy + sy), D = iso(gx, gy + sy);
    // face esquerda (D-C)
    quad(D.x, D.y, C.x, C.y, C.x, C.y - h, D.x, D.y - h, left);
    // face direita (B-C)
    quad(B.x, B.y, C.x, C.y, C.x, C.y - h, B.x, B.y - h, right);
    // topo
    ctx.beginPath();
    ctx.moveTo(A.x, A.y - h); ctx.lineTo(B.x, B.y - h); ctx.lineTo(C.x, C.y - h); ctx.lineTo(D.x, D.y - h); ctx.closePath();
    ctx.fillStyle = top; ctx.fill();
    // contorno do topo + aresta frontal
    ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(C.x, C.y - h); ctx.lineTo(C.x, C.y); ctx.stroke();
  }
  function quad(x1, y1, x2, y2, x3, y3, x4, y4, fill) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
  }

  function drawWalls(W, H) {
    const wallH = 74;
    // parede oeste (x=0)
    const w0 = iso(0, 0), w1 = iso(0, H);
    let g = ctx.createLinearGradient(0, w0.y - wallH, 0, w1.y);
    g.addColorStop(0, '#2b3550'); g.addColorStop(0.75, '#232c44'); g.addColorStop(1, '#3a2f22');
    quad(w0.x, w0.y - wallH, w1.x, w1.y - wallH, w1.x, w1.y, w0.x, w0.y, g);
    // brilho neon base
    quad(w0.x, w0.y, w1.x, w1.y, w1.x, w1.y - 6, w0.x, w0.y - 6, 'rgba(255,160,50,.35)');
    // parede norte (y=0)
    const n0 = iso(0, 0), n1 = iso(W, 0);
    let g2 = ctx.createLinearGradient(0, n0.y - wallH, 0, n1.y);
    g2.addColorStop(0, '#313b58'); g2.addColorStop(0.75, '#28324c'); g2.addColorStop(1, '#3a2f22');
    quad(n0.x, n0.y - wallH, n1.x, n1.y - wallH, n1.x, n1.y, n0.x, n0.y, g2);
    quad(n0.x, n0.y, n1.x, n1.y, n1.x, n1.y - 6, n0.x, n0.y - 6, 'rgba(255,160,50,.35)');

    // painel na parede norte (retângulo no plano da parede)
    const wallRect = (gxa, gxb, h1, h2, fill, stroke) => {
      const A = iso(gxa, 0), B = iso(gxb, 0);
      quad(A.x, A.y - h2, B.x, B.y - h2, B.x, B.y - h1, A.x, A.y - h1, fill);
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
    };
    // janelas (parede oeste) — luz do dia
    const wallRectW = (gya, gyb, h1, h2, fill) => {
      const A = iso(0, gya), B = iso(0, gyb);
      quad(A.x, A.y - h2, B.x, B.y - h2, B.x, B.y - h1, A.x, A.y - h1, fill);
    };
    // de dia: luz azulada; de noite: janelas acesas em amarelo quente
    const nf = nightFactor();
    const winCol = nf > 0.5
      ? `rgba(255,214,120,${(0.10 + nf * 0.3).toFixed(2)})`
      : 'rgba(150,200,255,.16)';
    for (let gy = 1.0; gy < H - 1.2; gy += 1.8) wallRectW(gy, gy + 0.9, 34, 60, winCol);

    // lousa branca (sobre a área de reunião, à direita)
    if (W > 5) { wallRect(W - 2.3, W - 1.0, 26, 52, '#eef1f6'); wallRect(W - 2.3, W - 1.0, 26, 52, null, 'rgba(0,0,0,.2)');
      const bp = iso(W - 1.65, 0);
      ctx.strokeStyle = '#4f8cff'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(bp.x - 14, bp.y - 44); ctx.lineTo(bp.x - 2, bp.y - 40); ctx.lineTo(bp.x + 10, bp.y - 46); ctx.stroke();
      ctx.strokeStyle = '#ff5c6c'; ctx.beginPath(); ctx.moveTo(bp.x - 12, bp.y - 34); ctx.lineTo(bp.x + 6, bp.y - 36); ctx.stroke();
    }

    // letreiro neon no topo da parede norte (à esquerda do quadro)
    const mid = iso(W / 2 - 1.1, 0);
    ctx.save();
    ctx.font = 'bold 19px Segoe UI, sans-serif'; ctx.textAlign = 'center';
    ctx.shadowColor = '#4f8cff'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#bcd4ff';
    ctx.fillText('★ ' + (G.state.company || 'AGÊNCIA').toUpperCase() + ' ★', mid.x, mid.y - wallH + 24);
    ctx.restore();
  }

  // parede interna de meia altura (divisória da cozinha)
  function drawInnerWall(wl) {
    cuboid(wl.gx, wl.gy, wl.sx, wl.sy, 30, '#8a93a8', '#5d667c', '#4c5468');
    // filete claro no topo
    const a = iso(wl.gx, wl.gy), b = iso(wl.gx + wl.sx, wl.gy), c = iso(wl.gx + wl.sx, wl.gy + wl.sy), d2 = iso(wl.gx, wl.gy + wl.sy);
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a.x, a.y - 30); ctx.lineTo(b.x, b.y - 30); ctx.lineTo(c.x, c.y - 30); ctx.lineTo(d2.x, d2.y - 30); ctx.closePath(); ctx.stroke();
  }

  function shadow(gx, gy, rx, ry) {
    const p = iso(gx, gy);
    ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill();
  }

  function drawDesk(d, idx) {
    const s = G.state;
    const busy = idx < Math.min(s.employees.length, s.desks) && s.active.length > 0;
    shadow(d.gx + 0.35, d.gy + 0.32, 27, 13);

    // pernas de metal
    [[0.04, 0.05], [0.6, 0.05], [0.04, 0.44], [0.6, 0.44]].forEach(([lx, ly]) =>
      cuboid(d.gx + lx, d.gy + ly, 0.06, 0.06, 11, '#5a6272', '#464d5c', '#3a404d'));
    // tampo de madeira
    cuboid(d.gx, d.gy, 0.7, 0.55, 14, '#a97a4e', '#7e5a39', '#6a4b2f');
    // veios da madeira
    ctx.strokeStyle = 'rgba(90,58,32,.3)'; ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const a = iso(d.gx + 0.07, d.gy + 0.12 + k * 0.15), b = iso(d.gx + 0.63, d.gy + 0.12 + k * 0.15);
      ctx.beginPath(); ctx.moveTo(a.x, a.y - 14); ctx.lineTo(b.x, b.y - 14); ctx.stroke();
    }

    // monitor (base + haste + tela virada para o personagem/câmera)
    const m = iso(d.gx + 0.32, d.gy + 0.13);
    const topY = m.y - 14;                       // altura do tampo
    ctx.fillStyle = '#2a2e38';
    ctx.beginPath(); ctx.ellipse(m.x, topY, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(m.x - 1.5, topY - 9, 3, 9);     // haste
    roundRect(m.x - 14, topY - 28, 28, 20, 3, '#1a1d24');   // moldura
    ctx.fillStyle = busy ? '#0e1622' : '#0a0d12';
    ctx.fillRect(m.x - 12, topY - 26, 24, 16);   // display
    if (busy) {
      // linhas de código coloridas "digitando"
      const cols = ['#4f8cff', '#37d67a', '#ffca4b', '#e05fb0', '#28c0d6'];
      for (let li = 0; li < 5; li++) {
        const wd = 5 + (Math.sin(t * 2 + idx * 1.7 + li * 0.9) * 0.5 + 0.5) * 15;
        ctx.fillStyle = cols[(li + idx) % cols.length];
        ctx.globalAlpha = 0.85;
        ctx.fillRect(m.x - 10, topY - 23.5 + li * 2.8, wd, 1.7);
      }
      ctx.globalAlpha = 1;
      // brilho da tela sobre a mesa
      ctx.fillStyle = 'rgba(120,170,255,.07)';
      ctx.beginPath(); ctx.ellipse(m.x, topY + 3, 20, 8, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(140,160,190,.35)';
      ctx.font = '8px monospace'; ctx.textAlign = 'center';
      ctx.fillText('· · ·', m.x, topY - 17);
      ctx.textAlign = 'left';
    }

    // teclado com teclas
    const kb = iso(d.gx + 0.36, d.gy + 0.35);
    const ky = kb.y - 14;
    roundRect(kb.x - 9, ky - 4, 18, 8, 2, '#3a4150');
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++)
      ctx.fillRect(kb.x - 7 + c * 2.5, ky - 2.4 + r * 2.6, 1.7, 1.7);
    // mouse
    const mo = iso(d.gx + 0.58, d.gy + 0.32);
    ctx.fillStyle = '#c7ccd6';
    ctx.beginPath(); ctx.ellipse(mo.x, mo.y - 15, 2.6, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    // caneca na mesa
    const mg = iso(d.gx + 0.1, d.gy + 0.42);
    const mgy = mg.y - 14;
    ctx.fillStyle = '#c94f4f'; ctx.fillRect(mg.x - 3, mgy - 6, 6, 6);
    ctx.strokeStyle = '#c94f4f'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(mg.x + 4, mgy - 3, 2.2, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  }

  // cadeira de escritório (encosto fica na frente do personagem = sentado)
  function drawChair(d) {
    const p = iso(d.gx + 0.32, d.gy + 0.66);
    // base com rodinhas
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 10, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2c3140'; ctx.lineWidth = 2;
    [[-8, 1], [8, 1], [-5, 4], [5, 4]].forEach(([dx2, dy2]) => {
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 6); ctx.lineTo(p.x + dx2, p.y + dy2); ctx.stroke();
      ctx.fillStyle = '#2c3140'; ctx.beginPath(); ctx.arc(p.x + dx2, p.y + dy2, 1.6, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = '#2c3140'; ctx.fillRect(p.x - 1.5, p.y - 12, 3, 7);  // coluna central
    // encosto
    roundRect(p.x - 8.5, p.y - 30, 17, 19, 4, '#454f68');
    roundRect(p.x - 6.5, p.y - 28, 13, 15, 3, '#525d7a');
  }

  // personagem billboard
  function drawWorker(w) {
    const p = iso(w.gx, w.gy);
    const walk = w.moving;
    const bob = walk ? Math.abs(Math.sin(t * 9 + w.phase)) * 3 : Math.sin(t * 2.2 + w.phase) * 1.1;
    const baseY = p.y - bob;
    // sombra
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, 11, 5, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill();
    const legSwing = walk ? Math.sin(t * 9 + w.phase) * 3 : 0;
    // pernas
    ctx.fillStyle = '#2b3242';
    ctx.fillRect(p.x - 6, baseY - 8, 4, 9 + legSwing);
    ctx.fillRect(p.x + 2, baseY - 8, 4, 9 - legSwing);
    // sapatos
    ctx.fillStyle = '#1b1f28';
    ctx.fillRect(p.x - 7, baseY - 0.5 + legSwing, 5.5, 2.6);
    ctx.fillRect(p.x + 1.5, baseY - 0.5 - legSwing, 5.5, 2.6);
    // corpo (com contorno leve)
    roundRect(p.x - 8, baseY - 24, 16, 17, 4, w.shirt);
    ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1;
    ctx.stroke();
    // braço (digitando quando na mesa)
    if (w.state === 'work') {
      const type = Math.sin(t * 12 + w.phase) * 2;
      ctx.fillStyle = w.skin;
      ctx.fillRect(p.x - 9, baseY - 18 + type, 4, 6);
      ctx.fillRect(p.x + 5, baseY - 18 - type, 4, 6);
    } else {
      ctx.fillStyle = w.shirt;
      ctx.fillRect(p.x - 10, baseY - 22, 3, 10);
      ctx.fillRect(p.x + 7, baseY - 22, 3, 10);
    }
    // cabeça (com contorno leve)
    ctx.beginPath(); ctx.arc(p.x, baseY - 30, 7, 0, Math.PI * 2); ctx.fillStyle = w.skin; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1; ctx.stroke();
    // cabelo
    ctx.beginPath(); ctx.arc(p.x, baseY - 32, 7, Math.PI, Math.PI * 2); ctx.fillStyle = w.hair; ctx.fill();
    ctx.fillRect(p.x - 7, baseY - 33, 14, 3);

    // ---- acessório por cargo ----
    const hy = baseY - 32;
    if (w.acc === 'cap') {              // júnior: boné
      ctx.fillStyle = '#e04f4f';
      ctx.beginPath(); ctx.arc(p.x, hy, 7.4, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillRect(p.x - 1, hy - 2, 10, 3);   // aba
    } else if (w.acc === 'glasses') {   // sênior: óculos
      ctx.strokeStyle = '#20242e'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(p.x - 3.4, baseY - 30, 2.6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x + 3.4, baseY - 30, 2.6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - 1, baseY - 30); ctx.lineTo(p.x + 1, baseY - 30); ctx.stroke();
    } else if (w.acc === 'beret') {     // designer: boina
      ctx.fillStyle = '#8a4dbf';
      ctx.beginPath(); ctx.ellipse(p.x - 2, hy - 2, 8, 4, -0.25, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x - 2, hy - 6, 1.6, 0, Math.PI * 2); ctx.fill();
    } else if (w.acc === 'phones') {    // QA: fones
      ctx.strokeStyle = '#20242e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, hy + 1, 8, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.fillStyle = '#20242e';
      ctx.fillRect(p.x - 9.5, baseY - 32, 3.4, 5); ctx.fillRect(p.x + 6.1, baseY - 32, 3.4, 5);
    } else if (w.acc === 'tie') {       // gerente: gravata
      ctx.fillStyle = '#c94f4f';
      ctx.beginPath(); ctx.moveTo(p.x, baseY - 24); ctx.lineTo(p.x + 2.4, baseY - 20);
      ctx.lineTo(p.x, baseY - 12); ctx.lineTo(p.x - 2.4, baseY - 20); ctx.closePath(); ctx.fill();
    } else if (w.acc === 'headset') {   // atendente: headset com microfone
      ctx.strokeStyle = '#20242e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, hy + 1, 8, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
      ctx.fillStyle = '#20242e'; ctx.fillRect(p.x + 6.1, baseY - 32, 3.2, 4.6);
      ctx.beginPath(); ctx.moveTo(p.x + 7.5, baseY - 28); ctx.quadraticCurveTo(p.x + 6, baseY - 24, p.x + 2.5, baseY - 25); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x + 2.2, baseY - 25, 1.4, 0, Math.PI * 2); ctx.fill();
    }

    // ---- balão de fala ----
    if (w.bubble) {
      const alpha = Math.min(1, w.bubble.life);
      ctx.globalAlpha = alpha;
      const by = baseY - 50;
      roundRect(p.x - 11, by - 10, 22, 20, 7, 'rgba(255,255,255,.92)');
      ctx.beginPath(); ctx.moveTo(p.x - 3, by + 10); ctx.lineTo(p.x + 3, by + 10); ctx.lineTo(p.x, by + 15); ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fill();
      ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(w.bubble.emoji, p.x, by + 5);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

    // ---- maleta do cliente ----
    if (w.briefcase) {
      const bx = p.x + (w.dir >= 0 ? 9 : -14), by = baseY - 12;
      roundRect(bx, by, 6.5, 5.5, 1.5, '#6b4a2b');
      ctx.strokeStyle = '#553a22'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(bx + 3.2, by, 2, Math.PI, 0); ctx.stroke();
    }

    // ---- caneca de café (depois do intervalo) ----
    if (w.mug > 0) {
      const mx = p.x + (w.dir >= 0 ? 10 : -13), my = baseY - 16;
      ctx.fillStyle = '#e8eef7'; ctx.fillRect(mx, my, 5.5, 6);
      ctx.strokeStyle = '#e8eef7'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(mx + (w.dir >= 0 ? 6 : 0), my + 3, 2.2, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.fillStyle = '#6f472e'; ctx.fillRect(mx + 1, my + 1, 3.5, 1.6);
      // fumacinha
      const sw = Math.sin(t * 4 + w.phase) * 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(mx + 3, my - 2); ctx.quadraticCurveTo(mx + 3 + sw, my - 6, mx + 3, my - 10); ctx.stroke();
    }
  }

  function roundRect(x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }

  function drawPlant(o) {
    shadow(o.gx, o.gy, 9, 4);
    const p = iso(o.gx, o.gy);
    ctx.fillStyle = '#6b4a2b'; ctx.fillRect(p.x - 5, p.y - 12, 10, 12); // vaso
    const sway = Math.sin(t * 1.5 + o.gx) * 2;
    ctx.fillStyle = '#2fa85a';
    ctx.beginPath(); ctx.ellipse(p.x + sway, p.y - 22, 10, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#37c368';
    ctx.beginPath(); ctx.ellipse(p.x + sway - 4, p.y - 26, 6, 9, 0, 0, Math.PI * 2); ctx.fill();
  }

  // máquina de espresso profissional
  function drawCoffee(o) {
    shadow(o.gx, o.gy, 11, 5);
    const p = iso(o.gx, o.gy);
    // bancadinha/base
    cuboid(o.gx - 0.17, o.gy - 0.16, 0.36, 0.32, 8, '#3a4150', '#2e3440', '#262b35');
    // corpo cromado
    cuboid(o.gx - 0.14, o.gy - 0.13, 0.3, 0.26, 26, '#d7dbe2', '#a7adb8', '#8b919d');
    // topo escuro com moedor
    cuboid(o.gx - 0.14, o.gy - 0.13, 0.3, 0.26, 30, '#3a3f4c', '#3a3f4c', '#2e323c');
    ctx.fillStyle = '#20242c';
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 32, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
    // bico e xícara
    ctx.fillStyle = '#3a3f4c'; ctx.fillRect(p.x - 1.5, p.y - 18, 3, 5);
    ctx.fillStyle = '#eef1f6'; ctx.fillRect(p.x - 3, p.y - 11, 6, 4.5);
    ctx.strokeStyle = '#eef1f6'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(p.x + 4, p.y - 9, 1.8, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    // luzinha e botões
    ctx.fillStyle = Math.sin(t * 2) > 0 ? '#37d67a' : '#255c3a';
    ctx.beginPath(); ctx.arc(p.x - 7, p.y - 24, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c94f4f'; ctx.beginPath(); ctx.arc(p.x - 3, p.y - 24, 1.5, 0, Math.PI * 2); ctx.fill();
    // vapor saindo da xícara
    const s = Math.sin(t * 3) * 2;
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 13); ctx.quadraticCurveTo(p.x + s + 3, p.y - 22, p.x, p.y - 30); ctx.stroke();
  }

  function drawTree(o) {
    const sc = o.s || 1;
    shadow(o.gx, o.gy, 10 * sc, 5 * sc);
    const p = iso(o.gx, o.gy);
    ctx.fillStyle = '#6b4a2b'; ctx.fillRect(p.x - 3 * sc, p.y - 18 * sc, 6 * sc, 18 * sc);
    const sway = Math.sin(t * 1.3 + o.gx * 2) * 2;
    ctx.fillStyle = '#2e8b48';
    ctx.beginPath(); ctx.arc(p.x + sway, p.y - 26 * sc, 13 * sc, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#37a557';
    ctx.beginPath(); ctx.arc(p.x + sway - 5 * sc, p.y - 31 * sc, 8 * sc, 0, Math.PI * 2); ctx.fill();
  }

  function drawPackage(o) {
    const p = iso(o.gx, o.gy);
    const bob = Math.abs(Math.sin(t * 8 + o.bob)) * 4;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, 8, 4, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill();
    // caixinha (cuboide pequeno)
    const y = p.y - bob;
    cuboidAt(p.x, y, 9, 9, 9, o.col, shade(o.col, -0.2), shade(o.col, -0.4));
    // fita
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(p.x - 1, y - 15, 2, 15);
  }
  // cuboide direto em tela (para itens pequenos)
  function cuboidAt(cx, cy, w, d, h, top, left, right) {
    const hw = w / 2;
    // topo (losango)
    ctx.beginPath();
    ctx.moveTo(cx, cy - h - d / 2); ctx.lineTo(cx + hw, cy - h); ctx.lineTo(cx, cy - h + d / 2); ctx.lineTo(cx - hw, cy - h); ctx.closePath();
    ctx.fillStyle = top; ctx.fill();
    // face esquerda
    ctx.beginPath(); ctx.moveTo(cx - hw, cy - h); ctx.lineTo(cx, cy - h + d / 2); ctx.lineTo(cx, cy + d / 2); ctx.lineTo(cx - hw, cy); ctx.closePath();
    ctx.fillStyle = left; ctx.fill();
    // face direita
    ctx.beginPath(); ctx.moveTo(cx + hw, cy - h); ctx.lineTo(cx, cy - h + d / 2); ctx.lineTo(cx, cy + d / 2); ctx.lineTo(cx + hw, cy); ctx.closePath();
    ctx.fillStyle = right; ctx.fill();
  }

  // sedan isométrico alinhado à rua
  function drawCar(o) {
    const L = 0.95, Wd = 0.4, dir = o.sp >= 0 ? 1 : -1;
    const gx = o.gx - L / 2, gy = o.gy - Wd / 2;
    const c = o.col;
    const pc = iso(o.gx, o.gy);
    // sombra
    ctx.beginPath(); ctx.ellipse(pc.x, pc.y + 2, 26, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
    // carroceria
    cuboid(gx, gy, L, Wd, 10, shade(c, 0.05), shade(c, -0.18), shade(c, -0.3));
    // capô e porta-malas (faixas mais claras no topo)
    tile(gx + (dir > 0 ? L - 0.24 : 0.02), gy + 0.03, 0.22, Wd - 0.06, shade(c, 0.16));
    tile(gx + (dir > 0 ? 0.02 : L - 0.24), gy + 0.03, 0.22, Wd - 0.06, shade(c, 0.1));
    // cabine com vidros
    const cb = gx + (dir > 0 ? 0.26 : 0.28);
    cuboid(cb, gy + 0.04, 0.42, Wd - 0.08, 19, shade(c, 0.18), 'rgba(150,200,235,.92)', 'rgba(115,165,205,.92)');
    // reflexo no vidro
    const gl = iso(cb + 0.36, gy + 0.04 + (Wd - 0.08) / 2);
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(gl.x - 3, gl.y - 10); ctx.lineTo(gl.x + 3, gl.y - 16); ctx.stroke();
    // rodas do lado visível, com calota
    [gx + 0.2, gx + L - 0.2].forEach((wx) => {
      const wp = iso(wx, gy + Wd);
      ctx.fillStyle = '#14171d';
      ctx.beginPath(); ctx.ellipse(wp.x, wp.y - 4, 5.2, 6.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9aa1ad';
      ctx.beginPath(); ctx.ellipse(wp.x, wp.y - 4, 2.2, 2.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a404d';
      ctx.beginPath(); ctx.ellipse(wp.x, wp.y - 4, 1, 1.2, 0, 0, Math.PI * 2); ctx.fill();
    });
    // faróis (frente) e lanternas (trás)
    const f = iso(dir > 0 ? gx + L : gx, gy + Wd * 0.62);
    ctx.fillStyle = '#fff2b8'; ctx.fillRect(f.x - 2, f.y - 9, 4, 3.2);
    const r2 = iso(dir > 0 ? gx : gx + L, gy + Wd * 0.62);
    ctx.fillStyle = '#ff5c6c'; ctx.fillRect(r2.x - 2, r2.y - 9, 4, 3.2);
  }

  function drawParticle(o) {
    const p = iso(o.gx, o.gy);
    ctx.globalAlpha = Math.max(0, o.life);
    ctx.beginPath(); ctx.arc(p.x, p.y - o.z, o.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220,230,255,.7)'; ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawPlus(p) {
    const pulse = 0.6 + 0.4 * Math.sin(t * 4);
    ctx.save();
    ctx.globalAlpha = pulse;
    // pad no chão
    ctx.beginPath(); ctx.ellipse(p.x + HW * 0.35, p.y + HH * 0.35, 30, 15, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(79,140,255,.25)'; ctx.fill();
    ctx.strokeStyle = 'rgba(79,140,255,.9)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = 1;
    // símbolo +
    ctx.fillStyle = '#8fb6ff';
    ctx.font = 'bold 30px Segoe UI, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('+', p.x + HW * 0.35, p.y + HH * 0.35 - 6 - Math.sin(t * 4) * 3);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.restore();
  }

  // clareia/escurece cor hex
  function shade(hex, amt) {
    const c = hex.replace('#', '');
    let r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    r = Math.max(0, Math.min(255, Math.round(r + 255 * amt)));
    g = Math.max(0, Math.min(255, Math.round(g + 255 * amt)));
    b = Math.max(0, Math.min(255, Math.round(b + 255 * amt)));
    return `rgb(${r},${g},${b})`;
  }

  // ---------- input da câmera + clique no pad "+" ----------
  function localXY(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }
  function onWheel(ev) {
    ev.preventDefault();
    const m = localXY(ev);
    const factor = Math.pow(1.0015, -ev.deltaY);
    const ns = Math.max(fit.scale * 0.5, Math.min(fit.scale * 3.2, cam.scale * factor));
    // mantém o ponto sob o cursor fixo
    cam.ox = m.x - (m.x - cam.ox) * (ns / cam.scale);
    cam.oy = m.y - (m.y - cam.oy) * (ns / cam.scale);
    cam.scale = ns;
  }
  // suporte a múltiplos ponteiros: 1 dedo arrasta, 2 dedos = pinça (zoom)
  const pointers = new Map();
  let pinch = null;
  function pinchInfo() {
    const [a, b] = [...pointers.values()];
    return {
      d: Math.hypot(a.x - b.x, a.y - b.y),
      cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
    };
  }
  function onPointerDown(ev) {
    const m = localXY(ev);
    pointers.set(ev.pointerId, m);
    canvas.setPointerCapture(ev.pointerId);
    if (pointers.size === 2) {
      dragging = null;
      const pi = pinchInfo();
      pinch = { d0: pi.d, cx0: pi.cx, cy0: pi.cy, scale0: cam.scale, ox0: cam.ox, oy0: cam.oy };
    } else if (pointers.size === 1) {
      dragging = { sx: m.x, sy: m.y, ox: cam.ox, oy: cam.oy, moved: false };
    }
  }
  function onPointerMove(ev) {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, localXY(ev));
    if (pointers.size === 2 && pinch) {
      const pi = pinchInfo();
      const ns = Math.max(fit.scale * 0.5, Math.min(fit.scale * 3.2, pinch.scale0 * (pi.d / Math.max(20, pinch.d0))));
      // mantém o ponto entre os dedos ancorado e acompanha o deslocamento deles
      cam.ox = pi.cx - (pinch.cx0 - pinch.ox0) * (ns / pinch.scale0);
      cam.oy = pi.cy - (pinch.cy0 - pinch.oy0) * (ns / pinch.scale0);
      cam.scale = ns;
      return;
    }
    if (!dragging) return;
    const m = localXY(ev);
    const dx = m.x - dragging.sx, dy = m.y - dragging.sy;
    if (Math.hypot(dx, dy) > 5) dragging.moved = true;
    if (dragging.moved) { cam.ox = dragging.ox + dx; cam.oy = dragging.oy + dy; }
  }
  function onPointerUp(ev) {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = null;
    const wasDrag = dragging && dragging.moved;
    dragging = null;
    if (wasDrag) return;               // arrastou: não é clique
    const m = localXY(ev);
    const wx = (m.x - cam.ox) / cam.scale;
    const wy = (m.y - cam.oy) / cam.scale;

    // clique num personagem? (procura o mais próximo num raio de ~22px de mundo)
    let best = null, bestD = 26 / Math.max(0.5, cam.scale / fit.scale);
    const consider = (kind, idx, gx, gy) => {
      const p = iso(gx, gy);
      const d = Math.hypot(wx - p.x, wy - (p.y - 18));
      if (d < bestD) { bestD = d; best = { kind, idx, sx: m.x, sy: m.y }; }
    };
    workers.forEach((w, i) => consider('emp', i, w.gx, w.gy));
    npcs.forEach((n, i) => consider('npc', i, n.gx, n.gy));
    if (best) {
      window.dispatchEvent(new CustomEvent('workerclick', { detail: best }));
      return;
    }
    window.dispatchEvent(new CustomEvent('scenebgclick'));

    if (!plusPad) return;
    const tx = plusPad.x + HW * 0.35, ty = plusPad.y + HH * 0.35;
    if (Math.hypot(wx - tx, wy - ty) < 34) G.buyDesk();
  }

  function npcInfo(i) {
    const n = npcs[i];
    return n ? { name: n.pname || 'Atendente', role: n.role } : null;
  }

  // posição em px CSS de um personagem no canvas (para testes/overlays)
  function workerScreenPos(i) {
    const w = workers[i];
    if (!w) return null;
    const p = iso(w.gx, w.gy);
    return { x: p.x * cam.scale + cam.ox, y: (p.y - 18) * cam.scale + cam.oy };
  }

  window.IsoOffice = { init, resize, popMoney, npcInfo, workerScreenPos, spawnClient };
})();
