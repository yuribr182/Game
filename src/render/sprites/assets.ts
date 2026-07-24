/* ===========================================================
   App Agency Tycoon — assets de imagem reais (F2.2 do PRD)
   Carrega os PNGs de arte (public/assets/props/) como texturas Pixi e
   guarda o ajuste de âncora/escala/posição por objeto. Quando um asset
   existe, a cena usa o sprite real; senão, cai no desenho procedural.
   =========================================================== */
import { Assets, Texture } from 'pixi.js';

export interface PropAssetCfg {
  file: string;
  /** âncora horizontal (0..1) — normalmente 0.5 (centro) */
  anchorX: number;
  /** âncora vertical (0..1) — ~ ponto onde o objeto toca o chão */
  anchorY: number;
  /** escala aplicada à textura (o PNG é grande; reduzimos p/ o mundo) */
  scale: number;
  /** deslocamento (em tiles) do ponto de grade p/ o centro do footprint */
  offGx?: number;
  offGy?: number;
}

/**
 * Mapa: tipo do objeto no jogo -> asset real. Âncora/escala ajustadas por item
 * (o ponto de contato com o chão varia de imagem p/ imagem).
 */
export const PROP_ASSETS: Record<string, PropAssetCfg> = {
  desk: { file: 'desk.png', anchorX: 0.5, anchorY: 0.72, scale: 0.09, offGx: 0.35, offGy: 0.28 },
  sofa: { file: 'sofa.png', anchorX: 0.5, anchorY: 0.74, scale: 0.11, offGx: 0.49, offGy: 0.25 },
  coffee: { file: 'coffee-machine.png', anchorX: 0.5, anchorY: 0.8, scale: 0.075 },
};

function assetUrl(file: string): string {
  return import.meta.env.BASE_URL + 'assets/props/' + file;
}

export interface LoadedProp {
  cfg: PropAssetCfg;
  texture: Texture;
}

/** carrega todos os assets disponíveis; itens ausentes ficam de fora (fallback) */
export async function loadPropAssets(): Promise<Map<string, LoadedProp>> {
  const map = new Map<string, LoadedProp>();
  await Promise.all(
    Object.entries(PROP_ASSETS).map(async ([type, cfg]) => {
      try {
        const texture = (await Assets.load(assetUrl(cfg.file))) as Texture;
        map.set(type, { cfg, texture });
      } catch {
        /* asset ausente -> mantém o desenho procedural */
      }
    }),
  );
  return map;
}
