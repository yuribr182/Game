// Persistência em disco: JSON com escrita atômica (tmp+rename) e NDJSON append-only.
// Uma camada fina e tipada (Store) isola uma futura troca por SQLite.

import { mkdir, readFile, rename, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type {
  ClienteCRM,
  ConfigPonte,
  ContaReceber,
  CustoFixo,
  EntradaAtividade,
  EstadoStandup,
  FuncionarioAgente,
  Lancamento,
  OportunidadeCRM,
  ProjetoReal,
  RelatorioStandup,
} from './tipos.js';
import { CONFIG_PADRAO } from './tipos.js';

export class Db {
  constructor(readonly dir: string) {}

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    for (const sub of ['atividade', 'sessoes', 'entregas']) {
      await mkdir(path.join(this.dir, sub), { recursive: true });
    }
  }

  caminho(nome: string): string {
    return path.join(this.dir, nome);
  }

  async lerJson<T>(nome: string, padrao: T): Promise<T> {
    const arq = this.caminho(nome);
    if (!existsSync(arq)) return padrao;
    const texto = await readFile(arq, 'utf8');
    if (!texto.trim()) return padrao;
    return JSON.parse(texto) as T;
  }

  /** Escrita atômica: grava num .tmp e faz rename (evita arquivo corrompido no meio). */
  async gravarJson(nome: string, valor: unknown): Promise<void> {
    const arq = this.caminho(nome);
    await mkdir(path.dirname(arq), { recursive: true });
    const tmp = `${arq}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(valor, null, 2), 'utf8');
    await rename(tmp, arq);
  }

  async anexarNdjson(nome: string, valor: unknown): Promise<void> {
    const arq = this.caminho(nome);
    await mkdir(path.dirname(arq), { recursive: true });
    await appendFile(arq, `${JSON.stringify(valor)}\n`, 'utf8');
  }

  async lerNdjson<T>(nome: string): Promise<T[]> {
    const arq = this.caminho(nome);
    if (!existsSync(arq)) return [];
    const texto = await readFile(arq, 'utf8');
    const linhas = texto.split('\n');
    const itens: T[] = [];
    for (const linha of linhas) {
      const l = linha.trim();
      if (!l) continue;
      try {
        itens.push(JSON.parse(l) as T);
      } catch {
        // linha truncada (ex. queda de energia no meio do append) — ignora
      }
    }
    return itens;
  }
}

/**
 * Reduz o livro-razão append-only: a ÚLTIMA ocorrência de cada id vence.
 * É o que permite "atualizar" o lançamento diário de custo de API sem
 * reescrever o arquivo — anexa-se de novo com o mesmo id determinístico.
 */
export function reduzirLancamentos(brutos: Lancamento[]): Lancamento[] {
  const porId = new Map<string, Lancamento>();
  for (const l of brutos) porId.set(l.id, l);
  return [...porId.values()];
}

export class Store {
  private db: Db;
  private filaEscrita: Promise<unknown> = Promise.resolve();

  constructor(dir: string) {
    this.db = new Db(dir);
  }

  get dir(): string {
    return this.db.dir;
  }

  async init(): Promise<void> {
    await this.db.init();
  }

  /** Serializa escritas para não intercalar gravações do mesmo arquivo. */
  private enfileirar<T>(fn: () => Promise<T>): Promise<T> {
    const proxima = this.filaEscrita.then(fn, fn);
    this.filaEscrita = proxima.catch(() => undefined);
    return proxima;
  }

  // ---- coleções ----

  listarFuncionarios(): Promise<FuncionarioAgente[]> {
    return this.db.lerJson<FuncionarioAgente[]>('funcionarios.json', []);
  }

  salvarFuncionarios(itens: FuncionarioAgente[]): Promise<void> {
    return this.enfileirar(() => this.db.gravarJson('funcionarios.json', itens));
  }

  listarProjetos(): Promise<ProjetoReal[]> {
    return this.db.lerJson<ProjetoReal[]>('projetos.json', []);
  }

  salvarProjetos(itens: ProjetoReal[]): Promise<void> {
    return this.enfileirar(() => this.db.gravarJson('projetos.json', itens));
  }

  listarContasReceber(): Promise<ContaReceber[]> {
    return this.db.lerJson<ContaReceber[]>('contas-receber.json', []);
  }

  salvarContasReceber(itens: ContaReceber[]): Promise<void> {
    return this.enfileirar(() => this.db.gravarJson('contas-receber.json', itens));
  }

  listarCustosFixos(): Promise<CustoFixo[]> {
    return this.db.lerJson<CustoFixo[]>('custos-fixos.json', []);
  }

  salvarCustosFixos(itens: CustoFixo[]): Promise<void> {
    return this.enfileirar(() => this.db.gravarJson('custos-fixos.json', itens));
  }

  async lerConfig(): Promise<ConfigPonte> {
    // merge com os padrões: configs gravadas antes de um campo existir continuam válidas
    const salvo = await this.db.lerJson<Partial<ConfigPonte>>('config.json', {});
    return { ...CONFIG_PADRAO, ...salvo };
  }

  salvarConfig(cfg: ConfigPonte): Promise<void> {
    return this.enfileirar(() => this.db.gravarJson('config.json', cfg));
  }

  // ---- livro-razão (NDJSON append-only) ----

  anexarLancamento(l: Lancamento): Promise<void> {
    return this.enfileirar(() => this.db.anexarNdjson('lancamentos.ndjson', l));
  }

  async listarLancamentos(): Promise<Lancamento[]> {
    const brutos = await this.db.lerNdjson<Lancamento>('lancamentos.ndjson');
    return reduzirLancamentos(brutos);
  }

  // ---- atividade por projeto ----

  anexarAtividade(projetoId: string, entrada: EntradaAtividade): Promise<void> {
    return this.enfileirar(() =>
      this.db.anexarNdjson(path.join('atividade', `${projetoId}.ndjson`), entrada),
    );
  }

  listarAtividade(projetoId: string): Promise<EntradaAtividade[]> {
    return this.db.lerNdjson<EntradaAtividade>(path.join('atividade', `${projetoId}.ndjson`));
  }

  // ---- dedupe de eventos por sessão ----

  async lerEventosVistos(sessionId: string): Promise<Set<string>> {
    const dados = await this.db.lerJson<{ vistos: string[] }>(
      path.join('sessoes', `${sessionId}.json`),
      { vistos: [] },
    );
    return new Set(dados.vistos);
  }

  salvarEventosVistos(sessionId: string, vistos: Set<string>): Promise<void> {
    // mantém só os últimos 5000 ids para o arquivo não crescer sem limite
    const lista = [...vistos].slice(-5000);
    return this.enfileirar(() =>
      this.db.gravarJson(path.join('sessoes', `${sessionId}.json`), { vistos: lista }),
    );
  }

  // ---- acumulador de custo de API por projeto+dia (alimenta o lançamento diário) ----

  lerCustosApiDia(): Promise<Record<string, number>> {
    return this.db.lerJson<Record<string, number>>('custos-api-dia.json', {});
  }

  salvarCustosApiDia(mapa: Record<string, number>): Promise<void> {
    return this.enfileirar(() => this.db.gravarJson('custos-api-dia.json', mapa));
  }

  caminhoEntregas(projetoId: string): string {
    return this.db.caminho(path.join('entregas', projetoId));
  }

  caminhoPropostas(oportunidadeId: string): string {
    return this.db.caminho(path.join('propostas', oportunidadeId));
  }

  // ---- CRM (backlog 7) ----

  listarClientes(): Promise<ClienteCRM[]> {
    return this.db.lerJson<ClienteCRM[]>('crm-clientes.json', []);
  }

  salvarClientes(itens: ClienteCRM[]): Promise<void> {
    return this.enfileirar(() => this.db.gravarJson('crm-clientes.json', itens));
  }

  listarOportunidades(): Promise<OportunidadeCRM[]> {
    return this.db.lerJson<OportunidadeCRM[]>('crm-oportunidades.json', []);
  }

  salvarOportunidades(itens: OportunidadeCRM[]): Promise<void> {
    return this.enfileirar(() => this.db.gravarJson('crm-oportunidades.json', itens));
  }

  // ---- conquistas reais (backlog 5): id → ISO de quando desbloqueou ----

  lerConquistas(): Promise<Record<string, string>> {
    return this.db.lerJson<Record<string, string>>('conquistas.json', {});
  }

  salvarConquistas(mapa: Record<string, string>): Promise<void> {
    return this.enfileirar(() => this.db.gravarJson('conquistas.json', mapa));
  }

  // ---- standup diário (F4b) ----

  lerStandup(): Promise<EstadoStandup> {
    return this.db.lerJson<EstadoStandup>('standup.json', { relatorios: [], runsProcessados: [] });
  }

  /** Anexa um relatório matinal (mantém os últimos 60) e/ou marca runs processados (últimos 200). */
  async salvarStandup(mudar: (estado: EstadoStandup) => void): Promise<EstadoStandup> {
    const estado = await this.lerStandup();
    mudar(estado);
    estado.relatorios = estado.relatorios.slice(-60);
    estado.runsProcessados = estado.runsProcessados.slice(-200);
    await this.enfileirar(() => this.db.gravarJson('standup.json', estado));
    return estado;
  }

  async listarStandups(limite = 15): Promise<RelatorioStandup[]> {
    const { relatorios } = await this.lerStandup();
    return relatorios.slice(-limite).reverse(); // mais recente primeiro
  }
}
