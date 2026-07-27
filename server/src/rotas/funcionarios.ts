// Cadastro de funcionários-agentes: POST cria o Agent na Anthropic; PUT usa agents.update.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  atualizarAgenteAnthropic,
  criarAgenteAnthropic,
} from '../anthropic/agentes.js';
import { clienteAnthropic } from '../anthropic/cliente.js';
import { agoraISO, MODELO_PADRAO } from '../config.js';
import type { FuncionarioAgente } from '../store/tipos.js';
import { responderErro, type Contexto } from './contexto.js';

const esquemaFuncionario = z.object({
  nome: z.string().min(1).max(40),
  cargoVisual: z.enum(['junior', 'pleno', 'senior', 'designer', 'qa', 'manager']),
  persona: z.string().max(4000).default(''),
  skills: z.array(z.string().min(1).max(60)).max(24).default([]),
  modelo: z.string().min(1).default(MODELO_PADRAO),
});

export function rotasFuncionarios(app: FastifyInstance, ctx: Contexto): void {
  app.get('/funcionarios', async () => ctx.store.listarFuncionarios());

  app.post('/funcionarios', async (req, reply) => {
    try {
      const corpo = esquemaFuncionario.safeParse(req.body);
      if (!corpo.success) {
        return reply.code(400).send({ erro: 'Cadastro inválido', detalhes: corpo.error.issues });
      }
      const funcionario: FuncionarioAgente = {
        id: randomUUID(),
        ...corpo.data,
        agentId: null,
        agentVersion: null,
        status: 'ativo',
        custoTotalUSD: 0,
        custoHojeUSD: 0,
        criadoEm: agoraISO(),
      };
      // Agent na Anthropic PRIMEIRO — se falhar, nada é salvo localmente.
      const { agentId, agentVersion } = await criarAgenteAnthropic(clienteAnthropic(), funcionario);
      funcionario.agentId = agentId;
      funcionario.agentVersion = agentVersion;

      const todos = await ctx.store.listarFuncionarios();
      todos.push(funcionario);
      await ctx.store.salvarFuncionarios(todos);
      await ctx.aoMudarEstado();
      return reply.code(201).send(funcionario);
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.put('/funcionarios/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const corpo = esquemaFuncionario.partial().safeParse(req.body);
      if (!corpo.success) {
        return reply.code(400).send({ erro: 'Edição inválida', detalhes: corpo.error.issues });
      }
      const todos = await ctx.store.listarFuncionarios();
      const funcionario = todos.find((f) => f.id === id);
      if (!funcionario) return reply.code(404).send({ erro: 'Funcionário não encontrado' });

      Object.assign(funcionario, corpo.data);
      if (funcionario.agentId) {
        // nova versão do Agent — sessões em andamento não quebram
        const { agentVersion } = await atualizarAgenteAnthropic(clienteAnthropic(), funcionario);
        funcionario.agentVersion = agentVersion;
      }
      await ctx.store.salvarFuncionarios(todos);
      await ctx.aoMudarEstado();
      return funcionario;
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.delete('/funcionarios/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const todos = await ctx.store.listarFuncionarios();
      const funcionario = todos.find((f) => f.id === id);
      if (!funcionario) return reply.code(404).send({ erro: 'Funcionário não encontrado' });

      const projetos = await ctx.store.listarProjetos();
      const ocupado = projetos.some(
        (p) =>
          p.funcionarioId === id &&
          ['em_andamento', 'pausado', 'aguardando_revisao'].includes(p.status),
      );
      if (ocupado) {
        return reply
          .code(409)
          .send({ erro: 'Este funcionário tem projeto em aberto — entregue ou pause antes de arquivar.' });
      }
      funcionario.status = 'arquivado'; // o Agent na Anthropic fica (archive lá é permanente)
      await ctx.store.salvarFuncionarios(todos);
      await ctx.aoMudarEstado();
      return { ok: true };
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });
}
