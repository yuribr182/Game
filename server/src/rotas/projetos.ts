// Projetos: cadastro com spec estruturada, iniciar/pausar/retomar/entregar, atividade e chat.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { agoraISO } from '../config.js';
import type { ProjetoReal } from '../store/tipos.js';
import { FUNCIONARIO_EQUIPE, ehResponsavelTime, idDoTime } from '../store/tipos.js';
import { responderErro, type Contexto } from './contexto.js';

const esquemaSpec = z.object({
  objetivo: z.string().min(1).max(8000),
  escopo: z.string().min(1).max(8000),
  foraDoEscopo: z.string().max(8000).optional(),
  requisitosTecnicos: z.string().max(8000).optional(),
  designReferencias: z.string().max(8000).optional(),
  entregaveis: z.string().min(1).max(8000),
  criteriosAceite: z.string().min(1).max(8000),
  observacoes: z.string().max(8000).optional(),
  anexos: z.array(z.string().min(1)).max(20).optional(),
});

const esquemaProjeto = z
  .object({
    nome: z.string().min(1).max(80),
    cliente: z.string().min(1).max(80),
    emoji: z.string().min(1).max(8).default('📦'),
    tipo: z.enum(['codigo', 'entrega']),
    spec: esquemaSpec,
    repoUrl: z.string().max(300).optional(),
    branch: z.string().max(120).optional(),
    valorContratoBRL: z.number().positive().max(100_000_000),
    pagamento: z.object({
      forma: z.enum(['avista', 'parcelado']),
      parcelas: z.number().int().min(1).max(48).optional(),
      entradaBRL: z.number().min(0).optional(),
    }),
    prazoDias: z.number().int().min(1).max(365),
    funcionarioId: z.string().min(1),
    qaAtivo: z.boolean().optional(), // F4a — padrão true, aplicado na criação
    abrirPR: z.boolean().optional(), // F4d — só faz sentido em tipo codigo
  })
  .superRefine((p, ctx) => {
    if (p.tipo === 'codigo') {
      if (!p.repoUrl?.startsWith('https://github.com/')) {
        ctx.addIssue({
          code: 'custom',
          path: ['repoUrl'],
          message: 'Projeto de código exige repoUrl do GitHub (https://github.com/...)',
        });
      }
    }
    if (p.pagamento.forma === 'parcelado') {
      if (!p.pagamento.parcelas) {
        ctx.addIssue({ code: 'custom', path: ['pagamento', 'parcelas'], message: 'Informe o número de parcelas' });
      }
      if ((p.pagamento.entradaBRL ?? 0) >= p.valorContratoBRL) {
        ctx.addIssue({
          code: 'custom',
          path: ['pagamento', 'entradaBRL'],
          message: 'A entrada precisa ser menor que o valor do contrato',
        });
      }
    }
  });

export function rotasProjetos(app: FastifyInstance, ctx: Contexto): void {
  app.get('/projetos', async () => ctx.store.listarProjetos());

  app.post('/projetos', async (req, reply) => {
    try {
      const corpo = esquemaProjeto.safeParse(req.body);
      if (!corpo.success) {
        return reply.code(400).send({ erro: 'Cadastro inválido', detalhes: corpo.error.issues });
      }
      const funcionarios = await ctx.store.listarFuncionarios();
      if (corpo.data.funcionarioId === FUNCIONARIO_EQUIPE) {
        // Gerente de IA delega para o roster inteiro (backlog 1)
        if (!funcionarios.some((f) => f.status === 'ativo')) {
          return reply.code(400).send({ erro: 'Contrate pelo menos 1 funcionário para usar o Gerente de IA' });
        }
      } else if (ehResponsavelTime(corpo.data.funcionarioId)) {
        // Time dinâmico (T1): o coordenador do time delega entre os membros
        const time = (await ctx.store.listarTimes()).find(
          (t) => t.id === idDoTime(corpo.data.funcionarioId) && t.status === 'ativo',
        );
        if (!time) return reply.code(400).send({ erro: 'Time responsável inválido ou arquivado' });
        if (!funcionarios.some((f) => time.membros.includes(f.id) && f.status === 'ativo')) {
          return reply.code(400).send({ erro: `O time "${time.nome}" não tem membros ativos` });
        }
      } else {
        const responsavel = funcionarios.find(
          (f) => f.id === corpo.data.funcionarioId && f.status === 'ativo',
        );
        if (!responsavel) return reply.code(400).send({ erro: 'Funcionário responsável inválido ou arquivado' });
      }

      const projeto: ProjetoReal = {
        id: randomUUID(),
        ...corpo.data,
        qaAtivo: corpo.data.qaAtivo ?? true, // QA automático é o padrão (F4a)
        abrirPR: corpo.data.tipo === 'codigo' ? (corpo.data.abrirPR ?? true) : false,
        criadoEm: agoraISO(),
        sessionId: null,
        etapasTotais: 0,
        etapasConcluidas: 0,
        resumoAtual: '',
        status: 'rascunho',
        custoUSD: 0,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      };
      const projetos = await ctx.store.listarProjetos();
      projetos.push(projeto);
      await ctx.store.salvarProjetos(projetos);
      await ctx.aoMudarEstado();
      return reply.code(201).send(projeto);
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.put('/projetos/:id', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const projetos = await ctx.store.listarProjetos();
      const projeto = projetos.find((p) => p.id === id);
      if (!projeto) return reply.code(404).send({ erro: 'Projeto não encontrado' });
      if (!['rascunho', 'pausado'].includes(projeto.status)) {
        return reply.code(409).send({ erro: 'Só dá para editar projetos em rascunho ou pausados' });
      }
      const corpo = esquemaProjeto.partial().safeParse(req.body);
      if (!corpo.success) {
        return reply.code(400).send({ erro: 'Edição inválida', detalhes: corpo.error.issues });
      }
      // campos de andamento (sessionId, custo, etapas...) nunca vêm do cliente
      Object.assign(projeto, corpo.data);
      await ctx.store.salvarProjetos(projetos);
      await ctx.aoMudarEstado();
      return projeto;
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.post('/projetos/:id/iniciar', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const projetos = await ctx.store.listarProjetos();
      const projeto = projetos.find((p) => p.id === id);
      if (!projeto) return reply.code(404).send({ erro: 'Projeto não encontrado' });
      if (projeto.status !== 'rascunho') {
        return reply.code(409).send({ erro: `Projeto já está '${projeto.status}'` });
      }
      const funcionarios = await ctx.store.listarFuncionarios();
      if (projeto.funcionarioId === FUNCIONARIO_EQUIPE) {
        if (!funcionarios.some((f) => f.status === 'ativo')) {
          return reply.code(400).send({ erro: 'O Gerente de IA precisa de pelo menos 1 funcionário ativo' });
        }
        await ctx.sessoes.iniciar(projeto, null);
      } else if (ehResponsavelTime(projeto.funcionarioId)) {
        const time = (await ctx.store.listarTimes()).find(
          (t) => t.id === idDoTime(projeto.funcionarioId) && t.status === 'ativo',
        );
        if (!time) return reply.code(400).send({ erro: 'Time responsável indisponível' });
        if (!funcionarios.some((f) => time.membros.includes(f.id) && f.status === 'ativo')) {
          return reply.code(400).send({ erro: `O time "${time.nome}" não tem membros ativos` });
        }
        await ctx.sessoes.iniciar(projeto, null);
      } else {
        const responsavel = funcionarios.find((f) => f.id === projeto.funcionarioId);
        if (!responsavel || responsavel.status !== 'ativo') {
          return reply.code(400).send({ erro: 'Funcionário responsável indisponível' });
        }
        await ctx.sessoes.iniciar(projeto, responsavel);
      }
      return await ctx.store.listarProjetos().then((ps) => ps.find((p) => p.id === id));
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.post('/projetos/:id/pausar', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const projeto = (await ctx.store.listarProjetos()).find((p) => p.id === id);
      if (!projeto) return reply.code(404).send({ erro: 'Projeto não encontrado' });
      if (projeto.status !== 'em_andamento') {
        return reply.code(409).send({ erro: 'Só dá para pausar projetos em andamento' });
      }
      await ctx.sessoes.pausar(id, 'manual');
      return { ok: true };
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.post('/projetos/:id/retomar', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const corpo = z.object({ feedback: z.string().max(8000).optional() }).safeParse(req.body ?? {});
      if (!corpo.success) return reply.code(400).send({ erro: 'Feedback inválido' });
      const projeto = (await ctx.store.listarProjetos()).find((p) => p.id === id);
      if (!projeto) return reply.code(404).send({ erro: 'Projeto não encontrado' });
      if (!['pausado', 'aguardando_revisao'].includes(projeto.status)) {
        return reply.code(409).send({ erro: 'Só dá para retomar projetos pausados ou aguardando revisão' });
      }
      await ctx.sessoes.retomar(id, corpo.data.feedback);
      return { ok: true };
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.post('/projetos/:id/entregar', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const resultado = await ctx.sessoes.entregar(id);
      return resultado;
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  // chat com o funcionário no meio do trabalho (vira user.message na sessão)
  app.post('/projetos/:id/mensagem', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const corpo = z.object({ texto: z.string().min(1).max(8000) }).safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'Mensagem inválida' });
      const projeto = (await ctx.store.listarProjetos()).find((p) => p.id === id);
      if (!projeto?.sessionId) return reply.code(409).send({ erro: 'Projeto sem sessão ativa' });
      await ctx.sessoes.enviarMensagem(projeto.sessionId, corpo.data.texto);
      await ctx.store.anexarAtividade(id, {
        ts: agoraISO(),
        tipo: 'sistema',
        texto: `Dono: ${corpo.data.texto.slice(0, 500)}`,
      });
      return { ok: true };
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });

  app.get('/projetos/:id/atividade', async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const { limite } = req.query as { limite?: string };
      const tudo = await ctx.store.listarAtividade(id);
      const n = Math.max(1, Math.min(1000, Number(limite) || 200));
      return tudo.slice(-n);
    } catch (erro) {
      return responderErro(reply, erro);
    }
  });
}
