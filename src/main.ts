/* ===========================================================
   App Agency Tycoon — bootstrap (Vite)
   Fase F0 do PRD (docs/PRD.md): os módulos legados ainda são
   IIFEs que se comunicam por window.* — a ORDEM dos imports
   abaixo reproduz a ordem antiga das tags <script>.
   Renderer: Canvas 2D nítido (js/iso.js) com arte real (imagens PNG) — a
   migração para Pixi foi descartada (a arte passou a ser por imagem, então o
   Canvas ficou melhor: nítido, simples e com todas as funções).
   Ainda a portar para TS: iso.js/props.js/ui.js/main.js/audio.js.
   =========================================================== */
import './data-shim'; // core/data.ts tipado -> window.DATA (antes dos legados!)
import './game-shim'; // core/engine.ts tipado -> window.Game (antes dos legados!)
import '../js/audio.js';
import '../js/props.js';
import '../js/iso.js'; // renderer Canvas -> window.IsoOffice (arte real via drawImage)
import '../js/ui.js';
import '../js/main.js';
