// Driver de sessões — as regras obrigatórias do plano (docs/PLANO-EMPRESA-REAL.md):
// 1. Stream ANTES do kickoff (SSE não tem replay).
// 2. Reconexão sem perda: events.list() + dedupe por event.id (Set persistido) antes do stream ao vivo.
// 3. Gate de idle: encerrar só em status_terminated ou status_idle com stop_reason != requires_action.
//    end_turn ⇒ projeto vira 'aguardando_revisao'.
// 4. Custom tool `reportar_progresso`: atualiza projeto, broadcast, responde user.custom_tool_result.
// 5. Custos: span.model_request_end.model_usage → USD → BRL → livro-razão; limite estourado ⇒ pausa automática.
// 6. Reconciliação no boot: sessions.retrieve() e religa (ou marca terminado).

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { agoraISO, arredondarBRL, hojeISO } from '../config.js';
import { gerarContasReceber, lancamentoVenda } from '../financeiro/motor.js';
import type { Store } from '../store/db.js';
import type {
  EventoSessao,
  FuncionarioAgente,
  ProjetoReal,
} from '../store/tipos.js';
import type { TempoReal } from '../tempoReal.js';
import {
  FERRAMENTA_PROGRESSO,
  garantirEnvironment,
  montarKickoff,
} from './agentes.js';
import { ErroPonte } from './cliente.js';
import { custoUsd, lancamentoCustoApiDiario, type UsoModelo } from './custos.js';

const BETA_MANAGED_AGENTS = 'managed-agents-2026-04-01';

// ---------- decisões puras (testáveis sem rede) ----------

export type Decisao =
  | { tipo: 'continuar' }
  | { tipo: 'revisao' } // idle end_turn → aguardando_revisao
  | { tipo: 'falha'; motivo: string } // retries_exhausted
  | { tipo: 'terminado' }; // status_terminated

/** Regra 3 — o gate de idle correto. */
export function decidirAposEvento(ev: EventoSessao): Decisao {
  if (ev.type === 'session.status_terminated') return { tipo: 'terminado' };
  if (ev.type === 'session.status_idle') {
    const stop = ev.stop_reason as { type?: string } | undefined;
    if (stop?.type === 'requires_action') return { tipo: 'continuar' };
    if (stop?.type === 'retries_exhausted') {
      return { tipo: 'falha', motivo: 'a sessão esgotou as tentativas (retries_exhausted)' };
    }
    return { tipo: 'revisao' }; // end_turn (ou stop_reason ausente)
  }
  return { tipo: 'continuar' };
}

/** Extrai o texto de um agent.message (content: [{type:'text', text}...]). */
export function textoDoEvento(ev: EventoSessao): string {
  const conteudo = ev.content;
  if (!Array.isArray(conteudo)) return '';
  return conteudo
    .map((b) => (b && typeof b === 'object' && (b as { type?: string }).type === 'text'
      ? String((b as { text?: string }).text ?? '')
      : ''))
    .join('')
    .trim();
}

interface ProgressoReportado {
  etapasConcluidas: number;
  etapasTotais: number;
  resumo: string;
}

export function lerProgresso(entrada: unknown): ProgressoReportado | null {
  if (!entrada || typeof entrada !== 'object') return null;
  const e = entrada as Record<string, unknown>;
  const concluidas = Number(e.etapasConcluidas);
  const totais = Number(e.etapasTotais);
  const resumo = typeof e.resumo === 'string' ? e.resumo : '';
  if (!Number.isFinite(concluidas) || !Number.isFinite(totais) || totais <= 0) return null;
  return {
    etapasConcluidas: Math.max(0, Math.min(Math.round(concluidas), Math.round(totais))),
    etapasTotais: Math.round(totais),
    resumo: resumo.slice(0, 300),
  };
}

// ---------- gerenciador ----------

interface Dependencias {
  store: Store;
  tempoReal: TempoReal;
  cliente: () => Anthropic; // lazy: lança ErroPonte se faltar a chave
  aoMudarEstado: () => Promise<void>; // broadcast do snapshot completo
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GerenciadorSessoes {
  private ativos = new Map<string, { abortar: boolean }>();

  constructor(private deps: Dependencias) {}

  // ---- ciclo de vida ----

  /** Inicia o projeto: registra a VENDA, cria a Session e liga o loop de eventos. */
  async iniciar(projeto: ProjetoReal, funcionario: FuncionarioAgente): Promise<void> {
    const { store } = this.deps;
    const cliente = this.deps.cliente();
    if (!funcionario.agentId) {
      throw new ErroPonte(`O funcionário ${funcionario.nome} ainda não tem Agent na Anthropic.`);
    }
    if (projeto.tipo === 'codigo' && !process.env.GITHUB_TOKEN) {
      throw new ErroPonte('Projeto de código exige GITHUB_TOKEN em server/.env.', 503);
    }

    const environmentId = await garantirEnvironment(cliente, store);

    const recursos: Record<string, unknown>[] = [];
    if (projeto.tipo === 'codigo' && projeto.repoUrl) {
      recursos.push({
        type: 'github_repository',
        url: projeto.repoUrl,
        authorization_token: process.env.GITHUB_TOKEN,
        ...(projeto.branch ? { checkout: { type: 'branch', name: projeto.branch } } : {}),
      });
    }
    for (const [i, fileId] of (projeto.spec.anexos ?? []).entries()) {
      recursos.push({ type: 'file', file_id: fileId, mount_path: `/workspace/anexos/anexo-${i + 1}` });
    }

    const sessao = await cliente.beta.sessions.create({
      agent: funcionario.agentId,
      environment_id: environmentId,
      title: `${projeto.emoji} ${projeto.nome} — ${funcionario.nome}`,
      ...(recursos.length ? { resources: recursos } : {}),
    } as Parameters<typeof cliente.beta.sessions.create>[0]);

    // venda registrada no contrato fechado (não afeta o caixa — regime de caixa)
    await store.anexarLancamento(lancamentoVenda(projeto, hojeISO()));

    await this.atualizarProjeto(projeto.id, (p) => {
      p.sessionId = sessao.id;
      p.status = 'em_andamento';
      p.iniciadoEm = agoraISO();
      p.motivoPausa = null;
    });
    await this.registrarAtividade(projeto.id, 'sistema', `Sessão criada (${sessao.id}) — ${funcionario.nome} assumiu o projeto.`);
    this.ligarLoop(projeto.id);
    await this.deps.aoMudarEstado();
  }

  /** Pausa manual (ou automática por limite de custo): user.interrupt + status 'pausado'. */
  async pausar(projetoId: string, motivo: 'manual' | 'limite_custo' = 'manual'): Promise<void> {
    const projeto = await this.obterProjeto(projetoId);
    if (!projeto?.sessionId) throw new ErroPonte('Projeto sem sessão ativa.');
    await this.atualizarProjeto(projetoId, (p) => {
      p.status = 'pausado';
      p.motivoPausa = motivo;
    });
    try {
      await this.deps.cliente().beta.sessions.events.send(projeto.sessionId, {
        events: [{ type: 'user.interrupt' }],
      } as Parameters<Anthropic['beta']['sessions']['events']['send']>[1]);
    } catch (erro) {
      await this.registrarAtividade(projetoId, 'sistema', `Falha ao interromper a sessão: ${mensagem(erro)}`);
    }
    await this.registrarAtividade(
      projetoId,
      'sistema',
      motivo === 'limite_custo' ? 'Pausado automaticamente: limite de custo estourado.' : 'Pausado pelo dono.',
    );
    await this.deps.aoMudarEstado();
  }

  /** Retoma (aceita feedback do dono, que vira user.message). */
  async retomar(projetoId: string, feedback?: string): Promise<void> {
    const projeto = await this.obterProjeto(projetoId);
    if (!projeto?.sessionId) throw new ErroPonte('Projeto sem sessão para retomar.');
    await this.atualizarProjeto(projetoId, (p) => {
      p.status = 'em_andamento';
      p.motivoPausa = null;
    });
    const texto = feedback?.trim()
      ? `Feedback do dono da agência:\n\n${feedback.trim()}\n\nContinue o trabalho levando isso em conta e siga reportando o progresso.`
      : 'Pode continuar o trabalho de onde parou. Siga reportando o progresso.';
    await this.enviarMensagem(projeto.sessionId, texto);
    await this.registrarAtividade(projetoId, 'sistema', feedback?.trim() ? `Retomado com feedback: ${feedback.trim().slice(0, 200)}` : 'Retomado.');
    this.ligarLoop(projetoId);
    await this.deps.aoMudarEstado();
  }

  /** Mensagem avulsa do dono para o agente (modal de Atividade). */
  async enviarMensagem(sessionId: string, texto: string): Promise<void> {
    await this.deps.cliente().beta.sessions.events.send(sessionId, {
      events: [{ type: 'user.message', content: [{ type: 'text', text: texto }] }],
    } as Parameters<Anthropic['beta']['sessions']['events']['send']>[1]);
  }

  /**
   * Entrega: marca 'entregue', gera as contas a receber, baixa os outputs
   * (files.list scope_id) para data/entregas/ e arquiva a sessão.
   */
  async entregar(projetoId: string): Promise<{ contasGeradas: number; arquivosBaixados: string[] }> {
    const { store } = this.deps;
    const projeto = await this.obterProjeto(projetoId);
    if (!projeto) throw new ErroPonte('Projeto não encontrado.', 404);
    if (!['aguardando_revisao', 'em_andamento', 'pausado'].includes(projeto.status)) {
      throw new ErroPonte(`Não dá para entregar um projeto com status '${projeto.status}'.`);
    }
    this.desligarLoop(projetoId);

    const hoje = hojeISO();
    const contas = gerarContasReceber(projeto, hoje);
    const existentes = await store.listarContasReceber();
    const idsExistentes = new Set(existentes.map((c) => c.id));
    const novas = contas.filter((c) => !idsExistentes.has(c.id));
    await store.salvarContasReceber([...existentes, ...novas]);

    await this.atualizarProjeto(projetoId, (p) => {
      p.status = 'entregue';
      p.entregueEm = agoraISO();
      p.motivoPausa = null;
    });

    let arquivos: string[] = [];
    if (projeto.sessionId) {
      arquivos = await this.baixarEntregas(projeto).catch(async (erro) => {
        await this.registrarAtividade(projetoId, 'sistema', `Falha ao baixar entregas: ${mensagem(erro)}`);
        return [];
      });
      await this.arquivarSessao(projeto.sessionId, projetoId);
    }

    await this.registrarAtividade(
      projetoId,
      'sistema',
      `Entregue! ${novas.length} conta(s) a receber gerada(s); ${arquivos.length} arquivo(s) baixado(s).`,
    );
    await this.deps.aoMudarEstado();
    return { contasGeradas: novas.length, arquivosBaixados: arquivos };
  }

  /** Regra 6 — reconciliação no boot: para cada projeto em andamento, religa ou marca terminado. */
  async reconciliar(): Promise<void> {
    const projetos = await this.deps.store.listarProjetos();
    for (const p of projetos) {
      if (p.status !== 'em_andamento' || !p.sessionId) continue;
      try {
        const sessao = await this.deps.cliente().beta.sessions.retrieve(p.sessionId);
        if ((sessao as { status?: string }).status === 'terminated') {
          await this.aplicarDecisao(p.id, { tipo: 'terminado' });
        } else {
          this.ligarLoop(p.id);
        }
      } catch (erro) {
        await this.registrarAtividade(p.id, 'sistema', `Reconciliação falhou: ${mensagem(erro)}`);
        await this.aplicarDecisao(p.id, { tipo: 'falha', motivo: 'sessão inacessível na reconciliação' });
      }
    }
  }

  desligarTodos(): void {
    for (const [, controle] of this.ativos) controle.abortar = true;
    this.ativos.clear();
  }

  // ---- loop de eventos ----

  private ligarLoop(projetoId: string): void {
    if (this.ativos.get(projetoId)) return; // já rodando
    const controle = { abortar: false };
    this.ativos.set(projetoId, controle);
    void this.rodarLoop(projetoId, controle).finally(() => {
      if (this.ativos.get(projetoId) === controle) this.ativos.delete(projetoId);
    });
  }

  private desligarLoop(projetoId: string): void {
    const controle = this.ativos.get(projetoId);
    if (controle) controle.abortar = true;
    this.ativos.delete(projetoId);
  }

  private async rodarLoop(projetoId: string, controle: { abortar: boolean }): Promise<void> {
    let tentativa = 0;
    while (!controle.abortar) {
      const projeto = await this.obterProjeto(projetoId);
      if (!projeto?.sessionId || projeto.status !== 'em_andamento') return;
      try {
        const resultado = await this.consumirSessao(projeto, controle);
        if (resultado === 'fim') return;
        tentativa = 0; // stream caiu sem terminal — reconecta
      } catch (erro) {
        tentativa += 1;
        await this.registrarAtividade(projetoId, 'sistema', `Conexão com a sessão falhou (${mensagem(erro)}); religando…`);
      }
      if (controle.abortar) return;
      await dormir(Math.min(30_000, 2_000 * 2 ** Math.min(tentativa, 4)));
    }
  }

  /** Regras 1 e 2: abre o stream primeiro, replay do histórico com dedupe, depois o vivo. */
  private async consumirSessao(
    projeto: ProjetoReal,
    controle: { abortar: boolean },
  ): Promise<'fim' | 'reconectar'> {
    const cliente = this.deps.cliente();
    const { store } = this.deps;
    const sessionId = projeto.sessionId!;

    // 1) stream aberto ANTES de qualquer envio (kickoff incluso)
    const stream = await cliente.beta.sessions.events.stream(sessionId);

    // 2) histórico completo + dedupe
    const vistos = await store.lerEventosVistos(sessionId);
    const historico: EventoSessao[] = [];
    for await (const bruto of cliente.beta.sessions.events.list(sessionId)) {
      historico.push(bruto as unknown as EventoSessao);
    }
    const respondidos = coletarToolResultsRespondidos(historico);

    let ultimoStatus: EventoSessao | null = null;
    for (const ev of historico) {
      const novo = !ev.id || !vistos.has(ev.id);
      if (ev.id) vistos.add(ev.id);
      if (novo) await this.efeitosDoEvento(projeto.id, ev, respondidos);
      if (ev.type.startsWith('session.status_')) ultimoStatus = ev;
    }
    await store.salvarEventosVistos(sessionId, vistos);

    // kickoff só depois do stream aberto — e só uma vez
    const atual = await this.obterProjeto(projeto.id);
    if (atual && !atual.kickoffEnviado) {
      await this.enviarMensagem(sessionId, montarKickoff(atual));
      await this.atualizarProjeto(projeto.id, (p) => {
        p.kickoffEnviado = true;
      });
      await this.registrarAtividade(projeto.id, 'sistema', 'Especificação enviada ao funcionário.');
      ultimoStatus = null; // acabamos de acordar a sessão
    }

    // decisão do estado ATUAL da sessão só pelo último status do histórico
    if (ultimoStatus) {
      const decisao = decidirAposEvento(ultimoStatus);
      if (decisao.tipo !== 'continuar') {
        await this.aplicarDecisao(projeto.id, decisao);
        return 'fim';
      }
    }

    // 3) stream ao vivo — checagem terminal roda para TODO evento (visto ou não)
    let desdeSalvo = 0;
    for await (const bruto of stream) {
      const ev = bruto as unknown as EventoSessao;
      const novo = !ev.id || !vistos.has(ev.id);
      if (ev.id) vistos.add(ev.id);
      if (novo) await this.efeitosDoEvento(projeto.id, ev, respondidos);
      desdeSalvo += 1;
      if (desdeSalvo >= 20) {
        desdeSalvo = 0;
        await store.salvarEventosVistos(sessionId, vistos);
      }
      const decisao = decidirAposEvento(ev);
      if (decisao.tipo !== 'continuar') {
        await store.salvarEventosVistos(sessionId, vistos);
        await this.aplicarDecisao(projeto.id, decisao);
        return 'fim';
      }
      if (controle.abortar) {
        await store.salvarEventosVistos(sessionId, vistos);
        return 'fim';
      }
    }
    await store.salvarEventosVistos(sessionId, vistos);
    return 'reconectar';
  }

  /** Efeitos colaterais de um evento NOVO (regras 4 e 5). */
  private async efeitosDoEvento(
    projetoId: string,
    ev: EventoSessao,
    respondidos: Set<string>,
  ): Promise<void> {
    switch (ev.type) {
      case 'agent.message': {
        const texto = textoDoEvento(ev);
        if (texto) await this.registrarAtividade(projetoId, 'mensagem', texto.slice(0, 2000));
        return;
      }
      case 'agent.tool_use':
      case 'agent.mcp_tool_use': {
        const nome = typeof ev.name === 'string' ? ev.name : 'ferramenta';
        await this.registrarAtividade(projetoId, 'ferramenta', `usou ${nome}`);
        return;
      }
      case 'agent.custom_tool_use':
        await this.tratarCustomTool(projetoId, ev, respondidos);
        return;
      case 'span.model_request_end':
        await this.registrarCusto(projetoId, (ev.model_usage ?? {}) as UsoModelo);
        return;
      case 'agent.thread_context_compacted':
        await this.registrarAtividade(projetoId, 'sistema', 'Contexto da sessão foi compactado.');
        return;
      case 'session.error': {
        const erro = ev.error as { message?: string } | undefined;
        const texto = erro?.message ?? 'erro na sessão';
        await this.registrarAtividade(projetoId, 'sistema', `Erro na sessão: ${texto}`);
        this.deps.tempoReal.enviar('alerta', { tipo: 'erro_sessao', projetoId, mensagem: texto });
        return;
      }
      default:
        return;
    }
  }

  /** Regra 4 — reportar_progresso: atualiza o projeto, avisa o front e responde a tool. */
  private async tratarCustomTool(
    projetoId: string,
    ev: EventoSessao,
    respondidos: Set<string>,
  ): Promise<void> {
    const nome = typeof ev.name === 'string' ? ev.name : '';
    const id = typeof ev.id === 'string' ? ev.id : null;
    let resposta = 'ok';
    if (nome === FERRAMENTA_PROGRESSO) {
      const progresso = lerProgresso(ev.input);
      if (progresso) {
        const projeto = await this.atualizarProjeto(projetoId, (p) => {
          p.etapasConcluidas = progresso.etapasConcluidas;
          p.etapasTotais = progresso.etapasTotais;
          p.resumoAtual = progresso.resumo;
        });
        this.deps.tempoReal.enviar('progresso', {
          projetoId,
          etapasConcluidas: progresso.etapasConcluidas,
          etapasTotais: progresso.etapasTotais,
          resumoAtual: progresso.resumo,
        });
        await this.registrarAtividade(
          projetoId,
          'progresso',
          `Etapa ${progresso.etapasConcluidas}/${progresso.etapasTotais} — ${progresso.resumo}`,
        );
        resposta = `registrado: ${progresso.etapasConcluidas}/${progresso.etapasTotais}`;
        if (projeto) await this.deps.aoMudarEstado();
      } else {
        resposta = 'entrada inválida: envie etapasConcluidas, etapasTotais (>0) e resumo';
      }
    } else {
      resposta = `ferramenta desconhecida: ${nome}`;
    }
    if (id && !respondidos.has(id)) {
      respondidos.add(id);
      const projeto = await this.obterProjeto(projetoId);
      if (projeto?.sessionId) {
        await this.deps.cliente().beta.sessions.events.send(projeto.sessionId, {
          events: [
            {
              type: 'user.custom_tool_result',
              custom_tool_use_id: id,
              content: [{ type: 'text', text: resposta }],
            },
          ],
        } as Parameters<Anthropic['beta']['sessions']['events']['send']>[1]);
      }
    }
  }

  /** Regra 5 — custo por request: acumula em projeto+funcionário, livro-razão e checa limites. */
  private async registrarCusto(projetoId: string, uso: UsoModelo): Promise<void> {
    const { store, tempoReal } = this.deps;
    const projeto = await this.obterProjeto(projetoId);
    if (!projeto) return;
    const funcionarios = await store.listarFuncionarios();
    const funcionario = funcionarios.find((f) => f.id === projeto.funcionarioId);
    const modelo = funcionario?.modelo ?? 'claude-opus-5';
    const usd = custoUsd(modelo, uso);
    if (usd <= 0) return;
    const hoje = hojeISO();
    const cfg = await store.lerConfig();

    await this.atualizarProjeto(projetoId, (p) => {
      p.custoUSD += usd;
      p.tokens.input += uso.input_tokens ?? 0;
      p.tokens.output += uso.output_tokens ?? 0;
      p.tokens.cacheRead += uso.cache_read_input_tokens ?? 0;
      p.tokens.cacheWrite += uso.cache_creation_input_tokens ?? 0;
    });
    if (funcionario) {
      if (funcionario.custoHojeData !== hoje) {
        funcionario.custoHojeData = hoje;
        funcionario.custoHojeUSD = 0;
      }
      funcionario.custoHojeUSD += usd;
      funcionario.custoTotalUSD += usd;
      await store.salvarFuncionarios(funcionarios);
    }

    // acumulador projeto+dia → lançamento diário consolidado (última versão vence)
    const chaveDia = `${projetoId}:${hoje}`;
    const dias = await store.lerCustosApiDia();
    dias[chaveDia] = (dias[chaveDia] ?? 0) + usd;
    await store.salvarCustosApiDia(dias);
    await store.anexarLancamento(
      lancamentoCustoApiDiario({
        projetoId,
        funcionarioId: projeto.funcionarioId,
        sessionId: projeto.sessionId ?? undefined,
        dia: hoje,
        usdAcumuladoDia: dias[chaveDia]!,
        cambioUsdBrl: cfg.cambioUsdBrl,
        modelo,
        nomeProjeto: projeto.nome,
      }),
    );

    const projetoAtualizado = await this.obterProjeto(projetoId);
    tempoReal.enviar('custo', {
      projetoId,
      custoUSD: projetoAtualizado?.custoUSD ?? 0,
      custoBRL: arredondarBRL((projetoAtualizado?.custoUSD ?? 0) * cfg.cambioUsdBrl),
      tokens: projetoAtualizado?.tokens,
      funcionarioId: projeto.funcionarioId,
      custoHojeFuncionarioUSD: funcionario?.custoHojeUSD ?? 0,
    });

    // limites → pausa automática + alerta
    if ((projetoAtualizado?.custoUSD ?? 0) > cfg.limitePorProjetoUSD && projetoAtualizado?.status === 'em_andamento') {
      tempoReal.enviar('alerta', {
        tipo: 'limite_projeto',
        projetoId,
        mensagem: `Limite de custo do projeto estourado (US$ ${cfg.limitePorProjetoUSD}). Pausando.`,
      });
      await this.pausar(projetoId, 'limite_custo');
      return;
    }
    let totalDia = 0;
    for (const [chave, valor] of Object.entries(dias)) {
      if (chave.endsWith(`:${hoje}`)) totalDia += valor;
    }
    if (totalDia > cfg.limiteDiarioUSD) {
      tempoReal.enviar('alerta', {
        tipo: 'limite_diario',
        mensagem: `Limite de custo diário estourado (US$ ${cfg.limiteDiarioUSD}). Pausando projetos ativos.`,
      });
      const projetos = await store.listarProjetos();
      for (const p of projetos) {
        if (p.status === 'em_andamento') await this.pausar(p.id, 'limite_custo');
      }
    }
  }

  private async aplicarDecisao(projetoId: string, decisao: Decisao): Promise<void> {
    const projeto = await this.obterProjeto(projetoId);
    if (!projeto) return;
    if (projeto.status === 'pausado' || projeto.status === 'entregue') return; // pausa/entrega mandam
    if (decisao.tipo === 'revisao') {
      await this.atualizarProjeto(projetoId, (p) => {
        p.status = 'aguardando_revisao';
      });
      await this.registrarAtividade(projetoId, 'sistema', 'O funcionário encerrou o turno — projeto aguardando a sua revisão.');
      this.deps.tempoReal.enviar('alerta', { tipo: 'aguardando_revisao', projetoId, mensagem: 'Projeto pronto para revisão.' });
    } else if (decisao.tipo === 'falha') {
      await this.atualizarProjeto(projetoId, (p) => {
        p.status = 'falhou';
      });
      await this.registrarAtividade(projetoId, 'sistema', `Projeto marcado como falho: ${decisao.motivo}`);
      this.deps.tempoReal.enviar('alerta', { tipo: 'falha', projetoId, mensagem: decisao.motivo });
    } else if (decisao.tipo === 'terminado') {
      const completo = projeto.etapasTotais > 0 && projeto.etapasConcluidas >= projeto.etapasTotais;
      await this.atualizarProjeto(projetoId, (p) => {
        p.status = completo ? 'aguardando_revisao' : 'falhou';
      });
      await this.registrarAtividade(
        projetoId,
        'sistema',
        completo ? 'Sessão terminada com as etapas completas — aguardando revisão.' : 'Sessão terminada antes do fim — projeto marcado como falho.',
      );
    }
    await this.deps.aoMudarEstado();
  }

  // ---- entrega de arquivos ----

  private async baixarEntregas(projeto: ProjetoReal): Promise<string[]> {
    const cliente = this.deps.cliente();
    const destino = this.deps.store.caminhoEntregas(projeto.id);
    await mkdir(destino, { recursive: true });
    const nomes: string[] = [];
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const pagina = await cliente.beta.files.list({
        scope_id: projeto.sessionId!,
        betas: [BETA_MANAGED_AGENTS],
      } as Parameters<typeof cliente.beta.files.list>[0]);
      for await (const arquivo of pagina) {
        const meta = arquivo as { id: string; filename?: string };
        const nome = path.basename(meta.filename ?? meta.id) || meta.id;
        const resposta = await cliente.beta.files.download(meta.id);
        const bytes = Buffer.from(await resposta.arrayBuffer());
        await writeFile(path.join(destino, nome), bytes);
        nomes.push(nome);
      }
      if (nomes.length) break;
      await dormir(2_000); // lag de indexação (~1-3s) entre idle e os outputs aparecerem
    }
    return nomes;
  }

  private async arquivarSessao(sessionId: string, projetoId: string): Promise<void> {
    const cliente = this.deps.cliente();
    try {
      for (let i = 0; i < 10; i++) {
        const s = await cliente.beta.sessions.retrieve(sessionId);
        if ((s as { status?: string }).status !== 'running') break;
        await dormir(300);
      }
      await cliente.beta.sessions.archive(sessionId);
    } catch (erro) {
      await this.registrarAtividade(projetoId, 'sistema', `Não consegui arquivar a sessão: ${mensagem(erro)}`);
    }
  }

  // ---- utilitários ----

  private async obterProjeto(projetoId: string): Promise<ProjetoReal | undefined> {
    const projetos = await this.deps.store.listarProjetos();
    return projetos.find((p) => p.id === projetoId);
  }

  private async atualizarProjeto(
    projetoId: string,
    mutar: (p: ProjetoReal) => void,
  ): Promise<ProjetoReal | undefined> {
    const projetos = await this.deps.store.listarProjetos();
    const projeto = projetos.find((p) => p.id === projetoId);
    if (!projeto) return undefined;
    mutar(projeto);
    await this.deps.store.salvarProjetos(projetos);
    return projeto;
  }

  private async registrarAtividade(
    projetoId: string,
    tipo: 'mensagem' | 'ferramenta' | 'progresso' | 'custo' | 'sistema',
    texto: string,
  ): Promise<void> {
    const entrada = { ts: agoraISO(), tipo, texto };
    await this.deps.store.anexarAtividade(projetoId, entrada);
    this.deps.tempoReal.enviar('atividade', { projetoId, entrada });
  }
}

function coletarToolResultsRespondidos(historico: EventoSessao[]): Set<string> {
  const respondidos = new Set<string>();
  for (const ev of historico) {
    if (ev.type === 'user.custom_tool_result' && typeof ev.custom_tool_use_id === 'string') {
      respondidos.add(ev.custom_tool_use_id);
    }
  }
  return respondidos;
}

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
