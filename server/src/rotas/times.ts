// Times dinâmicos (PLANO-TIMES-FLUXOS T1): squads montados por demanda.
// Criar/editar não fala com a Anthropic — o Agent coordenador do time é
// criado/atualizado sob demanda (garantirCoordenadorTime) quando um projeto
// do time inicia, para cadastro nunca falhar por indisponibilidade da API.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { agoraISO } from '../config.js';
import type { Time } from '../store/tipos.js';
import { PREFIXO_TIME } from '../store/tipos.js';
import { responderErro, type Contexto } from './contexto.js';

const esquemaTime = z.object({
  nome: z.string().min(1).max(80),
  emoji: z.string().min(1).max(8),
  missao: z.string().max(2000).default(''),
  membros: z.array(z.string().min(1)).min(1).max(20),
});

async function validarMembros(ctx: Contexto, membros: string[]): Promise<string | null> {
  const funcionarios = await ctx.store.listarFuncionarios();
  const ativos = new Set(funcionarios.filter((f) => f.status === 'ativo').map((f) => f.id));
  const invalido = membros.find((id) => !ativos.has(id));
  return invalido ? `Membro inválido ou arquivado: ${invalido}` : null;
}

export function rotasTimes(app: FastifyInstance, ctx: Contexto): void {
  app.get('/times', async () => ctx.store.listarTimes());

  app.post('/times', async (req, reply) => {
    try {
      const corpo = esquemaTime.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Time inválido', detalhes: corpo.error.issues });
      const problema = await validarMembros(ctx, corpo.data.membros);
      if (problema) return reply.code(400).send({ erro: problema });
      const times = await ctx.store.listarTimes();
      if (
        times.some(
          (t) => t.status === 'ativo' && t.nome.trim().toLowerCase() === corpo.data.nome.trim().toLowerCase(),
        )
      ) {
        return reply.code(409).send({ erro: 'Já existe um time ativo com esse nome' });
      }
      const time: Time = {
        id: randomUUID(),
        ...corpo.data,
        coordenadorAgentId: null,
        coordenadorVersion: null,
        coordenadorRoster: [],
        status: 'ativo',
        criadoEm: agoraISO(),
      };
      times.push(time);
      await ctx.store.salvarTimes(times);
      await ctx.aoMudarEstado();
      return reply.code(201).send(time);
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.put('/times/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const corpo = esquemaTime.partial().safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Edição inválida', detalhes: corpo.error.issues });
      if (corpo.data.membros) {
        const problema = await validarMembros(ctx, corpo.data.membros);
        if (problema) return reply.code(400).send({ erro: problema });
      }
      const times = await ctx.store.listarTimes();
      const time = times.find((t) => t.id === id);
      if (!time) return reply.code(404).send({ erro: 'Time não encontrado' });
      // membros/missão novos passam a valer no PRÓXIMO início de projeto do time
      // (garantirCoordenadorTime detecta o roster mudado e faz agents.update)
      Object.assign(time, corpo.data);
      await ctx.store.salvarTimes(times);
      await ctx.aoMudarEstado();
      return time;
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.delete('/times/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const times = await ctx.store.listarTimes();
      const time = times.find((t) => t.id === id);
      if (!time) return reply.code(404).send({ erro: 'Time não encontrado' });
      const abertos = (await ctx.store.listarProjetos()).filter(
        (p) =>
          p.funcionarioId === `${PREFIXO_TIME}${id}` &&
          !['entregue', 'falhou'].includes(p.status) &&
          p.status !== 'rascunho',
      );
      if (abertos.length) {
        return reply
          .code(409)
          .send({ erro: `O time tem ${abertos.length} projeto(s) em aberto — entregue ou pause antes de arquivar` });
      }
      time.status = 'arquivado'; // arquivamento lógico (o Agent na Anthropic permanece)
      await ctx.store.salvarTimes(times);
      await ctx.aoMudarEstado();
      return { ok: true };
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });
}
