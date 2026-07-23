/* ===========================================================
   App Agency Tycoon — PACOTE DE ARTE (móveis/objetos isométricos)
   Biblioteca de sprites vetoriais desenhados em Canvas.
   Cada função recebe um "toolkit" g (fornecido por iso.js) e
   desenha o objeto na posição de grade (gx, gy).
   Expõe window.Props.draw[tipo](g, gx, gy, opt)
   =========================================================== */
(function () {
  'use strict';

  // paletas reutilizáveis
  const WOOD = ['#8a5a3b', '#6f472e', '#5a3a25'];
  const STEEL = ['#c7ccd6', '#9aa1ad', '#7c828f'];
  const WHITE = ['#eef1f6', '#ccd2dc', '#b3bac6'];
  const DARK = ['#2a2f3a', '#1f232c', '#171a21'];

  function seat(g, gx, gy, color) {
    const c = color || '#4f8cff';
    g.box(gx, gy, 0.34, 0.34, 8, g.shade(c, 0.06), g.shade(c, -0.12), g.shade(c, -0.26));
  }

  const draw = {
    // ---- COZINHA ----
    fridge(g, gx, gy) {
      g.shadow(gx + 0.22, gy + 0.22, 15, 7);
      g.box(gx, gy, 0.5, 0.42, 42, WHITE[0], WHITE[1], WHITE[2]);
      // linha da porta + puxadores (face frontal-direita)
      const a = g.corner(gx + 0.5, gy, 42), b = g.corner(gx + 0.5, gy + 0.42, 42);
      const a0 = g.corner(gx + 0.5, gy, 0), b0 = g.corner(gx + 0.5, gy + 0.42, 0);
      g.ctx.strokeStyle = 'rgba(0,0,0,.18)'; g.ctx.lineWidth = 1.5;
      g.ctx.beginPath(); g.ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2); g.ctx.lineTo((a0.x + b0.x) / 2, (a0.y + b0.y) / 2); g.ctx.stroke();
      g.ctx.strokeStyle = '#9aa1ad'; g.ctx.lineWidth = 3;
      g.ctx.beginPath(); g.ctx.moveTo(b.x - 4, b.y + 8); g.ctx.lineTo(b.x - 4, b.y + 20); g.ctx.stroke();
    },
    stove(g, gx, gy) {
      g.shadow(gx + 0.22, gy + 0.22, 14, 7);
      g.box(gx, gy, 0.48, 0.42, 18, '#3a3f4a', '#2b2f38', '#22262e');
      // bocas do fogão no topo
      const c = g.corner(gx + 0.24, gy + 0.2, 18);
      g.ctx.fillStyle = '#20242c';
      [[-8, -4], [8, -4], [-8, 4], [8, 4]].forEach(([dx, dy]) => {
        g.ctx.beginPath(); g.ctx.arc(c.x + dx, c.y + dy, 4, 0, Math.PI * 2); g.ctx.fill();
      });
    },
    counter(g, gx, gy, opt) {
      const len = (opt && opt.len) || 0.5;
      g.shadow(gx + len / 2, gy + 0.2, 14, 7);
      g.box(gx, gy, len, 0.42, 20, '#d7dbe2', WOOD[1], WOOD[2]);
      // tampo de madeira
      g.box(gx, gy, len, 0.42, 22, '#9c6b45', '#9c6b45', '#9c6b45');
    },
    sink(g, gx, gy) {
      draw.counter(g, gx, gy, { len: 0.5 });
      const c = g.corner(gx + 0.25, gy + 0.2, 22);
      g.ctx.fillStyle = '#8b929e';
      g.ctx.fillRect(c.x - 7, c.y - 3, 14, 8); // cuba
      g.ctx.strokeStyle = '#c7ccd6'; g.ctx.lineWidth = 2;
      g.ctx.beginPath(); g.ctx.moveTo(c.x, c.y - 3); g.ctx.lineTo(c.x, c.y - 12); g.ctx.lineTo(c.x + 5, c.y - 12); g.ctx.stroke();
    },
    microwave(g, gx, gy) {
      g.box(gx, gy, 0.3, 0.24, 12, '#4a4f5a', '#3a3f48', '#2e323a');
      const c = g.corner(gx + 0.05, gy + 0.12, 22);
      g.ctx.fillStyle = '#7fd0ff'; g.ctx.globalAlpha = 0.5;
      g.ctx.fillRect(c.x, c.y - 8, 10, 7); g.ctx.globalAlpha = 1;
    },
    diningTable(g, gx, gy) {
      g.shadow(gx + 0.25, gy + 0.25, 16, 8);
      g.box(gx + 0.08, gy + 0.08, 0.36, 0.36, 15, '#b5bcc8', STEEL[1], STEEL[2]); // pé/base
      g.box(gx, gy, 0.52, 0.52, 17, '#e7d3b0', '#cdb488', '#b89a6e'); // tampo
    },
    stool(g, gx, gy) { seat(g, gx, gy, '#c94f4f'); },

    // ---- LOUNGE ----
    sofa(g, gx, gy, opt) {
      const ctx = g.ctx;
      const col = (opt && opt.col) || '#3f6fd6';
      g.shadow(gx + 0.48, gy + 0.3, 28, 12);
      // pés de madeira
      [[0.05, 0.1], [0.88, 0.1], [0.05, 0.42], [0.88, 0.42]].forEach(([dx, dy]) =>
        g.box(gx + dx, gy + dy, 0.05, 0.05, 5, '#6b4a2b', '#553a22', '#44301c'));
      // base
      g.box(gx, gy, 0.98, 0.5, 11, g.shade(col, -0.04), g.shade(col, -0.2), g.shade(col, -0.32));
      // almofadas do assento (2 peças com vinco)
      g.box(gx + 0.13, gy + 0.05, 0.37, 0.42, 16, g.shade(col, 0.12), g.shade(col, -0.06), g.shade(col, -0.18));
      g.box(gx + 0.51, gy + 0.05, 0.37, 0.42, 16, g.shade(col, 0.12), g.shade(col, -0.06), g.shade(col, -0.18));
      // encosto
      g.box(gx + 0.1, gy, 0.8, 0.13, 30, g.shade(col, 0.05), g.shade(col, -0.12), g.shade(col, -0.24));
      // vinco entre as almofadas do encosto
      const v0 = g.corner(gx + 0.5, gy, 30), v1 = g.corner(gx + 0.5, gy + 0.13, 30);
      ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(v0.x, v0.y); ctx.lineTo(v1.x, v1.y); ctx.stroke();
      // braços
      g.box(gx, gy + 0.06, 0.13, 0.44, 22, g.shade(col, 0.06), g.shade(col, -0.16), g.shade(col, -0.28));
      g.box(gx + 0.85, gy + 0.06, 0.13, 0.44, 22, g.shade(col, 0.06), g.shade(col, -0.16), g.shade(col, -0.28));
      // almofadas decorativas encostadas no encosto
      const pw1 = g.corner(gx + 0.24, gy + 0.16, 20), pw2 = g.corner(gx + 0.76, gy + 0.16, 20);
      ctx.save(); ctx.translate(pw1.x, pw1.y); ctx.rotate(0.46);
      g.roundRect(-5, -5, 10, 10, 3, '#ffca4b'); ctx.restore();
      ctx.save(); ctx.translate(pw2.x, pw2.y); ctx.rotate(0.46);
      g.roundRect(-5, -5, 10, 10, 3, '#ff9f45'); ctx.restore();
    },
    coffeeTable(g, gx, gy) {
      g.shadow(gx + 0.22, gy + 0.18, 13, 6);
      g.box(gx, gy, 0.44, 0.36, 9, 'rgba(150,200,255,.4)', WOOD[1], WOOD[2]);
    },
    tv(g, gx, gy) {
      g.box(gx, gy, 0.5, 0.06, 34, '#15181f', '#0e1015', '#0a0c10');
      const p0 = g.corner(gx + 0.05, gy + 0.06, 30), p1 = g.corner(gx + 0.45, gy + 0.06, 30);
      const fl = 0.4 + 0.25 * Math.abs(Math.sin(g.t * 1.7));
      g.quad(p0.x, p0.y, p1.x, p1.y, p1.x, p1.y - 20, p0.x, p0.y - 20, `rgba(90,160,255,${fl})`);
    },

    // ---- RECEPÇÃO ----
    reception(g, gx, gy) {
      const ctx = g.ctx;
      g.shadow(gx + 0.5, gy + 0.3, 30, 13);

      // tampo saliente (3 faces desenhadas "flutuando" sobre o corpo)
      const slab = (x, y, sx, sy, hTop, th, top, left, right) => {
        const A = g.corner(x, y, hTop), B = g.corner(x + sx, y, hTop),
              C = g.corner(x + sx, y + sy, hTop), D = g.corner(x, y + sy, hTop);
        const C2 = g.corner(x + sx, y + sy, hTop - th), D2 = g.corner(x, y + sy, hTop - th),
              B2 = g.corner(x + sx, y, hTop - th);
        g.quad(D.x, D.y, C.x, C.y, C2.x, C2.y, D2.x, D2.y, left);
        g.quad(B.x, B.y, C.x, C.y, C2.x, C2.y, B2.x, B2.y, right);
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.lineTo(D.x, D.y);
        ctx.closePath(); ctx.fillStyle = top; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.lineWidth = 1; ctx.stroke();
      };

      // corpo do balcão em L (madeira escura)
      g.box(gx, gy, 0.95, 0.4, 22, '#6b4f35', '#523b27', '#42301f');
      g.box(gx + 0.82, gy, 0.32, 0.95, 22, '#6b4f35', '#523b27', '#42301f');
      // friso de LED roxo na base frontal
      const p0 = g.xy(gx, gy + 0.4), p1 = g.xy(gx + 0.95, gy + 0.4);
      g.quad(p0.x, p0.y - 7, p1.x, p1.y - 7, p1.x, p1.y - 10, p0.x, p0.y - 10, 'rgba(124,92,255,.85)');
      const s0 = g.xy(gx + 1.14, gy), s1 = g.xy(gx + 1.14, gy + 0.95);
      g.quad(s0.x, s0.y - 7, s1.x, s1.y - 7, s1.x, s1.y - 10, s0.x, s0.y - 10, 'rgba(124,92,255,.85)');
      // tampos claros salientes
      slab(gx - 0.04, gy - 0.04, 1.03, 0.48, 27, 5, '#e8e4da', '#cfcabe', '#b8b3a6');
      slab(gx + 0.79, gy - 0.04, 0.39, 1.03, 27, 5, '#e8e4da', '#cfcabe', '#b8b3a6');

      // monitor da secretária (de costas para a câmera)
      const m = g.corner(gx + 0.3, gy + 0.12, 27);
      ctx.fillStyle = '#2a2e38';
      ctx.beginPath(); ctx.ellipse(m.x, m.y, 5, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(m.x - 1.2, m.y - 8, 2.4, 8);
      g.roundRect(m.x - 10, m.y - 23, 20, 15, 2, '#20242e');
      ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(m.x - 8, m.y - 21, 16, 11);

      // telefone de mesa
      const ph = g.corner(gx + 0.62, gy + 0.18, 27);
      g.roundRect(ph.x - 5, ph.y - 6, 11, 7, 2, '#333947');
      g.roundRect(ph.x - 6.5, ph.y - 10, 13, 4, 2, '#454c5e');   // fone no gancho
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++)
        ctx.fillRect(ph.x - 2 + c * 2.4, ph.y - 4.5 + r * 2.4, 1.5, 1.5);

      // sininho dourado de balcão
      const bell = g.corner(gx + 0.13, gy + 0.22, 27);
      ctx.fillStyle = '#e0a832'; ctx.fillRect(bell.x - 4.2, bell.y - 2.6, 8.4, 1.8);
      ctx.fillStyle = '#ffca4b';
      ctx.beginPath(); ctx.arc(bell.x, bell.y - 2.6, 3.4, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.arc(bell.x, bell.y - 6.4, 1.1, 0, Math.PI * 2); ctx.fill();

      // vasinho de flores no canto do L
      const fl = g.corner(gx + 0.97, gy + 0.2, 27);
      ctx.fillStyle = '#b5651d'; ctx.fillRect(fl.x - 3, fl.y - 6, 6, 6);
      ['#ff5c6c', '#ffca4b', '#e05fb0'].forEach((c2, i2) => {
        ctx.strokeStyle = '#2fa85a'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(fl.x, fl.y - 6); ctx.lineTo(fl.x - 3 + i2 * 3, fl.y - 12); ctx.stroke();
        ctx.fillStyle = c2;
        ctx.beginPath(); ctx.arc(fl.x - 3 + i2 * 3, fl.y - 13, 1.9, 0, Math.PI * 2); ctx.fill();
      });

      // pilha de papéis na lateral
      const pp = g.corner(gx + 0.95, gy + 0.62, 27);
      ctx.save(); ctx.translate(pp.x, pp.y); ctx.scale(1, 0.55); ctx.rotate(0.18);
      ctx.fillStyle = '#dfe3ea'; ctx.fillRect(-6, -7, 12, 14);
      ctx.fillStyle = '#eef1f6'; ctx.fillRect(-5, -8, 12, 14);
      ctx.restore();
    },
    plantBig(g, gx, gy) {
      g.shadow(gx, gy, 11, 5);
      g.box(gx - 0.12, gy - 0.12, 0.24, 0.24, 16, '#b5651d', '#8a4d16', '#6f3d11'); // vaso
      const c = g.corner(gx, gy, 16);
      g.ctx.fillStyle = '#2f9e52';
      for (const [dx, dy, r] of [[0, -14, 12], [-8, -20, 8], [8, -18, 9], [0, -26, 8]]) {
        g.ctx.beginPath(); g.ctx.ellipse(c.x + dx, c.y + dy, r, r + 3, 0, 0, Math.PI * 2); g.ctx.fill();
      }
      g.ctx.fillStyle = '#3ab866';
      g.ctx.beginPath(); g.ctx.ellipse(c.x - 4, c.y - 24, 6, 8, 0, 0, Math.PI * 2); g.ctx.fill();
    },

    // ---- REUNIÃO / TRABALHO ----
    meetingTable(g, gx, gy) {
      g.shadow(gx + 0.7, gy + 0.35, 34, 14);
      g.box(gx, gy, 1.4, 0.7, 15, '#c9d0dc', STEEL[1], STEEL[2]);
      g.box(gx, gy, 1.4, 0.7, 17, '#3a4150', '#3a4150', '#3a4150'); // tampo escuro
    },
    chair(g, gx, gy, opt) {
      const col = (opt && opt.col) || '#556071';
      g.shadow(gx, gy, 8, 4);
      // pés de metal
      [[-0.11, -0.11], [0.075, -0.11], [-0.11, 0.075], [0.075, 0.075]].forEach(([dx, dy]) =>
        g.box(gx + dx, gy + dy, 0.035, 0.035, 6, '#3a3f4a', '#2e323c', '#262a32'));
      // assento
      g.box(gx - 0.13, gy - 0.13, 0.26, 0.26, 10, g.shade(col, 0.08), g.shade(col, -0.1), g.shade(col, -0.22));
      // encosto
      g.box(gx - 0.13, gy - 0.13, 0.26, 0.055, 21, g.shade(col, 0.02), g.shade(col, -0.14), g.shade(col, -0.26));
    },
    waterCooler(g, gx, gy) {
      g.shadow(gx, gy, 9, 4);
      g.box(gx - 0.13, gy - 0.13, 0.26, 0.26, 24, WHITE[0], WHITE[1], WHITE[2]);
      const c = g.corner(gx, gy, 24);
      g.ctx.fillStyle = 'rgba(90,170,255,.65)';
      g.ctx.beginPath(); g.ctx.ellipse(c.x, c.y - 10, 8, 12, 0, 0, Math.PI * 2); g.ctx.fill();
    },
    printer(g, gx, gy) {
      g.shadow(gx, gy, 10, 5);
      g.box(gx - 0.15, gy - 0.15, 0.3, 0.28, 16, '#cfd4dc', '#a7adb8', '#8b919d');
      const c = g.corner(gx, gy, 16);
      g.ctx.fillStyle = '#eef1f6'; g.ctx.fillRect(c.x - 6, c.y - 3, 12, 5); // papel
      g.ctx.fillStyle = '#37d67a'; g.ctx.beginPath(); g.ctx.arc(c.x + 5, c.y - 6, 1.6, 0, Math.PI * 2); g.ctx.fill();
    },
    serverRack(g, gx, gy) {
      g.shadow(gx, gy, 10, 5);
      g.box(gx - 0.15, gy - 0.15, 0.3, 0.3, 46, '#23272f', '#1a1d24', '#13161b');
      const c = g.corner(gx, gy - 0.15, 46);
      for (let i = 0; i < 6; i++) {
        const on = Math.sin(g.t * 3 + i * 1.3) > 0;
        g.ctx.fillStyle = on ? '#37d67a' : '#255c3a';
        g.ctx.fillRect(c.x - 8, c.y + 6 + i * 6, 3, 3);
        g.ctx.fillStyle = Math.sin(g.t * 4 + i) > 0 ? '#ffca4b' : '#5c4a20';
        g.ctx.fillRect(c.x - 2, c.y + 6 + i * 6, 3, 3);
      }
    },
    // ---- DECORAÇÕES DESBLOQUEÁVEIS ----
    arcade(g, gx, gy) {
      g.shadow(gx, gy, 11, 5);
      g.box(gx - 0.18, gy - 0.16, 0.36, 0.32, 40, '#c94f8f', '#a03a72', '#822e5c');
      const c = g.corner(gx, gy, 40);
      // tela piscando
      const fl = 0.5 + 0.4 * Math.abs(Math.sin(g.t * 5));
      g.ctx.fillStyle = `rgba(120,220,255,${fl})`;
      g.ctx.fillRect(c.x - 8, c.y + 6, 14, 10);
      // botões
      g.ctx.fillStyle = '#ffca4b'; g.ctx.beginPath(); g.ctx.arc(c.x - 4, c.y + 22, 2, 0, Math.PI * 2); g.ctx.fill();
      g.ctx.fillStyle = '#37d67a'; g.ctx.beginPath(); g.ctx.arc(c.x + 2, c.y + 23, 2, 0, Math.PI * 2); g.ctx.fill();
    },
    poolTable(g, gx, gy) {
      g.shadow(gx + 0.35, gy + 0.25, 22, 10);
      g.box(gx, gy, 0.7, 0.5, 14, '#2e8b48', '#6f472e', '#5a3a25');
      const c = g.corner(gx + 0.35, gy + 0.25, 14);
      // bolas
      [['#fff', -5, -2], ['#c94f4f', 3, 1], ['#ffca4b', -1, 3]].forEach(([col, dx, dy]) => {
        g.ctx.fillStyle = col; g.ctx.beginPath(); g.ctx.arc(c.x + dx, c.y + dy, 2.2, 0, Math.PI * 2); g.ctx.fill();
      });
    },
    pufe(g, gx, gy, opt) {
      const col = (opt && opt.col) || '#ff9f45';
      g.shadow(gx, gy, 9, 4);
      const c = g.corner(gx, gy, 0);
      g.ctx.fillStyle = g.shade(col, -0.18);
      g.ctx.beginPath(); g.ctx.ellipse(c.x, c.y - 4, 11, 7, 0, 0, Math.PI * 2); g.ctx.fill();
      g.ctx.fillStyle = col;
      g.ctx.beginPath(); g.ctx.ellipse(c.x, c.y - 8, 10, 6, 0, 0, Math.PI * 2); g.ctx.fill();
    },
  };

  window.Props = { draw };
})();
