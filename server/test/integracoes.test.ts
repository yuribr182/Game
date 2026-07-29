// Integrações (F-ML): helpers puros e flags de configuração.

import { describe, expect, it } from 'vitest';
import { gadsApiConfigurada, gerarCsvGoogleAds } from '../src/integracoes/googleads.js';
import { igConfigurado } from '../src/integracoes/meta.js';

describe('gerarCsvGoogleAds', () => {
  it('gera o CSV no formato do Google Ads Editor com limites de caracteres', () => {
    const csv = gerarCsvGoogleAds([
      {
        campanha: 'Matrículas 2027',
        grupo: 'Institucional',
        titulo1: 'Escola Horizonte — matrículas abertas para o novo ano', // >30, deve cortar
        descricao1: 'd'.repeat(120), // >90, deve cortar
        palavrasChave: 'escola particular;matrícula 2027',
        urlFinal: 'https://escolahorizonte.com.br',
      },
    ]);
    const [cab, linha] = csv.split('\n');
    expect(cab).toContain('Campaign,Ad Group,Headline 1');
    expect(linha).toContain('Matrículas 2027');
    const colunas = linha!.split(',');
    expect(colunas[2]!.length).toBeLessThanOrEqual(30); // headline 1 cortada
    expect(csv).toContain('escola particular;matrícula 2027');
  });

  it('escapa vírgulas e aspas nas células', () => {
    const csv = gerarCsvGoogleAds([
      {
        campanha: 'A, B',
        grupo: 'G "1"',
        titulo1: 'T1',
        descricao1: 'D1',
        palavrasChave: 'k',
        urlFinal: 'https://x.com',
      },
    ]);
    expect(csv).toContain('"A, B"');
    expect(csv).toContain('"G ""1"""');
  });
});

describe('flags de configuração (sem chaves no ambiente de teste)', () => {
  it('Instagram e Google Ads API ficam desligados sem env', () => {
    expect(igConfigurado()).toBe(false);
    expect(gadsApiConfigurada()).toBe(false);
  });
});
