/* ===========================================================
   App Agency Tycoon — efeitos sonoros (WebAudio, sem arquivos)
   Expõe window.Sfx.play(nome)
   =========================================================== */
(function () {
  'use strict';
  let ac = null;

  function ctx() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }

  // nota simples com envelope
  function tone(freq, start, dur, type, vol) {
    const a = ctx(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, a.currentTime + start);
    g.gain.setValueAtTime(0, a.currentTime + start);
    g.gain.linearRampToValueAtTime(vol || 0.12, a.currentTime + start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
    o.connect(g); g.connect(a.destination);
    o.start(a.currentTime + start); o.stop(a.currentTime + start + dur + 0.05);
  }

  const bank = {
    complete() {  // caixa registradora: duas notas subindo + brilho
      tone(880, 0, 0.09, 'square', 0.07);
      tone(1318, 0.09, 0.22, 'square', 0.07);
      tone(2637, 0.09, 0.18, 'sine', 0.05);
    },
    money() { tone(1568, 0, 0.1, 'triangle', 0.08); tone(2093, 0.06, 0.14, 'triangle', 0.07); },
    hire() { tone(523, 0, 0.08, 'triangle', 0.1); tone(784, 0.07, 0.12, 'triangle', 0.1); },
    buy() { tone(660, 0, 0.06, 'square', 0.06); tone(880, 0.05, 0.09, 'square', 0.06); },
    upgrade() { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.07, 0.14, 'triangle', 0.09)); },
    level() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.08, 0.2, 'square', 0.06)); },
    fail() { tone(220, 0, 0.25, 'sawtooth', 0.07); tone(174, 0.16, 0.3, 'sawtooth', 0.07); },
    error() { tone(160, 0, 0.12, 'square', 0.05); },
    click() { tone(1200, 0, 0.03, 'sine', 0.04); },
  };

  function play(name) {
    const s = window.Game && window.Game.state;
    if (s && s.muted) return;
    if (bank[name]) { try { bank[name](); } catch (e) {} }
  }

  // ---------- sons ambientes (teclado digitando, carros na rua) ----------
  let noiseBuf = null;
  function noise() {
    const a = ctx(); if (!a) return null;
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  // clique curto de tecla (ruído filtrado)
  function keyClick() {
    const a = ctx(); if (!a) return;
    const src = a.createBufferSource(); src.buffer = noise();
    const bp = a.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 1800 + Math.random() * 2600; bp.Q.value = 2.5;
    const g = a.createGain();
    g.gain.setValueAtTime(0.02 + Math.random() * 0.02, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.045);
    src.connect(bp); bp.connect(g); g.connect(a.destination);
    src.start(); src.stop(a.currentTime + 0.06);
  }
  // whoosh grave de carro passando
  function carWhoosh() {
    const a = ctx(); if (!a) return;
    const src = a.createBufferSource(); src.buffer = noise(); src.loop = true;
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = a.createGain();
    const t0 = a.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.022, t0 + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
    src.connect(lp); lp.connect(g); g.connect(a.destination);
    src.start(); src.stop(t0 + 1.2);
  }

  let typeAcc = 0, carAcc = 0, nextCar = 12;
  // chamado a cada frame pelo main; info = { working, workers, paused }
  function ambientTick(dt, info) {
    const s = window.Game && window.Game.state;
    if (!s || s.muted || !info || info.paused || !ac) return;  // só toca após 1º gesto (ac criado)
    // digitação: alguns cliques por segundo, proporcional à equipe produzindo
    if (info.working && info.workers > 0) {
      typeAcc += dt * Math.min(9, 1.5 + info.workers * 1.6);
      while (typeAcc >= 1) { typeAcc -= 1; if (Math.random() < 0.85) keyClick(); }
    }
    // carro passando de vez em quando
    carAcc += dt;
    if (carAcc >= nextCar) { carAcc = 0; nextCar = 9 + Math.random() * 16; carWhoosh(); }
  }

  // cria o AudioContext no primeiro gesto do usuário (exigência dos navegadores)
  function unlock() { ctx(); }

  window.Sfx = { play, ambientTick, unlock };
})();
