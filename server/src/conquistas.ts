// Conquistas REAIS (backlog 5): marcos de verdade da agência, avaliados sobre os
// dados reais (projetos, livro-razão, equipe, meta). As bloqueadas aparecem no
// painel como metas; desbloquear é 1x (persistido) e vira toast dourado + Telegram.

import { agoraISO } from './config.js';
import { fluxoMensal } from './financeiro/motor.js';
import { notificarCelular } from './notificar/telegram.js';
import type { Store } from './store/db.js';
import type {
  ConfigPonte,
  ConquistaReal,
  FuncionarioAgente,
  Lancamento,
  ProjetoReal,
} from './store/tipos.js';
import type { TempoReal } from './tempoReal.js';

export const DEFS_CONQUISTAS: Omit<ConquistaReal, 'quando'>[] = [
  { id: 'primeira_entrega', emoji: '🚀', titulo: 'Primeira entrega', descricao: 'Entregue o 1º projeto real de um cliente.' },
  { id: 'selo_qa', emoji: '✅', titulo: 'Selo de qualidade', descricao: 'Tenha um projeto aprovado pelo QA automático.' },
  { id: 'codigo_no_ar', emoji: '🔀', titulo: 'Código no ar', descricao: 'Um funcionário abriu o 1º Pull Request real.' },
  { id: 'dez_mil_recebidos', emoji: '💰', titulo: 'R$ 10 mil na conta', descricao: 'Receba R$ 10.000 acumulados de clientes.' },
  { id: 'mes_no_azul', emoji: '📈', titulo: 'Mês no azul', descricao: 'Feche um mês com lucro de caixa (recebido > custos).' },
  { id: 'time_de_verdade', emoji: '👥', titulo: 'Time de verdade', descricao: 'Tenha 3 funcionários-agentes ativos ao mesmo tempo.' },
  { id: 'meta_esmagada', emoji: '🎯', titulo: 'Meta esmagada', descricao: 'Bata a meta de vendas de um mês.' },
  { id: 'cliente_fiel', emoji: '🤝', titulo: 'Cliente fiel', descricao: 'Feche o 2º projeto com o mesmo cliente.' },
];

export interface DadosConquistas {
  projetos: ProjetoReal[];
  funcionarios: FuncionarioAgente[];
  lancamentos: Lancamento[];
  config: Pick<ConfigPonte, 'metaBatidaMes'>;
}

/** Avaliação pura: quais conquistas os dados atuais sustentam. */
export function avaliarConquistas(dados: DadosConquistas): Set<string> {
  const { projetos, funcionarios, lancamentos, config } = dados;
  const atingidas = new Set<string>();

  if (projetos.some((p) => p.status === 'entregue')) atingidas.add('primeira_entrega');
  if (projetos.some((p) => p.qaResultado === 'aprovado')) atingidas.add('selo_qa');
  if (projetos.some((p) => p.prUrl)) atingidas.add('codigo_no_ar');

  const recebido = lancamentos.filter((l) => l.tipo === 'recebimento').reduce((s, l) => s + l.valorBRL, 0);
  if (recebido >= 10_000) atingidas.add('dez_mil_recebidos');

  if (fluxoMensal(lancamentos).some((m) => m.entradasBRL > 0 && m.saldoBRL > 0)) atingidas.add('mes_no_azul');

  if (funcionarios.filter((f) => f.status === 'ativo').length >= 3) atingidas.add('time_de_verdade');

  if (config.metaBatidaMes) atingidas.add('meta_esmagada');

  const porCliente = new Map<string, number>();
  for (const p of projetos) {
    if (p.status === 'rascunho') continue; // conta só contrato fechado (venda registrada)
    const chave = p.cliente.trim().toLowerCase();
    porCliente.set(chave, (porCliente.get(chave) ?? 0) + 1);
  }
  if ([...porCliente.values()].some((n) => n >= 2)) atingidas.add('cliente_fiel');

  return atingidas;
}

/** Monta a lista completa (desbloqueadas com data + bloqueadas como metas). */
export function listaConquistas(desbloqueadas: Record<string, string>): ConquistaReal[] {
  return DEFS_CONQUISTAS.map((d) => ({ ...d, quando: desbloqueadas[d.id] ?? null }));
}

/**
 * Reavalia e persiste: novas conquistas ganham timestamp, alerta na cena
 * (toast dourado) e aviso no celular. Nunca "des-conquista" — troféu é troféu.
 */
export async function verificarConquistas(store: Store, tempoReal: TempoReal): Promise<void> {
  const [projetos, funcionarios, lancamentos, config, salvas] = await Promise.all([
    store.listarProjetos(),
    store.listarFuncionarios(),
    store.listarLancamentos(),
    store.lerConfig(),
    store.lerConquistas(),
  ]);
  const atingidas = avaliarConquistas({ projetos, funcionarios, lancamentos, config });
  const novas = [...atingidas].filter((id) => !salvas[id]);
  if (!novas.length) return;
  for (const id of novas) salvas[id] = agoraISO();
  await store.salvarConquistas(salvas);
  for (const id of novas) {
    const def = DEFS_CONQUISTAS.find((d) => d.id === id);
    if (!def) continue;
    const msg = `🏆 Conquista desbloqueada: ${def.emoji} ${def.titulo} — ${def.descricao}`;
    tempoReal.enviar('alerta', { tipo: 'conquista', mensagem: msg });
    notificarCelular(msg);
  }
}
