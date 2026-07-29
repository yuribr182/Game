// Fluxos (T3): CRUD das esteiras + disparo e aprovação das execuções.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { agoraISO } from '../config.js';
import type { Fluxo } from '../store/tipos.js';
import { responderErro, type Contexto } from './contexto.js';

const esquemaEstagio = z
  .object({
    nome: z.string().min(1).max(60),
    responsavelTipo: z.enum(['funcionario', 'time', 'briefing']),
    responsavelId: z.string().default(''),
    instrucao: z.string().min(10).max(4000),
    aprovacao: z.enum(['manual', 'automatica']).default('manual'),
  })
  .superRefine((e, ctx2) => {
    if (e.responsavelTipo !== 'briefing' && !e.responsavelId) {
      ctx2.addIssue({ code: 'custom', path: ['responsavelId'], message: 'Escolha o responsável do estágio' });
    }
  });

const esquemaFluxo = z.object({
  nome: z.string().min(1).max(80),
  emoji: z.string().min(1).max(8).default('🔗'),
  estagios: z.array(esquemaEstagio).min(1).max(8),
});

async function validarResponsaveis(
  ctx: Contexto,
  estagios: z.infer<typeof esquemaEstagio>[],
): Promise<string | null> {
  const funcionarios = await ctx.store.listarFuncionarios();
  const times = await ctx.store.listarTimes();
  for (const e of estagios) {
    if (e.responsavelTipo === 'briefing') continue; // agente embutido da ponte
    if (e.responsavelTipo === 'time') {
      if (!times.some((t) => t.id === e.responsavelId && t.status === 'ativo')) {
        return `Estágio "${e.nome}": time inválido ou arquivado`;
      }
    } else if (!funcionarios.some((f) => f.id === e.responsavelId && f.status === 'ativo')) {
      return `Estágio "${e.nome}": funcionário inválido ou arquivado`;
    }
  }
  return null;
}

export function rotasFluxos(app: FastifyInstance, ctx: Contexto): void {
  app.get('/fluxos', async () => ctx.store.listarFluxos());

  app.get('/fluxos/execucoes', async () => {
    const execucoes = await ctx.store.listarExecucoesFluxos();
    return [...execucoes].reverse(); // mais recente primeiro
  });

  app.post('/fluxos', async (req, reply) => {
    try {
      const corpo = esquemaFluxo.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Fluxo inválido', detalhes: corpo.error.issues });
      const problema = await validarResponsaveis(ctx, corpo.data.estagios);
      if (problema) return reply.code(400).send({ erro: problema });
      const fluxo: Fluxo = {
        id: randomUUID(),
        nome: corpo.data.nome,
        emoji: corpo.data.emoji,
        estagios: corpo.data.estagios.map((e) => ({ id: randomUUID(), ...e })),
        ativo: true,
        criadoEm: agoraISO(),
      };
      const fluxos = await ctx.store.listarFluxos();
      fluxos.push(fluxo);
      await ctx.store.salvarFluxos(fluxos);
      await ctx.aoMudarEstado();
      return reply.code(201).send(fluxo);
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.put('/fluxos/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const corpo = esquemaFluxo.partial().safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Edição inválida', detalhes: corpo.error.issues });
      if (corpo.data.estagios) {
        const problema = await validarResponsaveis(ctx, corpo.data.estagios);
        if (problema) return reply.code(400).send({ erro: problema });
      }
      const fluxos = await ctx.store.listarFluxos();
      const fluxo = fluxos.find((f) => f.id === id);
      if (!fluxo) return reply.code(404).send({ erro: 'Fluxo não encontrado' });
      const emAndamento = (await ctx.store.listarExecucoesFluxos()).some(
        (e) => e.fluxoId === id && ['em_andamento', 'aguardando_aprovacao'].includes(e.status),
      );
      if (emAndamento && corpo.data.estagios) {
        return reply.code(409).send({ erro: 'Há execução em andamento — conclua ou cancele antes de mudar os estágios' });
      }
      Object.assign(fluxo, {
        ...corpo.data,
        ...(corpo.data.estagios
          ? { estagios: corpo.data.estagios.map((e) => ({ id: randomUUID(), ...e })) }
          : {}),
      });
      await ctx.store.salvarFluxos(fluxos);
      await ctx.aoMudarEstado();
      return fluxo;
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.delete('/fluxos/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const emAndamento = (await ctx.store.listarExecucoesFluxos()).some(
        (e) => e.fluxoId === id && ['em_andamento', 'aguardando_aprovacao'].includes(e.status),
      );
      if (emAndamento) {
        return reply.code(409).send({ erro: 'Há execução em andamento — conclua ou cancele antes de excluir' });
      }
      const fluxos = await ctx.store.listarFluxos();
      const idx = fluxos.findIndex((f) => f.id === id);
      if (idx < 0) return reply.code(404).send({ erro: 'Fluxo não encontrado' });
      fluxos.splice(idx, 1);
      await ctx.store.salvarFluxos(fluxos);
      await ctx.aoMudarEstado();
      return { ok: true };
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.post('/fluxos/:id/disparar', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const corpo = z
        .object({ titulo: z.string().min(1).max(120), entrada: z.string().max(6000).default('') })
        .safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Disparo inválido', detalhes: corpo.error.issues });
      const execucao = await ctx.fluxos.disparar(id, corpo.data.titulo, corpo.data.entrada, { tipo: 'manual' });
      return reply.code(201).send(execucao);
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.post('/fluxos/execucoes/:id/aprovar', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      await ctx.fluxos.aprovar(id);
      return { ok: true };
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.post('/fluxos/execucoes/:id/refazer', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const corpo = z.object({ feedback: z.string().min(1).max(4000) }).safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Envie o feedback do que refazer' });
      await ctx.fluxos.refazer(id, corpo.data.feedback);
      return { ok: true };
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.post('/fluxos/execucoes/:id/cancelar', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      await ctx.fluxos.cancelar(id);
      return { ok: true };
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });
}
