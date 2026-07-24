/* ===========================================================
   App Agency Tycoon — estado do jogo: tipos + criação (F1 do PRD)
   Portado de js/game.js (freshState/newEmployee) — NENHUMA regra
   de gameplay/balanceamento foi alterada.
   Módulo puro: sem DOM, sem Pixi (fronteira do core, lint).
   =========================================================== */
import type { CargoId, OpcaoEvento } from './data';
import { FIRST_NAMES, RIVALS } from './data';
import type { Bus, GameEvent } from './bus';

// segundos reais por "dia" do jogo — estilo The Sims: 1 dia = 24 minutos
export const DAY_LENGTH = 1440;
// pontos de trabalho -> XP
export const XP_PER_WORK = 0.35;
// versão do formato de save (bump exige migrate() + fixture de teste)
export const SAVE_VERSION = 3;
// chave sagrada do localStorage (nunca muda sem migração)
export const SAVE_KEY = 'appAgencyTycoon.save.v1';

// ---------- tipos do estado ----------
export interface Mood {
  mult: number;
  daysLeft: number;
}

export interface Employee {
  uid: string;
  role: CargoId;
  /** uid do projeto fixado, ou null para "auto" */
  assign: string | null;
  name: string;
  energy: number;
  resting: boolean;
  /** experiência acumulada em DIAS de jogo trabalhados */
  exp: number;
  salaryMult: number;
  mood: Mood | null;
}

export interface Project {
  uid: string;
  typeId: string;
  name: string;
  emoji: string;
  client: string;
  work: number;
  done: number;
  reward: number;
  rep: number;
  deadline: number;
  daysLeft: number;
  repReq: number;
  vip?: boolean;
}

export interface Product {
  uid: string;
  name: string;
  income: number;
  total: number;
  ageDays: number;
}

export interface Effect {
  id: string;
  daysLeft: number;
  prod?: number;
  label?: string;
}

/** Dados anexos a um evento com escolha (variam por tipo de evento). */
export interface PendingEventData {
  cost?: number;
  empUid?: string;
  amount?: number;
}

export interface PendingEvent {
  id: string;
  title: string;
  text: string;
  options?: OpcaoEvento[];
  data: PendingEventData;
  defaultOption: string;
  day: number;
}

export interface Stats {
  completed: number;
  earned: number;
  failed: number;
  hires: number;
  promotions: number;
}

export interface RivalState {
  id: string;
  name: string;
  rep: number;
  growth: number;
}

export interface GameState {
  v: number;
  company: string;
  money: number;
  rep: number;
  level: number;
  xp: number;
  day: number;
  dayProgress: number;
  tier: number;
  desks: number;
  employees: Employee[];
  active: Project[];
  available: Project[];
  upgrades: string[];
  achievements: string[];
  rivals: RivalState[];
  rankPos: number | null;
  products: Product[];
  effects: Effect[];
  pendingEvent: PendingEvent | null;
  contractTimer: number;
  salaryTimer: number;
  stats: Stats;
  muted: boolean;
  lastSeen: number;
  createdAt: number;
}

/** Relatório do tempo simulado offline (retornado por load()). */
export interface OfflineReport {
  seconds: number;
  money: number;
  completed: number;
  failed: number;
  days: number;
  rep: number;
}

/**
 * Contexto do motor: reúne o estado mutável e os utilitários injetáveis
 * (rng, relógio, gerador de ids) que antes eram variáveis do closure do
 * js/game.js. É passado às funções de economy/events para que elas
 * permaneçam puras e testáveis. `state` é sempre não-nulo quando essas
 * funções são chamadas (o engine garante).
 */
export interface Ctx {
  state: GameState;
  bus: Bus;
  /** true durante a simulação offline: silencia toasts/render */
  offline: boolean;
  /** fonte de aleatoriedade uniforme [0,1) — injetável para testes */
  random: () => number;
  /** relógio (Date.now por padrão) — injetável para testes */
  now: () => number;
  /** emite um aviso (silenciado quando offline) */
  emit: (ev: GameEvent) => void;
  /** notifica mudança de estado: checa conquistas, emite `change` e salva */
  changed: () => void;
  /** número aleatório em [a, b) */
  rand: (a: number, b: number) => number;
  /** item aleatório de um array não-vazio */
  pick: <T>(arr: readonly T[]) => T;
  /** próximo id sequencial de entidade ('e1', 'e2', ...) */
  nextId: () => string;
}

// ---------- criação de entidades ----------
export function newEmployee(ctx: Ctx, roleId: CargoId): Employee {
  return {
    uid: ctx.nextId(),
    role: roleId,
    assign: null,
    name: ctx.pick(FIRST_NAMES),
    energy: 100,
    resting: false,
    exp: 0,
    salaryMult: 1,
    mood: null, // { mult, daysLeft } — motivado/desmotivado
  };
}

/** Estado inicial de um jogo novo (portado 1:1 de freshState). */
export function freshState(ctx: Ctx, companyName?: string): GameState {
  return {
    v: SAVE_VERSION,
    company: companyName || 'Minha Agência',
    money: 1500,
    rep: 0,
    level: 1,
    xp: 0,
    day: 1,
    dayProgress: DAY_LENGTH * 0.375, // começa às 9h da manhã
    tier: 0,
    desks: 3, // 3 mesas de desenvolvedor (a secretária tem mesa própria)
    employees: [newEmployee(ctx, 'junior')], // 1 programador de largada
    active: [], // projetos em andamento
    available: [], // contratos ofertados
    upgrades: [], // ids comprados
    achievements: [], // conquistas desbloqueadas
    rivals: RIVALS.map((r) => ({ id: r.id, name: r.name, rep: r.rep, growth: r.growth })),
    rankPos: null, // posição atual no ranking (para toast de subida)
    products: [], // produtos próprios (renda passiva)
    effects: [], // efeitos temporários de eventos { id, daysLeft, prod }
    pendingEvent: null, // evento aguardando escolha do jogador
    contractTimer: 0,
    salaryTimer: 0,
    stats: { completed: 0, earned: 0, failed: 0, hires: 0, promotions: 0 },
    muted: false,
    lastSeen: ctx.now(),
    createdAt: ctx.now(),
  };
}

/** Formata número no padrão pt-BR (mesma função `fmt` do js/game.js). */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString('pt-BR');
}
