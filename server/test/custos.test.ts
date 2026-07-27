import { describe, expect, it } from 'vitest';
import { custoUsd, idLancamentoCustoApi, lancamentoCustoApiDiario } from '../src/anthropic/custos.js';
import { reduzirLancamentos } from '../src/store/db.js';

describe('custoUsd', () => {
  it('calcula opus-5 com todos os tipos de token', () => {
    // 1M input ($5) + 100k output ($2.50) + 1M cache read ($0.50) + 100k cache write ($0.625)
    const usd = custoUsd('claude-opus-5', {
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 100_000,
    });
    expect(usd).toBeCloseTo(5 + 2.5 + 0.5 + 0.625, 6);
  });

  it('haiku é mais barato e modelo desconhecido cai no padrão', () => {
    const uso = { input_tokens: 1_000_000, output_tokens: 0 };
    expect(custoUsd('claude-haiku-4-5', uso)).toBeCloseTo(1, 6);
    expect(custoUsd('modelo-que-nao-existe', uso)).toBeCloseTo(5, 6);
  });

  it('uso vazio custa zero', () => {
    expect(custoUsd('claude-opus-5', {})).toBe(0);
  });
});

describe('lançamento diário de custo de API', () => {
  it('id determinístico por projeto+dia e conversão para BRL negativo', () => {
    const l = lancamentoCustoApiDiario({
      projetoId: 'p1',
      dia: '2026-07-27',
      usdAcumuladoDia: 2.5,
      cambioUsdBrl: 5.4,
      nomeProjeto: 'App X',
    });
    expect(l.id).toBe(idLancamentoCustoApi('p1', '2026-07-27'));
    expect(l.valorBRL).toBe(-13.5);
    expect(l.meta?.usd).toBe(2.5);
  });

  it('append do mesmo id no livro-razão: a última versão vence (atualização sem reescrever)', () => {
    const v1 = lancamentoCustoApiDiario({ projetoId: 'p1', dia: '2026-07-27', usdAcumuladoDia: 1, cambioUsdBrl: 5 });
    const v2 = lancamentoCustoApiDiario({ projetoId: 'p1', dia: '2026-07-27', usdAcumuladoDia: 3, cambioUsdBrl: 5 });
    const outro = lancamentoCustoApiDiario({ projetoId: 'p2', dia: '2026-07-27', usdAcumuladoDia: 2, cambioUsdBrl: 5 });
    const reduzidos = reduzirLancamentos([v1, outro, v2]);
    expect(reduzidos).toHaveLength(2);
    const doP1 = reduzidos.find((l) => l.projetoId === 'p1');
    expect(doP1?.valorBRL).toBe(-15);
  });
});
