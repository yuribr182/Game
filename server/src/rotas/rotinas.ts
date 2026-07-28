// Rotinas 24/7 (T2): CRUD + disparo manual + feed de execuções.
// Criar/editar só cadastra; o Agent + deployment (cron) são garantidos de
// forma assíncrona (ligar/rodar) para o cadastro nunca depender da API.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { agoraISO } from '../config.js';
import type { Rotina } from '../store/tipos.js';
import { responderErro, type Contexto } from './contexto.js';

const esquemaRotina = z.object({
  nome: z.string().min(1).max(80),
  emoji: z.string().min(1).max(8).default('🔁'),
  responsavelTipo: z.enum(['funcionario', 'time']),
  responsavelId: z.string().min(1),
  hora: z.string().regex(/^\d{1,2}:\d{2}$/, 'hora no formato HH:MM'),
  dias: z.enum(['todos', 'uteis']).default('uteis'),
  briefing: z.string().min(10).max(6000),
  contexto: z.array(z.enum(['crm', 'projetos', 'financeiro'])).default([]),
  acoes: z.array(z.enum(['criar_oportunidade', 'registrar_nota_cliente', 'criar_rascunho_projeto'])).default([]),
});

async function validarResponsavel(
  ctx: Contexto,
  tipo: 'funcionario' | 'time',
  id: string,
): Promise<string | null> {
  if (tipo === 'time') {
    const time = (await ctx.store.listarTimes()).find((t) => t.id === id && t.status === 'ativo');
    return time ? null : 'Time responsável inválido ou arquivado';
  }
  const f = (await ctx.store.listarFuncionarios()).find((x) => x.id === id && x.status === 'ativo');
  return f ? null : 'Funcionário responsável inválido ou arquivado';
}

export function rotasRotinas(app: FastifyInstance, ctx: Contexto): void {
  app.get('/rotinas', async () => ctx.store.listarRotinas());

  app.get('/rotinas/execucoes', async (req) => {
    const { limite } = req.query as { limite?: string };
    return ctx.store.listarExecucoesRotinas(Math.min(100, Number(limite) || 20));
  });

  app.post('/rotinas', async (req, reply) => {
    try {
      const corpo = esquemaRotina.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Rotina inválida', detalhes: corpo.error.issues });
      const problema = await validarResponsavel(ctx, corpo.data.responsavelTipo, corpo.data.responsavelId);
      if (problema) return reply.code(400).send({ erro: problema });
      const rotina: Rotina = {
        id: randomUUID(),
        ...corpo.data,
        ativa: true,
        agentId: null,
        deploymentId: null,
        agendaAplicada: null,
        rosterAplicado: [],
        ultimaExecucao: null,
        criadoEm: agoraISO(),
      };
      const rotinas = await ctx.store.listarRotinas();
      rotinas.push(rotina);
      await ctx.store.salvarRotinas(rotinas);
      // liga o cron em segundo plano (não bloqueia o cadastro se a API estiver fora)
      void ctx.rotinas.garantirTodas().catch(() => undefined);
      await ctx.aoMudarEstado();
      return reply.code(201).send(rotina);
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.put('/rotinas/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const corpo = esquemaRotina.partial().extend({ ativa: z.boolean().optional() }).safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Edição inválida', detalhes: corpo.error.issues });
      if (corpo.data.responsavelTipo && corpo.data.responsavelId) {
        const problema = await validarResponsavel(ctx, corpo.data.responsavelTipo, corpo.data.responsavelId);
        if (problema) return reply.code(400).send({ erro: problema });
      }
      const rotinas = await ctx.store.listarRotinas();
      const rotina = rotinas.find((r) => r.id === id);
      if (!rotina) return reply.code(404).send({ erro: 'Rotina não encontrada' });
      const briefingOuAcoesMudou =
        (corpo.data.briefing && corpo.data.briefing !== rotina.briefing) ||
        (corpo.data.acoes && JSON.stringify(corpo.data.acoes) !== JSON.stringify(rotina.acoes)) ||
        (corpo.data.responsavelId && corpo.data.responsavelId !== rotina.responsavelId);
      Object.assign(rotina, corpo.data);
      // briefing/ações/responsável novos exigem Agent atualizado — zera o roster
      // aplicado para o próximo garantir() forçar o agents.update
      if (briefingOuAcoesMudou) rotina.rosterAplicado = ['_forcar_update_'];
      await ctx.store.salvarRotinas(rotinas);
      void ctx.rotinas.garantirTodas().catch(() => undefined);
      await ctx.aoMudarEstado();
      return rotina;
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.delete('/rotinas/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const rotinas = await ctx.store.listarRotinas();
      const idx = rotinas.findIndex((r) => r.id === id);
      if (idx < 0) return reply.code(404).send({ erro: 'Rotina não encontrada' });
      const [rotina] = rotinas.splice(idx, 1);
      await ctx.store.salvarRotinas(rotinas);
      await ctx.rotinas.desligar(rotina!, true).catch(() => undefined);
      await ctx.aoMudarEstado();
      return { ok: true };
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.post('/rotinas/:id/rodar', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const execucao = await ctx.rotinas.rodarAgora(id);
      return execucao ?? { ok: true, aviso: 'Disparada — o resultado aparece no feed em instantes.' };
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });
}
