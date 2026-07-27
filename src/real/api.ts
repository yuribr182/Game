/* Modo Empresa Real — cliente HTTP/SSE da ponte local (server/, porta 3777 via proxy do Vite).
   O browser NUNCA fala com a Anthropic: só com /api. */

import type { EntradaAtividadeReal, SnapshotReal } from './tipos';

const BASE = '/api';

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(`${BASE}${caminho}`, {
    ...init,
    // content-type JSON só quando HÁ corpo — POST vazio com esse header é 400 no Fastify
    ...(init?.body != null ? { headers: { 'content-type': 'application/json' } } : {}),
  });
  const corpo = (await resposta.json().catch(() => ({}))) as T & { erro?: string };
  if (!resposta.ok) {
    throw new Error(corpo?.erro ?? `Falha ${resposta.status} em ${caminho}`);
  }
  return corpo;
}

/** Detecção de ponte: false = mostrar o overlay "rode npm run empresa". */
export async function pingSaude(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/saude`, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}

export function obterEstado(): Promise<SnapshotReal> {
  return chamar<SnapshotReal>('/estado');
}

export function obterAtividade(projetoId: string, limite = 200): Promise<EntradaAtividadeReal[]> {
  return chamar<EntradaAtividadeReal[]>(`/projetos/${projetoId}/atividade?limite=${limite}`);
}

// ---- cadastros (F3: wizard de projeto e contratação de funcionário) ----

export function criarProjeto(dados: unknown): Promise<unknown> {
  return chamar('/projetos', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarProjeto(id: string, dados: unknown): Promise<unknown> {
  return chamar(`/projetos/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function criarFuncionario(dados: unknown): Promise<unknown> {
  return chamar('/funcionarios', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarFuncionario(id: string, dados: unknown): Promise<unknown> {
  return chamar(`/funcionarios/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function arquivarFuncionario(id: string): Promise<unknown> {
  return chamar(`/funcionarios/${id}`, { method: 'DELETE' });
}

// ---- financeiro ----

export function financeiroResumo(): Promise<unknown> {
  return chamar('/financeiro/resumo');
}

export function financeiroLancamentos(filtros: { de?: string; ate?: string; tipo?: string } = {}): Promise<unknown[]> {
  const q = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v) as [string, string][]);
  return chamar(`/financeiro/lancamentos${q.size ? `?${q.toString()}` : ''}`);
}

export function relatorioVendas(): Promise<unknown> {
  return chamar('/financeiro/relatorios/vendas');
}

export function relatorioFluxo(): Promise<unknown[]> {
  return chamar('/financeiro/relatorios/fluxo');
}

export function relatorioDre(mes?: string): Promise<unknown> {
  return chamar(`/financeiro/relatorios/dre${mes ? `?mes=${mes}` : ''}`);
}

export function relatorioMargem(): Promise<unknown[]> {
  return chamar('/financeiro/relatorios/margem');
}

export function relatorioFuncionarios(): Promise<unknown[]> {
  return chamar('/financeiro/relatorios/funcionarios');
}

export function listarContas(): Promise<unknown[]> {
  return chamar('/financeiro/contas-receber');
}

export function receberConta(id: string): Promise<unknown> {
  return chamar(`/financeiro/contas-receber/${id}/receber`, { method: 'POST' });
}

export function listarCustosFixos(): Promise<unknown[]> {
  return chamar('/financeiro/custos-fixos');
}

export function criarCustoFixo(dados: unknown): Promise<unknown> {
  return chamar('/financeiro/custos-fixos', { method: 'POST', body: JSON.stringify(dados) });
}

export function atualizarCustoFixo(id: string, dados: unknown): Promise<unknown> {
  return chamar(`/financeiro/custos-fixos/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

export function excluirCustoFixo(id: string): Promise<unknown> {
  return chamar(`/financeiro/custos-fixos/${id}`, { method: 'DELETE' });
}

// ---- ações de projeto ----

export function iniciarProjeto(id: string): Promise<unknown> {
  return chamar(`/projetos/${id}/iniciar`, { method: 'POST' });
}

export function pausarProjeto(id: string): Promise<unknown> {
  return chamar(`/projetos/${id}/pausar`, { method: 'POST' });
}

export function retomarProjeto(id: string, feedback?: string): Promise<unknown> {
  return chamar(`/projetos/${id}/retomar`, {
    method: 'POST',
    body: JSON.stringify(feedback ? { feedback } : {}),
  });
}

export function entregarProjeto(id: string): Promise<unknown> {
  return chamar(`/projetos/${id}/entregar`, { method: 'POST' });
}

export function enviarMensagemProjeto(id: string, texto: string): Promise<unknown> {
  return chamar(`/projetos/${id}/mensagem`, { method: 'POST', body: JSON.stringify({ texto }) });
}

// ---- tempo real ----

export interface CanaisStream {
  aoEstado?: (snapshot: SnapshotReal) => void;
  aoProgresso?: (dados: unknown) => void;
  aoAtividade?: (dados: unknown) => void;
  aoCusto?: (dados: unknown) => void;
  aoAlerta?: (dados: unknown) => void;
  aoConectar?: () => void;
  aoCair?: () => void;
}

/** Abre o SSE da ponte; o EventSource reconecta sozinho quando cai. */
export function abrirStream(canais: CanaisStream): EventSource {
  const fonte = new EventSource(`${BASE}/stream`);
  const ligar = (nome: string, cb?: (dados: unknown) => void): void => {
    if (!cb) return;
    fonte.addEventListener(nome, (ev) => {
      try {
        cb(JSON.parse((ev as MessageEvent).data as string));
      } catch {
        /* quadro malformado — ignora */
      }
    });
  };
  fonte.onopen = () => canais.aoConectar?.();
  fonte.onerror = () => canais.aoCair?.();
  ligar('estado', canais.aoEstado as ((d: unknown) => void) | undefined);
  ligar('progresso', canais.aoProgresso);
  ligar('atividade', canais.aoAtividade);
  ligar('custo', canais.aoCusto);
  ligar('alerta', canais.aoAlerta);
  return fonte;
}
