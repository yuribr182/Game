/* ===========================================================
   App Agency Tycoon — bootstrap (Vite)
   Fase F0 do PRD (docs/PRD.md): os módulos legados ainda são
   IIFEs que se comunicam por window.* — a ORDEM dos imports
   abaixo reproduz a ordem antiga das tags <script>.
   Conforme as fases avançam, cada import vira módulo TS:
     data.js  -> core/data.ts      (F1)
     game.js  -> core/engine.ts    (F1)
     iso.js/props.js -> render/ (Pixi)  (F2-F4)
     ui.js/main.js/audio.js -> ui/, audio/ (F5)
   =========================================================== */
import '../js/data.js';
import '../js/game.js';
import '../js/audio.js';
import '../js/props.js';
import '../js/iso.js';
import '../js/ui.js';
import '../js/main.js';
