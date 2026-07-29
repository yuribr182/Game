// Rotinas 24/7 (PLANO-TIMES-FLUXOS T2): generalização do mecanismo do standup.
// Cada rotina vira um Agent próprio (briefing + tools; multiagente quando o
// responsável é um time) + um deployment com cron na nuvem. A ponte detecta os
// runs por polling, responde as custom tools (contexto real + ações estruturadas
// com guard-rails) e publica o resultado no feed do painel + Telegram.

import { randomUUID } from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import { agoraISO, hojeISO, MODELO_PADRAO } from '../config.js';
import { resumoFinanceiro } from '../financeiro/motor.js';
import { notificarCelular } from '../notificar/telegram.js';
import type { Store } from '../store/db.js';
import type {
  AcaoRotina,
  ClienteCRM,
  EventoSessao,
  ExecucaoRotina,
  FuncionarioAgente,
  OportunidadeCRM,
  ProjetoReal,
  Rotina,
  Time,
} from '../store/tipos.js';
import { PREFIXO_TIME } from '../store/tipos.js';
import type { TempoReal } from '../tempoReal.js';
import { CARGO_ROTULO, garantirEnvironment, rosterMudou } from './agentes.js';
import { ErroPonte } from './cliente.js';
import { custoUsd, lancamentoCustoApiDiario, type UsoModelo } from './custos.js';
import { decidirAposEvento, textoDoEvento } from './sessoes.js';
import { cronDaHora, fusoLocal } from './standup.js';

export const FERRAMENTA_CONTEXTO_ROTINA = 'obter_contexto';
export const FERRAMENTA_PUBLICAR_ROTINA = 'publicar_resultado';

/** Descrição de cada ação estruturada (aparece no system e vira a tool). */
export const ACOES_ROTINA: Record<AcaoRotina, { descricao: string; schema: Record<string, unknown> }> = {
  criar_oportunidade: {
    descricao:
      'Cria um lead/oportunidade no funil do CRM (etapa "lead"). Use quando identificar um cliente em potencial ou uma chance de negócio.',
    schema: {
      type: 'object',
      properties: {
        clienteNome: { type: 'string', description: 'Nome do cliente (cria o cadastro se não existir)' },
        titulo: { type: 'string', description: 'Título curto da oportunidade' },
        valorEstimadoBRL: { type: 'number', description: 'Valor estimado em R$ (0 se não souber)' },
        observacoes: { type: 'string', description: 'Contexto: por que é uma oportunidade, próximos passos' },
      },
      required: ['clienteNome', 'titulo'],
    },
  },
  registrar_nota_cliente: {
    descricao: 'Anota uma observação datada no cadastro de um cliente do CRM (cria o cliente se não existir).',
    schema: {
      type: 'object',
      properties: {
        clienteNome: { type: 'string' },
        nota: { type: 'string', description: 'A anotação (curta e objetiva)' },
      },
      required: ['clienteNome', 'nota'],
    },
  },
  criar_rascunho_projeto: {
    descricao:
      'Cria um RASCUNHO de projeto pré-preenchido (o dono revisa e decide se inicia — nada começa sozinho).',
    schema: {
      type: 'object',
      properties: {
        nome: { type: 'string' },
        cliente: { type: 'string' },
        valorContratoBRL: { type: 'number' },
        prazoDias: { type: 'number' },
        objetivo: { type: 'string' },
        escopo: { type: 'string', description: 'Funcionalidades, uma por linha' },
        entregaveis: { type: 'string' },
        criteriosAceite: { type: 'string', description: 'Um por linha' },
        observacoes: { type: 'string' },
      },
      required: ['nome', 'cliente', 'objetivo', 'escopo', 'entregaveis', 'criteriosAceite'],
    },
  },
  disparar_fluxo: {
    descricao:
      'Dispara uma execução de um FLUXO existente (esteira de estágios). Use para encaminhar um caso quente para a esteira certa — os estágios com aprovação manual continuam esperando o dono.',
    schema: {
      type: 'object',
      properties: {
        fluxoNome: { type: 'string', description: 'Nome (ou parte do nome) do fluxo cadastrado' },
        titulo: { type: 'string', description: 'Título desta execução (ex.: "Lead: Padaria do João")' },
        entrada: { type: 'string', description: 'Contexto inicial completo para o 1º estágio' },
      },
      required: ['fluxoNome', 'titulo', 'entrada'],
    },
  },
};

// ---------- helpers puros (testáveis) ----------

/** Agenda ('HH:MM' + todos|uteis) → expressão cron. */
export function cronDaAgenda(hora: string, dias: 'todos' | 'uteis'): string {
  const base = cronDaHora(hora); // 'M H * * *'
  return dias === 'uteis' ? base.replace(/\*$/, '1-5') : base;
}

/** Chave da agenda aplicada no deployment (muda ⇒ recria). */
export function chaveAgenda(rotina: Pick<Rotina, 'hora' | 'dias'>): string {
  return `${rotina.hora}|${rotina.dias}`;
}

/** System do Agent da rotina — briefing + contexto/ações permitidas + responsável. */
export function montarSystemRotina(
  rotina: Rotina,
  responsavel: { funcionario?: FuncionarioAgente; time?: Time; membros?: FuncionarioAgente[] },
): string {
  const partes: string[] = [];
  if (responsavel.time) {
    const quem = (responsavel.membros ?? [])
      .map((m) => `- ${m.nome} (${CARGO_ROTULO[m.cargoVisual] ?? m.cargoVisual}): ${m.skills.join(', ') || 'generalista'}`)
      .join('\n');
    partes.push(
      `Você coordena o time "${responsavel.time.nome}" numa rotina recorrente de uma agência digital real. Delegue o trabalho entre os membros quando fizer sentido (cada um é um agente próprio):\n${quem}`,
    );
  } else if (responsavel.funcionario) {
    const f = responsavel.funcionario;
    partes.push(
      `Você é ${f.nome}, ${CARGO_ROTULO[f.cargoVisual] ?? f.cargoVisual} de uma agência digital real, executando uma rotina recorrente.`,
    );
    if (f.persona.trim()) partes.push(`## Sua persona\n${f.persona.trim()}`);
  }
  partes.push(`## A rotina: ${rotina.emoji} ${rotina.nome}\n${rotina.briefing.trim()}`);
  const acoes = rotina.acoes.length
    ? rotina.acoes.map((a) => `- \`${a}\`: ${ACOES_ROTINA[a].descricao}`).join('\n')
    : '- (nenhuma ação estruturada liberada — apenas analise e publique o resultado)';
  partes.push(`## Rotina de execução (obrigatória, nesta ordem)
1. Chame \`${FERRAMENTA_CONTEXTO_ROTINA}\` para receber os dados REAIS da agência.
2. Execute o briefing usando SÓ os dados do contexto — nunca invente.
3. Se apropriado, use as ações estruturadas liberadas:
${acoes}
4. Publique o resultado chamando \`${FERRAMENTA_PUBLICAR_ROTINA}\` com um resumo escaneável em pt-BR (máx. ~2000 caracteres): o que analisou, o que fez (inclua as ações executadas) e o que precisa de DECISÃO do dono.
5. Encerre. Nada de dinheiro, envio a clientes ou início de projeto — isso é sempre do dono.`);
  return partes.join('\n\n');
}

function ferramentasRotina(rotina: Rotina): unknown[] {
  const tools: unknown[] = [
    {
      type: 'custom',
      name: FERRAMENTA_CONTEXTO_ROTINA,
      description: 'Devolve os dados reais da agência (blocos configurados na rotina) para a execução de hoje.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      type: 'custom',
      name: FERRAMENTA_PUBLICAR_ROTINA,
      description: 'Publica o resultado da rotina no painel da agência (e no celular do dono). Chame UMA vez, com o texto final.',
      input_schema: {
        type: 'object',
        properties: { texto: { type: 'string', description: 'O resultado completo, em pt-BR' } },
        required: ['texto'],
      },
    },
  ];
  for (const acao of rotina.acoes) {
    tools.push({
      type: 'custom',
      name: acao,
      description: ACOES_ROTINA[acao].descricao,
      input_schema: ACOES_ROTINA[acao].schema,
    });
  }
  return tools;
}

// ---------- gerenciador ----------

interface Dependencias {
  store: Store;
  tempoReal: TempoReal;
  cliente: () => Anthropic;
  aoMudarEstado: () => Promise<void>;
  /** Injetado para a ação disparar_fluxo (opcional: sem ele a ação é negada). */
  fluxos?: { disparar: (fluxoId: string, titulo: string, entrada: string, origem: { tipo: 'rotina'; refId?: string }) => Promise<unknown> };
}

export class GerenciadorRotinas {
  private processando = new Set<string>(); // rotinaIds com sessão em processamento

  constructor(private deps: Dependencias) {}

  /** Boot: religa/pausa os crons de todas as rotinas conforme `ativa`. */
  async garantirTodas(): Promise<void> {
    const rotinas = await this.deps.store.listarRotinas();
    for (const rotina of rotinas) {
      if (!rotina.ativa && !rotina.deploymentId) continue;
      await this.garantirRecursos(rotina.id).catch((erro) =>
        console.warn(`[rotina ${rotina.nome}] falha ao garantir recursos: ${msg(erro)}`),
      );
    }
  }

  /** Dispara a rotina AGORA (botão do painel). Funciona mesmo com o cron pausado. */
  async rodarAgora(rotinaId: string): Promise<ExecucaoRotina | null> {
    const rotina = await this.garantirRecursos(rotinaId);
    if (!rotina.deploymentId) throw new ErroPonte('Não consegui preparar o deployment da rotina.', 502);
    const cliente = this.deps.cliente();
    const run = (await cliente.beta.deployments.run(rotina.deploymentId)) as {
      id?: string;
      session_id?: string | null;
    };
    if (!run.session_id) {
      throw new ErroPonte('O disparo manual não criou sessão — veja os runs do deployment no Console da Anthropic.', 502);
    }
    return this.processarSessao(rotina.id, run.session_id, run.id ?? `manual:${run.session_id}`);
  }

  /** Poll dos runs de todos os crons (mesmo padrão do standup). */
  async verificarRuns(): Promise<void> {
    const rotinas = await this.deps.store.listarRotinas();
    const { runsProcessados } = await this.deps.store.lerEstadoRotinas();
    const feitos = new Set(runsProcessados);
    const cliente = this.deps.cliente();
    for (const rotina of rotinas) {
      if (!rotina.ativa || !rotina.deploymentId || this.processando.has(rotina.id)) continue;
      const novos: { id: string; sessionId: string }[] = [];
      let vistos = 0;
      try {
        for await (const bruto of cliente.beta.deploymentRuns.list({
          deployment_id: rotina.deploymentId,
        } as Parameters<typeof cliente.beta.deploymentRuns.list>[0])) {
          vistos += 1;
          const run = bruto as unknown as { id: string; session_id?: string | null };
          if (!feitos.has(run.id)) {
            if (run.session_id) novos.push({ id: run.id, sessionId: run.session_id });
            else await this.deps.store.salvarEstadoRotinas((e) => e.runsProcessados.push(run.id));
          }
          if (vistos >= 10) break; // só os recentes interessam
        }
      } catch (erro) {
        console.warn(`[rotina ${rotina.nome}] falha listando runs: ${msg(erro)}`);
        continue;
      }
      for (const run of novos.reverse()) {
        await this.processarSessao(rotina.id, run.sessionId, run.id).catch((erro) =>
          console.warn(`[rotina ${rotina.nome}] falha processando a sessão ${run.sessionId}: ${msg(erro)}`),
        );
      }
    }
  }

  /** Ao arquivar/desativar uma rotina, pausa/arquiva o deployment dela. */
  async desligar(rotina: Rotina, arquivar = false): Promise<void> {
    if (!rotina.deploymentId) return;
    const cliente = this.deps.cliente();
    if (arquivar) await cliente.beta.deployments.archive(rotina.deploymentId).catch(() => undefined);
    else await cliente.beta.deployments.pause(rotina.deploymentId).catch(() => undefined);
  }

  // ---- internos ----

  /** Agent + deployment prontos para a rotina; recria o cron se a agenda mudou;
   *  atualiza o Agent se briefing/ações/roster mudaram (update incondicional é barato:
   *  detectamos só o roster; o resto muda junto com o PUT da rotina). */
  private async garantirRecursos(rotinaId: string): Promise<Rotina> {
    const { store } = this.deps;
    const cliente = this.deps.cliente();
    const rotinas = await store.listarRotinas();
    const rotina = rotinas.find((r) => r.id === rotinaId);
    if (!rotina) throw new ErroPonte('Rotina não encontrada.', 404);

    const responsavel = await this.responsavelDe(rotina);
    const roster = (responsavel.membros ?? [])
      .filter((m) => m.agentId)
      .slice(0, 20)
      .map((m) => m.agentId!);
    const parametros = {
      name: `Rotina — ${rotina.nome}`,
      model: responsavel.funcionario?.modelo ?? MODELO_PADRAO,
      system: montarSystemRotina(rotina, responsavel),
      tools: ferramentasRotina(rotina),
      ...(responsavel.time && roster.length ? { multiagent: { type: 'coordinator', agents: roster } } : {}),
    };
    if (!rotina.agentId) {
      const agente = await cliente.beta.agents.create(
        parametros as Parameters<typeof cliente.beta.agents.create>[0],
      );
      rotina.agentId = agente.id;
      rotina.rosterAplicado = roster;
      await store.salvarRotinas(rotinas);
    } else if (rosterMudou(roster, rotina.rosterAplicado)) {
      await cliente.beta.agents.update(
        rotina.agentId,
        parametros as Parameters<typeof cliente.beta.agents.update>[1],
      );
      rotina.rosterAplicado = roster;
      await store.salvarRotinas(rotinas);
    }

    if (rotina.deploymentId && rotina.agendaAplicada !== chaveAgenda(rotina)) {
      await cliente.beta.deployments.archive(rotina.deploymentId).catch(() => undefined);
      rotina.deploymentId = null;
    }
    if (!rotina.deploymentId) {
      const environmentId = await garantirEnvironment(cliente, store);
      const deployment = await cliente.beta.deployments.create({
        name: `Rotina — ${rotina.nome} (${rotina.hora}${rotina.dias === 'uteis' ? ' seg-sex' : ''})`,
        agent: rotina.agentId,
        environment_id: environmentId,
        initial_events: [
          {
            type: 'user.message',
            content: [
              {
                type: 'text',
                text: `Execute a rotina de hoje: chame ${FERRAMENTA_CONTEXTO_ROTINA}, faça o trabalho do briefing e publique com ${FERRAMENTA_PUBLICAR_ROTINA}.`,
              },
            ],
          },
        ],
        schedule: { type: 'cron', expression: cronDaAgenda(rotina.hora, rotina.dias), timezone: fusoLocal() },
      } as Parameters<typeof cliente.beta.deployments.create>[0]);
      rotina.deploymentId = deployment.id;
      rotina.agendaAplicada = chaveAgenda(rotina);
      await store.salvarRotinas(rotinas);
    }
    if (rotina.ativa) await cliente.beta.deployments.unpause(rotina.deploymentId).catch(() => undefined);
    else await cliente.beta.deployments.pause(rotina.deploymentId).catch(() => undefined);
    return rotina;
  }

  private async responsavelDe(
    rotina: Rotina,
  ): Promise<{ funcionario?: FuncionarioAgente; time?: Time; membros?: FuncionarioAgente[] }> {
    const { store } = this.deps;
    const funcionarios = await store.listarFuncionarios();
    if (rotina.responsavelTipo === 'time') {
      const time = (await store.listarTimes()).find((t) => t.id === rotina.responsavelId && t.status === 'ativo');
      if (!time) throw new ErroPonte('O time responsável pela rotina não existe mais.', 400);
      const membros = funcionarios.filter((f) => time.membros.includes(f.id) && f.status === 'ativo');
      if (!membros.length) throw new ErroPonte(`O time "${time.nome}" não tem membros ativos.`, 400);
      return { time, membros };
    }
    const funcionario = funcionarios.find((f) => f.id === rotina.responsavelId && f.status === 'ativo');
    if (!funcionario) throw new ErroPonte('O funcionário responsável pela rotina não existe mais.', 400);
    return { funcionario };
  }

  /** Consome a sessão da rotina: contexto/ações/publicação via custom tools + custo no livro. */
  private async processarSessao(
    rotinaId: string,
    sessionId: string,
    runId: string,
  ): Promise<ExecucaoRotina | null> {
    if (this.processando.has(rotinaId)) return null;
    this.processando.add(rotinaId);
    try {
      const { store } = this.deps;
      const cliente = this.deps.cliente();
      const rotina = (await store.listarRotinas()).find((r) => r.id === rotinaId);
      if (!rotina) return null;
      // stream ANTES de ler o histórico (SSE não tem replay) — mesmo padrão dos projetos
      const stream = await cliente.beta.sessions.events.stream(sessionId);
      const vistos = await store.lerEventosVistos(sessionId);
      const respondidos = new Set<string>();
      const acoesFeitas: string[] = [];
      let publicado: ExecucaoRotina | null = null;
      let ultimaMensagem = '';
      const teto = Date.now() + 15 * 60_000;

      const efeitos = async (ev: EventoSessao): Promise<void> => {
        const novo = !ev.id || !vistos.has(ev.id);
        if (ev.id) vistos.add(ev.id);
        if (!novo) return;
        if (ev.type === 'user.custom_tool_result' && typeof ev.custom_tool_use_id === 'string') {
          respondidos.add(ev.custom_tool_use_id);
          return;
        }
        if (ev.type === 'agent.message') {
          const texto = textoDoEvento(ev);
          if (texto) ultimaMensagem = texto;
          return;
        }
        if (ev.type === 'span.model_request_end') {
          await this.registrarCusto(rotina, (ev.model_usage ?? {}) as UsoModelo);
          return;
        }
        if (ev.type === 'agent.custom_tool_use') {
          const id = typeof ev.id === 'string' ? ev.id : null;
          const nome = typeof ev.name === 'string' ? ev.name : '';
          if (!id || respondidos.has(id)) return;
          respondidos.add(id);
          let resposta = 'ok';
          if (nome === FERRAMENTA_CONTEXTO_ROTINA) {
            resposta = JSON.stringify(await this.contexto(rotina));
          } else if (nome === FERRAMENTA_PUBLICAR_ROTINA) {
            const texto = (ev.input as { texto?: string } | undefined)?.texto ?? '';
            if (texto.trim()) {
              publicado = await this.publicar(rotina, texto.trim(), acoesFeitas, sessionId);
              resposta = 'publicado — obrigado! Pode encerrar.';
            } else {
              resposta = 'entrada inválida: envie o resultado no campo texto';
            }
          } else if ((rotina.acoes as string[]).includes(nome)) {
            resposta = await this.executarAcao(rotina, nome as AcaoRotina, ev.input ?? {});
            acoesFeitas.push(resposta);
          } else {
            resposta = `ferramenta desconhecida ou não liberada nesta rotina: ${nome}`;
          }
          // eco do session_thread_id: tools de subagentes (rotina de time) voltam à thread certa
          const threadId = typeof ev.session_thread_id === 'string' ? ev.session_thread_id : undefined;
          await cliente.beta.sessions.events.send(sessionId, {
            events: [
              {
                type: 'user.custom_tool_result',
                custom_tool_use_id: id,
                content: [{ type: 'text', text: resposta }],
                ...(threadId ? { session_thread_id: threadId } : {}),
              },
            ],
          } as Parameters<Anthropic['beta']['sessions']['events']['send']>[1]);
        }
      };

      let ultimoStatus: EventoSessao | null = null;
      for await (const bruto of cliente.beta.sessions.events.list(sessionId)) {
        const ev = bruto as unknown as EventoSessao;
        await efeitos(ev);
        if (ev.type.startsWith('session.status_')) ultimoStatus = ev;
      }
      const jaTerminou = ultimoStatus ? decidirAposEvento(ultimoStatus).tipo !== 'continuar' : false;
      if (!jaTerminou) {
        for await (const bruto of stream) {
          const ev = bruto as unknown as EventoSessao;
          await efeitos(ev);
          if (decidirAposEvento(ev).tipo !== 'continuar') break;
          if (Date.now() > teto) {
            console.warn(`[rotina ${rotina.nome}] teto de 15 min atingido — abandonando a sessão.`);
            break;
          }
        }
      }
      await store.salvarEventosVistos(sessionId, vistos);
      // esqueceu de publicar mas escreveu o resultado na mensagem final ⇒ aproveita
      if (!publicado && ultimaMensagem) publicado = await this.publicar(rotina, ultimaMensagem, acoesFeitas, sessionId);
      await cliente.beta.sessions.archive(sessionId).catch(() => undefined);
      return publicado;
    } finally {
      await this.deps.store.salvarEstadoRotinas((e) => {
        if (!e.runsProcessados.includes(runId)) e.runsProcessados.push(runId);
      });
      this.processando.delete(rotinaId);
    }
  }

  private async publicar(
    rotina: Rotina,
    texto: string,
    acoesFeitas: string[],
    sessionId: string,
  ): Promise<ExecucaoRotina> {
    const execucao: ExecucaoRotina = {
      id: randomUUID(),
      rotinaId: rotina.id,
      data: hojeISO(),
      texto: texto.slice(0, 6000),
      acoesFeitas: [...acoesFeitas],
      criadoEm: agoraISO(),
      sessionId,
    };
    await this.deps.store.salvarEstadoRotinas((e) => e.execucoes.push(execucao));
    const rotinas = await this.deps.store.listarRotinas();
    const alvo = rotinas.find((r) => r.id === rotina.id);
    if (alvo) {
      alvo.ultimaExecucao = execucao.criadoEm;
      await this.deps.store.salvarRotinas(rotinas);
    }
    this.deps.tempoReal.enviar('alerta', {
      tipo: 'rotina',
      mensagem: `${rotina.emoji} Rotina "${rotina.nome}" publicou o resultado — veja o feed.`,
    });
    notificarCelular(`${rotina.emoji} Rotina — ${rotina.nome}\n\n${execucao.texto.slice(0, 3000)}`);
    await this.deps.aoMudarEstado();
    return execucao;
  }

  /** Blocos de contexto configurados na rotina (dados reais, nada inventado). */
  private async contexto(rotina: Rotina): Promise<Record<string, unknown>> {
    const { store } = this.deps;
    const hoje = hojeISO();
    const resultado: Record<string, unknown> = { data: hoje, rotina: rotina.nome };
    if (rotina.contexto.includes('crm')) {
      const [clientes, oportunidades, projetos] = await Promise.all([
        store.listarClientes(),
        store.listarOportunidades(),
        store.listarProjetos(),
      ]);
      resultado.crm = {
        clientes: clientes.map((c) => ({
          nome: c.nome,
          contato: c.contato ?? null,
          origem: c.origem ?? null,
          observacoes: c.observacoes ?? null,
          projetosEntregues: projetos.filter(
            (p) => p.status === 'entregue' && p.cliente.trim().toLowerCase() === c.nome.trim().toLowerCase(),
          ).length,
        })),
        oportunidades: oportunidades.map((o) => ({
          titulo: o.titulo,
          cliente: clientes.find((c) => c.id === o.clienteId)?.nome ?? '?',
          etapa: o.etapa,
          valorEstimadoBRL: o.valorEstimadoBRL,
          observacoes: o.observacoes ?? null,
          atualizadoEm: o.atualizadoEm,
        })),
      };
    }
    if (rotina.contexto.includes('projetos')) {
      const projetos = await store.listarProjetos();
      resultado.projetos = projetos
        .filter((p) => ['em_andamento', 'pausado', 'aguardando_revisao', 'rascunho'].includes(p.status))
        .map((p) => ({
          nome: `${p.emoji} ${p.nome}`,
          cliente: p.cliente,
          status: p.status,
          etapas: `${p.etapasConcluidas}/${p.etapasTotais || '?'}`,
          fazendoAgora: p.resumoAtual || null,
          valorContratoBRL: p.valorContratoBRL,
        }));
    }
    if (rotina.contexto.includes('financeiro')) {
      const [lancamentos, contas] = await Promise.all([store.listarLancamentos(), store.listarContasReceber()]);
      const fin = resumoFinanceiro(lancamentos, contas, hoje);
      resultado.financeiro = {
        caixaBRL: fin.caixaBRL,
        totalAReceberBRL: fin.totalAReceberBRL,
        atrasadasBRL: fin.atrasadasBRL,
        vencendo7DiasBRL: fin.vencendo7DiasBRL,
        vendasMesBRL: fin.vendasMesBRL,
        custoApiMesBRL: fin.custoApiMesBRL,
        lucroMesBRL: fin.lucroMesBRL,
      };
    }
    return resultado;
  }

  /** Executa uma ação estruturada com guard-rails; devolve a descrição pt-BR do que fez. */
  private async executarAcao(rotina: Rotina, acao: AcaoRotina, entrada: unknown): Promise<string> {
    const { store } = this.deps;
    const dados = (entrada ?? {}) as Record<string, unknown>;
    const texto = (chave: string): string => String(dados[chave] ?? '').trim();

    if (acao === 'disparar_fluxo') {
      if (!this.deps.fluxos) return 'erro: disparo de fluxo indisponível nesta ponte';
      const busca = texto('fluxoNome').toLowerCase();
      const titulo = texto('titulo');
      const entradaFluxo = texto('entrada');
      if (!busca || !titulo || !entradaFluxo) return 'erro: fluxoNome, titulo e entrada são obrigatórios';
      const fluxos = await store.listarFluxos();
      const alvo =
        fluxos.find((f) => f.nome.toLowerCase() === busca) ??
        fluxos.find((f) => f.nome.toLowerCase().includes(busca));
      if (!alvo) {
        return `erro: nenhum fluxo com o nome "${texto('fluxoNome')}" — existem: ${fluxos.map((f) => f.nome).join(', ') || '(nenhum)'}`;
      }
      await this.deps.fluxos.disparar(alvo.id, titulo, entradaFluxo, { tipo: 'rotina', refId: rotina.id });
      return `fluxo "${alvo.nome}" disparado com a execução "${titulo}"`;
    }

    if (acao === 'criar_oportunidade' || acao === 'registrar_nota_cliente') {
      const nomeCliente = texto('clienteNome');
      if (!nomeCliente) return 'erro: clienteNome é obrigatório';
      const clientes = await store.listarClientes();
      let cliente = clientes.find((c) => c.nome.trim().toLowerCase() === nomeCliente.toLowerCase());
      if (!cliente) {
        cliente = {
          id: randomUUID(),
          nome: nomeCliente,
          origem: `rotina: ${rotina.nome}`,
          criadoEm: agoraISO(),
        } satisfies ClienteCRM;
        clientes.push(cliente);
        await store.salvarClientes(clientes);
      }
      if (acao === 'registrar_nota_cliente') {
        const nota = texto('nota');
        if (!nota) return 'erro: nota é obrigatória';
        const carimbo = `[${hojeISO()} · ${rotina.nome}] ${nota}`;
        cliente.observacoes = cliente.observacoes ? `${cliente.observacoes}\n${carimbo}` : carimbo;
        await store.salvarClientes(clientes);
        await this.deps.aoMudarEstado();
        return `nota registrada no cliente "${cliente.nome}"`;
      }
      const titulo = texto('titulo');
      if (!titulo) return 'erro: titulo é obrigatório';
      const oportunidades = await store.listarOportunidades();
      const oportunidade: OportunidadeCRM = {
        id: randomUUID(),
        clienteId: cliente.id,
        titulo,
        valorEstimadoBRL: Math.max(0, Number(dados.valorEstimadoBRL) || 0),
        etapa: 'lead',
        observacoes: texto('observacoes') || undefined,
        criadoEm: agoraISO(),
        atualizadoEm: agoraISO(),
      };
      oportunidades.push(oportunidade);
      await store.salvarOportunidades(oportunidades);
      await this.deps.aoMudarEstado();
      return `oportunidade "${titulo}" criada no funil (lead) para o cliente "${cliente.nome}"`;
    }

    // criar_rascunho_projeto — o dono revisa e inicia (nada começa sozinho)
    const nome = texto('nome');
    const cliente = texto('cliente');
    if (!nome || !cliente) return 'erro: nome e cliente são obrigatórios';
    const projeto: ProjetoReal = {
      id: randomUUID(),
      nome,
      cliente,
      emoji: '📦',
      tipo: 'entrega',
      spec: {
        objetivo: texto('objetivo'),
        escopo: texto('escopo'),
        entregaveis: texto('entregaveis'),
        criteriosAceite: texto('criteriosAceite'),
        observacoes: texto('observacoes') || undefined,
      },
      valorContratoBRL: Math.max(0, Number(dados.valorContratoBRL) || 0),
      pagamento: { forma: 'avista' },
      prazoDias: Math.max(1, Math.round(Number(dados.prazoDias) || 7)),
      criadoEm: agoraISO(),
      funcionarioId:
        rotina.responsavelTipo === 'time' ? `${PREFIXO_TIME}${rotina.responsavelId}` : rotina.responsavelId,
      sessionId: null,
      qaAtivo: true,
      etapasTotais: 0,
      etapasConcluidas: 0,
      resumoAtual: '',
      status: 'rascunho',
      custoUSD: 0,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
    const projetos = await store.listarProjetos();
    projetos.push(projeto);
    await store.salvarProjetos(projetos);
    await this.deps.aoMudarEstado();
    return `rascunho de projeto "${nome}" criado (aguardando revisão e início pelo dono)`;
  }

  /** Custo entra no livro (id rotina:<id>:<dia>) e conta no limite diário global. */
  private async registrarCusto(rotina: Rotina, uso: UsoModelo): Promise<void> {
    const usd = custoUsd(MODELO_PADRAO, uso);
    if (usd <= 0) return;
    const { store } = this.deps;
    const hoje = hojeISO();
    const cfg = await store.lerConfig();
    const chave = `rotina:${rotina.id}:${hoje}`;
    const dias = await store.lerCustosApiDia();
    dias[chave] = (dias[chave] ?? 0) + usd;
    await store.salvarCustosApiDia(dias);
    await store.anexarLancamento(
      lancamentoCustoApiDiario({
        projetoId: `rotina:${rotina.id}`,
        dia: hoje,
        usdAcumuladoDia: dias[chave]!,
        cambioUsdBrl: cfg.cambioUsdBrl,
        modelo: MODELO_PADRAO,
        nomeProjeto: `Rotina — ${rotina.nome}`,
      }),
    );
  }
}

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
