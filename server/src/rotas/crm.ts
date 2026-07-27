// CRM leve com funil comercial (backlog 7): clientes + oportunidades
// (lead → proposta → fechado | perdido). LTV/histórico o front deriva dos
// projetos reais do snapshot — aqui é só o cadastro comercial.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { agoraISO } from '../config.js';
import type { ClienteCRM, OportunidadeCRM } from '../store/tipos.js';
import { responderErro, type Contexto } from './contexto.js';

const esquemaCliente = z.object({
  nome: z.string().min(1).max(80),
  contato: z.string().max(160).optional(),
  origem: z.string().max(80).optional(),
  observacoes: z.string().max(2000).optional(),
});

const esquemaOportunidade = z.object({
  clienteId: z.string().min(1),
  titulo: z.string().min(1).max(120),
  valorEstimadoBRL: z.number().min(0).max(100_000_000),
  observacoes: z.string().max(2000).optional(),
});

const esquemaEdicaoOportunidade = z.object({
  etapa: z.enum(['lead', 'proposta', 'fechado', 'perdido']).optional(),
  titulo: z.string().min(1).max(120).optional(),
  valorEstimadoBRL: z.number().min(0).max(100_000_000).optional(),
  observacoes: z.string().max(2000).optional(),
});

export function rotasCrm(app: FastifyInstance, ctx: Contexto): void {
  // ---- clientes ----

  app.get('/crm/clientes', async () => ctx.store.listarClientes());

  app.post('/crm/clientes', async (req, reply) => {
    try {
      const corpo = esquemaCliente.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Cliente inválido', detalhes: corpo.error.issues });
      const clientes = await ctx.store.listarClientes();
      if (clientes.some((c) => c.nome.trim().toLowerCase() === corpo.data.nome.trim().toLowerCase())) {
        return reply.code(409).send({ erro: 'Já existe um cliente com esse nome' });
      }
      const cliente: ClienteCRM = { id: randomUUID(), ...corpo.data, criadoEm: agoraISO() };
      clientes.push(cliente);
      await ctx.store.salvarClientes(clientes);
      await ctx.aoMudarEstado();
      return reply.code(201).send(cliente);
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.put('/crm/clientes/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const corpo = esquemaCliente.partial().safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Edição inválida', detalhes: corpo.error.issues });
      const clientes = await ctx.store.listarClientes();
      const cliente = clientes.find((c) => c.id === id);
      if (!cliente) return reply.code(404).send({ erro: 'Cliente não encontrado' });
      Object.assign(cliente, corpo.data);
      await ctx.store.salvarClientes(clientes);
      await ctx.aoMudarEstado();
      return cliente;
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  // ---- oportunidades (funil) ----

  app.get('/crm/oportunidades', async () => ctx.store.listarOportunidades());

  app.post('/crm/oportunidades', async (req, reply) => {
    try {
      const corpo = esquemaOportunidade.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Oportunidade inválida', detalhes: corpo.error.issues });
      const clientes = await ctx.store.listarClientes();
      if (!clientes.some((c) => c.id === corpo.data.clienteId)) {
        return reply.code(400).send({ erro: 'Cliente da oportunidade não existe' });
      }
      const agora = agoraISO();
      const oportunidade: OportunidadeCRM = {
        id: randomUUID(),
        ...corpo.data,
        etapa: 'lead',
        criadoEm: agora,
        atualizadoEm: agora,
      };
      const todas = await ctx.store.listarOportunidades();
      todas.push(oportunidade);
      await ctx.store.salvarOportunidades(todas);
      await ctx.aoMudarEstado();
      return reply.code(201).send(oportunidade);
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.put('/crm/oportunidades/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const corpo = esquemaEdicaoOportunidade.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Edição inválida', detalhes: corpo.error.issues });
      const todas = await ctx.store.listarOportunidades();
      const oportunidade = todas.find((o) => o.id === id);
      if (!oportunidade) return reply.code(404).send({ erro: 'Oportunidade não encontrada' });
      Object.assign(oportunidade, corpo.data);
      oportunidade.atualizadoEm = agoraISO();
      await ctx.store.salvarOportunidades(todas);
      await ctx.aoMudarEstado();
      return oportunidade;
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.delete('/crm/oportunidades/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const todas = await ctx.store.listarOportunidades();
      const restantes = todas.filter((o) => o.id !== id);
      if (restantes.length === todas.length) return reply.code(404).send({ erro: 'Oportunidade não encontrada' });
      await ctx.store.salvarOportunidades(restantes);
      await ctx.aoMudarEstado();
      return { ok: true };
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });
}
