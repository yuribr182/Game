// Snapshot do estado da empresa — o que o RealAdapter (F2) vai consumir em GET /estado.

import { hojeISO } from './config.js';
import { marcarAtrasadas, resumoFinanceiro, type ResumoFinanceiro } from './financeiro/motor.js';
import type { Store } from './store/db.js';
import type { ConfigPonte, FuncionarioAgente, ProjetoReal } from './store/tipos.js';

export interface Snapshot {
  agora: string;
  funcionarios: FuncionarioAgente[];
  projetos: ProjetoReal[];
  financeiro: ResumoFinanceiro;
  config: Pick<ConfigPonte, 'cambioUsdBrl' | 'limiteDiarioUSD' | 'limitePorProjetoUSD'>;
}

export async function montarSnapshot(store: Store): Promise<Snapshot> {
  const hoje = hojeISO();
  const [funcionarios, projetos, lancamentos, contas, config] = await Promise.all([
    store.listarFuncionarios(),
    store.listarProjetos(),
    store.listarLancamentos(),
    store.listarContasReceber(),
    store.lerConfig(),
  ]);
  if (marcarAtrasadas(contas, hoje)) await store.salvarContasReceber(contas);
  return {
    agora: new Date().toISOString(),
    funcionarios,
    projetos,
    financeiro: resumoFinanceiro(lancamentos, contas, hoje),
    config: {
      cambioUsdBrl: config.cambioUsdBrl,
      limiteDiarioUSD: config.limiteDiarioUSD,
      limitePorProjetoUSD: config.limitePorProjetoUSD,
    },
  };
}
