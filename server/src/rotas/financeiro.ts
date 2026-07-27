// Painel financeiro: resumo, livro-razão, relatórios, contas a receber, custos fixos e config.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hojeISO, mesDe } from '../config.js';
import {
  custoPorFuncionario,
  dreMes,
  filtrarPorPeriodo,
  fluxoMensal,
  lancamentoRecebimento,
  marcarAtrasadas,
  margemPorProjeto,
  relatorioVendas,
  resumoFinanceiro,
} from '../financeiro/motor.js';
import type { ContaReceber, CustoFixo, TipoLancamento } from '../store/tipos.js';
import { responderErro, type Contexto } from './contexto.js';

const esquemaConta = z.object({
  projetoId: z.string().default(''),
  descricao: z.string().min(1).max(200),
  valorBRL: z.number().positive(),
  vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const esquemaCustoFixo = z.object({
  nome: z.string().min(1).max(120),
  categoria: z.enum(['servidor', 'ferramenta', 'imposto', 'outro']),
  valorBRL: z.number().positive(),
  recorrencia: z.enum(['mensal', 'anual', 'unico']),
  diaVencimento: z.number().int().min(1).max(28),
  mesVencimento: z.number().int().min(1).max(12).optional(),
  dataUnica: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ativo: z.boolean().default(true),
});

export function rotasFinanceiro(app: FastifyInstance, ctx: Contexto): void {
  // ---- visão geral ----

  app.get('/financeiro/resumo', async (_req, reply) => {
    try {
      const hoje = hojeISO();
      const [lancamentos, contas] = await Promise.all([
        ctx.store.listarLancamentos(),
        ctx.store.listarContasReceber(),
      ]);
      if (marcarAtrasadas(contas, hoje)) await ctx.store.salvarContasReceber(contas);
      return resumoFinanceiro(lancamentos, contas, hoje);
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.get('/financeiro/lancamentos', async (req, reply) => {
    try {
      const { de, ate, tipo, projetoId } = req.query as {
        de?: string;
        ate?: string;
        tipo?: TipoLancamento;
        projetoId?: string;
      };
      let lancamentos = filtrarPorPeriodo(await ctx.store.listarLancamentos(), de, ate);
      if (tipo) lancamentos = lancamentos.filter((l) => l.tipo === tipo);
      if (projetoId) lancamentos = lancamentos.filter((l) => l.projetoId === projetoId);
      return lancamentos.sort((a, b) => b.data.localeCompare(a.data));
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  // ---- relatórios ----

  app.get('/financeiro/relatorios/vendas', async (req, reply) => {
    try {
      const { de, ate } = req.query as { de?: string; ate?: string };
      const [lancamentos, projetos] = await Promise.all([
        ctx.store.listarLancamentos(),
        ctx.store.listarProjetos(),
      ]);
      return relatorioVendas(lancamentos, projetos, de, ate);
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.get('/financeiro/relatorios/fluxo', async (_req, reply) => {
    try {
      return fluxoMensal(await ctx.store.listarLancamentos());
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.get('/financeiro/relatorios/dre', async (req, reply) => {
    try {
      const { mes } = req.query as { mes?: string };
      const alvo = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : mesDe(hojeISO());
      return dreMes(await ctx.store.listarLancamentos(), alvo);
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.get('/financeiro/relatorios/margem', async (_req, reply) => {
    try {
      const [lancamentos, projetos] = await Promise.all([
        ctx.store.listarLancamentos(),
        ctx.store.listarProjetos(),
      ]);
      return margemPorProjeto(lancamentos, projetos);
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.get('/financeiro/relatorios/funcionarios', async (_req, reply) => {
    try {
      const [lancamentos, funcionarios] = await Promise.all([
        ctx.store.listarLancamentos(),
        ctx.store.listarFuncionarios(),
      ]);
      return custoPorFuncionario(lancamentos, funcionarios);
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  // ---- contas a receber ----

  app.get('/financeiro/contas-receber', async (_req, reply) => {
    try {
      const contas = await ctx.store.listarContasReceber();
      if (marcarAtrasadas(contas, hojeISO())) await ctx.store.salvarContasReceber(contas);
      return contas.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.post('/financeiro/contas-receber', async (req, reply) => {
    try {
      const corpo = esquemaConta.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Conta inválida', detalhes: corpo.error.issues });
      const conta: ContaReceber = { id: randomUUID(), status: 'aberta', ...corpo.data };
      const contas = await ctx.store.listarContasReceber();
      contas.push(conta);
      marcarAtrasadas(contas, hojeISO());
      await ctx.store.salvarContasReceber(contas);
      await ctx.aoMudarEstado();
      return reply.code(201).send(conta);
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.put('/financeiro/contas-receber/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const corpo = esquemaConta.partial().safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Edição inválida', detalhes: corpo.error.issues });
      const contas = await ctx.store.listarContasReceber();
      const conta = contas.find((c) => c.id === id);
      if (!conta) return reply.code(404).send({ erro: 'Conta não encontrada' });
      if (conta.status === 'recebida') return reply.code(409).send({ erro: 'Conta já recebida' });
      Object.assign(conta, corpo.data);
      if (conta.status === 'atrasada' && conta.vencimento >= hojeISO()) conta.status = 'aberta';
      marcarAtrasadas(contas, hojeISO());
      await ctx.store.salvarContasReceber(contas);
      await ctx.aoMudarEstado();
      return conta;
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  // receber = o ÚNICO momento em que o caixa sobe (regime de caixa)
  app.post('/financeiro/contas-receber/:id/receber', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const contas = await ctx.store.listarContasReceber();
      const conta = contas.find((c) => c.id === id);
      if (!conta) return reply.code(404).send({ erro: 'Conta não encontrada' });
      if (conta.status === 'recebida') return reply.code(409).send({ erro: 'Conta já recebida' });
      const hoje = hojeISO();
      conta.status = 'recebida';
      conta.recebidaEm = hoje;
      await ctx.store.salvarContasReceber(contas);
      await ctx.store.anexarLancamento(lancamentoRecebimento(conta, hoje));
      await ctx.aoMudarEstado();
      return conta;
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  // ---- custos fixos ----

  app.get('/financeiro/custos-fixos', async () => ctx.store.listarCustosFixos());

  app.post('/financeiro/custos-fixos', async (req, reply) => {
    try {
      const corpo = esquemaCustoFixo.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Custo inválido', detalhes: corpo.error.issues });
      const custo: CustoFixo = { id: randomUUID(), ...corpo.data };
      const custos = await ctx.store.listarCustosFixos();
      custos.push(custo);
      await ctx.store.salvarCustosFixos(custos);
      await ctx.rodarRotinaDiaria(); // se já venceu neste período, lança agora
      return reply.code(201).send(custo);
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.put('/financeiro/custos-fixos/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const corpo = esquemaCustoFixo.partial().safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Edição inválida', detalhes: corpo.error.issues });
      const custos = await ctx.store.listarCustosFixos();
      const custo = custos.find((c) => c.id === id);
      if (!custo) return reply.code(404).send({ erro: 'Custo não encontrado' });
      Object.assign(custo, corpo.data);
      await ctx.store.salvarCustosFixos(custos);
      await ctx.rodarRotinaDiaria();
      return custo;
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.delete('/financeiro/custos-fixos/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const custos = await ctx.store.listarCustosFixos();
      const restante = custos.filter((c) => c.id !== id);
      if (restante.length === custos.length) return reply.code(404).send({ erro: 'Custo não encontrado' });
      await ctx.store.salvarCustosFixos(restante);
      await ctx.aoMudarEstado();
      return { ok: true };
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  // ---- config (câmbio e limites de custo) ----

  app.get('/config', async () => ctx.store.lerConfig());

  app.put('/config', async (req, reply) => {
    try {
      const corpo = z
        .object({
          cambioUsdBrl: z.number().positive().max(100).optional(),
          limiteDiarioUSD: z.number().positive().max(100000).optional(),
          limitePorProjetoUSD: z.number().positive().max(100000).optional(),
        })
        .safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Config inválida', detalhes: corpo.error.issues });
      const cfg = await ctx.store.lerConfig();
      Object.assign(cfg, corpo.data);
      await ctx.store.salvarConfig(cfg);
      await ctx.aoMudarEstado();
      return cfg;
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });
}
