// Motor financeiro da agência — funções puras sobre o livro-razão e as coleções.
//
// Regras (decisão do dono, 2026-07-27 — regime de caixa):
// - Venda: registrada ao INICIAR o projeto. Aparece nos relatórios de vendas, NUNCA no caixa.
// - Entrega: gera as contas a receber conforme a forma de pagamento.
// - Recebimento: marcar a conta como recebida é o ÚNICO momento em que o caixa sobe.
// - Custos fixos: lançados automaticamente no vencimento (idempotente por período).
// - Custo de API: lançamento diário por projeto (id determinístico, última versão vence).

import { arredondarBRL, mesDe, somarDias, somarMeses } from '../config.js';
import type {
  ContaReceber,
  CustoFixo,
  FuncionarioAgente,
  Lancamento,
  ProjetoReal,
} from '../store/tipos.js';

// ---------- lançamentos ----------

export function lancamentoVenda(projeto: ProjetoReal, hoje: string): Lancamento {
  return {
    id: `venda:${projeto.id}`,
    data: hoje,
    tipo: 'venda',
    projetoId: projeto.id,
    valorBRL: arredondarBRL(projeto.valorContratoBRL),
    descricao: `Venda — ${projeto.emoji} ${projeto.nome} (${projeto.cliente})`,
  };
}

export function lancamentoRecebimento(conta: ContaReceber, hoje: string): Lancamento {
  return {
    id: `recebimento:${conta.id}`,
    data: hoje,
    tipo: 'recebimento',
    projetoId: conta.projetoId,
    contaReceberId: conta.id,
    valorBRL: arredondarBRL(conta.valorBRL),
    descricao: `Recebimento — ${conta.descricao}`,
  };
}

// ---------- contas a receber ----------

/**
 * Gera as contas a receber no momento da ENTREGA:
 * - à vista: 1 conta com vencimento hoje;
 * - parcelado: entrada opcional (vence hoje) + N parcelas mensais (1ª vence em hoje+1 mês).
 * Arredondamento: diferenças de centavos vão para a última parcela.
 */
export function gerarContasReceber(projeto: ProjetoReal, hoje: string): ContaReceber[] {
  const rotulo = `${projeto.emoji} ${projeto.nome}`;
  if (projeto.pagamento.forma === 'avista') {
    return [
      {
        id: `conta:${projeto.id}:1`,
        projetoId: projeto.id,
        descricao: `À vista — ${rotulo}`,
        valorBRL: arredondarBRL(projeto.valorContratoBRL),
        vencimento: hoje,
        status: 'aberta',
      },
    ];
  }

  const contas: ContaReceber[] = [];
  const entrada = arredondarBRL(projeto.pagamento.entradaBRL ?? 0);
  const parcelas = Math.max(1, projeto.pagamento.parcelas ?? 1);
  if (entrada > 0) {
    contas.push({
      id: `conta:${projeto.id}:entrada`,
      projetoId: projeto.id,
      descricao: `Entrada — ${rotulo}`,
      valorBRL: entrada,
      vencimento: hoje,
      status: 'aberta',
    });
  }
  const restante = arredondarBRL(projeto.valorContratoBRL - entrada);
  const base = arredondarBRL(Math.floor((restante / parcelas) * 100) / 100);
  let acumulado = 0;
  for (let i = 1; i <= parcelas; i++) {
    const valor = i === parcelas ? arredondarBRL(restante - acumulado) : base;
    acumulado = arredondarBRL(acumulado + valor);
    contas.push({
      id: `conta:${projeto.id}:${i}`,
      projetoId: projeto.id,
      descricao: `Parcela ${i}/${parcelas} — ${rotulo}`,
      valorBRL: valor,
      vencimento: somarMeses(hoje, i),
      status: 'aberta',
    });
  }
  return contas;
}

/** Contas abertas com vencimento no passado viram 'atrasada'. Retorna se algo mudou. */
export function marcarAtrasadas(contas: ContaReceber[], hoje: string): boolean {
  let mudou = false;
  for (const c of contas) {
    if (c.status === 'aberta' && c.vencimento < hoje) {
      c.status = 'atrasada';
      mudou = true;
    }
  }
  return mudou;
}

// ---------- custos fixos ----------

function idCustoFixoPeriodo(custo: CustoFixo, hoje: string): string {
  if (custo.recorrencia === 'unico') return `custo_fixo:${custo.id}:unico`;
  if (custo.recorrencia === 'anual') return `custo_fixo:${custo.id}:${hoje.slice(0, 4)}`;
  return `custo_fixo:${custo.id}:${mesDe(hoje)}`;
}

function vencimentoNoPeriodo(custo: CustoFixo, hoje: string): string | null {
  const dia = String(Math.min(28, Math.max(1, custo.diaVencimento))).padStart(2, '0');
  if (custo.recorrencia === 'unico') return custo.dataUnica ?? null;
  if (custo.recorrencia === 'anual') {
    const mes = String(Math.min(12, Math.max(1, custo.mesVencimento ?? 1))).padStart(2, '0');
    return `${hoje.slice(0, 4)}-${mes}-${dia}`;
  }
  return `${mesDe(hoje)}-${dia}`;
}

/**
 * Custos fixos devidos até hoje que ainda não foram lançados no período corrente.
 * Idempotente (id por período) e com catch-up: se a ponte estava desligada no dia
 * do vencimento, lança ao religar dentro do mesmo período.
 */
export function lancamentosCustosFixosDevidos(
  custos: CustoFixo[],
  lancamentosExistentes: Lancamento[],
  hoje: string,
): Lancamento[] {
  const idsExistentes = new Set(lancamentosExistentes.map((l) => l.id));
  const novos: Lancamento[] = [];
  for (const custo of custos) {
    if (!custo.ativo) continue;
    const vencimento = vencimentoNoPeriodo(custo, hoje);
    if (!vencimento || vencimento > hoje) continue;
    const id = idCustoFixoPeriodo(custo, hoje);
    if (idsExistentes.has(id)) continue;
    novos.push({
      id,
      data: vencimento,
      tipo: 'custo_fixo',
      custoFixoId: custo.id,
      valorBRL: -arredondarBRL(custo.valorBRL),
      descricao: `Custo fixo — ${custo.nome} (${custo.categoria})`,
    });
  }
  return novos;
}

// ---------- caixa e relatórios ----------

/** Caixa em regime de caixa: soma tudo MENOS vendas (venda não é dinheiro em conta). */
export function saldoCaixa(lancamentos: Lancamento[]): number {
  let total = 0;
  for (const l of lancamentos) {
    if (l.tipo === 'venda') continue;
    total += l.valorBRL;
  }
  return arredondarBRL(total);
}

export interface ResumoFinanceiro {
  caixaBRL: number;
  totalAReceberBRL: number;
  atrasadasBRL: number;
  vencendo7DiasBRL: number;
  vendasMesBRL: number;
  recebidoMesBRL: number;
  custoApiMesBRL: number;
  custosFixosMesBRL: number;
  lucroMesBRL: number; // mini-DRE do mês corrente
}

export function resumoFinanceiro(
  lancamentos: Lancamento[],
  contas: ContaReceber[],
  hoje: string,
): ResumoFinanceiro {
  const mes = mesDe(hoje);
  const em7dias = somarDias(hoje, 7);
  let vendasMes = 0;
  let recebidoMes = 0;
  let custoApiMes = 0;
  let custosFixosMes = 0;
  for (const l of lancamentos) {
    if (mesDe(l.data) !== mes) continue;
    if (l.tipo === 'venda') vendasMes += l.valorBRL;
    else if (l.tipo === 'recebimento') recebidoMes += l.valorBRL;
    else if (l.tipo === 'custo_api') custoApiMes += -l.valorBRL;
    else if (l.tipo === 'custo_fixo') custosFixosMes += -l.valorBRL;
  }
  let aReceber = 0;
  let atrasadas = 0;
  let vencendo = 0;
  for (const c of contas) {
    if (c.status === 'recebida') continue;
    aReceber += c.valorBRL;
    if (c.status === 'atrasada') atrasadas += c.valorBRL;
    else if (c.vencimento <= em7dias) vencendo += c.valorBRL;
  }
  return {
    caixaBRL: saldoCaixa(lancamentos),
    totalAReceberBRL: arredondarBRL(aReceber),
    atrasadasBRL: arredondarBRL(atrasadas),
    vencendo7DiasBRL: arredondarBRL(vencendo),
    vendasMesBRL: arredondarBRL(vendasMes),
    recebidoMesBRL: arredondarBRL(recebidoMes),
    custoApiMesBRL: arredondarBRL(custoApiMes),
    custosFixosMesBRL: arredondarBRL(custosFixosMes),
    lucroMesBRL: arredondarBRL(recebidoMes - custoApiMes - custosFixosMes),
  };
}

export function filtrarPorPeriodo(
  lancamentos: Lancamento[],
  de?: string,
  ate?: string,
): Lancamento[] {
  return lancamentos.filter((l) => (!de || l.data >= de) && (!ate || l.data <= ate));
}

export function relatorioVendas(
  lancamentos: Lancamento[],
  projetos: ProjetoReal[],
  de?: string,
  ate?: string,
): {
  totalBRL: number;
  quantidade: number;
  ticketMedioBRL: number;
  porCliente: { cliente: string; totalBRL: number; quantidade: number }[];
} {
  const vendas = filtrarPorPeriodo(lancamentos, de, ate).filter((l) => l.tipo === 'venda');
  const clientePorProjeto = new Map(projetos.map((p) => [p.id, p.cliente]));
  const porCliente = new Map<string, { totalBRL: number; quantidade: number }>();
  let total = 0;
  for (const v of vendas) {
    total += v.valorBRL;
    const cliente = (v.projetoId && clientePorProjeto.get(v.projetoId)) || 'Sem cliente';
    const atual = porCliente.get(cliente) ?? { totalBRL: 0, quantidade: 0 };
    atual.totalBRL = arredondarBRL(atual.totalBRL + v.valorBRL);
    atual.quantidade += 1;
    porCliente.set(cliente, atual);
  }
  return {
    totalBRL: arredondarBRL(total),
    quantidade: vendas.length,
    ticketMedioBRL: vendas.length ? arredondarBRL(total / vendas.length) : 0,
    porCliente: [...porCliente.entries()]
      .map(([cliente, v]) => ({ cliente, ...v }))
      .sort((a, b) => b.totalBRL - a.totalBRL),
  };
}

/** Fluxo de caixa mensal: entradas × saídas por mês (vendas fora — não são caixa). */
export function fluxoMensal(
  lancamentos: Lancamento[],
): { mes: string; entradasBRL: number; saidasBRL: number; saldoBRL: number }[] {
  const porMes = new Map<string, { entradasBRL: number; saidasBRL: number }>();
  for (const l of lancamentos) {
    if (l.tipo === 'venda') continue;
    const mes = mesDe(l.data);
    const atual = porMes.get(mes) ?? { entradasBRL: 0, saidasBRL: 0 };
    if (l.valorBRL >= 0) atual.entradasBRL += l.valorBRL;
    else atual.saidasBRL += -l.valorBRL;
    porMes.set(mes, atual);
  }
  return [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({
      mes,
      entradasBRL: arredondarBRL(v.entradasBRL),
      saidasBRL: arredondarBRL(v.saidasBRL),
      saldoBRL: arredondarBRL(v.entradasBRL - v.saidasBRL),
    }));
}

/** DRE simplificado do mês: receita recebida − custo de API − custos fixos = lucro. */
export function dreMes(
  lancamentos: Lancamento[],
  mes: string,
): { mes: string; receitaBRL: number; custoApiBRL: number; custosFixosBRL: number; lucroBRL: number } {
  let receita = 0;
  let api = 0;
  let fixos = 0;
  for (const l of lancamentos) {
    if (mesDe(l.data) !== mes) continue;
    if (l.tipo === 'recebimento') receita += l.valorBRL;
    else if (l.tipo === 'custo_api') api += -l.valorBRL;
    else if (l.tipo === 'custo_fixo') fixos += -l.valorBRL;
  }
  return {
    mes,
    receitaBRL: arredondarBRL(receita),
    custoApiBRL: arredondarBRL(api),
    custosFixosBRL: arredondarBRL(fixos),
    lucroBRL: arredondarBRL(receita - api - fixos),
  };
}

/** Margem por projeto: valor do contrato − custo de API dele. */
export function margemPorProjeto(
  lancamentos: Lancamento[],
  projetos: ProjetoReal[],
): {
  projetoId: string;
  nome: string;
  valorContratoBRL: number;
  custoApiBRL: number;
  margemBRL: number;
  margemPct: number;
}[] {
  const custoPorProjeto = new Map<string, number>();
  for (const l of lancamentos) {
    if (l.tipo !== 'custo_api' || !l.projetoId) continue;
    custoPorProjeto.set(l.projetoId, (custoPorProjeto.get(l.projetoId) ?? 0) + -l.valorBRL);
  }
  return projetos
    .filter((p) => p.status !== 'rascunho')
    .map((p) => {
      const custo = arredondarBRL(custoPorProjeto.get(p.id) ?? 0);
      const margem = arredondarBRL(p.valorContratoBRL - custo);
      return {
        projetoId: p.id,
        nome: `${p.emoji} ${p.nome}`,
        valorContratoBRL: p.valorContratoBRL,
        custoApiBRL: custo,
        margemBRL: margem,
        margemPct: p.valorContratoBRL > 0 ? Math.round((margem / p.valorContratoBRL) * 100) : 0,
      };
    });
}

export function custoPorFuncionario(
  lancamentos: Lancamento[],
  funcionarios: FuncionarioAgente[],
): { funcionarioId: string; nome: string; custoApiBRL: number }[] {
  const porFuncionario = new Map<string, number>();
  for (const l of lancamentos) {
    if (l.tipo !== 'custo_api' || !l.funcionarioId) continue;
    porFuncionario.set(l.funcionarioId, (porFuncionario.get(l.funcionarioId) ?? 0) + -l.valorBRL);
  }
  return funcionarios.map((f) => ({
    funcionarioId: f.id,
    nome: f.nome,
    custoApiBRL: arredondarBRL(porFuncionario.get(f.id) ?? 0),
  }));
}

/**
 * Sino de vendas + meta mensal (backlog 6): a meta só é comemorada UMA vez por
 * mês — `metaBatidaMes` guarda o yyyy-mm já festejado. Meta 0 = desligada.
 */
export function metaFoiBatida(
  vendasMesBRL: number,
  metaMensalBRL: number,
  metaBatidaMes: string | null | undefined,
  mesAtual: string,
): boolean {
  return metaMensalBRL > 0 && vendasMesBRL >= metaMensalBRL && metaBatidaMes !== mesAtual;
}
