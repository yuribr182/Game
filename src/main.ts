/* ===========================================================
   App Agency Tycoon — bootstrap (Vite)
   Fase F0 do PRD (docs/PRD.md): os módulos legados ainda são
   IIFEs que se comunicam por window.* — a ORDEM dos imports
   abaixo reproduz a ordem antiga das tags <script>.
   Conforme as fases avançam, cada import vira módulo TS:
     data.js  -> core/data.ts      (F1 ✔ — via data-shim.ts)
     game.js  -> core/ (engine)    (F1 ✔ — via game-shim.ts)
     iso.js/props.js -> render/ (Pixi)  (F2-F4)
     ui.js/main.js/audio.js -> ui/, audio/ (F5)
   =========================================================== */
import './data-shim'; // core/data.ts tipado -> window.DATA (antes dos legados!)
import './game-shim'; // core/engine.ts tipado -> window.Game (antes dos legados!)
import '../js/audio.js';
import '../js/props.js';
import '../js/iso.js'; // renderer Canvas legado (padrão) -> window.IsoOffice
import './render/pixi-shim'; // F2: se ?renderer=pixi, sobrescreve window.IsoOffice pela cena Pixi
import '../js/ui.js';
import '../js/main.js';
