// Google Ads: a exportação em CSV para o Google Ads Editor funciona SEM
// nenhuma chave (você importa o arquivo no Editor e publica com 2 cliques).
// Os campos GOOGLE_ADS_* do .env ficam prontos para a API oficial (que exige
// developer token aprovado pelo Google — fase futura).

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hojeISO } from '../config.js';
import type { Store } from '../store/db.js';

/** Campos da API oficial preenchidos? (informativo — a API em si é fase futura) */
export function gadsApiConfigurada(): boolean {
  return Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      process.env.GOOGLE_ADS_CLIENT_ID &&
      process.env.GOOGLE_ADS_CLIENT_SECRET &&
      process.env.GOOGLE_ADS_REFRESH_TOKEN &&
      process.env.GOOGLE_ADS_CUSTOMER_ID,
  );
}

export interface AnuncioGoogle {
  campanha: string;
  grupo: string;
  titulo1: string;
  titulo2?: string;
  titulo3?: string;
  descricao1: string;
  descricao2?: string;
  palavrasChave: string; // separadas por ;
  urlFinal: string;
}

function celula(v: string | undefined): string {
  const t = (v ?? '').replace(/"/g, '""');
  return /[",\n]/.test(t) ? `"${t}"` : t;
}

/** Gera o CSV no formato que o Google Ads Editor importa (pura, testável). */
export function gerarCsvGoogleAds(anuncios: AnuncioGoogle[]): string {
  const cab = [
    'Campaign', 'Ad Group', 'Headline 1', 'Headline 2', 'Headline 3',
    'Description Line 1', 'Description Line 2', 'Keywords', 'Final URL',
  ];
  const linhas = anuncios.map((a) =>
    [
      a.campanha, a.grupo,
      a.titulo1.slice(0, 30), (a.titulo2 ?? '').slice(0, 30), (a.titulo3 ?? '').slice(0, 30),
      a.descricao1.slice(0, 90), (a.descricao2 ?? '').slice(0, 90),
      a.palavrasChave, a.urlFinal,
    ]
      .map(celula)
      .join(','),
  );
  return [cab.join(','), ...linhas].join('\n');
}

/** Salva o CSV em data/campanhas/ e devolve o caminho relativo (p/ o feed). */
export async function salvarCsvCampanha(store: Store, nomeCampanha: string, csv: string): Promise<string> {
  const pasta = path.join(store.dir, 'campanhas');
  await mkdir(pasta, { recursive: true });
  const slug = nomeCampanha.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'campanha';
  const nome = `${slug}-${hojeISO()}.csv`;
  await writeFile(path.join(pasta, nome), csv, 'utf8');
  return `server/data/campanhas/${nome}`;
}
