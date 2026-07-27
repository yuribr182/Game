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
  projetos: ProjetoRealFront[];
  financeiro: ResumoFinanceiroReal;
  standups?: RelatorioStandupReal[]; // mais recente primeiro (F4b)
  crm?: { clientes: ClienteCRMReal[]; oportunidades: OportunidadeCRMReal[] };
  conquistas?: ConquistaRealFront[];
  config: {
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
