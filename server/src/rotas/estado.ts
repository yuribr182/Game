// Saúde da ponte, snapshot para o adapter e o canal SSE de tempo real.

import type { FastifyInstance } from 'fastify';
import { temChaveApi } from '../anthropic/cliente.js';
import { montarSnapshot } from '../snapshot.js';
import { responderErro, type Contexto } from './contexto.js';

export function rotasEstado(app: FastifyInstance, ctx: Contexto): void {
  app.get('/saude', async () => ({
    ok: true,
    servico: 'empresa-real-ponte',
    temChaveApi: temChaveApi(),
    conectadosSSE: ctx.tempoReal.conectados,
  }));

  app.get('/estado', async (_req, reply) => {
    try {
      return await montarSnapshot(ctx.store);
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.get('/stream', (req, reply) => {
    reply.hijack();
    ctx.tempoReal.adicionar(reply.raw);
    req.raw.on('close', () => {
      /* remoção acontece no 'close' do response dentro do TempoReal */
    });
  });
}
