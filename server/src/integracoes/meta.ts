// Integração real com o Instagram (Meta Graph API) — publica na conta
// profissional quando META_ACCESS_TOKEN + META_IG_USER_ID existem no .env.
// Fluxo oficial em 2 passos: criar o container de mídia → publicar.

import { ErroPonte } from '../anthropic/cliente.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

export function igConfigurado(): boolean {
  return Boolean(process.env.META_ACCESS_TOKEN && process.env.META_IG_USER_ID);
}

async function chamarGraph<T>(caminho: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ ...params, access_token: process.env.META_ACCESS_TOKEN! });
  const resposta = await fetch(`${GRAPH}${caminho}`, { method: 'POST', body: query });
  const corpo = (await resposta.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!resposta.ok || corpo.error) {
    throw new ErroPonte(`Instagram: ${corpo.error?.message ?? `falha ${resposta.status}`}`, 502);
  }
  return corpo;
}

/**
 * Publica uma FOTO no feed da conta profissional.
 * A imagem precisa estar numa URL pública (o Graph baixa de lá).
 * Devolve o id da mídia publicada.
 */
export async function publicarFotoInstagram(imagemUrl: string, legenda: string): Promise<string> {
  if (!igConfigurado()) {
    throw new ErroPonte('Instagram não configurado — preencha META_ACCESS_TOKEN e META_IG_USER_ID em server/.env.', 503);
  }
  if (!/^https:\/\//.test(imagemUrl)) {
    throw new ErroPonte('A imagem do post precisa ser uma URL https pública.', 400);
  }
  const igUser = process.env.META_IG_USER_ID!;
  const container = await chamarGraph<{ id: string }>(`/${igUser}/media`, {
    image_url: imagemUrl,
    caption: legenda.slice(0, 2200),
  });
  const publicado = await chamarGraph<{ id: string }>(`/${igUser}/media_publish`, {
    creation_id: container.id,
  });
  return publicado.id;
}
