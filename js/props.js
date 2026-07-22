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
      const col = (opt && opt.col) || '#3f6fd6';
      g.shadow(gx + 0.35, gy + 0.3, 24, 10);
      // assento
      g.box(gx, gy, 0.9, 0.5, 12, g.shade(col, 0.05), g.shade(col, -0.12), g.shade(col, -0.24));
      // encosto (fundo)
      g.box(gx, gy, 0.9, 0.14, 26, g.shade(col, 0.08), g.shade(col, -0.1), g.shade(col, -0.2));
      // braços
      g.box(gx, gy, 0.12, 0.5, 20, g.shade(col, 0.02), g.shade(col, -0.15), g.shade(col, -0.28));
      g.box(gx + 0.78, gy, 0.12, 0.5, 20, g.shade(col, 0.02), g.shade(col, -0.15), g.shade(col, -0.28));
      // almofadas
      const c = g.corner(gx + 0.3, gy + 0.32, 12);
      g.roundRect(c.x - 10, c.y - 8, 16, 12, 3, g.shade(col, 0.14));
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
      g.shadow(gx + 0.5, gy + 0.3, 28, 12);
      // balcão em L
      g.box(gx, gy, 0.9, 0.4, 26, '#6a4a8f', '#513873', '#3f2c5a'); // frente
      g.box(gx + 0.78, gy, 0.32, 0.9, 26, '#6a4a8f', '#513873', '#3f2c5a'); // lateral
      // tampo claro
      g.box(gx, gy, 0.9, 0.4, 28, '#d9dbe4', '#d9dbe4', '#d9dbe4');
      g.box(gx + 0.78, gy, 0.32, 0.9, 28, '#d9dbe4', '#d9dbe4', '#d9dbe4');
      // monitorzinho
      g.box(gx + 0.15, gy + 0.12, 0.2, 0.05, 40, '#20242e', '#171a22', '#12141a');
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
    chair(g, gx, gy, opt) { seat(g, gx, gy, (opt && opt.col) || '#556071'); },
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
    bookshelf(g, gx, gy) {
      g.shadow(gx, gy, 11, 5);
      g.box(gx - 0.16, gy - 0.12, 0.32, 0.22, 40, WOOD[0], WOOD[1], WOOD[2]);
      const c = g.corner(gx - 0.16, gy + 0.1, 40);
      const cols = ['#c94f4f', '#4f8cff', '#37d67a', '#ffca4b', '#7c5cff'];
      for (let s = 0; s < 3; s++) for (let b = 0; b < 5; b++) {
        g.ctx.fillStyle = cols[(s + b) % cols.length];
        g.ctx.fillRect(c.x + 3 + b * 4, c.y - 6 - s * 11, 3, 9);
      }
    },
  };

  window.Props = { draw };
})();
