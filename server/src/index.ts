// Bootstrap da ponte: Fastify + reconciliação de sessões + rotina diária.
// Rodar: npm run dev (ou `npm run empresa` na raiz, a partir da F2).

import Fastify from 'fastify';
import { clienteAnthropic, temChaveApi } from './anthropic/cliente.js';
import { GerenciadorPropostas } from './anthropic/propostas.js';
import { GerenciadorRotinas } from './anthropic/rotinas.js';
import { GerenciadorSessoes } from './anthropic/sessoes.js';
import { GerenciadorStandup } from './anthropic/standup.js';
import { carregarEnv, dirDados, hojeISO, porta } from './config.js';
import { verificarConquistas } from './conquistas.js';
import { lancamentosCustosFixosDevidos, marcarAtrasadas } from './financeiro/motor.js';
import { notificarCelular } from './notificar/telegram.js';
import { montarSnapshot } from './snapshot.js';
import { Store } from './store/db.js';
import { TempoReal } from './tempoReal.js';
import type { Contexto } from './rotas/contexto.js';
import { rotasCrm } from './rotas/crm.js';
import { rotasEstado } from './rotas/estado.js';
import { rotasFinanceiro } from './rotas/financeiro.js';
import { rotasFuncionarios } from './rotas/funcionarios.js';
import { rotasProjetos } from './rotas/projetos.js';
import { rotasRotinas } from './rotas/rotinas.js';
import { rotasTimes } from './rotas/times.js';

async function principal(): Promise<void> {
  carregarEnv();

  const store = new Store(dirDados());
  await store.init();
  const tempoReal = new TempoReal();

  const aoMudarEstado = async (): Promise<void> => {
    // conquistas antes do snapshot: o broadcast já sai com o troféu desbloqueado
    await verificarConquistas(store, tempoReal).catch((erro) => console.warn('[conquistas]', erro));
    tempoReal.enviar('estado', await montarSnapshot(store));
  };

  const sessoes = new GerenciadorSessoes({
    store,
    tempoReal,
    cliente: clienteAnthropic,
    aoMudarEstado,
  });

  const standup = new GerenciadorStandup({
    store,
    tempoReal,
    cliente: clienteAnthropic,
    aoMudarEstado,
  });

  const propostas = new GerenciadorPropostas({
    store,
    tempoReal,
    cliente: clienteAnthropic,
    aoMudarEstado,
  });

  const rotinas = new GerenciadorRotinas({
    store,
    tempoReal,
    cliente: clienteAnthropic,
    aoMudarEstado,
  });

  /** Rotina diária: contas atrasadas + custos fixos recorrentes (idempotente; com catch-up). */
  const rodarRotinaDiaria = async (): Promise<void> => {
    const hoje = hojeISO();
    const contas = await store.listarContasReceber();
    if (marcarAtrasadas(contas, hoje)) await store.salvarContasReceber(contas);
    const [custos, lancamentos] = await Promise.all([
      store.listarCustosFixos(),
      store.listarLancamentos(),
    ]);
    const novos = lancamentosCustosFixosDevidos(custos, lancamentos, hoje);
    for (const l of novos) await store.anexarLancamento(l);
    const cfg = await store.lerConfig();
    const primeiraDoDia = cfg.ultimaRotinaDiaria !== hoje;
    if (primeiraDoDia || novos.length) {
      cfg.ultimaRotinaDiaria = hoje;
      await store.salvarConfig(cfg);
      await aoMudarEstado();
    }
    // F4c — 1x por dia: contas vencendo hoje/atrasadas no celular do dono
    if (primeiraDoDia) {
      const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const vencemHoje = contas.filter((c) => c.status === 'aberta' && c.vencimento === hoje);
      const atrasadas = contas.filter((c) => c.status === 'atrasada');
      for (const c of vencemHoje) notificarCelular(`💰 Conta a receber vence HOJE: ${c.descricao} — ${brl(c.valorBRL)}.`);
      if (atrasadas.length) {
        const total = atrasadas.reduce((s, c) => s + c.valorBRL, 0);
        notificarCelular(`⚠️ ${atrasadas.length} conta(s) a receber atrasada(s), total ${brl(total)} — cobre o cliente!`);
      }
    }
  };

  const ctx: Contexto = { store, tempoReal, sessoes, standup, propostas, rotinas, aoMudarEstado, rodarRotinaDiaria };

  const app = Fastify({ logger: { level: 'info' } });
  await app.register(
    async (api) => {
      rotasEstado(api, ctx);
      rotasFuncionarios(api, ctx);
      rotasProjetos(api, ctx);
      rotasTimes(api, ctx);
      rotasRotinas(api, ctx);
      rotasFinanceiro(api, ctx);
      rotasCrm(api, ctx);
    },
    { prefix: '/api' },
  );

  await rodarRotinaDiaria();
  // avalia conquistas do histórico já no boot (dados antigos podem destravar troféus)
  await verificarConquistas(store, tempoReal).catch((erro) => app.log.warn(erro, 'conquistas no boot'));

  const intervaloRotina = setInterval(() => {
    void rodarRotinaDiaria().catch((erro) => app.log.error(erro, 'rotina diária falhou'));
  }, 60_000);
  intervaloRotina.unref();

  await app.listen({ port: porta(), host: '127.0.0.1' });
  app.log.info(`Ponte do Modo Empresa Real em http://127.0.0.1:${porta()}/api/saude (dados em ${store.dir})`);

  let intervaloStandup: NodeJS.Timeout | null = null;
  if (temChaveApi()) {
    await sessoes.reconciliar().catch((erro) => app.log.error(erro, 'reconciliação falhou'));
    // standup (F4b): garante o cron na nuvem e fica de olho nos disparos
    await standup.garantir().catch((erro) => app.log.error(erro, 'standup: garantir falhou'));
    await standup.verificarRuns().catch((erro) => app.log.error(erro, 'standup: verificação falhou'));
    // rotinas 24/7 (T2): mesmo padrão do standup, uma por cadastro
    await rotinas.garantirTodas().catch((erro) => app.log.error(erro, 'rotinas: garantir falhou'));
    await rotinas.verificarRuns().catch((erro) => app.log.error(erro, 'rotinas: verificação falhou'));
    intervaloStandup = setInterval(() => {
      void standup.verificarRuns().catch((erro) => app.log.error(erro, 'standup: verificação falhou'));
      void rotinas.verificarRuns().catch((erro) => app.log.error(erro, 'rotinas: verificação falhou'));
    }, 5 * 60_000);
    intervaloStandup.unref();
  } else {
    app.log.warn('ANTHROPIC_API_KEY ausente — cadastros funcionam, mas criar agente/iniciar projeto vai falhar. Preencha server/.env.');
  }

  const encerrar = async (): Promise<void> => {
    sessoes.desligarTodos();
    clearInterval(intervaloRotina);
    if (intervaloStandup) clearInterval(intervaloStandup);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void encerrar());
  process.on('SIGTERM', () => void encerrar());
}

principal().catch((erro) => {
  console.error('Falha ao subir a ponte:', erro);
  process.exit(1);
});
