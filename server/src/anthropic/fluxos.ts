// Fluxos (PLANO-TIMES-FLUXOS T3): esteiras que ligam agentes/times.
// Cada estágio roda numa SESSÃO PRÓPRIA com o responsável configurado
// (funcionário ou coordenador de time); a ponte é o correio — a saída de um
// estágio (resumo + arquivos) vira o kickoff do próximo. Entre estágios com
// aprovação manual, nada anda sem o clique do dono.

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { toFile } from '@anthropic-ai/sdk';
import { agoraISO, hojeISO, MODELO_PADRAO } from '../config.js';
import { notificarCelular } from '../notificar/telegram.js';
import type { Store } from '../store/db.js';
import type {
  CargaEstagio,
  EstagioFluxo,
  EventoSessao,
  ExecucaoFluxo,
  Fluxo,
} from '../store/tipos.js';
import type { TempoReal } from '../tempoReal.js';
import { garantirBriefing, garantirCoordenadorTime, garantirEnvironment } from './agentes.js';
import { ErroPonte } from './cliente.js';
import { custoUsd, lancamentoCustoApiDiario, type UsoModelo } from './custos.js';
import { decidirAposEvento, textoDoEvento } from './sessoes.js';

const BETA_MANAGED_AGENTS = 'managed-agents-2026-04-01';

// ---------- helpers puros (testáveis) ----------

/** Pasta em data/fluxos/<execucao>/ onde os arquivos de um estágio ficam. */
export function pastaEstagio(indice: number, estagioNome: string): string {
  return `${indice + 1}-${estagioNome.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}`;
}

/** Kickoff de um estágio: instrução + entrada do dono + carga acumulada dos anteriores. */
export function montarKickoffEstagio(dados: {
  fluxo: Fluxo;
  execucao: ExecucaoFluxo;
  estagio: EstagioFluxo;
  indice: number;
  feedback?: string;
  /** rótulos "estagio-N/arquivo" que foram MONTADOS na sessão deste estágio */
  arquivosMontados?: string[];
}): string {
  const { fluxo, execucao, estagio, indice, feedback } = dados;
  const montados = new Set(dados.arquivosMontados ?? []);
  const partes: string[] = [
    `# Fluxo: ${fluxo.emoji} ${fluxo.nome} — estágio ${indice + 1}/${fluxo.estagios.length}: ${estagio.nome}`,
    `Execução: "${execucao.titulo}"`,
    `\n## Sua tarefa neste estágio\n${estagio.instrucao.trim()}`,
  ];
  if (execucao.entrada.trim()) {
    partes.push(`\n## Entrada dada pelo dono da agência\n${execucao.entrada.trim()}`);
  }
  for (const [i, carga] of execucao.carga.entries()) {
    const noContainer = carga.arquivos.filter((n) => montados.has(`estagio-${i + 1}/${n}`));
    const soComDono = carga.arquivos.filter((n) => !montados.has(`estagio-${i + 1}/${n}`));
    partes.push(
      `\n## Resultado do estágio ${i + 1} (${carga.estagioNome})\n${carga.resumo}` +
        (noContainer.length
          ? `\nARQUIVOS DESSE ESTÁGIO montados em /workspace/carga/estagio-${i + 1}/: ${noContainer.join(', ')} — USE-OS como insumo direto.`
          : '') +
        (soComDono.length
          ? `\n(Outros arquivos ficaram com o dono: ${soComDono.join(', ')} — trabalhe a partir do resumo.)`
          : ''),
    );
  }
  if (feedback?.trim()) {
    partes.push(`\n## Feedback do dono (refaça levando isto em conta)\n${feedback.trim()}`);
  }
  partes.push(`\n## Como entregar (obrigatório)
- Trabalhe SÓ este estágio — não faça o trabalho dos próximos.
- Tudo em português do Brasil.
- Dúvidas no meio do caminho: NÃO pare nem espere o dono — siga o briefing/carga, tome a decisão mais razoável e REGISTRE a decisão no resumo final.
- Arquivos produzidos: escreva em /mnt/session/outputs/ (é o que passa adiante).
- Termine com uma mensagem final começando com "RESUMO DO ESTÁGIO:" contendo o resultado essencial em até ~1500 caracteres — é ela que o próximo estágio (e o dono) vai ler.`);
  return partes.join('\n');
}

/** Extrai o resumo da mensagem final ("RESUMO DO ESTÁGIO: ..." ou a mensagem toda). */
export function extrairResumoEstagio(ultimaMensagem: string): string {
  const marcador = /RESUMO DO EST[ÁA]GIO:\s*/i.exec(ultimaMensagem);
  const texto = marcador ? ultimaMensagem.slice(marcador.index + marcador[0].length) : ultimaMensagem;
  return texto.trim().slice(0, 4000) || '(estágio terminou sem resumo)';
}

// ---------- gerenciador ----------

interface Dependencias {
  store: Store;
  tempoReal: TempoReal;
  cliente: () => Anthropic;
  aoMudarEstado: () => Promise<void>;
}

export class GerenciadorFluxos {
  private processando = new Set<string>(); // execucaoIds com estágio rodando

  constructor(private deps: Dependencias) {}

  /** Dispara uma execução ("descida") do fluxo a partir do estágio 1. */
  async disparar(
    fluxoId: string,
    titulo: string,
    entrada: string,
    origem: ExecucaoFluxo['origem'],
  ): Promise<ExecucaoFluxo> {
    const fluxo = await this.obterFluxo(fluxoId);
    const execucao: ExecucaoFluxo = {
      id: randomUUID(),
      fluxoId,
      titulo: titulo.trim() || `Execução de ${fluxo.nome}`,
      entrada,
      estagioAtual: 0,
      status: 'em_andamento',
      carga: [],
      origem,
      sessionId: null,
      criadoEm: agoraISO(),
      atualizadoEm: agoraISO(),
    };
    const execucoes = await this.deps.store.listarExecucoesFluxos();
    execucoes.push(execucao);
    await this.deps.store.salvarExecucoesFluxos(execucoes);
    await this.deps.aoMudarEstado();
    // roda o estágio em segundo plano — a resposta HTTP não espera a sessão
    void this.rodarEstagio(execucao.id).catch((erro) =>
      console.warn(`[fluxo ${fluxo.nome}] estágio falhou: ${msg(erro)}`),
    );
    return execucao;
  }

  /** Dono aprovou o estágio atual: passa a carga adiante (ou conclui). */
  async aprovar(execucaoId: string): Promise<void> {
    const execucao = await this.obterExecucao(execucaoId);
    if (execucao.status !== 'aguardando_aprovacao') {
      throw new ErroPonte('A execução não está aguardando aprovação.', 409);
    }
    const fluxo = await this.obterFluxo(execucao.fluxoId);
    if (execucao.estagioAtual + 1 >= fluxo.estagios.length) {
      await this.atualizarExecucao(execucaoId, (e) => {
        e.status = 'concluida';
      });
      this.avisar(`✅ Fluxo "${fluxo.nome}" concluiu a execução "${execucao.titulo}".`);
      return;
    }
    await this.atualizarExecucao(execucaoId, (e) => {
      e.estagioAtual += 1;
      e.status = 'em_andamento';
    });
    void this.rodarEstagio(execucaoId).catch((erro) =>
      console.warn(`[fluxo ${fluxo.nome}] estágio falhou: ${msg(erro)}`),
    );
  }

  /** Dono pediu para refazer o estágio atual com feedback. */
  async refazer(execucaoId: string, feedback: string): Promise<void> {
    const execucao = await this.obterExecucao(execucaoId);
    if (execucao.status !== 'aguardando_aprovacao') {
      throw new ErroPonte('A execução não está aguardando aprovação.', 409);
    }
    await this.atualizarExecucao(execucaoId, (e) => {
      e.status = 'em_andamento';
      // descarta a carga do estágio refeito (a última)
      e.carga = e.carga.slice(0, e.estagioAtual);
    });
    void this.rodarEstagio(execucaoId, feedback).catch((erro) =>
      console.warn(`[fluxo] refazer falhou: ${msg(erro)}`),
    );
  }

  async cancelar(execucaoId: string): Promise<void> {
    await this.atualizarExecucao(execucaoId, (e) => {
      e.status = 'cancelada';
    });
  }

  // ---- internos ----

  /** Roda o estágio atual da execução numa sessão própria e captura a carga. */
  private async rodarEstagio(execucaoId: string, feedback?: string): Promise<void> {
    if (this.processando.has(execucaoId)) return;
    this.processando.add(execucaoId);
    try {
      const { store } = this.deps;
      const cliente = this.deps.cliente();
      const execucao = await this.obterExecucao(execucaoId);
      const fluxo = await this.obterFluxo(execucao.fluxoId);
      const indice = execucao.estagioAtual;
      const estagio = fluxo.estagios[indice];
      if (!estagio) throw new ErroPonte(`Estágio ${indice} não existe no fluxo.`, 500);

      const agentId = await this.agenteDe(estagio);
      const environmentId = await garantirEnvironment(cliente, store);
      // arquivos dos estágios anteriores sobem via Files API e são MONTADOS
      // na sessão nova (/workspace/carga/estagio-N/) — é assim que o logo do
      // designer chega de verdade na mão do dev
      const { recursos, montados } = await this.montarArquivosCarga(execucao);
      const sessao = await cliente.beta.sessions.create({
        agent: agentId,
        environment_id: environmentId,
        title: `${fluxo.emoji} ${fluxo.nome} · ${estagio.nome} — ${execucao.titulo}`,
        ...(recursos.length ? { resources: recursos } : {}),
      } as Parameters<typeof cliente.beta.sessions.create>[0]);
      await this.atualizarExecucao(execucaoId, (e) => {
        e.sessionId = sessao.id;
      });

      // stream ANTES do kickoff (SSE não tem replay) — regra do driver
      const stream = await cliente.beta.sessions.events.stream(sessao.id);
      const kickoff = montarKickoffEstagio({ fluxo, execucao, estagio, indice, feedback, arquivosMontados: montados });
      await cliente.beta.sessions.events.send(sessao.id, {
        events: [{ type: 'user.message', content: [{ type: 'text', text: kickoff }] }],
      } as Parameters<Anthropic['beta']['sessions']['events']['send']>[1]);

      let ultimaMensagem = '';
      let custoEstagioUSD = 0;
      const respondidos = new Set<string>();
      const teto = Date.now() + 30 * 60_000;
      for await (const bruto of stream) {
        const ev = bruto as unknown as EventoSessao;
        if (ev.type === 'agent.message') {
          const texto = textoDoEvento(ev);
          if (texto) ultimaMensagem = texto;
        } else if (ev.type === 'span.model_request_end') {
          const usd = await this.registrarCusto(execucao, fluxo, (ev.model_usage ?? {}) as UsoModelo);
          custoEstagioUSD += usd;
        } else if (ev.type === 'agent.custom_tool_use') {
          // o Agent do funcionário tem reportar_progresso — responde para não travar
          const id = typeof ev.id === 'string' ? ev.id : null;
          if (id && !respondidos.has(id)) {
            respondidos.add(id);
            const threadId = typeof ev.session_thread_id === 'string' ? ev.session_thread_id : undefined;
            await cliente.beta.sessions.events.send(sessao.id, {
              events: [
                {
                  type: 'user.custom_tool_result',
                  custom_tool_use_id: id,
                  content: [{ type: 'text', text: 'ok — siga o trabalho do estágio' }],
                  ...(threadId ? { session_thread_id: threadId } : {}),
                },
              ],
            } as Parameters<Anthropic['beta']['sessions']['events']['send']>[1]);
          }
        }
        if (decidirAposEvento(ev).tipo !== 'continuar') break;
        if (Date.now() > teto) {
          console.warn(`[fluxo ${fluxo.nome}] teto de 30 min no estágio "${estagio.nome}" — encerrando.`);
          break;
        }
      }

      const arquivos = await this.baixarArquivos(sessao.id, execucaoId, indice, estagio.nome);
      await cliente.beta.sessions.archive(sessao.id).catch(() => undefined);

      const carga: CargaEstagio = {
        estagioId: estagio.id,
        estagioNome: estagio.nome,
        resumo: extrairResumoEstagio(ultimaMensagem),
        arquivos,
        custoUSD: Math.round(custoEstagioUSD * 10000) / 10000,
        concluidoEm: agoraISO(),
      };
      const ultimo = indice + 1 >= fluxo.estagios.length;
      const automatico = estagio.aprovacao === 'automatica';
      await this.atualizarExecucao(execucaoId, (e) => {
        e.sessionId = null;
        e.carga = [...e.carga.slice(0, indice), carga];
        if (automatico && !ultimo) {
          e.estagioAtual += 1;
          e.status = 'em_andamento';
        } else if (automatico && ultimo) {
          e.status = 'concluida';
        } else {
          e.status = 'aguardando_aprovacao';
        }
      });

      if (automatico && !ultimo) {
        this.avisar(`${fluxo.emoji} "${execucao.titulo}": estágio ${estagio.nome} concluiu — seguindo para o próximo.`);
        void this.rodarEstagio(execucaoId).catch((erro) => console.warn(`[fluxo] próximo estágio falhou: ${msg(erro)}`));
      } else if (automatico && ultimo) {
        this.avisar(`✅ Fluxo "${fluxo.nome}" concluiu a execução "${execucao.titulo}".`);
        notificarCelular(`✅ Fluxo ${fluxo.nome} — "${execucao.titulo}" concluído.\n\n${carga.resumo.slice(0, 2500)}`);
      } else {
        this.avisar(`👀 "${execucao.titulo}": estágio ${estagio.nome} concluiu — aguardando SUA aprovação para seguir.`);
        notificarCelular(
          `👀 Fluxo ${fluxo.nome} — "${execucao.titulo}"\nEstágio "${estagio.nome}" concluiu e aguarda sua aprovação.\n\n${carga.resumo.slice(0, 2500)}`,
        );
      }
    } catch (erro) {
      await this.atualizarExecucao(execucaoId, (e) => {
        e.status = 'falhou';
        e.erro = msg(erro);
        e.sessionId = null;
      }).catch(() => undefined);
      this.avisar(`❌ Fluxo: execução falhou — ${msg(erro)}`);
      throw erro;
    } finally {
      this.processando.delete(execucaoId);
      await this.deps.aoMudarEstado();
    }
  }

  /** Agent do estágio: Briefing embutido, funcionário direto ou coordenador do time. */
  private async agenteDe(estagio: EstagioFluxo): Promise<string> {
    const { store } = this.deps;
    if (estagio.responsavelTipo === 'briefing') {
      return garantirBriefing(this.deps.cliente(), store);
    }
    if (estagio.responsavelTipo === 'time') {
      return garantirCoordenadorTime(this.deps.cliente(), store, estagio.responsavelId);
    }
    const funcionario = (await store.listarFuncionarios()).find(
      (f) => f.id === estagio.responsavelId && f.status === 'ativo',
    );
    if (!funcionario?.agentId) {
      throw new ErroPonte(`O responsável do estágio "${estagio.nome}" não existe mais (ou não tem Agent).`, 400);
    }
    return funcionario.agentId;
  }

  /** Sobe os arquivos das cargas anteriores (disco → Files API) e devolve os
   *  resources p/ montar em /workspace/carga/estagio-N/. Melhor esforço:
   *  arquivo que falhar só não é montado (o kickoff avisa o agente). */
  private async montarArquivosCarga(
    execucao: ExecucaoFluxo,
  ): Promise<{ recursos: Record<string, unknown>[]; montados: string[] }> {
    const cliente = this.deps.cliente();
    const recursos: Record<string, unknown>[] = [];
    const montados: string[] = [];
    const LIMITE_ARQUIVOS = 12;
    const LIMITE_BYTES = 8 * 1024 * 1024;
    for (const [i, carga] of execucao.carga.entries()) {
      for (const nome of carga.arquivos) {
        if (recursos.length >= LIMITE_ARQUIVOS) break;
        const caminho = path.join(
          this.deps.store.caminhoFluxos(execucao.id),
          pastaEstagio(i, carga.estagioNome),
          path.basename(nome),
        );
        try {
          const info = await stat(caminho);
          if (!info.isFile() || info.size > LIMITE_BYTES) continue;
          const bytes = await readFile(caminho);
          const arquivo = await cliente.beta.files.upload({
            file: await toFile(bytes, path.basename(nome)),
            betas: [BETA_MANAGED_AGENTS],
          } as Parameters<typeof cliente.beta.files.upload>[0]);
          const fileId = (arquivo as { id: string }).id;
          recursos.push({
            type: 'file',
            file_id: fileId,
            mount_path: `/workspace/carga/estagio-${i + 1}/${path.basename(nome)}`,
          });
          montados.push(`estagio-${i + 1}/${path.basename(nome)}`);
        } catch (erro) {
          console.warn(`[fluxo] não montei ${nome} do estágio ${i + 1}: ${msg(erro)}`);
        }
      }
    }
    return { recursos, montados };
  }

  private async baixarArquivos(
    sessionId: string,
    execucaoId: string,
    indice: number,
    estagioNome: string,
  ): Promise<string[]> {
    const cliente = this.deps.cliente();
    const pasta = pastaEstagio(indice, estagioNome);
    const destino = path.join(this.deps.store.caminhoFluxos(execucaoId), pasta);
    await mkdir(destino, { recursive: true });
    const nomes: string[] = [];
    try {
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        const pagina = await cliente.beta.files.list({
          scope_id: sessionId,
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
        await new Promise((r) => setTimeout(r, 2_000)); // lag de indexação dos outputs
      }
    } catch (erro) {
      console.warn(`[fluxo] falha baixando arquivos do estágio: ${msg(erro)}`);
    }
    return nomes;
  }

  private async registrarCusto(execucao: ExecucaoFluxo, fluxo: Fluxo, uso: UsoModelo): Promise<number> {
    const usd = custoUsd(MODELO_PADRAO, uso);
    if (usd <= 0) return 0;
    const { store } = this.deps;
    const hoje = hojeISO();
    const cfg = await store.lerConfig();
    const chave = `fluxo:${execucao.id}:${hoje}`;
    const dias = await store.lerCustosApiDia();
    dias[chave] = (dias[chave] ?? 0) + usd;
    await store.salvarCustosApiDia(dias);
    await store.anexarLancamento(
      lancamentoCustoApiDiario({
        projetoId: `fluxo:${execucao.id}`,
        dia: hoje,
        usdAcumuladoDia: dias[chave]!,
        cambioUsdBrl: cfg.cambioUsdBrl,
        modelo: MODELO_PADRAO,
        nomeProjeto: `Fluxo — ${fluxo.nome} (${execucao.titulo})`,
      }),
    );
    return usd;
  }

  private avisar(mensagem: string): void {
    this.deps.tempoReal.enviar('alerta', { tipo: 'fluxo', mensagem });
  }

  private async obterFluxo(id: string): Promise<Fluxo> {
    const fluxo = (await this.deps.store.listarFluxos()).find((f) => f.id === id);
    if (!fluxo) throw new ErroPonte('Fluxo não encontrado.', 404);
    return fluxo;
  }

  private async obterExecucao(id: string): Promise<ExecucaoFluxo> {
    const execucao = (await this.deps.store.listarExecucoesFluxos()).find((e) => e.id === id);
    if (!execucao) throw new ErroPonte('Execução não encontrada.', 404);
    return execucao;
  }

  private async atualizarExecucao(id: string, mudar: (e: ExecucaoFluxo) => void): Promise<void> {
    const execucoes = await this.deps.store.listarExecucoesFluxos();
    const execucao = execucoes.find((e) => e.id === id);
    if (!execucao) return;
    mudar(execucao);
    execucao.atualizadoEm = agoraISO();
    await this.deps.store.salvarExecucoesFluxos(execucoes);
    await this.deps.aoMudarEstado();
  }
}

function msg(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
