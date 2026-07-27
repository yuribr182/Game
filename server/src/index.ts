// Bootstrap da ponte: Fastify + reconciliação de sessões + rotina diária.
// Rodar: npm run dev (ou `npm run empresa` na raiz, a partir da F2).

import Fastify from 'fastify';
import { clienteAnthropic, temChaveApi } from './anthropic/cliente.js';
import { GerenciadorSessoes } from './anthropic/sessoes.js';
import { carregarEnv, dirDados, hojeISO, porta } from './config.js';
import { lancamentosCustosFixosDevidos, marcarAtrasadas } from './financeiro/motor.js';
import { montarSnapshot } from './snapshot.js';
import { Store } from './store/db.js';
import { TempoReal } from './tempoReal.js';
import type { Contexto } from './rotas/contexto.js';
import { rotasEstado } from './rotas/estado.js';
import { rotasFinanceiro } from './rotas/financeiro.js';
import { rotasFuncionarios } from './rotas/funcionarios.js';
import { rotasProjetos } from './rotas/projetos.js';

async function principal(): Promise<void> {
  carregarEnv();

  const store = new Store(dirDados());
  await store.init();
  const tempoReal = new TempoReal();

  const aoMudarEstado = async (): Promise<void> => {
    tempoReal.enviar('estado', await montarSnapshot(store));
  };

  const sessoes = new GerenciadorSessoes({
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
    if (cfg.ultimaRotinaDiaria !== hoje || novos.length) {
      cfg.ultimaRotinaDiaria = hoje;
      await store.salvarConfig(cfg);
      await aoMudarEstado();
    }
  };

  const ctx: Contexto = { store, tempoReal, sessoes, aoMudarEstado, rodarRotinaDiaria };

  const app = Fastify({ logger: { level: 'info' } });
  await app.register(
    async (api) => {
      rotasEstado(api, ctx);
      rotasFuncionarios(api, ctx);
      rotasProjetos(api, ctx);
      rotasFinanceiro(api, ctx);
    },
    { prefix: '/api' },
  );

  await rodarRotinaDiaria();

  const intervaloRotina = setInterval(() => {
    void rodarRotinaDiaria().catch((erro) => app.log.error(erro, 'rotina diária falhou'));
  }, 60_000);
  intervaloRotina.unref();

  await app.listen({ port: porta(), host: '127.0.0.1' });
  app.log.info(`Ponte do Modo Empresa Real em http://127.0.0.1:${porta()}/api/saude (dados em ${store.dir})`);

  if (temChaveApi()) {
    await sessoes.reconciliar().catch((erro) => app.log.error(erro, 'reconciliação falhou'));
  } else {
    app.log.warn('ANTHROPIC_API_KEY ausente — cadastros funcionam, mas criar agente/iniciar projeto vai falhar. Preencha server/.env.');
  }

  const encerrar = async (): Promise<void> => {
    sessoes.desligarTodos();
    clearInterval(intervaloRotina);
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
