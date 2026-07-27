// Conversão de uso de tokens (span.model_request_end.model_usage) em USD e BRL.

import { arredondarBRL } from '../config.js';
import type { Lancamento } from '../store/tipos.js';

/** Preços em USD por milhão de tokens (MTok). Cache read = 0,1×; cache write (5min) = 1,25× o input. */
export const PRECOS_USD_MTOK: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
};

export interface UsoModelo {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/** Custo em USD de um model_request. Modelo desconhecido usa a tabela do padrão (opus-5). */
export function custoUsd(modelo: string, uso: UsoModelo): number {
  const preco = PRECOS_USD_MTOK[modelo] ?? PRECOS_USD_MTOK['claude-opus-5']!;
  const M = 1_000_000;
  return (
    ((uso.input_tokens ?? 0) / M) * preco.input +
    ((uso.output_tokens ?? 0) / M) * preco.output +
    ((uso.cache_read_input_tokens ?? 0) / M) * preco.cacheRead +
    ((uso.cache_creation_input_tokens ?? 0) / M) * preco.cacheWrite
  );
}

/** Id determinístico do lançamento diário de custo de API — reescrito (append) a cada atualização. */
export function idLancamentoCustoApi(projetoId: string, dia: string): string {
  return `custo_api:${projetoId}:${dia}`;
}

/**
 * Lançamento diário consolidado de custo de API de um projeto (valor negativo = saída).
 * Mesmo id no mesmo dia ⇒ a última versão anexada ao NDJSON vence (ver reduzirLancamentos).
 */
export function lancamentoCustoApiDiario(args: {
  projetoId: string;
  funcionarioId?: string;
  sessionId?: string;
  dia: string;
  usdAcumuladoDia: number;
  cambioUsdBrl: number;
  modelo?: string;
  nomeProjeto?: string;
}): Lancamento {
  return {
    id: idLancamentoCustoApi(args.projetoId, args.dia),
    data: args.dia,
    tipo: 'custo_api',
    projetoId: args.projetoId,
    funcionarioId: args.funcionarioId,
    valorBRL: -arredondarBRL(args.usdAcumuladoDia * args.cambioUsdBrl),
    descricao: `Custo de API — ${args.nomeProjeto ?? args.projetoId} (${args.dia})`,
    meta: { usd: args.usdAcumuladoDia, modelo: args.modelo, sessionId: args.sessionId },
  };
}
