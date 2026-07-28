// Rotinas 24/7 (T2): helpers puros de agenda e system do Agent da rotina.

import { describe, expect, it } from 'vitest';
import { chaveAgenda, cronDaAgenda, montarSystemRotina } from '../src/anthropic/rotinas.js';
import type { FuncionarioAgente, Rotina, Time } from '../src/store/tipos.js';

const rotinaBase: Rotina = {
  id: 'r1',
  nome: 'Caçador de leads',
  emoji: '🧲',
  responsavelTipo: 'funcionario',
  responsavelId: 'f1',
  hora: '08:00',
  dias: 'uteis',
  briefing: 'Qualifique os leads do CRM e anote os quentes.',
  contexto: ['crm'],
  acoes: ['criar_oportunidade', 'registrar_nota_cliente'],
  ativa: true,
  agentId: null,
  deploymentId: null,
  ultimaExecucao: null,
  criadoEm: '2026-07-28T00:00:00Z',
};

const funcionario: FuncionarioAgente = {
  id: 'f1',
  nome: 'Bia',
  cargoVisual: 'pleno',
  persona: 'Comercial consultiva, direta e simpática.',
  skills: ['copy'],
  modelo: 'claude-opus-5',
  agentId: 'agent_f1',
  agentVersion: 1,
  status: 'ativo',
  custoTotalUSD: 0,
  custoHojeUSD: 0,
  criadoEm: '2026-07-28T00:00:00Z',
};

describe('cronDaAgenda / chaveAgenda', () => {
  it('dias úteis viram 1-5; todos os dias mantém *', () => {
    expect(cronDaAgenda('08:30', 'uteis')).toBe('30 8 * * 1-5');
    expect(cronDaAgenda('08:30', 'todos')).toBe('30 8 * * *');
  });

  it('hora inválida cai no padrão 09:00', () => {
    expect(cronDaAgenda('abc', 'todos')).toBe('0 9 * * *');
  });

  it('chave muda quando hora ou dias mudam (⇒ recria o deployment)', () => {
    expect(chaveAgenda({ hora: '08:00', dias: 'uteis' })).toBe('08:00|uteis');
    expect(chaveAgenda({ hora: '08:00', dias: 'todos' })).not.toBe(chaveAgenda({ hora: '08:00', dias: 'uteis' }));
  });
});

describe('montarSystemRotina', () => {
  it('funcionário: identidade + persona + briefing + ações liberadas', () => {
    const system = montarSystemRotina(rotinaBase, { funcionario });
    expect(system).toContain('Bia');
    expect(system).toContain('Comercial consultiva');
    expect(system).toContain('Qualifique os leads');
    expect(system).toContain('criar_oportunidade');
    expect(system).toContain('registrar_nota_cliente');
    expect(system).toContain('obter_contexto');
    expect(system).toContain('publicar_resultado');
    expect(system).toContain('sempre do dono'); // guard-rail explícito
  });

  it('time: coordena membros com especialidades', () => {
    const time: Time = {
      id: 't1',
      nome: 'Mercado Livre',
      emoji: '🛒',
      missao: 'Operar a conta.',
      membros: ['f1'],
      coordenadorAgentId: null,
      coordenadorVersion: null,
      status: 'ativo',
      criadoEm: '2026-07-28T00:00:00Z',
    };
    const system = montarSystemRotina(
      { ...rotinaBase, responsavelTipo: 'time', responsavelId: 't1', acoes: [] },
      { time, membros: [funcionario] },
    );
    expect(system).toContain('Mercado Livre');
    expect(system).toContain('Bia');
    expect(system).toContain('nenhuma ação estruturada');
  });
});
