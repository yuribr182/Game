// Integração real com o Mercado Livre (API oficial, REST).
// Liga quando ML_CLIENT_ID + ML_CLIENT_SECRET + refresh token existem.
// ⚠️ O refresh token do ML é ROTATIVO (single-use): a cada refresh a API
// devolve um novo — a ponte persiste o mais recente em config.json e usa o
// do .env só como semente inicial.

import type { Store } from '../store/db.js';
import { ErroPonte } from '../anthropic/cliente.js';

const API = 'https://api.mercadolibre.com';

let tokenCache: { token: string; expiraEmMs: number; sellerId: number | null } = {
  token: '',
  expiraEmMs: 0,
  sellerId: null,
};

/** Campos mínimos preenchidos? (o refresh pode já ter rotacionado p/ a config) */
export async function mlConfigurado(store: Store): Promise<boolean> {
  if (!process.env.ML_CLIENT_ID || !process.env.ML_CLIENT_SECRET) return false;
  if (process.env.ML_REFRESH_TOKEN) return true;
  const cfg = await store.lerConfig();
  return Boolean(cfg.mlRefreshToken);
}

async function tokenAcesso(store: Store): Promise<string> {
  if (tokenCache.token && Date.now() < tokenCache.expiraEmMs - 60_000) return tokenCache.token;
  const cfg = await store.lerConfig();
  const refresh = cfg.mlRefreshToken || process.env.ML_REFRESH_TOKEN;
  if (!refresh) {
    throw new ErroPonte('Mercado Livre não configurado — preencha ML_CLIENT_ID/SECRET/REFRESH_TOKEN em server/.env.', 503);
  }
  const resposta = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.ML_CLIENT_ID!,
      client_secret: process.env.ML_CLIENT_SECRET!,
      refresh_token: refresh,
    }),
  });
  if (!resposta.ok) {
    throw new ErroPonte(`Mercado Livre recusou o refresh do token (${resposta.status}) — gere um refresh token novo.`, 502);
  }
  const dados = (await resposta.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    user_id?: number;
  };
  tokenCache = {
    token: dados.access_token,
    expiraEmMs: Date.now() + (dados.expires_in ?? 21600) * 1000,
    sellerId: dados.user_id ?? tokenCache.sellerId,
  };
  // rotaciona: persiste o refresh novo (o antigo morre no ML)
  if (dados.refresh_token && dados.refresh_token !== cfg.mlRefreshToken) {
    cfg.mlRefreshToken = dados.refresh_token;
    await store.salvarConfig(cfg);
  }
  return tokenCache.token;
}

async function chamarMl<T>(store: Store, caminho: string, init?: RequestInit): Promise<T> {
  const token = await tokenAcesso(store);
  const resposta = await fetch(`${API}${caminho}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const corpo = (await resposta.json().catch(() => ({}))) as T & { message?: string };
  if (!resposta.ok) {
    throw new ErroPonte(`Mercado Livre: ${corpo?.message ?? `falha ${resposta.status}`} (${caminho})`, 502);
  }
  return corpo;
}

async function sellerId(store: Store): Promise<number> {
  if (tokenCache.sellerId) return tokenCache.sellerId;
  const eu = await chamarMl<{ id: number }>(store, '/users/me');
  tokenCache.sellerId = eu.id;
  return eu.id;
}

export interface PerguntaML {
  id: number;
  texto: string;
  itemId: string;
  itemTitulo?: string;
  de?: string;
  data?: string;
}

/** Perguntas ainda sem resposta na conta do vendedor. */
export async function listarPerguntasAbertas(store: Store, limite = 20): Promise<PerguntaML[]> {
  const id = await sellerId(store);
  const dados = await chamarMl<{
    questions?: { id: number; text: string; item_id: string; from?: { id: number }; date_created?: string }[];
  }>(store, `/questions/search?seller_id=${id}&status=UNANSWERED&limit=${limite}&api_version=4`);
  const perguntas = dados.questions ?? [];
  // título do item ajuda o agente a responder com contexto
  const titulos = new Map<string, string>();
  for (const itemId of [...new Set(perguntas.map((q) => q.item_id))].slice(0, 15)) {
    try {
      const item = await chamarMl<{ title?: string }>(store, `/items/${itemId}?attributes=title`);
      if (item.title) titulos.set(itemId, item.title);
    } catch {
      /* item indisponível — segue sem título */
    }
  }
  return perguntas.map((q) => ({
    id: q.id,
    texto: q.text,
    itemId: q.item_id,
    itemTitulo: titulos.get(q.item_id),
    de: q.from ? String(q.from.id) : undefined,
    data: q.date_created,
  }));
}

/** Responde uma pergunta (publica NA HORA no anúncio — use com rotina autorizada). */
export async function responderPergunta(store: Store, perguntaId: number, texto: string): Promise<void> {
  await chamarMl(store, '/answers', {
    method: 'POST',
    body: JSON.stringify({ question_id: perguntaId, text: texto.slice(0, 2000) }),
  });
}

export interface ItemML {
  id: string;
  titulo: string;
  precoBRL: number;
  estoque: number;
  status: string;
  visitas?: number;
}

/** Anúncios ativos do vendedor (resumo para o contexto da rotina). */
export async function listarItens(store: Store, limite = 20): Promise<ItemML[]> {
  const id = await sellerId(store);
  const busca = await chamarMl<{ results?: string[] }>(
    store,
    `/users/${id}/items/search?status=active&limit=${limite}`,
  );
  const itens: ItemML[] = [];
  for (const itemId of (busca.results ?? []).slice(0, limite)) {
    try {
      const item = await chamarMl<{
        id: string; title: string; price: number; available_quantity: number; status: string;
      }>(store, `/items/${itemId}`);
      itens.push({
        id: item.id,
        titulo: item.title,
        precoBRL: item.price,
        estoque: item.available_quantity,
        status: item.status,
      });
    } catch {
      /* segue para o próximo */
    }
  }
  return itens;
}

/** Atualiza título e/ou preço de um anúncio (aplica NA HORA). */
export async function atualizarItem(
  store: Store,
  itemId: string,
  campos: { titulo?: string; precoBRL?: number },
): Promise<void> {
  const corpo: Record<string, unknown> = {};
  if (campos.titulo) corpo.title = campos.titulo.slice(0, 60);
  if (campos.precoBRL && campos.precoBRL > 0) corpo.price = campos.precoBRL;
  if (!Object.keys(corpo).length) throw new ErroPonte('Nada para atualizar no anúncio.', 400);
  await chamarMl(store, `/items/${itemId}`, { method: 'PUT', body: JSON.stringify(corpo) });
}
