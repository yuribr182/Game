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
  let npcs = [];             // NPCs decorativos (atendente, cliente)
  let packages = [];         // entregas em movimento
  let pops = [];             // popups flutuantes (+R$)
  let cars = [];             // carros na rua
  let robot = null;          // robô patrulheiro
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

  // ---------- inicialização ----------
  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    buildTK();
    window.addEventListener('resize', resize);
    // câmera: zoom (roda), arrastar (mouse/touch), duplo clique = enquadrar
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', () => (dragging = null));
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

    // ---- MÓVEIS (o pacote de arte) por zona ----
    const F = [];
    // COZINHA (dentro do cômodo)
    F.push({ type: 'fridge', gx: 0.25, gy: 0.3 });
    F.push({ type: 'stove', gx: 0.3, gy: 1.05 });
    F.push({ type: 'sink', gx: 0.3, gy: 1.7 });
    F.push({ type: 'microwave', gx: 1.1, gy: 0.35 });
    F.push({ type: 'diningTable', gx: 1.3, gy: 1.5 });
    F.push({ type: 'stool', gx: 1.15, gy: 1.3, col: '#e0a54b' });
    F.push({ type: 'stool', gx: 1.95, gy: 1.95, col: '#c94f4f' });
    // LOUNGE (frente-esquerda / sul-oeste)
    F.push({ type: 'sofa', gx: 0.4, gy: H - 1.6, col: '#3f6fd6' });
    F.push({ type: 'coffeeTable', gx: 0.55, gy: H - 0.95 });
    F.push({ type: 'tv', gx: 0.25, gy: H - 2.4 });
    F.push({ type: 'plantBig', gx: 1.5, gy: H - 0.5 });
    // decorações desbloqueáveis (loja)
    const upg = s.upgrades || [];
    if (upg.includes('pufes')) {
      F.push({ type: 'pufe', gx: 1.85, gy: H - 1.15, col: '#ff9f45' });
      F.push({ type: 'pufe', gx: 2.15, gy: H - 0.8, col: '#37d67a' });
      F.push({ type: 'pufe', gx: 1.7, gy: H - 0.65, col: '#4f8cff' });
    }
    if (upg.includes('arcade')) F.push({ type: 'arcade', gx: 0.35, gy: H - 3.1 });
    if (upg.includes('sinuca')) F.push({ type: 'poolTable', gx: 2.7, gy: H - 1.5 });
    // RECEPÇÃO (frente-direita, perto da porta)
    layout.reception = { gx: W - 2.2, gy: H - 1.7 };
    F.push({ type: 'reception', gx: W - 2.2, gy: H - 1.7 });
    F.push({ type: 'chair', gx: W - 0.7, gy: H - 1.6, col: '#7c5cff' });
    F.push({ type: 'chair', gx: W - 0.7, gy: H - 1.0, col: '#7c5cff' });
    F.push({ type: 'plantBig', gx: W - 0.4, gy: H - 2.3 });
    // REUNIÃO (fundo-direita / norte-leste)
    F.push({ type: 'meetingTable', gx: W - 2.2, gy: 0.6 });
    [[-0.2, 0.4], [-0.2, 1.0], [1.35, 0.4], [1.35, 1.0], [0.5, -0.15], [0.5, 1.5]].forEach(([dx, dy]) =>
      F.push({ type: 'chair', gx: W - 2.2 + dx, gy: 0.6 + dy, col: '#556071' }));
    // EQUIPAMENTOS
    F.push({ type: 'serverRack', gx: 0.35, gy: H * 0.5 });
    F.push({ type: 'waterCooler', gx: W - 0.5, gy: H * 0.5 });
    F.push({ type: 'printer', gx: WX0 - 0.55, gy: WY0 + 1.9 });
    F.push({ type: 'bookshelf', gx: W - 0.4, gy: 2.4 });
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
      const att = makeWorker(-1, { gx: r.gx + 0.35, gy: r.gy - 0.25 }, 'atendente');
      att.home = { gx: r.gx + 0.35, gy: r.gy - 0.25 };
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
      w.desk = layout.desks[i];
      const roleId = s.employees[i].role;
      if (w.role !== roleId) {
        w.role = roleId;
        const st = ROLE_STYLE[roleId];
        if (st) { w.shirt = st.shirt; w.acc = st.acc; }
      }
      if (w.state === 'work') { w.hx = w.desk.gx; w.hy = w.desk.gy + 0.55; w.path = []; }
    });

    lastDesks = s.desks; lastEmp = emp;

    // robô patrulheiro (surge quando há equipe)
    if (emp > 0 && !robot) robot = { gx: 0.5, gy: layout.H - 0.6, seg: 0, tp: 0, spin: 0 };
    if (emp === 0) robot = null;

    // carros na rua (2 fixos)
    if (cars.length === 0 && layout) {
      cars.push({ gx: -2, gy: layout.H + 1.4, sp: 0.9, col: pick(SHIRTS) });
      cars.push({ gx: layout.W + 2, gy: layout.H + 1.9, sp: -0.7, col: pick(SHIRTS) });
    }
  }

  function makeWorker(i, d, roleId) {
    const style = ROLE_STYLE[roleId] || { shirt: pick(SHIRTS), acc: null };
    return {
      i, desk: d, role: roleId || null,
      gx: d.gx, gy: d.gy + 0.55,
      hx: d.gx, hy: d.gy + 0.55,          // waypoint atual
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

    // trabalhadores (desocupados = sem projeto ativo -> vão à cozinha tomar café)
    const idle = s.active.length === 0;
    workers.forEach((w) => {
      w.timer -= dt;
      if (w.mug > 0) w.mug -= dt;
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
            routeTo(w, w.desk.gx, w.desk.gy + 0.55);
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

    // fluxo de entregas (pacotes) proporcional à produção -> movimento constante
    if (producing && layout && workers.length) {
      spawnAcc += dt * (0.4 + Math.min(3, G.production() * 0.05));
      while (spawnAcc >= 1) {
        spawnAcc -= 1;
        const w = pick(workers);
        packages.push({ gx: w.desk.gx, gy: w.desk.gy + 0.3, tx: layout.door.gx, ty: layout.door.gy, sp: rand(1.4, 2.2), col: pick(['#4f8cff', '#37d67a', '#ffca4b']), bob: rand(0, 6) });
      }
    }
    // move pacotes
    for (let i = packages.length - 1; i >= 0; i--) {
      const p = packages[i];
      const dx = p.tx - p.gx, dy = p.ty - p.gy, d = Math.hypot(dx, dy);
      if (d < 0.08) { spawnPuff(p.gx, p.gy); packages.splice(i, 1); continue; }
      p.gx += (dx / d) * p.sp * dt; p.gy += (dy / d) * p.sp * dt;
    }

    // robô patrulha o perímetro
    if (robot && layout) updateRobot(dt);

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

    // pad "+" pulsante para comprar mesa
    if (s.desks < G.maxDesks()) {
      const d = layout.desks[s.desks];
      plusPad = d ? iso(d.gx, d.gy) : null;
    } else plusPad = null;
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

  function updateRobot(dt) {
    const path = [
      { gx: 0.5, gy: layout.H - 0.6 }, { gx: layout.W - 0.6, gy: layout.H - 0.6 },
      { gx: layout.W - 0.6, gy: 0.6 }, { gx: 0.5, gy: 0.6 },
    ];
    const a = path[robot.seg], b = path[(robot.seg + 1) % path.length];
    robot.tp += dt * 0.35;
    if (robot.tp >= 1) { robot.tp = 0; robot.seg = (robot.seg + 1) % path.length; }
    robot.gx = lerp(a.gx, b.gx, robot.tp);
    robot.gy = lerp(a.gy, b.gy, robot.tp);
    robot.spin += dt * 6;
  }

  function spawnPuff(gx, gy) { for (let k = 0; k < 4; k++) particles.push({ gx: gx + rand(-0.1, 0.1), gy, z: rand(6, 12), life: rand(0.4, 0.7), r: rand(3, 6) }); }
  function spawnSmoke(gx, gy) { particles.push({ gx, gy, z: 30, life: 0.6, r: 4 }); }

  // popup de dinheiro
  function popMoney(text) {
    if (!workers.length || !layout) return;
    const w = pick(workers);
    const p = iso(w.gx, w.gy);
    pops.push({ x: p.x, y: p.y - 40, text, life: 1.6, color: '#ffca4b' });
  }

  // ---------- desenho ----------
  function frame(now) {
    let dt = (now - lastNow) / 1000; lastNow = now;
    if (dt > 0.1) dt = 0.1;
    if (G.state) { syncEntities(); update(dt); draw(); }
    requestAnimationFrame(frame);
  }

  function draw() {
    const { W, H } = layout;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // céu
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, '#20304d'); sky.addColorStop(1, '#0e1622');
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
    layout.desks.forEach((d, i) => ents.push({ d: d.gx + d.gy, kind: 'desk', o: d, idx: i }));
    layout.furniture.forEach((f) => ents.push({ d: f.gx + f.gy, kind: 'furn', o: f }));
    layout.kwalls.forEach((wl) => ents.push({ d: wl.gx + wl.sx / 2 + wl.gy + wl.sy / 2, kind: 'wall', o: wl }));
    ents.push({ d: layout.coffee.gx + layout.coffee.gy, kind: 'coffee', o: layout.coffee });
    layout.trees.forEach((tr) => ents.push({ d: tr.gx + tr.gy, kind: 'tree', o: tr }));
    workers.forEach((w) => ents.push({ d: w.gx + w.gy + 0.01, kind: 'worker', o: w }));
    npcs.forEach((n) => ents.push({ d: n.gx + n.gy + 0.01, kind: 'worker', o: n }));
    packages.forEach((p) => ents.push({ d: p.gx + p.gy + 0.02, kind: 'pkg', o: p }));
    if (robot) ents.push({ d: robot.gx + robot.gy + 0.01, kind: 'robot', o: robot });
    cars.forEach((c) => ents.push({ d: c.gx + c.gy, kind: 'car', o: c }));
    particles.forEach((p) => ents.push({ d: p.gx + p.gy + 0.5, kind: 'part', o: p }));

    ents.sort((a, b) => a.d - b.d);
    ents.forEach((e) => {
      if (e.kind === 'desk') drawDesk(e.o, e.idx);
      else if (e.kind === 'furn') prop(e.o.type, e.o.gx, e.o.gy, e.o);
      else if (e.kind === 'wall') drawInnerWall(e.o);
      else if (e.kind === 'worker') drawWorker(e.o);
      else if (e.kind === 'coffee') drawCoffee(e.o);
      else if (e.kind === 'tree') drawTree(e.o);
      else if (e.kind === 'pkg') drawPackage(e.o);
      else if (e.kind === 'robot') drawRobot(e.o);
      else if (e.kind === 'car') drawCar(e.o);
      else if (e.kind === 'part') drawParticle(e.o);
    });

    // pad "+"
    if (plusPad) drawPlus(plusPad);

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

  // cuboide isométrico
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
    for (let gy = 1.0; gy < H - 1.2; gy += 1.8) wallRectW(gy, gy + 0.9, 34, 60, 'rgba(150,200,255,.16)');

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
    const busy = idx < s.employees.length && s.active.length > 0;
    shadow(d.gx + 0.35, d.gy + 0.35, 26, 12);
    // tampo da mesa
    cuboid(d.gx, d.gy, 0.7, 0.55, 14, '#5b6172', '#3f4454', '#333846');
    // monitor
    const mx = d.gx + 0.12, my = d.gy + 0.06;
    cuboid(mx, my, 0.32, 0.06, 26, '#20242e', '#171a22', '#12141a'); // base/tela traseira
    // face da tela (brilhando quando produzindo)
    const flick = busy ? (0.55 + 0.45 * Math.abs(Math.sin(t * 6 + idx))) : 0.12;
    const p0 = iso(mx, my + 0.06), p1 = iso(mx + 0.32, my + 0.06);
    quad(p0.x, p0.y - 8, p1.x, p1.y - 8, p1.x, p1.y - 24, p0.x, p0.y - 24, `rgba(90,160,255,${flick})`);
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
    // corpo
    roundRect(p.x - 8, baseY - 24, 16, 17, 4, w.shirt);
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
    // cabeça
    ctx.beginPath(); ctx.arc(p.x, baseY - 30, 7, 0, Math.PI * 2); ctx.fillStyle = w.skin; ctx.fill();
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

  function drawCoffee(o) {
    shadow(o.gx, o.gy, 10, 5);
    cuboid(o.gx - 0.15, o.gy - 0.15, 0.32, 0.3, 30, '#c9ccd6', '#9aa0ae', '#7f8593');
    const p = iso(o.gx, o.gy);
    ctx.fillStyle = '#3a3f4c'; ctx.fillRect(p.x - 6, p.y - 22, 12, 8);
    // vapor
    const s = Math.sin(t * 3) * 2;
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 32); ctx.quadraticCurveTo(p.x + s + 3, p.y - 40, p.x, p.y - 48); ctx.stroke();
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

  function drawRobot(o) {
    const p = iso(o.gx, o.gy);
    const bob = Math.sin(t * 5) * 2;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 1, 10, 5, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill();
    // corpo disco
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 6 + bob, 12, 7, 0, 0, Math.PI * 2); ctx.fillStyle = '#8a93a6'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 9 + bob, 12, 6, 0, 0, Math.PI * 2); ctx.fillStyle = '#c7cedb'; ctx.fill();
    // luz giratória
    const lx = p.x + Math.cos(o.spin) * 6;
    ctx.beginPath(); ctx.arc(lx, p.y - 12 + bob, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#4f8cff'; ctx.fill();
  }

  function drawCar(o) {
    const p = iso(o.gx, o.gy);
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 16, 6, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill();
    cuboidAt(p.x, p.y, 30, 16, 12, o.col, shade(o.col, -0.2), shade(o.col, -0.4));
    cuboidAt(p.x, p.y - 12, 18, 10, 9, shade(o.col, 0.1), shade(o.col, -0.1), shade(o.col, -0.3));
    // faróis
    ctx.fillStyle = '#fff6c8'; ctx.fillRect(p.x + (o.sp > 0 ? 12 : -15), p.y - 4, 3, 3);
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
  function onPointerDown(ev) {
    const m = localXY(ev);
    dragging = { sx: m.x, sy: m.y, ox: cam.ox, oy: cam.oy, moved: false };
    canvas.setPointerCapture(ev.pointerId);
  }
  function onPointerMove(ev) {
    if (!dragging) return;
    const m = localXY(ev);
    const dx = m.x - dragging.sx, dy = m.y - dragging.sy;
    if (Math.hypot(dx, dy) > 5) dragging.moved = true;
    if (dragging.moved) { cam.ox = dragging.ox + dx; cam.oy = dragging.oy + dy; }
  }
  function onPointerUp(ev) {
    const wasDrag = dragging && dragging.moved;
    dragging = null;
    if (wasDrag) return;               // arrastou: não é clique
    if (!plusPad) return;
    const m = localXY(ev);
    const wx = (m.x - cam.ox) / cam.scale;
    const wy = (m.y - cam.oy) / cam.scale;
    const tx = plusPad.x + HW * 0.35, ty = plusPad.y + HH * 0.35;
    if (Math.hypot(wx - tx, wy - ty) < 34) G.buyDesk();
  }

  window.IsoOffice = { init, resize, popMoney };
})();
