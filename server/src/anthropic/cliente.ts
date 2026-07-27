// Cliente da API da Anthropic — a chave vive só em server/.env (nunca no browser).

import Anthropic from '@anthropic-ai/sdk';

let instancia: Anthropic | null = null;

export class ErroPonte extends Error {
  constructor(
    mensagem: string,
    readonly status = 400,
  ) {
    super(mensagem);
    this.name = 'ErroPonte';
  }
}

export function temChaveApi(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function clienteAnthropic(): Anthropic {
  if (!temChaveApi()) {
    throw new ErroPonte(
      'ANTHROPIC_API_KEY ausente — preencha server/.env (copie de .env.example) e reinicie a ponte.',
      503,
    );
  }
  if (!instancia) instancia = new Anthropic();
  return instancia;
}
