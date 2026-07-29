// Fluxos (T3): kickoff de estágio (com carga acumulada) e extração de resumo.

import { describe, expect, it } from 'vitest';
import { extrairResumoEstagio, montarKickoffEstagio } from '../src/anthropic/fluxos.js';
import type { ExecucaoFluxo, Fluxo } from '../src/store/tipos.js';

const fluxo: Fluxo = {
  id: 'fx1',
  nome: 'Comercial completo',
  emoji: '🔗',
  estagios: [
    { id: 'e1', nome: 'Captação', responsavelTipo: 'funcionario', responsavelId: 'f1', instrucao: 'Qualifique o lead.', aprovacao: 'manual' },
    { id: 'e2', nome: 'Proposta', responsavelTipo: 'funcionario', responsavelId: 'f1', instrucao: 'Escreva a proposta.', aprovacao: 'manual' },
  ],
  ativo: true,
  criadoEm: '2026-07-28T00:00:00Z',
};

const execucao: ExecucaoFluxo = {
  id: 'ex1',
  fluxoId: 'fx1',
  titulo: 'Lead: Padaria do João',
  entrada: 'Padaria quer site com cardápio.',
  estagioAtual: 1,
  status: 'em_andamento',
  carga: [
    {
      estagioId: 'e1',
      estagioNome: 'Captação',
      resumo: 'Lead QUENTE: orçamento ~R$ 5 mil, decisor é o próprio dono.',
      arquivos: ['analise.md'],
      custoUSD: 0.12,
      concluidoEm: '2026-07-28T10:00:00Z',
    },
  ],
  origem: { tipo: 'manual' },
  sessionId: null,
  criadoEm: '2026-07-28T09:00:00Z',
  atualizadoEm: '2026-07-28T10:00:00Z',
};

describe('montarKickoffEstagio', () => {
  it('inclui instrução, entrada do dono e a carga dos estágios anteriores', () => {
    const kickoff = montarKickoffEstagio({
      fluxo,
      execucao,
      estagio: fluxo.estagios[1]!,
      indice: 1,
    });
    expect(kickoff).toContain('estágio 2/2: Proposta');
    expect(kickoff).toContain('Escreva a proposta.');
    expect(kickoff).toContain('Padaria quer site');
    expect(kickoff).toContain('Lead QUENTE'); // carga do estágio 1 passou adiante
    expect(kickoff).toContain('analise.md');
    expect(kickoff).toContain('RESUMO DO ESTÁGIO:');
    expect(kickoff).toContain('não faça o trabalho dos próximos');
  });

  it('arquivos montados apontam para /workspace/carga; os demais ficam com o dono', () => {
    const kickoff = montarKickoffEstagio({
      fluxo,
      execucao,
      estagio: fluxo.estagios[1]!,
      indice: 1,
      arquivosMontados: ['estagio-1/analise.md'],
    });
    expect(kickoff).toContain('montados em /workspace/carga/estagio-1/: analise.md');
    expect(kickoff).not.toContain('ficaram com o dono');
  });

  it('feedback do dono entra no refazer', () => {
    const kickoff = montarKickoffEstagio({
      fluxo,
      execucao,
      estagio: fluxo.estagios[1]!,
      indice: 1,
      feedback: 'Preço muito alto, refaça com 3 opções.',
    });
    expect(kickoff).toContain('Preço muito alto');
  });
});

describe('extrairResumoEstagio', () => {
  it('corta a partir do marcador RESUMO DO ESTÁGIO', () => {
    expect(extrairResumoEstagio('bla bla\nRESUMO DO ESTÁGIO: proposta pronta em 3 opções.')).toBe(
      'proposta pronta em 3 opções.',
    );
  });

  it('sem marcador usa a mensagem toda; vazio vira aviso', () => {
    expect(extrairResumoEstagio('fiz tudo')).toBe('fiz tudo');
    expect(extrairResumoEstagio('')).toContain('sem resumo');
  });
});
