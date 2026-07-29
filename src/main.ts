/* ===========================================================
   Agência Real — bootstrap (Vite)
   Os módulos legados da cena ainda são IIFEs que se comunicam
   por window.* — a ORDEM dos imports reproduz a ordem antiga
   das tags <script>. Renderer: Canvas 2D nítido (js/iso.js)
   com arte real (imagens PNG).
   O jogo simulado foi aposentado (2026-07-28): o boot liga
   direto o RealAdapter — tudo que aparece na tela é real.
   =========================================================== */
import './data-shim'; // core/data.ts tipado -> window.DATA (cargos/estilos da cena)
import './real/boot'; // window.Game = RealAdapter (modo único: Agência Real)
import '../js/audio.js';
import '../js/props.js';
import '../js/iso.js'; // renderer Canvas -> window.IsoOffice (arte real via drawImage)
import '../js/ui.js'; // HUD + toasts (painéis de jogo desativados no pivô)
import '../js/main.js';
import './real/ui-real'; // painéis reais (projetos, equipe/times, financeiro) — por último
