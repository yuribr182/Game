// F4 — QA automático (outcome/rubrica), PR real, standup diário, Telegram e config.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  extrairLinkPR,
  montarKickoff,
  montarRubric,
  ownerRepoDe,
} from '../src/anthropic/agentes.js';
import { interpretarAvaliacaoQA } from '../src/anthropic/sessoes.js';
import { cronDaHora, montarContextoStandup } from '../src/anthropic/standup.js';
import { enviarTelegram } from '../src/notificar/telegram.js';
import { Store } from '../src/store/db.js';
import type { FuncionarioAgente, ProjetoReal } from '../src/store/tipos.js';

function projetoFake(extra: Partial<ProjetoReal> = {}): ProjetoReal {
  return {
    id: 'p1',
    nome: 'Site da Padaria',
    cliente: 'Padaria Pão Quente',
    emoji: '🥖',
    tipo: 'entrega',
    spec: {
      objetivo: 'Vender pão online',
      escopo: 'Landing + cardápio',
      entregaveis: 'index.html com o cardápio completo',
      criteriosAceite: '- Abre no celular\n- Tem os 12 pães do cardápio\n\n- Texto em pt-BR',
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
    ...extra,
  };
}

function funcionarioFake(extra: Partial<FuncionarioAgente> = {}): FuncionarioAgente {
  return {
    id: 'f1',
    nome: 'Rafa',
    cargoVisual: 'senior',
    persona: '',
    skills: [],
    modelo: 'claude-opus-5',
    agentId: 'agent_1',
    agentVersion: 1,
    status: 'ativo',
    custoTotalUSD: 0,
    custoHojeUSD: 1.234,
    criadoEm: '2026-07-01T00:00:00Z',
    ...extra,
  };
}

describe('F4a — rubrica do QA (montarRubric)', () => {
  it('cada linha de critério vira um item graduável; linhas vazias somem', () => {
    const rubric = montarRubric(projetoFake());
    expect(rubric).toContain('- Abre no celular');
    expect(rubric).toContain('- Tem os 12 pães do cardápio');
    expect(rubric).toContain('- Texto em pt-BR');
    expect(rubric).toContain('index.html com o cardápio completo');
    expect(rubric).toContain('/mnt/session/outputs/');
    expect(rubric).toContain('português do Brasil');
  });

  it('projeto de código aponta para o repositório, não para outputs', () => {
    const rubric = montarRubric(projetoFake({ tipo: 'codigo', branch: 'feat/x' }));
    expect(rubric).toContain('push');
    expect(rubric).not.toContain('/mnt/session/outputs/');
  });
});

describe('F4a — interpretarAvaliacaoQA', () => {
  it('mapeia cada result do grader e marca o que é terminal', () => {
    const casos: [string, string, boolean][] = [
      ['satisfied', 'aprovado', true],
      ['needs_revision', 'revisar', false],
      ['max_iterations_reached', 'max_iteracoes', true],
      ['failed', 'reprovado', true],
      ['interrupted', 'interrompido', true],
    ];
    for (const [bruto, esperado, final] of casos) {
      const a = interpretarAvaliacaoQA({
        type: 'span.outcome_evaluation_end',
        result: bruto,
        explanation: 'porque sim',
        iteration: 1,
      });
      expect(a?.resultado).toBe(esperado);
      expect(a?.final).toBe(final);
      expect(a?.iteracao).toBe(2); // 0-indexado na API, 1-based para exibir
      expect(a?.explicacao).toBe('porque sim');
    }
  });

  it('ignora eventos de outro tipo e results desconhecidos', () => {
    expect(interpretarAvaliacaoQA({ type: 'agent.message' })).toBeNull();
    expect(interpretarAvaliacaoQA({ type: 'span.outcome_evaluation_end', result: 'zzz' })).toBeNull();
  });
});

describe('F4d — Pull Request real', () => {
  it('ownerRepoDe entende URLs com e sem .git e rejeita lixo', () => {
    expect(ownerRepoDe('https://github.com/yuribr182/Game')).toBe('yuribr182/Game');
    expect(ownerRepoDe('https://github.com/yuribr182/Game.git')).toBe('yuribr182/Game');
    expect(ownerRepoDe('https://github.com/a/b/tree/main')).toBe('a/b');
    expect(ownerRepoDe('https://gitlab.com/a/b')).toBeNull();
    expect(ownerRepoDe(undefined)).toBeNull();
  });

  it('kickoff de código com abrirPR instrui o PR via API REST (proxy injeta o token)', () => {
    const kickoff = montarKickoff(
      projetoFake({
        tipo: 'codigo',
        repoUrl: 'https://github.com/yuribr182/padaria',
        branch: 'entrega/site',
        abrirPR: true,
      }),
    );
    expect(kickoff).toContain('Pull Request');
    expect(kickoff).toContain('api.github.com/repos/yuribr182/padaria/pulls');
    expect(kickoff).toContain('NÃO peça token');
  });

  it('sem abrirPR não há seção de PR', () => {
    const kickoff = montarKickoff(
      projetoFake({ tipo: 'codigo', repoUrl: 'https://github.com/a/b', abrirPR: false }),
    );
    expect(kickoff).not.toContain('Pull Request');
  });

  it('extrairLinkPR acha o link no meio do texto e ignora outros links do GitHub', () => {
    expect(
      extrairLinkPR('Pronto! PR aberto: https://github.com/yuribr182/padaria/pull/7 — pode revisar.'),
    ).toBe('https://github.com/yuribr182/padaria/pull/7');
    expect(extrairLinkPR('veja https://github.com/yuribr182/padaria/issues/3')).toBeNull();
    expect(extrairLinkPR('sem link nenhum')).toBeNull();
  });
});

describe('F4b — standup diário', () => {
  it('cronDaHora converte HH:MM e cai no padrão 09:00 quando inválida', () => {
    expect(cronDaHora('09:30')).toBe('30 9 * * *');
    expect(cronDaHora('7:05')).toBe('5 7 * * *');
    expect(cronDaHora('23:59')).toBe('59 23 * * *');
    expect(cronDaHora('meia-noite')).toBe('0 9 * * *');
  });

  it('montarContextoStandup entrega os dados que o gerente precisa', () => {
    const agoraMs = Date.parse('2026-07-27T12:00:00Z');
    const contexto = montarContextoStandup({
      hoje: '2026-07-27',
      projetosAbertos: [
        projetoFake({
          status: 'em_andamento',
          iniciadoEm: '2026-07-25T12:00:00Z',
          etapasTotais: 8,
          etapasConcluidas: 3,
          resumoAtual: 'implementando o cardápio',
          custoUSD: 1.2345,
          qaResultado: 'revisar',
          prUrl: 'https://github.com/a/b/pull/1',
        }),
      ],
      rascunhos: 2,
      entreguesTotal: 5,
      funcionarios: [funcionarioFake(), funcionarioFake({ id: 'f2', nome: 'Bia', status: 'arquivado' })],
      financeiro: {
        caixaBRL: 1000,
        totalAReceberBRL: 500,
        atrasadasBRL: 100,
        vencendo7DiasBRL: 200,
        custoApiMesBRL: 50,
      },
      atividadeRecente: { p1: ['10:00 [progresso] Etapa 3/8'] },
      agoraMs,
    }) as {
      projetosAtivos: Record<string, unknown>[];
      equipe: { nome: string }[];
      financeiro: { caixaBRL: number };
      rascunhosAguardandoInicio: number;
    };
    const p = contexto.projetosAtivos[0]!;
    expect(p.responsavel).toBe('Rafa');
    expect(p.etapas).toBe('3/8');
    expect(p.diasRestantes).toBe(5); // 7 de prazo − 2 corridos
    expect(p.custoApiUSD).toBe(1.23);
    expect(p.qa).toBe('revisar');
    expect(p.pullRequest).toBe('https://github.com/a/b/pull/1');
    expect(p.ultimasAtividades).toEqual(['10:00 [progresso] Etapa 3/8']);
    expect(contexto.equipe.map((f) => f.nome)).toEqual(['Rafa']); // arquivada fica de fora
    expect(contexto.financeiro.caixaBRL).toBe(1000);
    expect(contexto.rascunhosAguardandoInicio).toBe(2);
  });
});

describe('F4c — Telegram', () => {
  const env = process.env;
  beforeEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });
  afterEach(() => {
    process.env = env;
  });

  it('sem config: não chama a rede e devolve false', async () => {
    let chamadas = 0;
    const ok = await enviarTelegram('oi', async () => {
      chamadas += 1;
      return { ok: true, status: 200 };
    });
    expect(ok).toBe(false);
    expect(chamadas).toBe(0);
  });

  it('com config: POST correto para a API do bot', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok123';
    process.env.TELEGRAM_CHAT_ID = '42';
    let url = '';
    let corpo: { chat_id?: string; text?: string } = {};
    const ok = await enviarTelegram('✅ Projeto pronto', async (u, init) => {
      url = u;
      corpo = JSON.parse(String(init?.body)) as typeof corpo;
      return { ok: true, status: 200 };
    });
    expect(ok).toBe(true);
    expect(url).toBe('https://api.telegram.org/bottok123/sendMessage');
    expect(corpo.chat_id).toBe('42');
    expect(corpo.text).toBe('✅ Projeto pronto');
  });

  it('falha de rede vira false, nunca exceção', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'tok123';
    process.env.TELEGRAM_CHAT_ID = '42';
    const ok = await enviarTelegram('oi', async () => {
      throw new Error('sem internet');
    });
    expect(ok).toBe(false);
  });
});

describe('config — merge com os padrões (campos novos em arquivos antigos)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'empresa-f4-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('config gravada antes da F4 ganha os campos de standup com os padrões', async () => {
    await writeFile(
      path.join(dir, 'config.json'),
      JSON.stringify({ cambioUsdBrl: 6, limiteDiarioUSD: 10, limitePorProjetoUSD: 20, environmentId: 'env_x' }),
      'utf8',
    );
    const store = new Store(dir);
    await store.init();
    const cfg = await store.lerConfig();
    expect(cfg.cambioUsdBrl).toBe(6); // o que estava salvo vence
    expect(cfg.environmentId).toBe('env_x');
    expect(cfg.standupAtivo).toBe(true); // padrão novo entra
    expect(cfg.standupHora).toBe('09:00');
  });

  it('standup.json guarda relatórios (1 por dia, o novo substitui) e runs processados', async () => {
    const store = new Store(dir);
    await store.init();
    await store.salvarStandup((e) => {
      e.relatorios.push({ data: '2026-07-27', texto: 'v1', criadoEm: '2026-07-27T09:00:00Z' });
      e.runsProcessados.push('drun_1');
    });
    await store.salvarStandup((e) => {
      e.relatorios = e.relatorios.filter((r) => r.data !== '2026-07-27');
      e.relatorios.push({ data: '2026-07-27', texto: 'v2', criadoEm: '2026-07-27T09:05:00Z' });
    });
    const lista = await store.listarStandups();
    expect(lista).toHaveLength(1);
    expect(lista[0]!.texto).toBe('v2');
    const { runsProcessados } = await store.lerStandup();
    expect(runsProcessados).toEqual(['drun_1']);
  });
});
