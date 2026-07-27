// Tipos do Modo Empresa Real (espelham docs/PLANO-EMPRESA-REAL.md).

export type CargoId = 'junior' | 'pleno' | 'senior' | 'designer' | 'qa' | 'manager';

export interface FuncionarioAgente {
  id: string;
  nome: string;
  cargoVisual: CargoId; // avatar/mesa na cena
  persona: string; // vira parte do `system` do Agent
  skills: string[]; // chaves de bloco (ex. 'web') ou skills Anthropic ('xlsx') ou 'skill_...'
  modelo: string; // padrão 'claude-opus-5'
  agentId: string | null;
  agentVersion: number | null;
  memoryStoreId?: string | null; // memória profissional (F4e) — criada no 1º projeto
  status: 'ativo' | 'arquivado';
  custoTotalUSD: number;
  custoHojeUSD: number; // "salário do dia"
  custoHojeData?: string; // yyyy-mm-dd a que custoHojeUSD se refere
  criadoEm: string;
}

export interface EspecificacaoProjeto {
  objetivo: string; // o que o projeto resolve / para quê
  escopo: string; // funcionalidades / o que está incluso
  foraDoEscopo?: string;
  requisitosTecnicos?: string; // stack, integrações, restrições
  designReferencias?: string; // identidade visual, links de referência
  entregaveis: string; // o que exatamente deve ser entregue
  criteriosAceite: string; // como saber que está pronto
  observacoes?: string;
  anexos?: string[]; // file_ids (upload via Files API, montados na sessão)
}

export type StatusProjeto =
  | 'rascunho'
  | 'em_andamento'
  | 'pausado'
  | 'aguardando_revisao'
  | 'entregue'
  | 'falhou';

export interface TokensProjeto {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Situação do QA automático (F4a — grader de outcomes, contexto independente). */
export type ResultadoQA =
  | 'avaliando' // grader está avaliando uma rodada agora
  | 'revisar' // grader pediu ajustes; o funcionário já está revisando
  | 'aprovado' // rubric satisfeita
  | 'max_iteracoes' // esgotou as rodadas sem aprovar tudo
  | 'reprovado' // rubric incompatível com a tarefa (failed)
  | 'interrompido'; // pausa/interrupção encerrou o ciclo de QA

export interface ProjetoReal {
  id: string;
  nome: string;
  cliente: string;
  emoji: string;
  tipo: 'codigo' | 'entrega';
  spec: EspecificacaoProjeto;
  repoUrl?: string;
  branch?: string;
  valorContratoBRL: number;
  pagamento: { forma: 'avista' | 'parcelado'; parcelas?: number; entradaBRL?: number };
  prazoDias: number;
  criadoEm: string;
  iniciadoEm?: string;
  entregueEm?: string;
  funcionarioId: string; // 1 agente responsável na v1
  sessionId: string | null;
  kickoffEnviado?: boolean; // spec já enviada à sessão (stream-first garante a ordem)
  qaAtivo?: boolean; // F4a: kickoff vira user.define_outcome (QA antes de aguardando_revisao)
  qaIteracao?: number; // rodada atual do QA (1-based, para exibir)
  qaResultado?: ResultadoQA | null;
  qaFeedback?: string; // última explicação do grader (feedback devolvido ao executor)
  abrirPR?: boolean; // F4d: código — abrir Pull Request real ao final
  prUrl?: string; // link do PR aberto (capturado das mensagens do agente)
  etapasTotais: number;
  etapasConcluidas: number;
  resumoAtual: string;
  status: StatusProjeto;
  motivoPausa?: 'manual' | 'limite_custo' | null;
  custoUSD: number; // consumo de API do projeto
  tokens: TokensProjeto;
}

// ---- Financeiro de agência ----

export interface ContaReceber {
  id: string;
  projetoId: string;
  descricao: string; // ex. "Parcela 2/3 — App X"
  valorBRL: number;
  vencimento: string; // yyyy-mm-dd
  status: 'aberta' | 'recebida' | 'atrasada';
  recebidaEm?: string;
}

export interface CustoFixo {
  id: string;
  nome: string;
  categoria: 'servidor' | 'ferramenta' | 'imposto' | 'outro';
  valorBRL: number;
  recorrencia: 'mensal' | 'anual' | 'unico';
  diaVencimento: number; // 1-28
  mesVencimento?: number; // 1-12 — só para recorrência anual
  dataUnica?: string; // yyyy-mm-dd — só para recorrência 'unico'
  ativo: boolean;
}

export type TipoLancamento = 'venda' | 'recebimento' | 'custo_api' | 'custo_fixo' | 'ajuste';

export interface Lancamento {
  id: string;
  data: string; // yyyy-mm-dd
  tipo: TipoLancamento;
  projetoId?: string;
  funcionarioId?: string;
  contaReceberId?: string;
  custoFixoId?: string;
  valorBRL: number; // entradas positivas, saídas negativas
  descricao: string;
  meta?: {
    modelo?: string;
    inputTokens?: number;
    outputTokens?: number;
    usd?: number;
    sessionId?: string;
  };
}

export interface ConfigPonte {
  cambioUsdBrl: number;
  limiteDiarioUSD: number; // custo de API somado do dia (todos os projetos)
  limitePorProjetoUSD: number;
  environmentId: string | null; // Environment global na Anthropic (criado 1x)
  ultimaRotinaDiaria?: string; // yyyy-mm-dd
  // ---- standup diário (F4b) ----
  standupAtivo: boolean;
  standupHora: string; // HH:MM local (fuso da máquina)
  standupAgentId?: string | null; // Agent "gerente de operações" (criado 1x)
  standupDeploymentId?: string | null; // deployment com o cron matinal
  standupHoraAplicada?: string | null; // hora usada no deployment atual (muda ⇒ recria)
}

export const CONFIG_PADRAO: ConfigPonte = {
  cambioUsdBrl: 5.4,
  limiteDiarioUSD: 25,
  limitePorProjetoUSD: 50,
  environmentId: null,
  standupAtivo: true,
  standupHora: '09:00',
  standupAgentId: null,
  standupDeploymentId: null,
  standupHoraAplicada: null,
};

export interface EntradaAtividade {
  ts: string; // ISO completo
  tipo: 'mensagem' | 'ferramenta' | 'progresso' | 'custo' | 'sistema' | 'qa';
  texto: string;
  meta?: Record<string, unknown>;
}

/** Relatório matinal consolidado (F4b) — publicado pelo agente gerente. */
export interface RelatorioStandup {
  data: string; // yyyy-mm-dd
  texto: string;
  criadoEm: string; // ISO
  sessionId?: string;
}

/** Persistência do standup: relatórios + runs do deployment já processados. */
export interface EstadoStandup {
  relatorios: RelatorioStandup[];
  runsProcessados: string[];
}

/** Evento bruto vindo do stream/list de sessões da Anthropic (campos acessados defensivamente). */
export interface EventoSessao {
  type: string;
  id?: string;
  processed_at?: string | null;
  [chave: string]: unknown;
}
