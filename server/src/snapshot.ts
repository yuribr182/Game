// Snapshot do estado da empresa — o que o RealAdapter (F2) vai consumir em GET /estado.

import { hojeISO } from './config.js';
import { marcarAtrasadas, resumoFinanceiro, type ResumoFinanceiro } from './financeiro/motor.js';
import type { Store } from './store/db.js';
import type { ConfigPonte, FuncionarioAgente, ProjetoReal, RelatorioStandup } from './store/tipos.js';

export interface Snapshot {
  agora: string;
  funcionarios: FuncionarioAgente[];
  projetos: ProjetoReal[];
  financeiro: ResumoFinanceiro;
  standups: RelatorioStandup[]; // mais recente primeiro (F4b)
  config: Pick<
    ConfigPonte,
    | 'cambioUsdBrl'
    | 'limiteDiarioUSD'
    | 'limitePorProjetoUSD'
    | 'standupAtivo'
    | 'standupHora'
    | 'metaMensalBRL'
    | 'metaBatidaMes'
  >;
}

export async function montarSnapshot(store: Store): Promise<Snapshot> {
  const hoje = hojeISO();
  const [funcionarios, projetos, lancamentos, contas, config, standups] = await Promise.all([
    store.listarFuncionarios(),
    store.listarProjetos(),
    store.listarLancamentos(),
    store.listarContasReceber(),
    store.lerConfig(),
    store.listarStandups(5),
  ]);
  if (marcarAtrasadas(contas, hoje)) await store.salvarContasReceber(contas);
  return {
    agora: new Date().toISOString(),
    funcionarios,
    projetos,
    financeiro: resumoFinanceiro(lancamentos, contas, hoje),
    standups,
    config: {
      cambioUsdBrl: config.cambioUsdBrl,
      limiteDiarioUSD: config.limiteDiarioUSD,
      limitePorProjetoUSD: config.limitePorProjetoUSD,
      standupAtivo: config.standupAtivo,
      standupHora: config.standupHora,
      metaMensalBRL: config.metaMensalBRL,
      metaBatidaMes: config.metaBatidaMes ?? null,
    },
  };
}
