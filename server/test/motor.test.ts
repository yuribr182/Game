import { describe, expect, it } from 'vitest';
import {
  dreMes,
  fluxoMensal,
  gerarContasReceber,
  lancamentoRecebimento,
  lancamentosCustosFixosDevidos,
  lancamentoVenda,
  marcarAtrasadas,
  margemPorProjeto,
  relatorioVendas,
  resumoFinanceiro,
  saldoCaixa,
} from '../src/financeiro/motor.js';
import type { ContaReceber, CustoFixo, Lancamento, ProjetoReal } from '../src/store/tipos.js';

function projetoFake(extra: Partial<ProjetoReal> = {}): ProjetoReal {
  return {
    id: 'p1',
    nome: 'App X',
    cliente: 'Padaria Pão Quente',
    emoji: '🥖',
    tipo: 'entrega',
    spec: {
      objetivo: 'obj',
      escopo: 'esc',
      entregaveis: 'ent',
      criteriosAceite: 'crit',
    },
    valorContratoBRL: 3000,
    pagamento: { forma: 'avista' },
    prazoDias: 10,
    criadoEm: '2026-07-01T00:00:00Z',
    funcionarioId: 'f1',
    sessionId: null,
    etapasTotais: 0,
    etapasConcluidas: 0,
    resumoAtual: '',
    status: 'em_andamento',
    custoUSD: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    ...extra,
  };
}

describe('vendas e caixa (regime de caixa)', () => {
  it('venda aparece no relatório mas NÃO no caixa', () => {
    const venda = lancamentoVenda(projetoFake(), '2026-07-27');
    expect(venda.tipo).toBe('venda');
    expect(venda.valorBRL).toBe(3000);
    expect(saldoCaixa([venda])).toBe(0);
    const rel = relatorioVendas([venda], [projetoFake()]);
    expect(rel.totalBRL).toBe(3000);
    expect(rel.porCliente[0]?.cliente).toBe('Padaria Pão Quente');
  });

  it('receber uma conta sobe o caixa', () => {
    const conta: ContaReceber = {
      id: 'c1',
      projetoId: 'p1',
      descricao: 'À vista — App X',
      valorBRL: 3000,
      vencimento: '2026-07-27',
      status: 'aberta',
    };
    const rec = lancamentoRecebimento(conta, '2026-07-27');
    expect(saldoCaixa([rec])).toBe(3000);
  });
});

describe('gerarContasReceber', () => {
  it('à vista: 1 conta com vencimento hoje', () => {
    const contas = gerarContasReceber(projetoFake(), '2026-07-27');
    expect(contas).toHaveLength(1);
    expect(contas[0]!.valorBRL).toBe(3000);
    expect(contas[0]!.vencimento).toBe('2026-07-27');
  });

  it('parcelado com entrada: entrada hoje + N parcelas mensais, centavos na última', () => {
    const p = projetoFake({
      valorContratoBRL: 1000,
      pagamento: { forma: 'parcelado', parcelas: 3, entradaBRL: 100 },
    });
    const contas = gerarContasReceber(p, '2026-01-31');
    expect(contas).toHaveLength(4);
    expect(contas[0]!.descricao).toContain('Entrada');
    expect(contas[0]!.vencimento).toBe('2026-01-31');
    // 900 / 3 = 300 exato
    expect(contas.slice(1).map((c) => c.valorBRL)).toEqual([300, 300, 300]);
    // fim de mês ancorado: 31/01 + 1 mês = 28/02
    expect(contas[1]!.vencimento).toBe('2026-02-28');
    expect(contas[2]!.vencimento).toBe('2026-03-31');
    const soma = contas.reduce((s, c) => s + c.valorBRL, 0);
    expect(soma).toBe(1000);
  });

  it('parcelas com dízima fecham a soma exata na última', () => {
    const p = projetoFake({ valorContratoBRL: 1000, pagamento: { forma: 'parcelado', parcelas: 3 } });
    const contas = gerarContasReceber(p, '2026-07-27');
    expect(contas.map((c) => c.valorBRL)).toEqual([333.33, 333.33, 333.34]);
  });
});

describe('atrasadas e resumo', () => {
  it('conta vencida vira atrasada; resumo agrega certo', () => {
    const contas: ContaReceber[] = [
      { id: 'a', projetoId: 'p1', descricao: 'velha', valorBRL: 100, vencimento: '2026-07-01', status: 'aberta' },
      { id: 'b', projetoId: 'p1', descricao: 'próxima', valorBRL: 200, vencimento: '2026-07-30', status: 'aberta' },
      { id: 'c', projetoId: 'p1', descricao: 'longe', valorBRL: 400, vencimento: '2026-12-01', status: 'aberta' },
    ];
    expect(marcarAtrasadas(contas, '2026-07-27')).toBe(true);
    expect(contas[0]!.status).toBe('atrasada');
    const lancs: Lancamento[] = [
      { id: 'v', data: '2026-07-10', tipo: 'venda', valorBRL: 700, descricao: '' },
      { id: 'r', data: '2026-07-12', tipo: 'recebimento', valorBRL: 500, descricao: '' },
      { id: 'api', data: '2026-07-12', tipo: 'custo_api', valorBRL: -50, descricao: '' },
      { id: 'fixo', data: '2026-07-05', tipo: 'custo_fixo', valorBRL: -60, descricao: '' },
    ];
    const resumo = resumoFinanceiro(lancs, contas, '2026-07-27');
    expect(resumo.caixaBRL).toBe(390);
    expect(resumo.totalAReceberBRL).toBe(700);
    expect(resumo.atrasadasBRL).toBe(100);
    expect(resumo.vencendo7DiasBRL).toBe(200);
    expect(resumo.vendasMesBRL).toBe(700);
    expect(resumo.lucroMesBRL).toBe(500 - 50 - 60);
  });
});

describe('custos fixos', () => {
  const vps: CustoFixo = {
    id: 'cf1',
    nome: 'VPS',
    categoria: 'servidor',
    valorBRL: 60,
    recorrencia: 'mensal',
    diaVencimento: 5,
    ativo: true,
  };

  it('lança no vencimento (com catch-up) e é idempotente por período', () => {
    const primeiros = lancamentosCustosFixosDevidos([vps], [], '2026-07-27');
    expect(primeiros).toHaveLength(1);
    expect(primeiros[0]!.id).toBe('custo_fixo:cf1:2026-07');
    expect(primeiros[0]!.data).toBe('2026-07-05');
    expect(primeiros[0]!.valorBRL).toBe(-60);
    // segunda rodada no mesmo mês: nada
    expect(lancamentosCustosFixosDevidos([vps], primeiros, '2026-07-28')).toHaveLength(0);
    // mês seguinte, antes do dia 5: nada; no dia 5: lança de novo
    expect(lancamentosCustosFixosDevidos([vps], primeiros, '2026-08-04')).toHaveLength(0);
    expect(lancamentosCustosFixosDevidos([vps], primeiros, '2026-08-05')).toHaveLength(1);
  });

  it('inativo não lança; anual respeita o mês', () => {
    expect(lancamentosCustosFixosDevidos([{ ...vps, ativo: false }], [], '2026-07-27')).toHaveLength(0);
    const dominio: CustoFixo = {
      ...vps,
      id: 'cf2',
      nome: 'Domínio',
      recorrencia: 'anual',
      mesVencimento: 9,
      diaVencimento: 10,
    };
    expect(lancamentosCustosFixosDevidos([dominio], [], '2026-07-27')).toHaveLength(0);
    const lanc = lancamentosCustosFixosDevidos([dominio], [], '2026-09-10');
    expect(lanc).toHaveLength(1);
    expect(lanc[0]!.id).toBe('custo_fixo:cf2:2026');
  });
});

describe('relatórios', () => {
  const lancs: Lancamento[] = [
    { id: 'v1', data: '2026-06-10', tipo: 'venda', valorBRL: 1000, descricao: '', projetoId: 'p1' },
    { id: 'r1', data: '2026-06-15', tipo: 'recebimento', valorBRL: 1000, descricao: '' },
    { id: 'a1', data: '2026-06-20', tipo: 'custo_api', valorBRL: -80, descricao: '', projetoId: 'p1' },
    { id: 'r2', data: '2026-07-10', tipo: 'recebimento', valorBRL: 500, descricao: '' },
  ];

  it('fluxo mensal separa entradas e saídas (sem vendas)', () => {
    const fluxo = fluxoMensal(lancs);
    expect(fluxo).toEqual([
      { mes: '2026-06', entradasBRL: 1000, saidasBRL: 80, saldoBRL: 920 },
      { mes: '2026-07', entradasBRL: 500, saidasBRL: 0, saldoBRL: 500 },
    ]);
  });

  it('DRE do mês fecha receita − api − fixos', () => {
    const dre = dreMes(lancs, '2026-06');
    expect(dre).toEqual({ mes: '2026-06', receitaBRL: 1000, custoApiBRL: 80, custosFixosBRL: 0, lucroBRL: 920 });
  });

  it('margem por projeto = contrato − custo de API', () => {
    const margens = margemPorProjeto(lancs, [projetoFake({ valorContratoBRL: 1000 })]);
    expect(margens[0]).toMatchObject({ custoApiBRL: 80, margemBRL: 920, margemPct: 92 });
  });
});
