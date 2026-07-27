// Snapshot do estado da empresa — o que o RealAdapter (F2) vai consumir em GET /estado.

import { hojeISO } from './config.js';
import { listaConquistas } from './conquistas.js';
import { marcarAtrasadas, resumoFinanceiro, type ResumoFinanceiro } from './financeiro/motor.js';
import type { Store } from './store/db.js';
import type {
  ClienteCRM,
  ConfigPonte,
  ConquistaReal,
  FuncionarioAgente,
  OportunidadeCRM,
  ProjetoReal,
  RelatorioStandup,
} from './store/tipos.js';

export interface Snapshot {
  agora: string;
  funcionarios: FuncionarioAgente[];
  projetos: ProjetoReal[];
  financeiro: ResumoFinanceiro;
  standups: RelatorioStandup[]; // mais recente primeiro (F4b)
  crm: { clientes: ClienteCRM[]; oportunidades: OportunidadeCRM[] }; // backlog 7
  conquistas: ConquistaReal[]; // backlog 5 — bloqueadas viram metas
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
  const [funcionarios, projetos, lancamentos, contas, config, standups, clientes, oportunidades, conquistas] =
    await Promise.all([
      store.listarFuncionarios(),
      store.listarProjetos(),
      store.listarLancamentos(),
      store.listarContasReceber(),
      store.lerConfig(),
      store.listarStandups(5),
      store.listarClientes(),
      store.listarOportunidades(),
      store.lerConquistas(),
    ]);
  if (marcarAtrasadas(contas, hoje)) await store.salvarContasReceber(contas);
  return {
    agora: new Date().toISOString(),
    funcionarios,
    projetos,
    financeiro: resumoFinanceiro(lancamentos, contas, hoje),
    standups,
    crm: { clientes, oportunidades },
    conquistas: listaConquistas(conquistas),
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
