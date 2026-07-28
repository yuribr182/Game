// Times dinâmicos (T1): helpers de responsável e system do coordenador.

import { describe, expect, it } from 'vitest';
import { montarSystemCoordenadorTime } from '../src/anthropic/agentes.js';
import { ehResponsavelTime, idDoTime, PREFIXO_TIME } from '../src/store/tipos.js';
import type { FuncionarioAgente, Time } from '../src/store/tipos.js';

describe('responsável time:<id>', () => {
  it('reconhece o prefixo e extrai o id', () => {
    expect(ehResponsavelTime(`${PREFIXO_TIME}abc-123`)).toBe(true);
    expect(idDoTime(`${PREFIXO_TIME}abc-123`)).toBe('abc-123');
  });

  it('não confunde com funcionário nem com "equipe"', () => {
    expect(ehResponsavelTime('f-9')).toBe(false);
    expect(ehResponsavelTime('equipe')).toBe(false);
  });
});

describe('montarSystemCoordenadorTime', () => {
  const time: Time = {
    id: 't1',
    nome: 'Mercado Livre',
    emoji: '🛒',
    missao: 'Operar a conta do Mercado Livre com excelência.',
    membros: ['f1', 'f2'],
    coordenadorAgentId: null,
    coordenadorVersion: null,
    status: 'ativo',
    criadoEm: '2026-07-28T00:00:00Z',
  };
  const membro = (id: string, nome: string, skills: string[]): FuncionarioAgente => ({
    id,
    nome,
    cargoVisual: 'pleno',
    persona: '',
    skills,
    modelo: 'claude-opus-5',
    agentId: `agent_${id}`,
    agentVersion: 1,
    status: 'ativo',
    custoTotalUSD: 0,
    custoHojeUSD: 0,
    criadoEm: '2026-07-28T00:00:00Z',
  });

  it('inclui nome do time, missão e o roster com especialidades', () => {
    const system = montarSystemCoordenadorTime(time, [
      membro('f1', 'Bia', ['copy', 'pesquisa']),
      membro('f2', 'Léo', ['planilhas']),
    ]);
    expect(system).toContain('Mercado Livre');
    expect(system).toContain('Operar a conta do Mercado Livre');
    expect(system).toContain('Bia');
    expect(system).toContain('copy, pesquisa');
    expect(system).toContain('Léo');
    expect(system).toContain('português do Brasil');
    expect(system).toContain('reportar_progresso');
  });

  it('sem missão, usa a padrão; sem skills, marca generalista', () => {
    const system = montarSystemCoordenadorTime({ ...time, missao: '' }, [membro('f1', 'Ana', [])]);
    expect(system).toContain('Executar com excelência');
    expect(system).toContain('generalista');
  });
});
