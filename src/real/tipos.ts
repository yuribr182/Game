/* Modo Empresa Real — espelho (mínimo) dos tipos da ponte (server/src/store/tipos.ts).
   Só os campos que o front consome; a fonte da verdade é o server. */

export type CargoId = 'junior' | 'pleno' | 'senior' | 'designer' | 'qa' | 'manager';

export interface FuncionarioReal {
  id: string;
  nome: string;
  cargoVisual: CargoId;
  persona: string;
  skills: string[];
  modelo: string;
  agentId: string | null;
  status: 'ativo' | 'arquivado';
  custoTotalUSD: number;
  custoHojeUSD: number;
  criadoEm: string;
}

/** Squad dinâmico (T1) — coordenador multiagente fica só na ponte. */
export interface TimeReal {
  id: string;
  nome: string;
  emoji: string;
  missao: string;
  membros: string[]; // funcionarioIds
  status: 'ativo' | 'arquivado';
  criadoEm: string;
}

/** Prefixo de responsável quando o projeto é de um time ("time:<id>"). */
export const PREFIXO_TIME = 'time:';
export function ehResponsavelTime(funcionarioId: string): boolean {
  return funcionarioId.startsWith(PREFIXO_TIME);
}
export function idDoTime(funcionarioId: string): string {
  return funcionarioId.slice(PREFIXO_TIME.length);
}

// ---- Rotinas 24/7 (T2) ----

export type ContextoRotinaReal = 'crm' | 'projetos' | 'financeiro';
export type AcaoRotinaReal =
  | 'criar_oportunidade'
  | 'registrar_nota_cliente'
  | 'criar_rascunho_projeto'
  | 'disparar_fluxo';

export interface RotinaReal {
  id: string;
  nome: string;
  emoji: string;
  responsavelTipo: 'funcionario' | 'time';
  responsavelId: string;
  hora: string; // HH:MM
  dias: 'todos' | 'uteis';
  briefing: string;
  contexto: ContextoRotinaReal[];
  acoes: AcaoRotinaReal[];
  ativa: boolean;
  ultimaExecucao: string | null;
  criadoEm: string;
}

export interface ExecucaoRotinaReal {
  id: string;
  rotinaId: string;
  data: string;
  texto: string;
  acoesFeitas: string[];
  criadoEm: string;
}

// ---- Fluxos (T3) ----

export interface EstagioFluxoReal {
  id: string;
  nome: string;
  responsavelTipo: 'funcionario' | 'time';
  responsavelId: string;
  instrucao: string;
  aprovacao: 'manual' | 'automatica';
}

export interface FluxoReal {
  id: string;
  nome: string;
  emoji: string;
  estagios: EstagioFluxoReal[];
  ativo: boolean;
  criadoEm: string;
}

export interface CargaEstagioReal {
  estagioId: string;
  estagioNome: string;
  resumo: string;
  arquivos: string[];
  custoUSD: number;
  concluidoEm: string;
}

export type StatusExecucaoFluxoReal =
  | 'em_andamento'
  | 'aguardando_aprovacao'
  | 'concluida'
  | 'cancelada'
  | 'falhou';

export interface ExecucaoFluxoReal {
  id: string;
  fluxoId: string;
  titulo: string;
  entrada: string;
  estagioAtual: number;
  status: StatusExecucaoFluxoReal;
  carga: CargaEstagioReal[];
  erro?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export type StatusProjetoReal =
  | 'rascunho'
  | 'em_andamento'
  | 'pausado'
  | 'aguardando_revisao'
  | 'entregue'
  | 'falhou';

export type ResultadoQAReal =
  | 'avaliando'
  | 'revisar'
  | 'aprovado'
  | 'max_iteracoes'
  | 'reprovado'
  | 'interrompido';

export interface ProjetoRealFront {
  id: string;
  nome: string;
  cliente: string;
  emoji: string;
  tipo: 'codigo' | 'entrega';
  valorContratoBRL: number;
  prazoDias: number;
  criadoEm: string;
  iniciadoEm?: string;
  funcionarioId: string;
  etapasTotais: number;
  etapasConcluidas: number;
  resumoAtual: string;
  status: StatusProjetoReal;
  custoUSD: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  // F4
  qaAtivo?: boolean;
  qaIteracao?: number;
  qaResultado?: ResultadoQAReal | null;
  qaFeedback?: string;
  abrirPR?: boolean;
  prUrl?: string;
}

export interface ResumoFinanceiroReal {
  caixaBRL: number;
  totalAReceberBRL: number;
  atrasadasBRL: number;
  vencendo7DiasBRL: number;
  vendasMesBRL: number;
  recebidoMesBRL: number;
  custoApiMesBRL: number;
  custosFixosMesBRL: number;
  lucroMesBRL: number;
}

export interface RelatorioStandupReal {
  data: string; // yyyy-mm-dd
  texto: string;
  criadoEm: string;
}

// ---- CRM leve (backlog 7) ----

export interface ClienteCRMReal {
  id: string;
  nome: string;
  contato?: string;
  origem?: string;
  observacoes?: string;
  criadoEm: string;
}

export type EtapaFunilReal = 'lead' | 'proposta' | 'fechado' | 'perdido';

export interface OportunidadeCRMReal {
  id: string;
  clienteId: string;
  titulo: string;
  valorEstimadoBRL: number;
  etapa: EtapaFunilReal;
  observacoes?: string;
  criadoEm: string;
  atualizadoEm: string;
  proposta?: {
    status: 'gerando' | 'pronta' | 'falhou';
    arquivos: string[];
    geradaEm?: string;
    erro?: string;
  } | null;
}

// ---- conquistas reais (backlog 5) ----

export interface ConquistaRealFront {
  id: string;
  emoji: string;
  titulo: string;
  descricao: string;
  quando: string | null; // null = bloqueada (vira meta no painel)
}

export interface SnapshotReal {
  agora: string;
  funcionarios: FuncionarioReal[];
  times?: TimeReal[]; // squads dinâmicos (T1)
  rotinas?: RotinaReal[]; // rotinas 24/7 (T2)
  execucoesRotinas?: ExecucaoRotinaReal[]; // feed, mais recente primeiro (T2)
  fluxos?: FluxoReal[]; // esteiras (T3)
  execucoesFluxos?: ExecucaoFluxoReal[]; // mais recente primeiro (T3)
  projetos: ProjetoRealFront[];
  financeiro: ResumoFinanceiroReal;
  standups?: RelatorioStandupReal[]; // mais recente primeiro (F4b)
  crm?: { clientes: ClienteCRMReal[]; oportunidades: OportunidadeCRMReal[] };
  conquistas?: ConquistaRealFront[];
  config: {
    nomeEmpresa?: string;
    cambioUsdBrl: number;
    limiteDiarioUSD: number;
    limitePorProjetoUSD: number;
    standupAtivo?: boolean;
    standupHora?: string;
    metaMensalBRL?: number;
    metaBatidaMes?: string | null;
  };
}

export interface EventoProgresso {
  projetoId: string;
  etapasConcluidas: number;
  etapasTotais: number;
  resumoAtual: string;
}

export interface EventoCusto {
  projetoId: string;
  custoUSD: number;
  custoBRL: number;
  funcionarioId?: string;
}

export interface EventoAlerta {
  tipo: string;
  projetoId?: string;
  mensagem: string;
}

export interface EntradaAtividadeReal {
  ts: string;
  tipo: 'mensagem' | 'ferramenta' | 'progresso' | 'custo' | 'sistema' | 'qa';
  texto: string;
}

export type NomeEventoReal = 'snapshot' | 'progresso' | 'atividade' | 'custo' | 'alerta';

/** Canal que o adapter expõe em window.Game.real para os painéis do modo real. */
export interface PonteRealApi {
  snapshot(): SnapshotReal | null;
  on(nome: NomeEventoReal, fn: (dados: unknown) => void): void;
  resumo(projetoId: string): string;
}
