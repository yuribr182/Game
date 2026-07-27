// Propostas em PDF (backlog 3): o agente Comercial recebe um briefing montado da
// oportunidade do CRM + histórico real da agência, escreve a proposta em
// /mnt/session/outputs/ e a ponte baixa para data/propostas/<oportunidade>/.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { agoraISO, hojeISO } from '../config.js';
import { notificarCelular } from '../notificar/telegram.js';
import type { Store } from '../store/db.js';
import type { EventoSessao, OportunidadeCRM } from '../store/tipos.js';
import type { TempoReal } from '../tempoReal.js';
import { garantirComercial, garantirEnvironment, montarBriefingProposta } from './agentes.js';
import { ErroPonte } from './cliente.js';
import { custoUsd, lancamentoCustoApiDiario, type UsoModelo } from './custos.js';
import { decidirAposEvento } from './sessoes.js';

const BETA_MANAGED_AGENTS = 'managed-agents-2026-04-01';
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Dependencias {
  store: Store;
  tempoReal: TempoReal;
  cliente: () => Anthropic;
  aoMudarEstado: () => Promise<void>;
}

export class GerenciadorPropostas {
  private gerando = new Set<string>();

  constructor(private deps: Dependencias) {}

  /** Dispara a geração (roda em segundo plano; o front acompanha pelo snapshot). */
  async gerar(oportunidadeId: string): Promise<void> {
    const { store } = this.deps;
    this.deps.cliente(); // valida a chave antes de marcar qualquer coisa
    const oportunidades = await store.listarOportunidades();
    const oportunidade = oportunidades.find((o) => o.id === oportunidadeId);
    if (!oportunidade) throw new ErroPonte('Oportunidade não encontrada.', 404);
    if (oportunidade.etapa === 'perdido') throw new ErroPonte('Oportunidade perdida — reabra antes.');
    if (this.gerando.has(oportunidadeId) || oportunidade.proposta?.status === 'gerando') {
      throw new ErroPonte('Já tem uma proposta sendo gerada para esta oportunidade.', 409);
    }
    this.gerando.add(oportunidadeId);
    await this.marcar(oportunidadeId, { status: 'gerando', arquivos: [] });
    await this.deps.aoMudarEstado();
    void this.rodar(oportunidadeId).finally(() => this.gerando.delete(oportunidadeId));
  }

  // ---- internos ----

  private async rodar(oportunidadeId: string): Promise<void> {
    const { store, tempoReal } = this.deps;
    try {
      const cliente = this.deps.cliente();
      const [oportunidades, clientes, projetos] = await Promise.all([
        store.listarOportunidades(),
        store.listarClientes(),
        store.listarProjetos(),
      ]);
      const oportunidade = oportunidades.find((o) => o.id === oportunidadeId);
      if (!oportunidade) return;
      const clienteCrm = clientes.find((c) => c.id === oportunidade.clienteId);

      const briefing = montarBriefingProposta({
        titulo: oportunidade.titulo,
        valorEstimadoBRL: oportunidade.valorEstimadoBRL,
        observacoes: oportunidade.observacoes,
        cliente: clienteCrm ?? { nome: 'Cliente' },
        historico: projetos
          .filter((p) => p.status === 'entregue')
          .map((p) => ({
            nome: p.nome,
            tipo: p.tipo,
            valorContratoBRL: p.valorContratoBRL,
            custoUSD: p.custoUSD,
            prazoDias: p.prazoDias,
          })),
      });

      const agentId = await garantirComercial(cliente, store);
      const environmentId = await garantirEnvironment(cliente, store);
      const sessao = await cliente.beta.sessions.create({
        agent: agentId,
        environment_id: environmentId,
        title: `📄 Proposta — ${oportunidade.titulo}`,
      } as Parameters<typeof cliente.beta.sessions.create>[0]);

      // stream ANTES do kickoff (SSE não tem replay) — mesmo padrão do driver
      const stream = await cliente.beta.sessions.events.stream(sessao.id);
      await cliente.beta.sessions.events.send(sessao.id, {
        events: [{ type: 'user.message', content: [{ type: 'text', text: briefing }] }],
      } as Parameters<Anthropic['beta']['sessions']['events']['send']>[1]);

      const teto = Date.now() + 15 * 60_000;
      for await (const bruto of stream) {
        const ev = bruto as unknown as EventoSessao;
        if (ev.type === 'span.model_request_end') {
          await this.registrarCusto((ev.model_usage ?? {}) as UsoModelo);
        }
        if (decidirAposEvento(ev).tipo !== 'continuar') break;
        if (Date.now() > teto) {
          console.warn('[proposta] teto de 15 min — abandonando a sessão.');
          break;
        }
      }

      const arquivos = await this.baixar(sessao.id, oportunidadeId);
      await cliente.beta.sessions.archive(sessao.id).catch(() => undefined);

      if (arquivos.length) {
        await this.marcar(oportunidadeId, { status: 'pronta', arquivos, geradaEm: agoraISO() }, (o) => {
          if (o.etapa === 'lead') o.etapa = 'proposta'; // proposta pronta ⇒ avança no funil
        });
        const aviso = `📄 Proposta pronta: ${oportunidade.titulo} (${arquivos.join(', ')})`;
        tempoReal.enviar('alerta', { tipo: 'proposta', mensagem: aviso });
        notificarCelular(aviso);
      } else {
        await this.marcar(oportunidadeId, { status: 'falhou', arquivos: [], erro: 'a sessão terminou sem gerar arquivos' });
        tempoReal.enviar('alerta', { tipo: 'proposta_falhou', mensagem: `⚠️ A proposta de "${oportunidade.titulo}" não gerou arquivos.` });
      }
    } catch (erro) {
      const texto = erro instanceof Error ? erro.message : String(erro);
      await this.marcar(oportunidadeId, { status: 'falhou', arquivos: [], erro: texto.slice(0, 300) });
      this.deps.tempoReal.enviar('alerta', { tipo: 'proposta_falhou', mensagem: `⚠️ Proposta falhou: ${texto}` });
    } finally {
      await this.deps.aoMudarEstado();
    }
  }

  private async marcar(
    oportunidadeId: string,
    proposta: NonNullable<OportunidadeCRM['proposta']>,
    extra?: (o: OportunidadeCRM) => void,
  ): Promise<void> {
    const todas = await this.deps.store.listarOportunidades();
    const alvo = todas.find((o) => o.id === oportunidadeId);
    if (!alvo) return;
    alvo.proposta = proposta;
    alvo.atualizadoEm = agoraISO();
    extra?.(alvo);
    await this.deps.store.salvarOportunidades(todas);
  }

  private async baixar(sessionId: string, oportunidadeId: string): Promise<string[]> {
    const cliente = this.deps.cliente();
    const destino = this.deps.store.caminhoPropostas(oportunidadeId);
    await mkdir(destino, { recursive: true });
    const nomes: string[] = [];
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const pagina = await cliente.beta.files.list({
        scope_id: sessionId,
        betas: [BETA_MANAGED_AGENTS],
      } as Parameters<typeof cliente.beta.files.list>[0]);
      for await (const arquivo of pagina) {
        const meta = arquivo as { id: string; filename?: string };
        const nome = path.basename(meta.filename ?? meta.id) || meta.id;
        const resposta = await cliente.beta.files.download(meta.id);
        await writeFile(path.join(destino, nome), Buffer.from(await resposta.arrayBuffer()));
        nomes.push(nome);
      }
      if (nomes.length) break;
      await dormir(2_000); // lag de indexação entre o idle e os outputs aparecerem
    }
    return nomes;
  }

  /** Custo consolidado do dia das propostas (chave proposta:<dia> — conta no limite diário). */
  private async registrarCusto(uso: UsoModelo): Promise<void> {
    const usd = custoUsd('claude-opus-5', uso);
    if (usd <= 0) return;
    const { store } = this.deps;
    const hoje = hojeISO();
    const cfg = await store.lerConfig();
    const chave = `proposta:${hoje}`;
    const dias = await store.lerCustosApiDia();
    dias[chave] = (dias[chave] ?? 0) + usd;
    await store.salvarCustosApiDia(dias);
    await store.anexarLancamento(
      lancamentoCustoApiDiario({
        projetoId: 'proposta',
        dia: hoje,
        usdAcumuladoDia: dias[chave]!,
        cambioUsdBrl: cfg.cambioUsdBrl,
        modelo: 'claude-opus-5',
        nomeProjeto: 'Propostas comerciais',
      }),
    );
  }
}
