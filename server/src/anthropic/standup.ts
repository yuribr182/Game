// Standup diário (F4b): um Agent "Gerente de Operações" roda num deployment com
// cron matinal (deployments.create). Cada disparo cria uma sessão nova na nuvem;
// a ponte detecta o run (polling em deployment_runs), responde as custom tools
// com o contexto real do dia e publica o relatório no painel + celular (Telegram).

import type Anthropic from '@anthropic-ai/sdk';
import { agoraISO, hojeISO, MODELO_PADRAO } from '../config.js';
import { resumoFinanceiro } from '../financeiro/motor.js';
import { notificarCelular } from '../notificar/telegram.js';
import type { Store } from '../store/db.js';
import type {
  ConfigPonte,
  EventoSessao,
  FuncionarioAgente,
  ProjetoReal,
  RelatorioStandup,
} from '../store/tipos.js';
import type { TempoReal } from '../tempoReal.js';
import { garantirEnvironment } from './agentes.js';
import { ErroPonte } from './cliente.js';
import { custoUsd, lancamentoCustoApiDiario, type UsoModelo } from './custos.js';
import { decidirAposEvento, textoDoEvento } from './sessoes.js';

export const FERRAMENTA_CONTEXTO = 'obter_contexto_standup';
export const FERRAMENTA_PUBLICAR = 'publicar_standup';

const SYSTEM_GERENTE = `Você é o Gerente de Operações de uma agência digital real. Todo dia de manhã você faz o standup: um relatório curto que o dono lê no celular.

## Rotina (obrigatória, nesta ordem)
1. Chame a ferramenta \`${FERRAMENTA_CONTEXTO}\` para receber os dados REAIS de ontem/hoje (projetos, progresso, custos, financeiro).
2. Escreva o relatório em português do Brasil, direto e escaneável:
   - 📌 manchete do dia em 1 linha;
   - por projeto ativo: onde parou ontem, o que esperar hoje, riscos (prazo/custo/QA);
   - 💰 financeiro: caixa, a receber (destaque atrasadas!), custo de API;
   - ✅ o que precisa de DECISÃO do dono hoje (se nada, diga que está tudo andando).
3. Publique chamando \`${FERRAMENTA_PUBLICAR}\` com o texto completo em \`texto\` e encerre.

Não invente dados: use SÓ o que veio do contexto. Sem projetos ativos, faça um relatório mínimo. Máximo ~2000 caracteres.`;

function ferramentasGerente(): unknown[] {
  return [
    {
      type: 'custom',
      name: FERRAMENTA_CONTEXTO,
      description: 'Devolve os dados reais da agência (projetos, progresso, custos, financeiro) para o standup de hoje.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      type: 'custom',
      name: FERRAMENTA_PUBLICAR,
      description: 'Publica o relatório matinal no painel da agência (e no celular do dono). Chame UMA vez, com o texto final.',
      input_schema: {
        type: 'object',
        properties: { texto: { type: 'string', description: 'O relatório completo, em pt-BR' } },
        required: ['texto'],
      },
    },
  ];
}

// ---------- helpers puros (testáveis) ----------

/** 'HH:MM' → expressão cron 'M H * * *'. Hora inválida cai no padrão 09:00. */
export function cronDaHora(hora: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  const h = m ? Math.min(23, Number(m[1])) : 9;
  const min = m ? Math.min(59, Number(m[2])) : 0;
  return `${min} ${h} * * *`;
}

/** Fuso IANA da máquina (a agência vive no fuso do dono). */
export function fusoLocal(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
}

/** Monta o JSON que a ferramenta obter_contexto_standup devolve ao gerente. */
export function montarContextoStandup(dados: {
  hoje: string;
  projetosAbertos: ProjetoReal[];
  rascunhos: number;
  entreguesTotal: number;
  funcionarios: FuncionarioAgente[];
  financeiro: {
    caixaBRL: number;
    totalAReceberBRL: number;
    atrasadasBRL: number;
    vencendo7DiasBRL: number;
    custoApiMesBRL: number;
  };
  atividadeRecente: Record<string, string[]>;
  agoraMs: number;
}): Record<string, unknown> {
  return {
    data: dados.hoje,
    projetosAtivos: dados.projetosAbertos.map((p) => ({
      nome: `${p.emoji} ${p.nome}`,
      cliente: p.cliente,
      status: p.status,
      responsavel:
        p.funcionarioId === 'equipe'
          ? 'Equipe toda (Gerente de IA)'
          : (dados.funcionarios.find((f) => f.id === p.funcionarioId)?.nome ?? '?'),
      etapas: `${p.etapasConcluidas}/${p.etapasTotais || '?'}`,
      fazendoAgora: p.resumoAtual || '(sem resumo ainda)',
      diasRestantes: p.iniciadoEm
        ? p.prazoDias - Math.floor((dados.agoraMs - Date.parse(p.iniciadoEm)) / 86400000)
        : p.prazoDias,
      custoApiUSD: Math.round(p.custoUSD * 100) / 100,
      qa: p.qaResultado ?? null,
      pullRequest: p.prUrl ?? null,
      ultimasAtividades: dados.atividadeRecente[p.id] ?? [],
    })),
    rascunhosAguardandoInicio: dados.rascunhos,
    projetosEntreguesTotal: dados.entreguesTotal,
    equipe: dados.funcionarios
      .filter((f) => f.status === 'ativo')
      .map((f) => ({
        nome: f.nome,
        cargo: f.cargoVisual,
        custoApiHojeUSD: Math.round(f.custoHojeUSD * 100) / 100,
      })),
    financeiro: dados.financeiro,
  };
}

// ---------- gerenciador ----------

interface Dependencias {
  store: Store;
  tempoReal: TempoReal;
  cliente: () => Anthropic;
  aoMudarEstado: () => Promise<void>;
}

export class GerenciadorStandup {
  private processando = false;

  constructor(private deps: Dependencias) {}

  /** Chamado no boot: liga/pausa o cron conforme a config. Não cria nada se nunca foi usado e está desativado. */
  async garantir(): Promise<void> {
    const cfg = await this.deps.store.lerConfig();
    if (!cfg.standupAtivo && !cfg.standupDeploymentId) return;
    await this.garantirRecursos(cfg);
  }

  /** Dispara um standup AGORA (botão do painel). Funciona mesmo com o cron pausado. */
  async rodarAgora(): Promise<RelatorioStandup | null> {
    const cfg = await this.garantirRecursos(await this.deps.store.lerConfig());
    if (!cfg.standupDeploymentId) throw new ErroPonte('Não consegui preparar o deployment do standup.', 502);
    const cliente = this.deps.cliente();
    const run = (await cliente.beta.deployments.run(cfg.standupDeploymentId)) as {
      id?: string;
      session_id?: string | null;
    };
    if (!run.session_id) {
      throw new ErroPonte('O disparo manual não criou sessão — veja os runs do deployment no Console da Anthropic.', 502);
    }
    return this.processarSessao(run.session_id, run.id ?? `manual:${run.session_id}`);
  }

  /** Poll dos runs do cron (o disparo acontece na nuvem, sem a ponte saber a hora exata). */
  async verificarRuns(): Promise<void> {
    if (this.processando) return;
    const cfg = await this.deps.store.lerConfig();
    if (!cfg.standupAtivo || !cfg.standupDeploymentId) return;
    const { runsProcessados } = await this.deps.store.lerStandup();
    const feitos = new Set(runsProcessados);
    const cliente = this.deps.cliente();
    const novos: { id: string; sessionId: string }[] = [];
    let vistos = 0;
    for await (const bruto of cliente.beta.deploymentRuns.list({
      deployment_id: cfg.standupDeploymentId,
    } as Parameters<typeof cliente.beta.deploymentRuns.list>[0])) {
      vistos += 1;
      const run = bruto as unknown as {
        id: string;
        session_id?: string | null;
        error?: { type?: string; message?: string } | null;
      };
      if (!feitos.has(run.id)) {
        if (run.session_id) {
          novos.push({ id: run.id, sessionId: run.session_id });
        } else {
          await this.deps.store.salvarStandup((e) => e.runsProcessados.push(run.id));
          console.warn(`[standup] run ${run.id} falhou: ${run.error?.type ?? 'erro desconhecido'}`);
        }
      }
      if (vistos >= 20) break; // só os recentes interessam
    }
    for (const run of novos.reverse()) {
      await this.processarSessao(run.sessionId, run.id).catch((erro) =>
        console.warn(`[standup] falha processando a sessão ${run.sessionId}: ${msg(erro)}`),
      );
    }
  }

  // ---- internos ----

  /** Agent + deployment prontos; cron religado/pausado conforme standupAtivo; recria se a hora mudou. */
  private async garantirRecursos(cfg: ConfigPonte): Promise<ConfigPonte> {
    const { store } = this.deps;
    const cliente = this.deps.cliente();
    if (!cfg.standupAgentId) {
      const agente = await cliente.beta.agents.create({
        name: 'Gerente de Operações — standup matinal',
        model: MODELO_PADRAO,
        system: SYSTEM_GERENTE,
        tools: ferramentasGerente(),
      } as Parameters<typeof cliente.beta.agents.create>[0]);
      cfg.standupAgentId = agente.id;
      await store.salvarConfig(cfg);
    }
    if (cfg.standupDeploymentId && cfg.standupHoraAplicada !== cfg.standupHora) {
      // hora mudou ⇒ recria (archive é terminal; deployments não têm update de schedule)
      await cliente.beta.deployments.archive(cfg.standupDeploymentId).catch(() => undefined);
      cfg.standupDeploymentId = null;
    }
    if (!cfg.standupDeploymentId) {
      const environmentId = await garantirEnvironment(cliente, store);
      const deployment = await cliente.beta.deployments.create({
        name: `Standup matinal — Empresa Real (${cfg.standupHora})`,
        agent: cfg.standupAgentId,
        environment_id: environmentId,
        initial_events: [
          {
            type: 'user.message',
            content: [
              {
                type: 'text',
                text: `Bom dia! Faça o standup de hoje: chame ${FERRAMENTA_CONTEXTO}, escreva o relatório e publique com ${FERRAMENTA_PUBLICAR}.`,
              },
            ],
          },
        ],
        schedule: { type: 'cron', expression: cronDaHora(cfg.standupHora), timezone: fusoLocal() },
      } as Parameters<typeof cliente.beta.deployments.create>[0]);
      cfg.standupDeploymentId = deployment.id;
      cfg.standupHoraAplicada = cfg.standupHora;
      await store.salvarConfig(cfg);
    }
    if (cfg.standupAtivo) await cliente.beta.deployments.unpause(cfg.standupDeploymentId).catch(() => undefined);
    else await cliente.beta.deployments.pause(cfg.standupDeploymentId).catch(() => undefined);
    return cfg;
  }

  /** Consome a sessão do standup: contexto/publicação via custom tools + custo no livro. */
  private async processarSessao(sessionId: string, runId: string): Promise<RelatorioStandup | null> {
    if (this.processando) return null;
    this.processando = true;
    try {
      const { store } = this.deps;
      const cliente = this.deps.cliente();
      // stream ANTES de ler o histórico (SSE não tem replay) — mesmo padrão dos projetos
      const stream = await cliente.beta.sessions.events.stream(sessionId);
      const vistos = await store.lerEventosVistos(sessionId);
      const respondidos = new Set<string>();
      let publicado: RelatorioStandup | null = null;
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
          await this.registrarCusto((ev.model_usage ?? {}) as UsoModelo);
          return;
        }
        if (ev.type === 'agent.custom_tool_use') {
          const id = typeof ev.id === 'string' ? ev.id : null;
          const nome = typeof ev.name === 'string' ? ev.name : '';
          if (!id || respondidos.has(id)) return;
          respondidos.add(id);
          let resposta = 'ok';
          if (nome === FERRAMENTA_CONTEXTO) {
            resposta = JSON.stringify(await this.contexto());
          } else if (nome === FERRAMENTA_PUBLICAR) {
            const texto = (ev.input as { texto?: string } | undefined)?.texto ?? '';
            if (texto.trim()) {
              publicado = await this.publicar(texto.trim(), sessionId);
              resposta = 'publicado — obrigado! Pode encerrar.';
            } else {
              resposta = 'entrada inválida: envie o relatório no campo texto';
            }
          } else {
            resposta = `ferramenta desconhecida: ${nome}`;
          }
          await cliente.beta.sessions.events.send(sessionId, {
            events: [
              { type: 'user.custom_tool_result', custom_tool_use_id: id, content: [{ type: 'text', text: resposta }] },
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
            console.warn('[standup] teto de 15 min atingido — abandonando a sessão.');
            break;
          }
        }
      }
      await store.salvarEventosVistos(sessionId, vistos);
      // gerente esqueceu de publicar mas escreveu o relatório na mensagem final ⇒ aproveita
      if (!publicado && ultimaMensagem) publicado = await this.publicar(ultimaMensagem, sessionId);
      await cliente.beta.sessions.archive(sessionId).catch(() => undefined);
      return publicado;
    } finally {
      await this.deps.store.salvarStandup((e) => {
        if (!e.runsProcessados.includes(runId)) e.runsProcessados.push(runId);
      });
      this.processando = false;
    }
  }

  private async publicar(texto: string, sessionId: string): Promise<RelatorioStandup> {
    const relatorio: RelatorioStandup = {
      data: hojeISO(),
      texto: texto.slice(0, 6000),
      criadoEm: agoraISO(),
      sessionId,
    };
    await this.deps.store.salvarStandup((e) => {
      // 1 relatório por dia — reexecuções (testes manuais) substituem o do dia
      e.relatorios = e.relatorios.filter((r) => r.data !== relatorio.data);
      e.relatorios.push(relatorio);
    });
    this.deps.tempoReal.enviar('alerta', {
      tipo: 'standup',
      mensagem: '📋 Relatório matinal publicado — veja no painel de Projetos.',
    });
    notificarCelular(`📋 Standup — ${relatorio.data}\n\n${relatorio.texto.slice(0, 3500)}`);
    await this.deps.aoMudarEstado();
    return relatorio;
  }

  private async contexto(): Promise<Record<string, unknown>> {
    const { store } = this.deps;
    const hoje = hojeISO();
    const [projetos, funcionarios, lancamentos, contas] = await Promise.all([
      store.listarProjetos(),
      store.listarFuncionarios(),
      store.listarLancamentos(),
      store.listarContasReceber(),
    ]);
    const abertos = projetos.filter((p) => ['em_andamento', 'pausado', 'aguardando_revisao'].includes(p.status));
    const atividadeRecente: Record<string, string[]> = {};
    const desde = Date.now() - 36 * 3600_000; // ~da manhã de ontem para cá
    for (const p of abertos) {
      const entradas = await store.listarAtividade(p.id);
      atividadeRecente[p.id] = entradas
        .filter((e) => Date.parse(e.ts) >= desde)
        .slice(-8)
        .map((e) => `${e.ts.slice(11, 16)} [${e.tipo}] ${e.texto.slice(0, 160)}`);
    }
    const fin = resumoFinanceiro(lancamentos, contas, hoje);
    return montarContextoStandup({
      hoje,
      projetosAbertos: abertos,
      rascunhos: projetos.filter((p) => p.status === 'rascunho').length,
      entreguesTotal: projetos.filter((p) => p.status === 'entregue').length,
      funcionarios: funcionarios.filter((f) => f.status === 'ativo'),
      financeiro: {
        caixaBRL: fin.caixaBRL,
        totalAReceberBRL: fin.totalAReceberBRL,
        atrasadasBRL: fin.atrasadasBRL,
        vencendo7DiasBRL: fin.vencendo7DiasBRL,
        custoApiMesBRL: fin.custoApiMesBRL,
      },
      atividadeRecente,
      agoraMs: Date.now(),
    });
  }

  /** Custo do standup entra no livro (id standup:<dia>) e conta no limite diário. */
  private async registrarCusto(uso: UsoModelo): Promise<void> {
    const usd = custoUsd(MODELO_PADRAO, uso);
    if (usd <= 0) return;
    const { store } = this.deps;
    const hoje = hojeISO();
    const cfg = await store.lerConfig();
    const chave = `standup:${hoje}`;
    const dias = await store.lerCustosApiDia();
    dias[chave] = (dias[chave] ?? 0) + usd;
    await store.salvarCustosApiDia(dias);
    await store.anexarLancamento(
      lancamentoCustoApiDiario({
        projetoId: 'standup',
        dia: hoje,
        usdAcumuladoDia: dias[chave]!,
        cambioUsdBrl: cfg.cambioUsdBrl,
        modelo: MODELO_PADRAO,
        nomeProjeto: 'Standup matinal',
      }),
    );
  }
}

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
