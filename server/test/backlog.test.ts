// Backlog "insano" — sino/meta, conquistas, gerente multiagente e propostas.

import { describe, expect, it } from 'vitest';
import { montarBriefingProposta, montarKickoff, rosterMudou } from '../src/anthropic/agentes.js';
import { avaliarConquistas, DEFS_CONQUISTAS, listaConquistas } from '../src/conquistas.js';
import { metaFoiBatida } from '../src/financeiro/motor.js';
import type { FuncionarioAgente, Lancamento, ProjetoReal } from '../src/store/tipos.js';

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

// ---- conquistas reais ----

function projeto(extra: Partial<ProjetoReal>): ProjetoReal {
  return {
    id: 'p', nome: 'P', cliente: 'Cliente X', emoji: '📦', tipo: 'entrega',
    spec: { objetivo: 'o', escopo: 'e', entregaveis: 'x', criteriosAceite: 'c' },
    valorContratoBRL: 1000, pagamento: { forma: 'avista' }, prazoDias: 7,
    criadoEm: '2026-07-01T00:00:00Z', funcionarioId: 'f1', sessionId: null,
    etapasTotais: 0, etapasConcluidas: 0, resumoAtual: '', status: 'em_andamento',
    custoUSD: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    ...extra,
  };
}

function funcionario(id: string, status: 'ativo' | 'arquivado' = 'ativo'): FuncionarioAgente {
  return {
    id, nome: id, cargoVisual: 'pleno', persona: '', skills: [], modelo: 'claude-opus-5',
    agentId: null, agentVersion: null, status, custoTotalUSD: 0, custoHojeUSD: 0,
    criadoEm: '2026-07-01T00:00:00Z',
  };
}

const lanc = (tipo: Lancamento['tipo'], valorBRL: number, data = '2026-07-10'): Lancamento => ({
  id: `${tipo}:${valorBRL}:${data}`, data, tipo, valorBRL, descricao: '',
});

describe('avaliarConquistas — marcos reais', () => {
  const vazio = { projetos: [], funcionarios: [], lancamentos: [], config: { metaBatidaMes: null } };

  it('agência zerada não destrava nada', () => {
    expect(avaliarConquistas(vazio).size).toBe(0);
  });

  it('cada marco destrava a conquista certa', () => {
    expect(avaliarConquistas({ ...vazio, projetos: [projeto({ id: 'a', status: 'entregue' })] }).has('primeira_entrega')).toBe(true);
    expect(avaliarConquistas({ ...vazio, projetos: [projeto({ id: 'a', qaResultado: 'aprovado' })] }).has('selo_qa')).toBe(true);
    expect(avaliarConquistas({ ...vazio, projetos: [projeto({ id: 'a', prUrl: 'https://github.com/a/b/pull/1' })] }).has('codigo_no_ar')).toBe(true);
    expect(avaliarConquistas({ ...vazio, lancamentos: [lanc('recebimento', 6000), lanc('recebimento', 4000, '2026-06-10')] }).has('dez_mil_recebidos')).toBe(true);
    expect(avaliarConquistas({ ...vazio, lancamentos: [lanc('recebimento', 500), lanc('custo_api', -100)] }).has('mes_no_azul')).toBe(true);
    expect(avaliarConquistas({ ...vazio, funcionarios: [funcionario('a'), funcionario('b'), funcionario('c')] }).has('time_de_verdade')).toBe(true);
    expect(avaliarConquistas({ ...vazio, config: { metaBatidaMes: '2026-07' } }).has('meta_esmagada')).toBe(true);
    expect(
      avaliarConquistas({
        ...vazio,
        projetos: [projeto({ id: 'a', cliente: 'Padaria' }), projeto({ id: 'b', cliente: ' padaria ' })],
      }).has('cliente_fiel'),
    ).toBe(true);
  });

  it('quase lá NÃO destrava: 9.999 recebidos, 2 ativos, rascunhos do mesmo cliente, mês no vermelho', () => {
    const r = avaliarConquistas({
      projetos: [
        projeto({ id: 'a', cliente: 'X', status: 'rascunho' }),
        projeto({ id: 'b', cliente: 'X', status: 'rascunho' }),
      ],
      funcionarios: [funcionario('a'), funcionario('b'), funcionario('c', 'arquivado')],
      lancamentos: [lanc('recebimento', 9_999), lanc('custo_fixo', -20_000)],
      config: { metaBatidaMes: null },
    });
    expect(r.has('dez_mil_recebidos')).toBe(false);
    expect(r.has('time_de_verdade')).toBe(false);
    expect(r.has('cliente_fiel')).toBe(false);
    expect(r.has('mes_no_azul')).toBe(false);
  });

  it('listaConquistas cobre todas as definições, com data só nas desbloqueadas', () => {
    const lista = listaConquistas({ primeira_entrega: '2026-07-27T12:00:00Z' });
    expect(lista).toHaveLength(DEFS_CONQUISTAS.length);
    expect(lista.find((c) => c.id === 'primeira_entrega')?.quando).toBe('2026-07-27T12:00:00Z');
    expect(lista.find((c) => c.id === 'selo_qa')?.quando).toBeNull();
  });
});

// ---- gerente de IA multiagente ----

describe('gerente de IA — roster e kickoff', () => {
  it('rosterMudou ignora a ordem e pega inclusão/remoção', () => {
    expect(rosterMudou(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(rosterMudou(['a', 'b', 'c'], ['a', 'b'])).toBe(true);
    expect(rosterMudou(['a'], ['a', 'b'])).toBe(true);
    expect(rosterMudou(['a'], undefined)).toBe(true);
  });

  it('kickoff de projeto da equipe instrui o gerente a delegar', () => {
    const equipe = montarKickoff(projeto({ id: 'x', funcionarioId: 'equipe' }));
    expect(equipe).toContain('Trabalho em equipe');
    expect(equipe).toContain('distribua');
    const solo = montarKickoff(projeto({ id: 'y' }));
    expect(solo).not.toContain('Trabalho em equipe');
  });
});

// ---- propostas em PDF ----

describe('montarBriefingProposta', () => {
  it('leva cliente, valor, observações e o histórico real de projetos', () => {
    const briefing = montarBriefingProposta({
      titulo: 'Loja virtual completa',
      valorEstimadoBRL: 8000,
      observacoes: 'quer integração com Pix',
      cliente: { nome: 'Loja da Maria', contato: 'maria@loja.com', origem: 'site' },
      historico: [
        { nome: 'Cardápio Online', tipo: 'entrega', valorContratoBRL: 4500, custoUSD: 1.87, prazoDias: 10 },
      ],
    });
    for (const trecho of [
      'Loja virtual completa',
      'Loja da Maria',
      'maria@loja.com',
      'Pix',
      '8.000,00', // toLocaleString usa espaço não-quebrável após o R$
      'Cardápio Online',
      '10 dias',
      '/mnt/session/outputs/proposta.pdf',
    ]) {
      expect(briefing).toContain(trecho);
    }
  });

  it('sem valor estimado, pede sugestão; sem histórico, some a seção', () => {
    const briefing = montarBriefingProposta({
      titulo: 'X',
      valorEstimadoBRL: 0,
      cliente: { nome: 'Y' },
      historico: [],
    });
    expect(briefing).toContain('sugira você');
    expect(briefing).not.toContain('Histórico real');
  });
});
