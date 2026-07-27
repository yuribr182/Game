// Backlog "insano" — sino de vendas + meta mensal.

import { describe, expect, it } from 'vitest';
import { metaFoiBatida } from '../src/financeiro/motor.js';

describe('metaFoiBatida — comemoração 1x por mês', () => {
  it('cruza a meta pela primeira vez no mês → comemora', () => {
    expect(metaFoiBatida(12_000, 10_000, null, '2026-07')).toBe(true);
    expect(metaFoiBatida(10_000, 10_000, '2026-06', '2026-07')).toBe(true); // mês novo re-arma
  });

  it('já comemorada neste mês → silêncio', () => {
    expect(metaFoiBatida(50_000, 10_000, '2026-07', '2026-07')).toBe(false);
  });

  it('meta desligada (0) ou ainda não atingida → nada', () => {
    expect(metaFoiBatida(999_999, 0, null, '2026-07')).toBe(false);
    expect(metaFoiBatida(9_999.99, 10_000, null, '2026-07')).toBe(false);
  });
});
