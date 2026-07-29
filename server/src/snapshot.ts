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
  ExecucaoFluxo,
  ExecucaoRotina,
  Fluxo,
  OportunidadeCRM,
  ProjetoReal,
  RelatorioStandup,
  Rotina,
  Time,
} from './store/tipos.js';

export interface Snapshot {
  agora: string;
  funcionarios: FuncionarioAgente[];
  times: Omit<Time, 'coordenadorAgentId' | 'coordenadorVersion' | 'coordenadorRoster'>[]; // squads (T1) — ids de Agent nunca chegam ao browser
  projetos: ProjetoReal[];
  financeiro: ResumoFinanceiro;
  standups: RelatorioStandup[]; // mais recente primeiro (F4b)
  rotinas: Omit<Rotina, 'agentId' | 'deploymentId' | 'agendaAplicada' | 'rosterAplicado'>[]; // T2
  execucoesRotinas: ExecucaoRotina[]; // feed, mais recente primeiro (T2)
  fluxos: Fluxo[]; // esteiras (T3)
  execucoesFluxos: ExecucaoFluxo[]; // mais recente primeiro (T3)
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
  const [funcionarios, times, projetos, lancamentos, contas, config, standups, clientes, oportunidades, conquistas] =
    await Promise.all([
      store.listarFuncionarios(),
      store.listarTimes(),
      store.listarProjetos(),
      store.listarLancamentos(),
      store.listarContasReceber(),
      store.lerConfig(),
      store.listarStandups(5),
      store.listarClientes(),
      store.listarOportunidades(),
      store.lerConquistas(),
    ]);
  const [rotinas, execucoesRotinas, fluxos, execucoesFluxos] = await Promise.all([
    store.listarRotinas(),
    store.listarExecucoesRotinas(15),
    store.listarFluxos(),
    store.listarExecucoesFluxos(),
  ]);
  if (marcarAtrasadas(contas, hoje)) await store.salvarContasReceber(contas);
  return {
    agora: new Date().toISOString(),
    funcionarios,
    times: times.map(({ coordenadorAgentId: _a, coordenadorVersion: _v, coordenadorRoster: _r, ...t }) => t),
    projetos,
    financeiro: resumoFinanceiro(lancamentos, contas, hoje),
    standups,
    rotinas: rotinas.map(
      ({ agentId: _a, deploymentId: _d, agendaAplicada: _g, rosterAplicado: _r, ...r }) => r,
    ),
    execucoesRotinas,
    fluxos,
    execucoesFluxos: [...execucoesFluxos].reverse().slice(0, 20),
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
