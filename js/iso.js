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
  let layout = null;         // { W, H, desks:[{gx,gy}] , perRow }
  let workers = [];          // personagens
  let packages = [];         // entregas em movimento
  let pops = [];             // popups flutuantes (+R$)
  let cars = [];             // carros na rua
  let robot = null;          // robô patrulheiro
  let particles = [];        // fumacinha / faíscas
  let lastTier = -1, lastDesks = -1, lastEmp = -1;
  let t = 0, lastNow = 0;
  let running = false;
  let plusPad = null;        // posição do pad "+" clicável (raw screen)

  const SHIRTS = ['#4f8cff', '#37d67a', '#ffca4b', '#ff5c6c', '#7c5cff', '#ff9f45', '#28c0d6', '#e05fb0'];
  const SKINS = ['#f2c49b', '#e0a878', '#c68642', '#8d5524', '#ffd9b3'];
  const HAIRS = ['#2b2118', '#4a342a', '#111', '#6b4a2b', '#d9c27a', '#7a3b2b'];

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const lerp = (a, b, k) => a + (b - a) * k;

  // ---- projeção isométrica (coordenadas "mundo" -> tela crua) ----
  function iso(gx, gy) {
    return { x: (gx - gy) * HW, y: (gx + gy) * HH };
  }

  // ---------- inicialização ----------
  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', resize);
    canvas.addEventListener('click', onClick);
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
    const perRow = Math.min(6, Math.max(2, Math.ceil(Math.sqrt(max))));
    const rows = Math.ceil(max / perRow);
    const DX = 1.5, DY = 1.7;
    const desks = [];
    for (let i = 0; i < max; i++) {
      const gx = 0.9 + (i % perRow) * DX;
      const gy = 1.0 + Math.floor(i / perRow) * DY;
      desks.push({ gx, gy });
    }
    const W = 0.9 + perRow * DX + 0.4;
    const H = 1.0 + rows * DY + 0.6;
    layout = { W, H, desks, perRow, max };

    // objetos de decoração fixos
    layout.coffee = { gx: W - 0.5, gy: 0.5 };
    layout.door = { gx: W - 0.6, gy: H - 0.2 };
    layout.plants = [
      { gx: 0.3, gy: 0.3 }, { gx: W - 0.3, gy: H - 0.3 }, { gx: 0.3, gy: H - 0.4 },
    ];
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
    const cw = canvas.width, ch = canvas.height;
    const contentW = (maxX - minX), contentH = (maxY - minY);
    const scale = Math.min(cw / contentW, ch / contentH) * 0.96;
    cam.scale = scale;
    cam.ox = (cw - contentW * scale) / 2 - minX * scale;
    cam.oy = (ch - contentH * scale) / 2 - minY * scale;
  }

  // ---------- sincroniza entidades com o estado ----------
  function syncEntities() {
    const s = G.state;
    if (!layout || s.tier !== lastTier) { lastTier = s.tier; buildLayout(); workers = []; }
    const emp = Math.min(s.employees.length, s.desks);

    // trabalhadores = funcionários sentados
    while (workers.length < emp) {
      const i = workers.length;
      const d = layout.desks[i];
      workers.push(makeWorker(i, d));
    }
    while (workers.length > emp) workers.pop();
    // reatribui mesa (caso layout mudou)
    workers.forEach((w, i) => { w.desk = layout.desks[i]; if (w.state === 'work') { w.hx = w.desk.gx; w.hy = w.desk.gy + 0.55; } });

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

  function makeWorker(i, d) {
    return {
      i, desk: d,
      gx: d.gx, gy: d.gy + 0.55,
      hx: d.gx, hy: d.gy + 0.55,          // alvo atual
      state: 'work', timer: rand(3, 10),
      phase: rand(0, Math.PI * 2),
      shirt: pick(SHIRTS), skin: pick(SKINS), hair: pick(HAIRS),
      moving: false, dir: 1, sp: rand(1.1, 1.7),
    };
  }

  // ---------- atualização ----------
  function update(dt) {
    const s = G.state;
    t += dt;
    const producing = s.active.length > 0 && G.production() > 0;

    // trabalhadores
    workers.forEach((w) => {
      w.timer -= dt;
      if (w.state === 'work') {
        // fica na mesa; de vez em quando levanta e passeia
        if (w.timer <= 0) {
          const dest = pickDest();
          w.hx = dest.gx; w.hy = dest.gy; w.state = 'walk'; w.timer = rand(2, 5);
          w.errand = dest.errand;
        }
      } else if (w.state === 'walk') {
        if (reached(w)) {
          w.state = 'pause'; w.timer = rand(0.6, 2.2);
          if (w.errand === 'coffee' && Math.random() < 0.6) w.timer += 1.2;
        }
      } else { // pause
        if (w.timer <= 0) {
          // volta pra mesa
          w.hx = w.desk.gx; w.hy = w.desk.gy + 0.55; w.state = 'return'; w.timer = 6;
        }
      }
      if (w.state === 'return' && reached(w)) { w.state = 'work'; w.timer = rand(5, 13); }
      stepToward(w, dt);
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

  function pickDest() {
    const r = Math.random();
    if (r < 0.4) return { gx: layout.coffee.gx, gy: layout.coffee.gy + 0.5, errand: 'coffee' };
    if (r < 0.7 && workers.length > 1) { const d = pick(layout.desks); return { gx: d.gx - 0.6, gy: d.gy + 0.5, errand: 'chat' }; }
    return { gx: rand(0.6, layout.W - 0.6), gy: rand(0.8, layout.H - 0.8), errand: 'walk' };
  }
  function reached(w) { return Math.hypot(w.hx - w.gx, w.hy - w.gy) < 0.06; }
  function stepToward(w, dt) {
    const dx = w.hx - w.gx, dy = w.hy - w.gy, d = Math.hypot(dx, dy);
    if (d < 0.02) { w.moving = false; return; }
    const sp = w.sp * dt;
    if (sp >= d) { w.gx = w.hx; w.gy = w.hy; w.moving = false; return; }
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

    // decorações fixas no piso (tapetes de luz)
    // coleta de entidades para z-sort
    const ents = [];
    // mesas
    layout.desks.forEach((d, i) => ents.push({ d: d.gx + d.gy, kind: 'desk', o: d, idx: i }));
    // plantas
    layout.plants.forEach((p) => ents.push({ d: p.gx + p.gy, kind: 'plant', o: p }));
    // máquina de café
    ents.push({ d: layout.coffee.gx + layout.coffee.gy, kind: 'coffee', o: layout.coffee });
    // árvores
    layout.trees.forEach((tr) => ents.push({ d: tr.gx + tr.gy, kind: 'tree', o: tr }));
    // trabalhadores
    workers.forEach((w) => ents.push({ d: w.gx + w.gy + 0.01, kind: 'worker', o: w }));
    // pacotes
    packages.forEach((p) => ents.push({ d: p.gx + p.gy + 0.02, kind: 'pkg', o: p }));
    // robô
    if (robot) ents.push({ d: robot.gx + robot.gy + 0.01, kind: 'robot', o: robot });
    // carros
    cars.forEach((c) => ents.push({ d: c.gx + c.gy, kind: 'car', o: c }));
    // partículas
    particles.forEach((p) => ents.push({ d: p.gx + p.gy + 0.5, kind: 'part', o: p }));

    ents.sort((a, b) => a.d - b.d);
    ents.forEach((e) => {
      if (e.kind === 'desk') drawDesk(e.o, e.idx);
      else if (e.kind === 'worker') drawWorker(e.o);
      else if (e.kind === 'plant') drawPlant(e.o);
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
        tile(gx, gy, w, h, ((gx + gy) | 0) % 2 === 0 ? '#5b6580' : '#525d75');
      }
    }
    // brilho quente perto das paredes (como no exemplo)
    const glow = ctx.createLinearGradient(iso(0, 0).x, iso(0, 0).y, iso(W * .5, H * .5).x, iso(W * .5, H * .5).y);
    glow.addColorStop(0, 'rgba(255,175,70,.30)'); glow.addColorStop(1, 'rgba(255,175,70,0)');
    ctx.save(); ctx.beginPath();
    const a = iso(0, 0), b = iso(W, 0), c = iso(W, H), d = iso(0, H);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
    ctx.clip(); ctx.fillStyle = glow; ctx.fill(); ctx.restore();
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

    // letreiro neon no topo da parede norte
    const mid = iso(W / 2, 0);
    ctx.save();
    ctx.font = 'bold 20px Segoe UI, sans-serif'; ctx.textAlign = 'center';
    ctx.shadowColor = '#4f8cff'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#bcd4ff';
    ctx.fillText('★ ' + (G.state.company || 'AGÊNCIA').toUpperCase() + ' ★', mid.x, mid.y - wallH + 26);
    ctx.restore();
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

  // ---------- clique: comprar mesa no pad "+" ----------
  function onClick(ev) {
    if (!plusPad) return;
    const r = canvas.getBoundingClientRect();
    const mx = (ev.clientX - r.left) * dpr, my = (ev.clientY - r.top) * dpr;
    // converte para espaço "mundo cru" desfazendo a câmera
    const wx = (mx - cam.ox * dpr) / (cam.scale * dpr);
    const wy = (my - cam.oy * dpr) / (cam.scale * dpr);
    const tx = plusPad.x + HW * 0.35, ty = plusPad.y + HH * 0.35;
    if (Math.hypot(wx - tx, wy - ty) < 34) G.buyDesk();
  }

  window.IsoOffice = { init, resize, popMoney };
})();
