/* Modo Empresa Real — RealAdapter: um objeto com a MESMA forma do Engine
   (window.Game) que espelha a ponte local em vez de simular.
   Regras que vieram do mapeamento do legado (não quebrar!):
   - precisa estar completo ANTES de js/ui.js carregar (fmt é desreferenciado na carga);
   - state é um objeto real e mutável (js/main.js escreve state.muted);
   - employees[i].role só pode ser cargo de DATA.ROLES; a ORDEM do array é a
     identidade visual dos bonecos;
   - stats é obrigatório; active[].work > 0 e deadline > 0; pendingEvent com
     options ou null; maxDesks() >= min(employees.length, desks);
   - production() roda a cada frame — tem que ser barata. */

import type { Engine } from '../core/engine';
import { TIERS } from '../core/data';
import type { Employee, GameState, Project } from '../core/state';
import { DAY_LENGTH, fmt } from '../core/state';
import { abrirStream, iniciarProjeto, obterEstado, pingSaude } from './api';
import type {
  EventoAlerta,
  EventoCusto,
  EventoProgresso,
  NomeEventoReal,
  PonteRealApi,
  ProjetoRealFront,
  SnapshotReal,
} from './tipos';

type NomeEventoBus = 'event' | 'change' | 'tick';

interface AvisoJogo {
  type: string;
  msg: string;
  gain?: number;
}

const CHAVE_MUTE = 'empresaReal.muted';

export function criarAdaptadorReal(): Engine & { modoReal: true } {
  // ---------- estado (mesma forma do GameState do jogo) ----------
  const estado: GameState = {
    v: 3,
    company: 'Empresa Real',
    money: 0,
    rep: 0,
    level: 1,
    xp: 0,
    day: 1,
    dayProgress: fracaoDoDiaReal() * DAY_LENGTH,
    tier: 0,
    desks: 3,
    employees: [],
    active: [],
    available: [],
    upgrades: [],
    achievements: [],
    rivals: [],
    rankPos: null,
    products: [],
    effects: [],
    pendingEvent: null,
    contractTimer: 0,
    salaryTimer: 0,
    stats: { completed: 0, earned: 0, failed: 0, hires: 0, promotions: 0 },
    muted: localStorage.getItem(CHAVE_MUTE) === '1',
    lastSeen: Date.now(),
    createdAt: Date.now(),
  };

  const ouvintes: Record<NomeEventoBus, ((dados: unknown) => void)[]> = {
    event: [],
    change: [],
    tick: [],
  };

  function emitir(nome: NomeEventoBus, dados: unknown): void {
    for (const fn of ouvintes[nome]) fn(dados);
  }

  function avisar(aviso: AvisoJogo): void {
    emitir('event', aviso);
  }

  function mudou(): void {
    emitir('change', estado);
  }

  // ---------- canal para os painéis reais (ui-real) e para a cena ----------
  const ouvintesReais: Record<NomeEventoReal, ((dados: unknown) => void)[]> = {
    snapshot: [],
    progresso: [],
    atividade: [],
    custo: [],
    alerta: [],
  };

  function emitirReal(nome: NomeEventoReal, dados: unknown): void {
    for (const fn of ouvintesReais[nome]) fn(dados);
  }

  let ultimoSnapshot: SnapshotReal | null = null;
  const resumos = new Map<string, string>();

  const real: PonteRealApi = {
    snapshot: () => ultimoSnapshot,
    on: (nome, fn) => {
      ouvintesReais[nome]?.push(fn);
    },
    resumo: (projetoId) => resumos.get(projetoId) ?? '',
  };

  // ---------- relógio real ----------
  function fracaoDoDiaReal(agora: Date = new Date()): number {
    const seg = agora.getHours() * 3600 + agora.getMinutes() * 60 + agora.getSeconds();
    return seg / 86400;
  }

  let inicioEmpresaMs = Date.now();

  function diaReal(): number {
    return Math.max(1, Math.floor((Date.now() - inicioEmpresaMs) / 86400000) + 1);
  }

  // ---------- estimativa de produção (pts/s) por progresso reportado ----------
  const taxas = new Map<string, { taxa: number; ts: number; doneAnterior: number }>();

  function taxaVigente(uid: string): number {
    const t = taxas.get(uid);
    if (!t) return 0;
    if (Date.now() - t.ts > 2 * 3600_000) return 0; // sem progresso há 2h ⇒ zera
    return t.taxa;
  }

  function registrarProgressoParaTaxa(uid: string, doneNovo: number): void {
    const agora = Date.now();
    const anterior = taxas.get(uid);
    if (anterior && doneNovo > anterior.doneAnterior) {
      const dt = Math.max(1, (agora - anterior.ts) / 1000);
      taxas.set(uid, { taxa: (doneNovo - anterior.doneAnterior) / dt, ts: agora, doneAnterior: doneNovo });
    } else if (!anterior || doneNovo !== anterior.doneAnterior) {
      taxas.set(uid, { taxa: anterior?.taxa ?? 0, ts: agora, doneAnterior: doneNovo });
    }
  }

  // ---------- mapeamento snapshot → GameState ----------
  function mapearProjeto(p: ProjetoRealFront): Project {
    const work = Math.max(1, p.etapasTotais) * 100;
    const inicio = p.iniciadoEm ? Date.parse(p.iniciadoEm) : Date.now();
    const diasCorridos = Math.floor((Date.now() - inicio) / 86400000);
    return {
      uid: p.id,
      typeId: 'real',
      name: p.status === 'pausado' ? `${p.nome} (pausado)` : p.nome,
      emoji: p.emoji,
      client: p.cliente,
      work,
      done: Math.min(work, p.etapasConcluidas * 100),
      reward: p.valorContratoBRL,
      rep: 0,
      deadline: Math.max(1, p.prazoDias),
      daysLeft: Math.max(0, p.prazoDias - diasCorridos),
      repReq: 0,
      vip: p.tipo === 'codigo',
    } as Project;
  }

  function aplicarSnapshot(snap: SnapshotReal): void {
    const ativos = snap.funcionarios.filter((f) => f.status === 'ativo');
    const emAberto = snap.projetos.filter((p) =>
      ['em_andamento', 'pausado', 'aguardando_revisao'].includes(p.status),
    );
    const rascunhos = snap.projetos.filter((p) => p.status === 'rascunho');
    const entregues = snap.projetos.filter((p) => p.status === 'entregue');
    const falhos = snap.projetos.filter((p) => p.status === 'falhou');

    const datas = [...ativos, ...snap.projetos]
      .map((x) => Date.parse(x.criadoEm))
      .filter((n) => Number.isFinite(n));
    if (datas.length) inicioEmpresaMs = Math.min(...datas);

    // a ORDEM define qual boneco é quem — segue a ordem estável da ponte
    estado.employees = ativos.map((f): Employee => {
      const projetoDele =
        emAberto.find((p) => p.funcionarioId === f.id && p.status === 'em_andamento') ??
        emAberto.find((p) => p.funcionarioId === f.id);
      return {
        uid: f.id,
        role: f.cargoVisual,
        assign: projetoDele ? projetoDele.id : null,
        name: f.nome,
        energy: 100,
        resting: !emAberto.some((p) => p.funcionarioId === f.id && p.status === 'em_andamento'),
        exp: Math.max(0, Math.floor((Date.now() - Date.parse(f.criadoEm)) / 86400000)),
        salaryMult: 1,
        mood: null,
      };
    });

    estado.active = emAberto.map(mapearProjeto);
    estado.available = rascunhos.map(mapearProjeto);
    for (const p of emAberto) registrarProgressoParaTaxa(p.id, p.etapasConcluidas * 100);

    estado.money = snap.financeiro.caixaBRL;
    estado.desks = Math.max(3, ativos.length + 1);
    estado.tier = Math.max(
      0,
      TIERS.findIndex((t) => t.maxDesks >= Math.max(estado.desks, estado.employees.length)),
    );
    estado.rep = entregues.length * 10;
    estado.stats.completed = entregues.length;
    estado.stats.failed = falhos.length;
    estado.stats.earned = entregues.reduce((s, p) => s + p.valorContratoBRL, 0);
    estado.stats.hires = ativos.length;
    estado.day = diaReal();
    estado.dayProgress = fracaoDoDiaReal() * DAY_LENGTH;

    ultimoSnapshot = snap;
    for (const p of snap.projetos) if (p.resumoAtual) resumos.set(p.id, p.resumoAtual);
    mudou();
    emitirReal('snapshot', snap);
  }

  // ---------- conexão com a ponte ----------
  const overlayPonte = (): HTMLElement | null => document.getElementById('ponteOffline');

  function mostrarPonteOffline(mostrar: boolean): void {
    overlayPonte()?.classList.toggle('hidden', !mostrar);
  }

  let conectado = false;

  async function conectar(): Promise<void> {
    const ok = await pingSaude();
    if (!ok) {
      mostrarPonteOffline(true);
      setTimeout(() => void conectar(), 5000); // fica tentando; o overlay some sozinho
      return;
    }
    mostrarPonteOffline(false);
    try {
      aplicarSnapshot(await obterEstado());
    } catch {
      /* o stream manda o próximo */
    }
    if (conectado) return;
    conectado = true;
    abrirStream({
      aoEstado: (snap) => aplicarSnapshot(snap),
      aoProgresso: (dados) => {
        const ev = dados as EventoProgresso;
        if (ev.resumoAtual) resumos.set(ev.projetoId, ev.resumoAtual);
        const projeto = estado.active.find((p) => p.uid === ev.projetoId);
        if (projeto) {
          projeto.work = Math.max(1, ev.etapasTotais) * 100;
          projeto.done = Math.min(projeto.work, ev.etapasConcluidas * 100);
          registrarProgressoParaTaxa(projeto.uid, projeto.done);
          mudou();
        }
        emitirReal('progresso', ev);
      },
      aoAtividade: (dados) => emitirReal('atividade', dados),
      aoCusto: (dados) => {
        const ev = dados as EventoCusto;
        const projetoSnap = ultimoSnapshot?.projetos.find((p) => p.id === ev.projetoId);
        if (projetoSnap) projetoSnap.custoUSD = ev.custoUSD;
        emitirReal('custo', ev);
      },
      aoAlerta: (dados) => {
        const ev = dados as EventoAlerta;
        // 'venda'/'meta' não têm som no sfxMap do legado — ui-real toca sino/fanfarra;
        // 'conquista' vira 'achieve' (toast dourado + som de level do legado)
        const tipo =
          ev.tipo === 'venda'
            ? 'venda'
            : ev.tipo === 'meta_batida'
              ? 'meta'
              : ev.tipo === 'conquista'
                ? 'achieve'
                : ev.tipo === 'aguardando_revisao' || ev.tipo === 'standup'
                  ? 'info'
                  : ev.tipo === 'falha'
                    ? 'fail'
                    : 'warn';
        avisar({ type: tipo, msg: `🏢 ${ev.mensagem}` });
        emitirReal('alerta', ev);
      },
      aoCair: () => {
        void pingSaude().then((vivo) => mostrarPonteOffline(!vivo));
      },
      aoConectar: () => mostrarPonteOffline(false),
    });
  }

  void conectar();

  // ---------- relógio: emitido pelo loop legado (G.tick a cada frame) ----------
  let acumulador = 0;
  let muteAnterior = estado.muted;

  function tick(dt: number): void {
    acumulador += dt;
    if (acumulador < 1) return;
    acumulador = 0;
    estado.dayProgress = fracaoDoDiaReal() * DAY_LENGTH;
    const dia = diaReal();
    if (dia !== estado.day) estado.day = dia;
    if (estado.muted !== muteAnterior) {
      muteAnterior = estado.muted;
      localStorage.setItem(CHAVE_MUTE, estado.muted ? '1' : '0');
    }
    emitir('tick', estado);
  }

  function naoDisponivel(oQue: string): void {
    avisar({ type: 'info', msg: `🏢 ${oQue} chega com os painéis reais (próxima fase).` });
  }

  // ---------- a API pública (mesma forma do Engine) ----------
  const adaptador = {
    modoReal: true as const,
    real,
    realResumo: (projetoId: string) => resumos.get(projetoId) ?? '',

    on(tipo: NomeEventoBus, fn: (dados: never) => void): void {
      ouvintes[tipo]?.push(fn as (dados: unknown) => void);
    },

    tick,
    autoSaveTick(): void {
      /* o tempo é real; nada a salvar */
    },
    newGame(): void {
      /* não existe "novo jogo" no modo real */
    },
    load(): boolean {
      return false;
    },
    hasSave(): boolean {
      return false;
    },
    reset(): void {
      /* nada a resetar localmente */
    },
    save(): void {
      /* a ponte persiste tudo */
    },

    get state(): GameState | null {
      return estado;
    },
    get timeScale(): number {
      return 1; // tempo real: sempre 1x
    },
    setTimeScale(): void {
      /* no-op — controles escondidos pelo CSS .modo-real */
    },

    // getters de balanceamento (baratos: iso.js chama a cada frame)
    tier: () => TIERS[Math.min(estado.tier, TIERS.length - 1)] ?? TIERS[0]!,
    maxDesks: () => Math.max(estado.desks, estado.employees.length),
    projectSlots: () => estado.active.length + 1, // sempre há vaga: aceitar = iniciar de verdade
    deskCost: () => 0,
    production: () => estado.active.reduce((s, p) => s + taxaVigente(p.uid), 0),
    employeesSeated: () => estado.employees.filter((e) => !e.resting).length,
    contractValueMult: () => 1,
    repMultiplier: () => 1,
    projectRates: () => {
      const mapa: Record<string, number> = {};
      for (const p of estado.active) mapa[p.uid] = taxaVigente(p.uid);
      return mapa;
    },
    assignedCount: (projectUid: string) =>
      estado.employees.filter((e) => e.assign === projectUid).length,
    promotionFor: () => null,
    canPromote: () => false,
    productCost: () => 0,
    productsUnlocked: () => false,
    empSpeed: () => 0,
    takeOfflineReport: () => null,
    rankPosition: () => 1,

    // ações
    acceptProject(uid: string): void {
      avisar({ type: 'accept', msg: '🏢 Iniciando o projeto com o funcionário responsável…' });
      iniciarProjeto(uid).catch((erro: Error) =>
        avisar({ type: 'error', msg: `🏢 ${erro.message}` }),
      );
    },
    declineProject(): void {
      naoDisponivel('Recusar/excluir rascunho');
    },
    hire(): void {
      naoDisponivel('Contratar funcionário-agente');
    },
    fire(): void {
      naoDisponivel('Arquivar funcionário');
    },
    buyDesk(): void {
      /* mesas = funcionários + 1, derivado do cadastro */
    },
    upgradeOffice(): void {
      /* tier deriva do tamanho da equipe */
    },
    buyUpgrade(): void {
      naoDisponivel('Melhorias');
    },
    assignEmployee(): void {
      naoDisponivel('Reatribuir projeto');
    },
    promote(): void {
      naoDisponivel('Promover');
    },
    resolveEvent(): void {
      /* não há eventos simulados no modo real */
    },
    launchProduct(): void {
      naoDisponivel('Produtos próprios');
    },
    setCompany(): void {
      /* nome fixo por enquanto */
    },

    // helpers
    fmt,
    DAY_LENGTH,
  };

  return adaptador as unknown as Engine & { modoReal: true };
}
