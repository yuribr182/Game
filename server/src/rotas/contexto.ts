// Dependências compartilhadas pelas rotas + tradução de erros para HTTP.

import type { FastifyReply } from 'fastify';
import Anthropic from '@anthropic-ai/sdk';
import type { GerenciadorPropostas } from '../anthropic/propostas.js';
import type { GerenciadorSessoes } from '../anthropic/sessoes.js';
import type { GerenciadorStandup } from '../anthropic/standup.js';
import { ErroPonte } from '../anthropic/cliente.js';
import type { Store } from '../store/db.js';
import type { TempoReal } from '../tempoReal.js';

export interface Contexto {
  store: Store;
  tempoReal: TempoReal;
  sessoes: GerenciadorSessoes;
  standup: GerenciadorStandup;
  propostas: GerenciadorPropostas;
  aoMudarEstado: () => Promise<void>;
  rodarRotinaDiaria: () => Promise<void>;
}

export function responderErro(reply: FastifyReply, erro: unknown): void {
  if (erro instanceof ErroPonte) {
    void reply.code(erro.status).send({ erro: erro.message });
    return;
  }
  if (erro instanceof Anthropic.APIError) {
    void reply.code(502).send({ erro: `API da Anthropic: ${erro.message}` });
    return;
  }
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  void reply.code(500).send({ erro: mensagem });
}
