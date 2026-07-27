import { describe, expect, it } from 'vitest';
import {
  montarKickoff,
  montarSystem,
  skillsAgente,
} from '../src/anthropic/agentes.js';
import { decidirAposEvento, lerProgresso, textoDoEvento } from '../src/anthropic/sessoes.js';
import type { FuncionarioAgente, ProjetoReal } from '../src/store/tipos.js';

describe('decidirAposEvento — gate de idle (regra 3 do driver)', () => {
  it('idle esperando ação do cliente (custom tool) NÃO encerra', () => {
    expect(
      decidirAposEvento({ type: 'session.status_idle', stop_reason: { type: 'requires_action' } }),
    ).toEqual({ tipo: 'continuar' });
  });

  it('idle end_turn vira aguardando_revisao', () => {
    expect(
      decidirAposEvento({ type: 'session.status_idle', stop_reason: { type: 'end_turn' } }),
    ).toEqual({ tipo: 'revisao' });
  });

  it('retries_exhausted vira falha', () => {
    const d = decidirAposEvento({
      type: 'session.status_idle',
      stop_reason: { type: 'retries_exhausted' },
    });
    expect(d.tipo).toBe('falha');
  });

  it('terminated encerra; eventos comuns continuam', () => {
    expect(decidirAposEvento({ type: 'session.status_terminated' })).toEqual({ tipo: 'terminado' });
    expect(decidirAposEvento({ type: 'agent.message' })).toEqual({ tipo: 'continuar' });
    expect(decidirAposEvento({ type: 'span.model_request_end' })).toEqual({ tipo: 'continuar' });
  });
});

describe('lerProgresso — entrada da custom tool', () => {
  it('normaliza e limita os valores', () => {
    expect(lerProgresso({ etapasConcluidas: 3, etapasTotais: 8, resumo: 'implementando login' })).toEqual({
      etapasConcluidas: 3,
      etapasTotais: 8,
      resumo: 'implementando login',
    });
    // concluídas nunca passam do total; negativo vira 0
    expect(lerProgresso({ etapasConcluidas: 12, etapasTotais: 8, resumo: 'x' })?.etapasConcluidas).toBe(8);
    expect(lerProgresso({ etapasConcluidas: -2, etapasTotais: 8, resumo: 'x' })?.etapasConcluidas).toBe(0);
  });

  it('rejeita entradas inválidas', () => {
    expect(lerProgresso(null)).toBeNull();
    expect(lerProgresso({ etapasConcluidas: 1 })).toBeNull();
    expect(lerProgresso({ etapasConcluidas: 1, etapasTotais: 0, resumo: 'x' })).toBeNull();
  });
});

describe('textoDoEvento', () => {
  it('junta só os blocos de texto', () => {
    expect(
      textoDoEvento({
        type: 'agent.message',
        content: [
          { type: 'text', text: 'Olá! ' },
          { type: 'outro', text: 'ignora' },
          { type: 'text', text: 'Começando.' },
        ],
      }),
    ).toBe('Olá! Começando.');
    expect(textoDoEvento({ type: 'agent.message' })).toBe('');
  });
});

function funcionarioFake(): FuncionarioAgente {
  return {
    id: 'f1',
    nome: 'Rafa',
    cargoVisual: 'senior',
    persona: 'Pragmático, entrega rápido.',
    skills: ['web', 'backend', 'xlsx', 'skill_custom123', 'inexistente'],
    modelo: 'claude-opus-5',
    agentId: null,
    agentVersion: null,
    status: 'ativo',
    custoTotalUSD: 0,
    custoHojeUSD: 0,
    criadoEm: '2026-07-27T00:00:00Z',
  };
}

describe('montagem do agente', () => {
  it('system tem nome, persona, especialidades e o protocolo de progresso', () => {
    const system = montarSystem(funcionarioFake());
    expect(system).toContain('Rafa');
    expect(system).toContain('Pragmático');
    expect(system).toContain('Desenvolvimento Web');
    expect(system).toContain('reportar_progresso');
    expect(system).toContain('/mnt/session/outputs/');
    expect(system).toContain('português do Brasil');
  });

  it('skills viram referências anthropic/custom e ignoram chaves de bloco', () => {
    const skills = skillsAgente(funcionarioFake());
    expect(skills).toEqual([
      { type: 'anthropic', skill_id: 'xlsx' },
      { type: 'custom', skill_id: 'skill_custom123' },
    ]);
  });

  it('kickoff traz todas as seções da spec e a instrução de começar pelo plano', () => {
    const projeto: ProjetoReal = {
      id: 'p1',
      nome: 'Site da Padaria',
      cliente: 'Padaria Pão Quente',
      emoji: '🥖',
      tipo: 'entrega',
      spec: {
        objetivo: 'Vender pão online',
        escopo: 'Landing + cardápio',
        foraDoEscopo: 'App mobile',
        requisitosTecnicos: 'HTML puro',
        designReferencias: 'Tons quentes',
        entregaveis: 'index.html',
        criteriosAceite: 'Abre no celular',
        observacoes: 'Cliente aprova por WhatsApp',
      },
      valorContratoBRL: 2000,
      pagamento: { forma: 'avista' },
      prazoDias: 7,
      criadoEm: '2026-07-27T00:00:00Z',
      funcionarioId: 'f1',
      sessionId: null,
      etapasTotais: 0,
      etapasConcluidas: 0,
      resumoAtual: '',
      status: 'rascunho',
      custoUSD: 0,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
    const kickoff = montarKickoff(projeto);
    for (const trecho of [
      'Site da Padaria',
      'Vender pão online',
      'Landing + cardápio',
      'App mobile',
      'HTML puro',
      'Tons quentes',
      'index.html',
      'Abre no celular',
      'WhatsApp',
      '/mnt/session/outputs/',
      'reportar_progresso',
    ]) {
      expect(kickoff).toContain(trecho);
    }
    const codigo = montarKickoff({ ...projeto, tipo: 'codigo', branch: 'feat/site' });
    expect(codigo).toContain('feat/site');
    expect(codigo).not.toContain('/mnt/session/outputs/');
  });
});
